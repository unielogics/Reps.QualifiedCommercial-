"use client";

type Case = {
  annual_rate: number;
  monthly_payment: number;
  total_payments: number;
  total_interest: number;
};

export type TermScenario = {
  term_months: number;
  rate_type: "fixed" | "indexed" | string;
  illustration_amount: number;
  amount_source: "requested" | "default_illustration" | string;
  calculation_available: boolean;
  unavailable_reason: string | null;
  best: Case | null;
  highest_cost: Case | null;
  index_name?: string | null;
  index_value?: number | null;
  effective_date?: string | null;
};

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
const percent = (value: number) => `${(value * 100).toFixed(2)}%`;

function CaseTable({ data, title, tone, locale }: { data: Case; title: string; tone: "best" | "high"; locale: "en" | "es" }) {
  const rows = locale === "es" ? [
    ["Tasa anual", percent(data.annual_rate)],
    ["Pago mensual", money(data.monthly_payment)],
    ["Pagos totales", money(data.total_payments)],
    ["Interes total", money(data.total_interest)],
  ] : [
    ["Annual rate", percent(data.annual_rate)],
    ["Monthly payment", money(data.monthly_payment)],
    ["Total payments", money(data.total_payments)],
    ["Total interest", money(data.total_interest)],
  ];
  return <table className={`termCaseTable ${tone}`}><caption>{title}</caption><tbody>{rows.map(([label, value]) => <tr key={label}><th>{label}</th><td>{value}</td></tr>)}</tbody></table>;
}

export default function TermScenarioTables({ scenarios, locale = "en", compact = false }: { scenarios?: TermScenario[]; locale?: "en" | "es"; compact?: boolean }) {
  if (!scenarios?.length) return null;
  return <div className={`termScenarios ${compact ? "compact" : ""}`}>{scenarios.map((scenario) => <section className="termScenario" key={`${scenario.term_months}-${scenario.rate_type}`}>
    <header><div><span>{locale === "es" ? "Escenario de plazo" : "Term scenario"}</span><h4>{scenario.term_months} {locale === "es" ? "meses" : "months"}</h4></div><small>{locale === "es" ? "Ilustracion" : "Illustration"}: {money(scenario.illustration_amount)}</small></header>
    {scenario.calculation_available && scenario.best && scenario.highest_cost ? <div className="termScenarioCases"><CaseTable data={scenario.best} title={locale === "es" ? "Mejor tasa publicada" : "Best published case"} tone="best" locale={locale} /><CaseTable data={scenario.highest_cost} title={locale === "es" ? "Mayor costo configurado" : "Highest configured cost"} tone="high" locale={locale} /></div> : <div className="termUnavailable">{scenario.unavailable_reason || (locale === "es" ? "Los terminos se determinan despues de la revision." : "Terms determined after review.")}</div>}
  </section>)}</div>;
}
