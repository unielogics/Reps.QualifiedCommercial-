"use client";

import { useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api, apiBase } from "@/lib/api";

type Locale = "en" | "es";
type Product = { program_key: string; category: string; name: string; summary: string | null; highlights: string[]; pricing: string | null; disclosure: string | null; amount_min: number | null; amount_max: number | null; term_min_months: number | null; term_max_months: number | null };
type Question = { key: string; kind: "money" | "text" | "number" | "select" | "boolean"; label: string };
type Catalog = { items: Product[]; questions: Question[] };
type Contact = { id: string; name: string; company: string | null; email: string | null };
type ContactPage = { items: Contact[]; total: number };
type ProgramResult = { program_key: string; name: string; status: "recommended" | "potential" | "blocked"; borrower_safe_reasons: string[]; unresolved: string[]; strengths: string[]; estimated_max_amount: number };
type ScreeningResult = { verification: string; client_requested_amount: number | null; recommended_amount: number | null; amount_adjustment_required: boolean; evaluated_programs: ProgramResult[]; next_question: Question | null };

const text = {
  en: { title: "Products", sub: "Browse and present programs before opening a formal application.", browse: "Browse products", finder: "Product Finder", search: "Search products", compare: "Compare", present: "Present", pdf: "Share PDF", start: "Start application", amount: "Program amount", term: "Term", pricing: "Indicative pricing", preliminary: "Preliminary fit only. Verify all eligibility before submission.", details: "Prospect basics", screen: "Screen programs", next: "Next question", results: "Screening results", requested: "Client requested", recommended: "Screened maximum", confirm: "Confirm funding goal", contact: "Contact", send: "Send presentation" },
  es: { title: "Productos", sub: "Explore y presente programas antes de abrir una solicitud formal.", browse: "Ver productos", finder: "Buscador de productos", search: "Buscar productos", compare: "Comparar", present: "Presentar", pdf: "Compartir PDF", start: "Iniciar solicitud", amount: "Monto del programa", term: "Plazo", pricing: "Precio indicativo", preliminary: "Evaluación preliminar. Verifique la elegibilidad antes de enviar.", details: "Datos del prospecto", screen: "Evaluar programas", next: "Siguiente pregunta", results: "Resultados", requested: "Monto solicitado", recommended: "Máximo evaluado", confirm: "Confirmar meta", contact: "Contacto", send: "Enviar presentación" },
};

function money(value: number | null) { return value == null ? "—" : `$${Math.round(value).toLocaleString()}`; }
function termRange(item: Product) {
  if (!item.term_min_months) return "—";
  return item.term_min_months === item.term_max_months ? `${item.term_min_months} mo` : `${item.term_min_months}–${item.term_max_months} mo`;
}

export default function ProductsPage() {
  const { getToken } = useAuth();
  const router = useRouter();
  const rail = useRef<HTMLDivElement>(null);
  const [locale, setLocale] = useState<Locale>("en");
  const [mode, setMode] = useState<"browse" | "finder">("browse");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [contactId, setContactId] = useState("");
  const [profile, setProfile] = useState({ company_name: "", contact_name: "", email: "", phone: "", industry: "", requested_amount: "", use_of_funds: "" });
  const [session, setSession] = useState<{ id: string; dealer_id: string; contact_id: string } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | number | boolean>>({});
  const [result, setResult] = useState<ScreeningResult | null>(null);
  const [message, setMessage] = useState("");
  const t = text[locale];

  const catalog = useQuery({
    queryKey: ["products", locale],
    queryFn: async () => api<Catalog>(`/dealer-os/products?locale=${locale}`, { authToken: (await getToken()) ?? undefined }),
  });
  const contacts = useQuery({
    queryKey: ["contacts", "products"],
    queryFn: async () => api<ContactPage>("/dealer-os/contacts?limit=50&offset=0", { authToken: (await getToken()) ?? undefined }),
  });
  const items = useMemo(() => (catalog.data?.items ?? []).filter((item) => (category === "all" || item.category === category) && `${item.name} ${item.summary ?? ""}`.toLowerCase().includes(search.toLowerCase())), [catalog.data, category, search]);
  const categories = Array.from(new Set((catalog.data?.items ?? []).map((item) => item.category)));
  const activeKeys = selected.length ? selected : items.slice(0, 1).map((item) => item.program_key);

  const createSession = useMutation({
    mutationFn: async () => api<{ id: string; dealer_id: string; contact_id: string; answers: Record<string, unknown> }>("/dealer-os/product-finder/sessions", { method: "POST", authToken: (await getToken()) ?? undefined, body: JSON.stringify({ ...profile, requested_amount: Number(profile.requested_amount), locale }) }),
    onSuccess: (data) => { setSession(data); setContactId(data.contact_id); setAnswers((old) => ({ ...(data.answers as Record<string, string | number | boolean>), ...old })); setMessage(""); },
  });
  const screen = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error("Create the prospect first");
      return api<{ result: ScreeningResult }>(`/dealer-os/product-finder/sessions/${session.id}/screen`, { method: "POST", authToken: (await getToken()) ?? undefined, body: JSON.stringify({ answers }) });
    },
    onSuccess: (data) => { setResult(data.result); setSelected(data.result.evaluated_programs.filter((p) => p.status !== "blocked").map((p) => p.program_key)); },
  });
  const confirmGoal = useMutation({
    mutationFn: async () => api(`/dealer-os/product-finder/sessions/${session?.id}/confirm-funding-goal`, { method: "POST", authToken: (await getToken()) ?? undefined, body: JSON.stringify({ amount: result?.recommended_amount }) }),
    onSuccess: () => setMessage(locale === "es" ? "Meta de financiamiento confirmada." : "Funding goal confirmed."),
  });
  const startApplication = useMutation({
    mutationFn: async () => api<{ route: string }>(`/dealer-os/product-finder/sessions/${session?.id}/start-application`, { method: "POST", authToken: (await getToken()) ?? undefined }),
    onSuccess: (data) => router.push(data.route),
  });
  const present = useMutation({
    mutationFn: async (channel: "in_person" | "email") => api<{ delivery_status: string }>("/dealer-os/product-presentations", { method: "POST", authToken: (await getToken()) ?? undefined, body: JSON.stringify({ contact_id: contactId, session_id: session?.id, program_keys: activeKeys, locale, channel }) }),
    onSuccess: (data) => setMessage(`${locale === "es" ? "Presentación" : "Presentation"}: ${data.delivery_status}`),
  });

  const downloadPdf = async () => {
    const token = await getToken();
    const response = await fetch(`${apiBase}/dealer-os/products/pdf?locale=${locale}&keys=${encodeURIComponent(activeKeys.join(","))}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) return setMessage("PDF unavailable");
    const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `qc-product-catalog-${locale}.pdf`; anchor.click(); URL.revokeObjectURL(url);
  };

  return <div className="productsPage">
    <header className="hd productHeader">
      <div><span className="eyebrow">Field Desk catalog</span><h2>{t.title}</h2><p className="lede">{t.sub}</p></div>
      <div className="productHeaderActions">
        <div className="seg" aria-label="Language"><button className={locale === "en" ? "on" : ""} onClick={() => setLocale("en")}>EN</button><button className={locale === "es" ? "on" : ""} onClick={() => setLocale("es")}>ES</button></div>
        <button className={`finderLaunch ${mode === "finder" ? "on" : ""}`} onClick={() => setMode(mode === "finder" ? "browse" : "finder")} title={t.finder} aria-label={t.finder}><span>⌁</span><b>{t.finder}</b></button>
      </div>
    </header>

    <div className="seg productMode" role="tablist"><button className={mode === "browse" ? "on" : ""} onClick={() => setMode("browse")}>{t.browse}</button><button className={mode === "finder" ? "on" : ""} onClick={() => setMode("finder")}>{t.finder}</button></div>

    {mode === "browse" ? <>
      <div className="productToolbar mt"><input className="field" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.search} /><select className="field" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select><span className="sp" /><button className="iconAction" aria-label="Previous product" onClick={() => rail.current?.scrollBy({ left: -360, behavior: "smooth" })}>←</button><button className="iconAction" aria-label="Next product" onClick={() => rail.current?.scrollBy({ left: 360, behavior: "smooth" })}>→</button></div>
      <div className="productRail" ref={rail}>{items.map((item) => { const on = selected.includes(item.program_key); return <article className={`productCard ${on ? "selected" : ""}`} key={item.program_key}>
        <div className="productCardTop"><span className="productGlyph">▦</span><span className="cellchip c-mut">{item.category}</span></div><h3>{item.name}</h3><p>{item.summary || t.preliminary}</p>
        <dl><div><dt>{t.amount}</dt><dd>{money(item.amount_min)}–{money(item.amount_max)}</dd></div><div><dt>{t.term}</dt><dd>{termRange(item)}</dd></div><div><dt>{t.pricing}</dt><dd>{item.pricing || "—"}</dd></div></dl>
        <div className="productActions"><button className={`btn ${on ? "pri" : ""}`} onClick={() => setSelected((old) => on ? old.filter((key) => key !== item.program_key) : [...old, item.program_key])}>{t.compare}</button><button className="btn" onClick={() => { setSelected([item.program_key]); present.mutate("in_person"); }} disabled={!contactId}>{t.present}</button><button className="btn" onClick={() => router.push("/?new=1")}>{t.start}</button></div>
      </article>; })}</div>
      <section className="productCompare panel mt"><div><span className="eyebrow">Selected comparison</span><h3>{activeKeys.length} program{activeKeys.length === 1 ? "" : "s"}</h3></div><label className="productContact"><span>{t.contact}</span><select className="field" value={contactId} onChange={(event) => setContactId(event.target.value)}><option value="">Select contact</option>{contacts.data?.items.map((contact) => <option value={contact.id} key={contact.id}>{contact.name} · {contact.company}</option>)}</select></label><button className="btn" onClick={downloadPdf}>{t.pdf}</button><button className="btn pri" disabled={!contactId} onClick={() => present.mutate("email")}>{t.send}</button></section>
    </> : <section className="finderWorkspace mt">
      <aside className="finderIntro"><span className="finderOrb">⌁</span><span className="eyebrow">Guided screening</span><h3>{t.finder}</h3><p>Answer one gate at a time. A failed gate removes only that program, while the original client request stays unchanged.</p><div className="finderTrust"><b>Self-reported</b><span>Results recalculate when verified bank and credit evidence arrives.</span></div></aside>
      <div className="finderMain">
        {!session ? <div className="finderForm"><h3>{t.details}</h3><div className="fieldGrid"><label><span>Business</span><input className="field" value={profile.company_name} onChange={(e) => setProfile({ ...profile, company_name: e.target.value })} /></label><label><span>Name</span><input className="field" value={profile.contact_name} onChange={(e) => setProfile({ ...profile, contact_name: e.target.value })} /></label><label><span>Email</span><input className="field" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} /></label><label><span>Phone</span><input className="field" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></label><label><span>Industry</span><input className="field" value={profile.industry} onChange={(e) => setProfile({ ...profile, industry: e.target.value })} /></label><label><span>Requested amount</span><input className="field" inputMode="numeric" value={profile.requested_amount} onChange={(e) => setProfile({ ...profile, requested_amount: e.target.value })} /></label><label className="full"><span>Detailed use of funds</span><textarea className="field" rows={4} value={profile.use_of_funds} onChange={(e) => setProfile({ ...profile, use_of_funds: e.target.value })} /></label></div><button className="btn pri finderPrimary" disabled={!profile.company_name || !profile.contact_name || !profile.requested_amount || !profile.use_of_funds || createSession.isPending} onClick={() => createSession.mutate()}>{createSession.isPending ? "Creating…" : t.next}</button></div>
        : <div className="finderConversation"><div className="finderFact"><b>{profile.company_name}</b><span>{money(Number(profile.requested_amount))} · {profile.use_of_funds}</span></div>
          {(catalog.data?.questions ?? []).map((question, index) => { const value = answers[question.key]; const active = index === (catalog.data?.questions ?? []).findIndex((entry) => answers[entry.key] === undefined); const answered = value !== undefined; if (!active && !answered) return null; return <div className={`finderQuestion ${active ? "active" : "answered"}`} key={question.key}><span className="questionNumber">{answered ? "✓" : index + 1}</span><div><b>{question.label}</b>{question.kind === "boolean" ? <div className="seg mt"><button className={value === true ? "on" : ""} onClick={() => setAnswers({ ...answers, [question.key]: true })}>Yes</button><button className={value === false ? "on" : ""} onClick={() => setAnswers({ ...answers, [question.key]: false })}>No</button></div> : <input className="field mt" value={String(value ?? "")} onChange={(event) => setAnswers({ ...answers, [question.key]: question.kind === "number" || question.kind === "money" ? Number(event.target.value) : event.target.value })} />}</div></div>; })}
          <button className="btn pri finderPrimary" onClick={() => screen.mutate()} disabled={screen.isPending}>{screen.isPending ? "Screening…" : t.screen}</button>
          {result && <div className="screenResults"><div className="screenSummary"><div><span>{t.requested}</span><b>{money(result.client_requested_amount)}</b></div><div><span>{t.recommended}</span><b>{money(result.recommended_amount)}</b></div><small>{result.verification}</small></div>{result.evaluated_programs.map((program) => <article key={program.program_key} className={`screenProgram ${program.status}`}><div><span className={`cellchip ${program.status === "recommended" ? "c-ok" : program.status === "blocked" ? "c-bad" : "c-warn"}`}>{program.status}</span><h4>{program.name}</h4></div>{program.strengths.map((item) => <p className="screenGood" key={item}>✓ {item}</p>)}{program.unresolved.map((item) => <p key={item}>• {item}</p>)}{program.borrower_safe_reasons.map((item) => <p className="screenBad" key={item}>× {item}</p>)}</article>)}
            <div className="screenActions">{result.amount_adjustment_required && <button className="btn" onClick={() => confirmGoal.mutate()}>{t.confirm} · {money(result.recommended_amount)}</button>}<button className="btn pri" onClick={() => startApplication.mutate()}>{t.start}</button></div></div>}
        </div>}
      </div>
    </section>}
    {message && <div className="toastInline" role="status">{message}</div>}
  </div>;
}
