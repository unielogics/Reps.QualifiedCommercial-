"use client";

import { useRef, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileCheck2,
  Share2,
  ShieldAlert,
  Target,
} from "lucide-react";
import { ProductIcon } from "@/components/ProductIcon";
import ProductShareDialog from "@/components/ProductShareDialog";
import { api, apiBase } from "@/lib/api";

type Locale = "en" | "es";
type ProductDetail = {
  program_key: string;
  category: string;
  name: string;
  summary: string | null;
  pricing: string | null;
  disclosure: string | null;
  amount_min: number | null;
  amount_max: number | null;
  term_min_months: number | null;
  term_max_months: number | null;
  direct_action: "start_application" | "book_call";
  icon_key: string;
  details: {
    closing_timeline?: string;
    uses?: string[];
    best_fit?: string[];
    minimum_requirements?: string[];
    documents?: string[];
    exclusions?: string[];
  };
};
type DetailResponse = { item: ProductDetail; position: number; total: number; previous_key: string; next_key: string };

function money(value: number | null) {
  return value == null ? "Awaiting review" : `$${Math.round(value).toLocaleString()}`;
}

function termRange(item: ProductDetail) {
  if (!item.term_min_months) return "Awaiting review";
  return item.term_min_months === item.term_max_months
    ? `${item.term_min_months} months`
    : `${item.term_min_months}-${item.term_max_months} months`;
}

function DetailList({ title, items, icon }: { title: string; items?: string[]; icon: ReactNode }) {
  return (
    <section className="bookletSection">
      <header>{icon}<h3>{title}</h3></header>
      {items?.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>Details available after preliminary review.</p>}
    </section>
  );
}

export default function ProductBookletPage() {
  const { program_key: rawKey } = useParams<{ program_key: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { getToken } = useAuth();
  const programKey = decodeURIComponent(rawKey);
  const [locale, setLocale] = useState<Locale>(search.get("locale") === "es" ? "es" : "en");
  const [shareOpen, setShareOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const touchStart = useRef<number | null>(null);

  const detail = useQuery({
    queryKey: ["product-detail", programKey, locale],
    queryFn: async () => api<DetailResponse>(`/dealer-os/products/detail/${encodeURIComponent(programKey)}?locale=${locale}`, { authToken: (await getToken()) ?? undefined }),
  });
  const booking = useQuery({
    queryKey: ["products", "booking"],
    queryFn: async () => api<{ enabled: boolean; url: string | null }>("/dealer-os/products/booking", { authToken: (await getToken()) ?? undefined }),
  });

  const go = (key: string | undefined) => {
    if (key) router.push(`/products/${key}?locale=${locale}`);
  };
  const download = async () => {
    const token = await getToken();
    const response = await fetch(`${apiBase}/dealer-os/products/pdf?locale=${locale}&keys=${encodeURIComponent(programKey)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) return setNotice("PDF unavailable");
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${programKey}-${locale}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (detail.isLoading) return <div className="bookletLoading">Loading program...</div>;
  if (!detail.data) return <div className="empty">Program unavailable.</div>;
  const { item } = detail.data;
  const labels = locale === "es" ? {
    back: "Todos los productos", program: "Programa", amount: "Monto", term: "Plazo", pricing: "Precio indicativo", timeline: "Tiempo de cierre",
    uses: "Usos permitidos", fit: "Mejor perfil", requirements: "Requisitos minimos", documents: "Documentos esperados", limitations: "Limitaciones y exclusiones",
    compare: "Agregar a comparacion", share: "Compartir PDF", download: "Descargar PDF", start: "Iniciar solicitud", book: "Reservar llamada de financiamiento",
  } : {
    back: "All products", program: "Program", amount: "Amount", term: "Term", pricing: "Indicative pricing", timeline: "Closing timeline",
    uses: "Permitted uses", fit: "Best fit", requirements: "Minimum requirements", documents: "Expected documents", limitations: "Limitations and exclusions",
    compare: "Add to comparison", share: "Share PDF", download: "Download PDF", start: "Start application", book: "Book a funding call",
  };

  return (
    <div
      className="productBooklet"
      onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }}
      onTouchEnd={(event) => {
        if (touchStart.current == null) return;
        const distance = (event.changedTouches[0]?.clientX ?? touchStart.current) - touchStart.current;
        if (Math.abs(distance) > 65) go(distance < 0 ? detail.data.next_key : detail.data.previous_key);
        touchStart.current = null;
      }}
    >
      <header className="bookletToolbar">
        <button className="backLinkButton" onClick={() => router.push("/products")}><ArrowLeft size={17} /> {labels.back}</button>
        <span className="sp" />
        <button className="btn" onClick={() => router.push(`/products?selected=${programKey}&locale=${locale}`)}>{labels.compare}</button>
        <button className="btn" onClick={() => setShareOpen(true)}><Share2 size={16} /> {labels.share}</button>
        <div className="seg"><button className={locale === "en" ? "on" : ""} onClick={() => setLocale("en")}>EN</button><button className={locale === "es" ? "on" : ""} onClick={() => setLocale("es")}>ES</button></div>
      </header>

      <main className="bookletPage">
        <section className="bookletHero">
          <div className="bookletHeroIcon"><ProductIcon programKey={item.icon_key || item.program_key} size={32} /></div>
          <div className="bookletHeroCopy">
            <span className="eyebrow">{labels.program} {detail.data.position} of {detail.data.total} - {item.category}</span>
            <h1>{item.name}</h1>
            <p>{item.summary}</p>
          </div>
          <div className="bookletPager">
            <button className="iconAction" onClick={() => go(detail.data.previous_key)} aria-label="Previous program"><ChevronLeft size={20} /></button>
            <span>{detail.data.position} / {detail.data.total}</span>
            <button className="iconAction" onClick={() => go(detail.data.next_key)} aria-label="Next program"><ChevronRight size={20} /></button>
          </div>
        </section>

        <section className="bookletTerms">
          <div><span>{labels.amount}</span><b>{money(item.amount_min)} - {money(item.amount_max)}</b></div>
          <div><span>{labels.term}</span><b>{termRange(item)}</b></div>
          <div><span>{labels.pricing}</span><b>{item.pricing || "Subject to review"}</b></div>
          <div><span>{labels.timeline}</span><b>{item.details.closing_timeline || "Subject to review"}</b></div>
        </section>

        <div className="bookletGrid">
          <DetailList title={labels.uses} items={item.details.uses} icon={<CheckCircle2 size={19} />} />
          <DetailList title={labels.fit} items={item.details.best_fit} icon={<Target size={19} />} />
          <DetailList title={labels.requirements} items={item.details.minimum_requirements} icon={<FileCheck2 size={19} />} />
          <DetailList title={labels.documents} items={item.details.documents} icon={<Download size={19} />} />
          <DetailList title={labels.limitations} items={item.details.exclusions} icon={<ShieldAlert size={19} />} />
          <section className="bookletSection bookletDecision">
            <header><Clock3 size={19} /><h3>Next step</h3></header>
            <p>{item.direct_action === "start_application" ? "This direct program can begin in Field Desk now." : "This program requires a structured funding call before application."}</p>
            {item.direct_action === "start_application" ? <button className="btn pri" onClick={() => router.push("/?new=1")}>{labels.start}</button> : <button className="btn pri" disabled={!booking.data?.enabled} onClick={() => booking.data?.url && window.open(booking.data.url, "_blank", "noopener,noreferrer")}><CalendarDays size={17} /> {labels.book}</button>}
          </section>
        </div>

        <footer className="bookletDisclosure"><p>{item.disclosure || "Preliminary program information only. Final eligibility and terms require underwriting."}</p><button className="btn" onClick={() => void download()}><Download size={16} /> {labels.download}</button></footer>
      </main>
      <ProductShareDialog open={shareOpen} onClose={() => setShareOpen(false)} programKeys={[programKey]} locale={locale} />
      {notice && <div className="toastInline">{notice}</div>}
    </div>
  );
}
