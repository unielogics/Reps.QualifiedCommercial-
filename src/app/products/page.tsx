"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, CalendarDays, ChevronLeft, ChevronRight, Plus, Share2, Trash2, WandSparkles, X } from "lucide-react";
import { api, apiBase } from "@/lib/api";
import BusinessAddressFields from "@/components/BusinessAddressFields";
import { ProductIcon } from "@/components/ProductIcon";
import ProductFinderTaxonomy, { type ProductFinderTaxonomyValue } from "@/components/ProductFinderTaxonomy";
import ProductShareDialog from "@/components/ProductShareDialog";
import TermScenarioTables, { type TermScenario } from "@/components/TermScenarioTables";

type Locale = "en" | "es";
type Product = {
  program_key: string;
  category: string;
  name: string;
  summary: string | null;
  pricing: string | null;
  amount_min: number | null;
  amount_max: number | null;
  term_min_months: number | null;
  term_max_months: number | null;
  direct_action: "start_application" | "book_call";
  icon_key: string;
  term_scenarios: TermScenario[];
};
type Question = { key: string; kind: "money" | "text" | "number" | "select" | "boolean"; label: string; options?: string[] };
type Catalog = { items: Product[]; questions: Question[] };
type ProgramResult = { program_key: string; name: string; status: "recommended" | "potential" | "blocked" | "advisory"; decision_type?: "deterministic" | "advisory"; borrower_safe_reasons: string[]; unresolved: string[]; strengths: string[]; estimated_max_amount: number | null };
type PropertyAnalysis = { property_count: number; total_stated_equity: number | null; portfolio_ltv: number | null };
type ScreeningResult = { verification: string; client_requested_amount: number | null; recommended_amount: number | null; amount_adjustment_required: boolean; evaluated_programs: ProgramResult[]; real_estate_analysis?: PropertyAnalysis };
type PropertyRow = { id: string; address: string; city: string; state: string; zip: string; property_type: "commercial" | "residential" | "mixed"; amount_owed: string; estimated_value: string };
type ProspectProfile = ProductFinderTaxonomyValue & { company_name: string; contact_name: string; email: string; phone: string; requested_amount: string; use_of_funds: string };

const EMPTY_TAXONOMY: ProductFinderTaxonomyValue = { industry_entry_id: null, industry: "", industry_label: "", subindustry_entry_id: null, subindustry: "", subindustry_label: "", activity_entry_id: null, naics_code: "", naics_label: "", taxonomy_status: "unclassified" };
const copy = {
  en: { title: "Products", sub: "Browse, compare, and present financing programs before opening a formal application.", finder: "Product Finder", search: "Search products", compare: "Compare", comparison: "Program comparison", selectMore: "Select another program to compare side by side.", pdf: "Share PDF", start: "Start application", book: "Book a funding call", open: "View full program", amount: "Program amount", term: "Term", pricing: "Indicative pricing", category: "Category", overview: "Overview", nextAction: "Next action", preliminary: "Preliminary fit only. Verify all eligibility before submission.", details: "Prospect basics", screen: "Screen programs", next: "Continue to screening", requested: "Client requested", recommended: "Screened maximum", confirm: "Confirm funding goal", properties: "Real-estate collateral", addProperty: "Add property", propertyHelp: "Values are self-reported and unverified until supporting evidence is reviewed." },
  es: { title: "Productos", sub: "Explore, compare y presente programas antes de abrir una solicitud formal.", finder: "Buscador de productos", search: "Buscar productos", compare: "Comparar", comparison: "Comparacion de programas", selectMore: "Seleccione otro programa para compararlos lado a lado.", pdf: "Compartir PDF", start: "Iniciar solicitud", book: "Reservar llamada", open: "Ver programa completo", amount: "Monto del programa", term: "Plazo", pricing: "Precio indicativo", category: "Categoria", overview: "Resumen", nextAction: "Proximo paso", preliminary: "Evaluacion preliminar. Verifique la elegibilidad antes de enviar.", details: "Datos del prospecto", screen: "Evaluar programas", next: "Continuar a evaluacion", requested: "Monto solicitado", recommended: "Maximo evaluado", confirm: "Confirmar meta", properties: "Garantia de bienes raices", addProperty: "Agregar propiedad", propertyHelp: "Los valores son declarados y no verificados hasta revisar la evidencia." },
};
const optionLabels: Record<string, Record<Locale, string>> = {
  none: { en: "None", es: "Ninguno" }, within_3_years: { en: "Within 3 years", es: "Dentro de 3 anos" }, "4_to_7_years": { en: "4 to 7 years ago", es: "Hace 4 a 7 anos" }, more_than_7_years: { en: "More than 7 years ago", es: "Hace mas de 7 anos" }, within_10_years: { en: "Within 10 years", es: "Dentro de 10 anos" }, more_than_10_years: { en: "More than 10 years ago", es: "Hace mas de 10 anos" }, purchase: { en: "Purchase", es: "Compra" }, refinance: { en: "Refinance", es: "Refinanciamiento" }, cash_out: { en: "Cash-out", es: "Retiro de capital" }, construction: { en: "Construction", es: "Construccion" }, other: { en: "Other", es: "Otro" },
};

const money = (value: number | null) => value == null ? "—" : `$${Math.round(value).toLocaleString()}`;
const termRange = (item: Product) => !item.term_min_months ? "—" : item.term_min_months === item.term_max_months ? `${item.term_min_months} mo` : `${item.term_min_months}–${item.term_max_months} mo`;
const newProperty = (): PropertyRow => ({ id: crypto.randomUUID(), address: "", city: "", state: "", zip: "", property_type: "commercial", amount_owed: "", estimated_value: "" });

export default function ProductsPage() {
  const { getToken } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rail = useRef<HTMLDivElement>(null);
  const [locale, setLocale] = useState<Locale>("en");
  const [mode, setMode] = useState<"browse" | "finder">("browse");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [profile, setProfile] = useState<ProspectProfile>({ company_name: "", contact_name: "", email: "", phone: "", requested_amount: "", use_of_funds: "", ...EMPTY_TAXONOMY });
  const [session, setSession] = useState<{ id: string; dealer_id: string; contact_id: string } | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [result, setResult] = useState<ScreeningResult | null>(null);
  const [message, setMessage] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const t = copy[locale];
  const requestedAmount = Number(profile.requested_amount) || undefined;

  useEffect(() => {
    const selectedKey = searchParams.get("selected");
    if (selectedKey) setSelected([selectedKey]);
    if (searchParams.get("share") === "1") setShareOpen(true);
    if (searchParams.get("locale") === "es") setLocale("es");
  }, [searchParams]);

  const catalog = useQuery({
    queryKey: ["products", locale, requestedAmount ?? null],
    queryFn: async () => api<Catalog>(`/dealer-os/products?locale=${locale}${requestedAmount ? `&amount=${requestedAmount}` : ""}`, { authToken: (await getToken()) ?? undefined }),
  });
  const booking = useQuery({ queryKey: ["products", "booking"], queryFn: async () => api<{ enabled: boolean; url: string | null }>("/dealer-os/products/booking", { authToken: (await getToken()) ?? undefined }) });
  const items = useMemo(() => (catalog.data?.items ?? []).filter((item) => (category === "all" || item.category === category) && `${item.name} ${item.summary ?? ""}`.toLowerCase().includes(search.toLowerCase())), [catalog.data, category, search]);
  const comparisonItems = useMemo(() => (catalog.data?.items ?? []).filter((item) => selected.includes(item.program_key)), [catalog.data, selected]);
  const categories = Array.from(new Set((catalog.data?.items ?? []).map((item) => item.category)));
  const activeKeys = selected.length ? selected : items.map((item) => item.program_key);

  const createSession = useMutation({
    mutationFn: async () => api<{ id: string; dealer_id: string; contact_id: string; answers: Record<string, unknown> }>("/dealer-os/product-finder/sessions", { method: "POST", authToken: (await getToken()) ?? undefined, body: JSON.stringify({ ...profile, requested_amount: Number(profile.requested_amount), locale }) }),
    onSuccess: (data) => { setSession(data); setAnswers({ ...data.answers }); setMessage(""); },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Unable to start Product Finder."),
  });
  const screen = useMutation({
    mutationFn: async (answerOverrides?: Record<string, unknown>) => {
      if (!session) throw new Error("Create the prospect first");
      const propertyPayload = properties.map(({ id: _id, ...row }) => ({ ...row, amount_owed: row.amount_owed ? Number(row.amount_owed) : null, estimated_value: row.estimated_value ? Number(row.estimated_value) : null })).filter((row) => row.address || row.estimated_value || row.amount_owed);
      return api<{ result: ScreeningResult }>(`/dealer-os/product-finder/sessions/${session.id}/screen`, { method: "POST", authToken: (await getToken()) ?? undefined, body: JSON.stringify({ answers: { ...(answerOverrides ?? answers), properties: propertyPayload } }) });
    },
    onSuccess: (data) => { setResult(data.result); setSelected(data.result.evaluated_programs.filter((program) => program.status !== "blocked").map((program) => program.program_key)); },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Screening unavailable."),
  });
  const confirmGoal = useMutation({ mutationFn: async () => api(`/dealer-os/product-finder/sessions/${session?.id}/confirm-funding-goal`, { method: "POST", authToken: (await getToken()) ?? undefined, body: JSON.stringify({ amount: result?.recommended_amount }) }), onSuccess: () => setMessage(locale === "es" ? "Meta de financiamiento confirmada." : "Funding goal confirmed.") });
  const startApplication = useMutation({ mutationFn: async () => api<{ route: string }>(`/dealer-os/product-finder/sessions/${session?.id}/start-application`, { method: "POST", authToken: (await getToken()) ?? undefined }), onSuccess: (data) => router.push(data.route) });

  const downloadPdf = async () => {
    const token = await getToken();
    const amount = requestedAmount ? `&amount=${requestedAmount}` : "";
    const response = await fetch(`${apiBase}/dealer-os/products/pdf?locale=${locale}&keys=${encodeURIComponent(activeKeys.join(","))}${amount}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) return setMessage("PDF unavailable");
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `qc-product-catalog-${locale}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const visibleQuestions = (catalog.data?.questions ?? []).filter((question) => {
    if (["real_estate_purpose", "owned_real_estate_available"].includes(question.key) && answers.real_estate_involved === false) return false;
    if (question.key === "youngest_mca_days" && Number(answers.mca_count) === 0) return false;
    if (question.key === "tax_payment_plan_current" && answers.tax_liability_over_10000 !== true) return false;
    if (question.key === "term_obligations_released_or_on_plan" && answers.judgment_over_50000_within_7_years !== true && answers.aggregate_liens_judgments_over_25000_within_7_years !== true) return false;
    return true;
  });
  const activeQuestionIndex = visibleQuestions.findIndex((question) => answers[question.key] === undefined || answers[question.key] === "");
  const realEstateActive = answers.real_estate_involved === true || answers.owned_real_estate_available === true;
  const finderReady = Boolean(profile.company_name.trim() && profile.contact_name.trim() && requestedAmount && profile.use_of_funds.trim().length >= 3 && profile.activity_entry_id);
  const viableDirect = result?.evaluated_programs.some((program) => program.decision_type !== "advisory" && program.status !== "blocked");
  const activeTaxonomy = { ...EMPTY_TAXONOMY, ...answers } as ProductFinderTaxonomyValue;

  return <div className="productsPage">
    <header className="hd productHeader">
      <div><span className="eyebrow">Field Desk catalog</span><h2>{t.title}</h2><p className="lede">{t.sub}</p></div>
      <div className="productHeaderActions">
        {selected.length > 0 && <span className="selectedCompare"><b>{selected.length}</b> selected</span>}
        <button className="btn" onClick={() => setShareOpen(true)}><Share2 size={17} /> {t.pdf}</button>
        <div className="seg" aria-label="Language"><button className={locale === "en" ? "on" : ""} onClick={() => setLocale("en")}>EN</button><button className={locale === "es" ? "on" : ""} onClick={() => setLocale("es")}>ES</button></div>
        <button className={`finderLaunch ${mode === "finder" ? "on" : ""}`} onClick={() => setMode(mode === "finder" ? "browse" : "finder")} title={t.finder} aria-label={t.finder}><span><WandSparkles size={17} /></span><b>{t.finder}</b></button>
      </div>
    </header>

    {mode === "browse" ? <>
      <div className="productToolbar mt"><input className="field" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.search} /><select className="field" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select><span className="sp" /><button className="iconAction" aria-label="Previous product" onClick={() => rail.current?.scrollBy({ left: -360, behavior: "smooth" })}><ChevronLeft size={18} /></button><button className="iconAction" aria-label="Next product" onClick={() => rail.current?.scrollBy({ left: 360, behavior: "smooth" })}><ChevronRight size={18} /></button></div>
      {selected.length > 0 && <section className="comparisonMatrix">
        <header className="comparisonMatrixHeader"><div><span className="eyebrow">{t.comparison}</span><b>{selected.length} program{selected.length === 1 ? "" : "s"}</b>{selected.length === 1 && <small>{t.selectMore}</small>}</div><span className="sp" /><button className="btn" onClick={() => void downloadPdf()}>Download PDF</button><button className="btn pri" onClick={() => setShareOpen(true)}><Share2 size={16} /> {t.pdf}</button></header>
        <div className="comparisonTableWrap"><table className="comparisonTable"><thead><tr><th>{t.comparison}</th>{comparisonItems.map((item) => <th key={item.program_key}><span className="comparisonProgramHead"><span className="productGlyph small"><ProductIcon programKey={item.icon_key || item.program_key} size={17} /></span><b>{item.name}</b><button className="comparisonRemove" type="button" aria-label={`Remove ${item.name}`} onClick={() => setSelected((old) => old.filter((key) => key !== item.program_key))}><X size={15} /></button></span></th>)}</tr></thead><tbody><tr><th>{t.overview}</th>{comparisonItems.map((item) => <td key={item.program_key}>{item.summary || t.preliminary}</td>)}</tr><tr><th>{t.amount}</th>{comparisonItems.map((item) => <td key={item.program_key}><b>{money(item.amount_min)}-{money(item.amount_max)}</b></td>)}</tr><tr><th>{t.term}</th>{comparisonItems.map((item) => <td key={item.program_key}><b>{termRange(item)}</b></td>)}</tr><tr><th>{t.pricing}</th>{comparisonItems.map((item) => <td key={item.program_key}><b>{item.pricing || "Awaiting review"}</b></td>)}</tr><tr><th>{t.category}</th>{comparisonItems.map((item) => <td key={item.program_key}><span className="cellchip c-mut">{item.category}</span></td>)}</tr><tr><th>{t.nextAction}</th>{comparisonItems.map((item) => <td key={item.program_key}>{item.direct_action === "start_application" ? t.start : t.book}</td>)}</tr></tbody></table></div>
        <div className="comparisonScenarios">{comparisonItems.map((item) => <article key={item.program_key}><h3>{item.name}</h3><TermScenarioTables scenarios={item.term_scenarios} locale={locale} compact /></article>)}</div>
      </section>}
      <div className="productRail" ref={rail}>{items.map((item) => { const on = selected.includes(item.program_key); return <article className={`productCard ${on ? "selected" : ""}`} key={item.program_key} onClick={() => router.push(`/products/${item.program_key}?locale=${locale}${requestedAmount ? `&amount=${requestedAmount}` : ""}`)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") router.push(`/products/${item.program_key}?locale=${locale}`); }}>
        <div className="productCardTop"><span className="productGlyph"><ProductIcon programKey={item.icon_key || item.program_key} /></span><span className="cellchip c-mut">{item.category}</span></div><h3>{item.name}</h3><p>{item.summary || t.preliminary}</p><dl><div><dt>{t.amount}</dt><dd>{money(item.amount_min)}-{money(item.amount_max)}</dd></div><div><dt>{t.term}</dt><dd>{termRange(item)}</dd></div><div><dt>{t.pricing}</dt><dd>{item.pricing || "Awaiting review"}</dd></div></dl><span className="productOpenHint">{t.open} <ChevronRight size={15} /></span><div className="productActions" onClick={(event) => event.stopPropagation()}><button className={`btn ${on ? "pri" : ""}`} onClick={() => setSelected((old) => on ? old.filter((key) => key !== item.program_key) : [...old, item.program_key])}>{t.compare}</button>{item.direct_action === "start_application" ? <button className="btn" onClick={() => router.push("/?new=1")}>{t.start}</button> : <button className="btn" disabled={!booking.data?.enabled} onClick={() => booking.data?.url && window.open(booking.data.url, "_blank", "noopener,noreferrer")}><CalendarDays size={16} /> {t.book}</button>}</div>
      </article>; })}</div>
    </> : <section className="finderWorkspace mt">
      <aside className="finderIntro"><span className="finderOrb"><WandSparkles size={21} /></span><span className="eyebrow">Guided screening</span><h3>{t.finder}</h3><p>Screen the primary owner, canonical NAICS activity, bank behavior, debt exposure, and stated collateral without changing the formal application.</p><div className="finderTrust"><b>Self-reported</b><span>Exact EZ/Micro gates remain separate from advisory alternatives.</span></div></aside>
      <div className="finderMain">
        {!session ? <div className="finderForm"><h3>{t.details}</h3><div className="fieldGrid"><label><span>Business</span><input className="field" value={profile.company_name} onChange={(event) => setProfile({ ...profile, company_name: event.target.value })} /></label><label><span>Primary contact</span><input className="field" value={profile.contact_name} onChange={(event) => setProfile({ ...profile, contact_name: event.target.value })} /></label><label><span>Email</span><input className="field" type="email" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} /></label><label><span>Phone</span><input className="field" value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} /></label><label><span>Requested amount</span><input className="field" inputMode="numeric" value={profile.requested_amount} onChange={(event) => setProfile({ ...profile, requested_amount: event.target.value.replace(/[^0-9.]/g, "") })} /></label><ProductFinderTaxonomy locale={locale} value={profile} onChange={(taxonomy) => setProfile((current) => ({ ...current, ...taxonomy }))} /><label className="full"><span>Detailed use of funds</span><textarea className="field" rows={4} value={profile.use_of_funds} onChange={(event) => setProfile({ ...profile, use_of_funds: event.target.value })} /></label></div><button className="btn pri finderPrimary" disabled={!finderReady || createSession.isPending} onClick={() => createSession.mutate()}>{createSession.isPending ? "Creating…" : t.next}</button></div>
        : <div className="finderConversation"><div className="finderFact"><b>{profile.company_name}</b><span>{money(Number(profile.requested_amount))} · {activeTaxonomy.naics_code} · {activeTaxonomy.naics_label}</span></div>
          <ProductFinderTaxonomy locale={locale} value={activeTaxonomy} onChange={(taxonomy) => { const next = { ...answers, ...taxonomy }; setProfile((current) => ({ ...current, ...taxonomy })); setAnswers(next); if (taxonomy.activity_entry_id && result) screen.mutate(next); else setResult(null); }} />
          {visibleQuestions.map((question, index) => { const value = answers[question.key]; const active = index === activeQuestionIndex; const answered = value !== undefined && value !== ""; if (!active && !answered) return null; return <div className={`finderQuestion ${active ? "active" : "answered"}`} key={question.key}><span className="questionNumber">{answered ? "✓" : index + 1}</span><div><b>{question.label}</b>{question.kind === "boolean" ? <div className="seg mt"><button className={value === true ? "on" : ""} onClick={() => setAnswers({ ...answers, [question.key]: true })}>Yes</button><button className={value === false ? "on" : ""} onClick={() => setAnswers({ ...answers, [question.key]: false })}>No</button></div> : question.kind === "select" ? <select className="field mt" value={String(value ?? "")} onChange={(event) => setAnswers({ ...answers, [question.key]: event.target.value })}><option value="">Select</option>{(question.options ?? []).map((option) => <option key={option} value={option}>{optionLabels[option]?.[locale] ?? option.replaceAll("_", " ")}</option>)}</select> : <input className="field mt" inputMode={question.kind === "number" || question.kind === "money" ? "decimal" : undefined} value={String(value ?? "")} onChange={(event) => setAnswers({ ...answers, [question.key]: question.kind === "number" || question.kind === "money" ? event.target.value === "" ? "" : Number(event.target.value) : event.target.value })} />}</div></div>; })}
          {realEstateActive && <section className="finderProperties"><header><div><span className="eyebrow">{t.properties}</span><h3>Stated equity and LTV</h3><p>{t.propertyHelp}</p></div><button className="btn" type="button" onClick={() => setProperties((rows) => [...rows, newProperty()])}><Plus size={16} /> {t.addProperty}</button></header>{properties.map((property, index) => { const value = Number(property.estimated_value); const owed = Number(property.amount_owed); const equity = value > 0 ? value - (owed || 0) : null; const ltv = value > 0 ? (owed / value) * 100 : null; return <article className="finderProperty" key={property.id}><div className="finderPropertyTop"><b>Property {index + 1}</b><button className="iconAction" type="button" onClick={() => setProperties((rows) => rows.filter((row) => row.id !== property.id))} aria-label="Remove property"><Trash2 size={16} /></button></div><BusinessAddressFields value={property} manualFallback="when-needed" searchLabel="Property address" searchPlaceholder="Search with Geoapify" helperText="Select a suggestion or use manual entry." onChange={(next) => setProperties((rows) => rows.map((row) => row.id === property.id ? { ...row, ...next } : row))} /><div className="propertyInputs"><label><span>Property type</span><select className="field" value={property.property_type} onChange={(event) => setProperties((rows) => rows.map((row) => row.id === property.id ? { ...row, property_type: event.target.value as PropertyRow["property_type"] } : row))}><option value="commercial">Commercial</option><option value="residential">Residential</option><option value="mixed">Mixed use</option></select></label><label><span>Current amount owed</span><input className="field" inputMode="decimal" value={property.amount_owed} onChange={(event) => setProperties((rows) => rows.map((row) => row.id === property.id ? { ...row, amount_owed: event.target.value.replace(/[^0-9.]/g, "") } : row))} /></label><label><span>Estimated value</span><input className="field" inputMode="decimal" value={property.estimated_value} onChange={(event) => setProperties((rows) => rows.map((row) => row.id === property.id ? { ...row, estimated_value: event.target.value.replace(/[^0-9.]/g, "") } : row))} /></label></div>{equity != null && <div className="propertyMetrics"><span><small>Stated equity</small><b>{money(equity)}</b></span><span><small>Current LTV</small><b>{ltv?.toFixed(1)}%</b></span><em>Unverified estimate</em></div>}</article>; })}{!properties.length && <button className="finderPropertyEmpty" type="button" onClick={() => setProperties([newProperty()])}><Building2 size={23} /><span><b>Add the first property</b><small>Capture address, type, debt, and estimated value.</small></span></button>}</section>}
          <button className="btn pri finderPrimary" onClick={() => screen.mutate(undefined)} disabled={screen.isPending}>{screen.isPending ? "Screening…" : t.screen}</button>
          {result && <div className="screenResults"><div className="screenSummary"><div><span>{t.requested}</span><b>{money(result.client_requested_amount)}</b></div><div><span>{t.recommended}</span><b>{money(result.recommended_amount)}</b></div>{result.real_estate_analysis?.property_count ? <div><span>Stated equity</span><b>{money(result.real_estate_analysis.total_stated_equity)}</b></div> : null}<small>{result.verification}</small></div>{result.evaluated_programs.map((program) => { const product = catalog.data?.items.find((item) => item.program_key === program.program_key); return <article key={program.program_key} className={`screenProgram ${program.status}`}><div><span className={`cellchip ${program.status === "recommended" ? "c-ok" : program.status === "blocked" ? "c-bad" : "c-warn"}`}>{program.status}</span><h4>{program.name}</h4></div>{program.strengths.map((item) => <p className="screenGood" key={item}>✓ {item}</p>)}{program.unresolved.map((item) => <p key={item}>• {item}</p>)}{program.borrower_safe_reasons.map((item) => <p className="screenBad" key={item}>× {item}</p>)}{product && <TermScenarioTables scenarios={product.term_scenarios} locale={locale} compact />}</article>; })}<div className="screenActions">{result.amount_adjustment_required && <button className="btn" onClick={() => confirmGoal.mutate()}>{t.confirm} · {money(result.recommended_amount)}</button>}{viableDirect ? <button className="btn pri" onClick={() => startApplication.mutate()}>{t.start}</button> : <button className="btn pri" disabled={!booking.data?.enabled} onClick={() => booking.data?.url && window.open(booking.data.url, "_blank", "noopener,noreferrer")}><CalendarDays size={16} /> {t.book}</button>}</div></div>}
        </div>}
      </div>
    </section>}
    <ProductShareDialog open={shareOpen} onClose={() => setShareOpen(false)} programKeys={activeKeys} locale={locale} sessionId={session?.id} />
    {message && <div className="toastInline" role="status">{message}</div>}
  </div>;
}
