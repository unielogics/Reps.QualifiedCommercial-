"use client";

// What the field team is bringing in. The backend scopes this report to the
// signed-in rep's own book or to the full firm for team users.
//
// The headline number is deliberately NOT applications opened. A rep can open
// twenty applications in an afternoon and none of them are worth anything until
// a client actually sends something, so leading with the count would reward
// exactly the wrong behaviour.

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMe } from "@/lib/useMe";

type ProductionTotals = {
  funnel: Funnel;
  with_documents: number;
  insights: Insights;
};

type CategoryMetric = {
  industry: string;
  opened: number;
  approved_or_fundable: number;
};

type LocationMetric = {
  location: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  opened: number;
  approved_or_fundable: number;
};

type AmountMetric = {
  average_requested: number | null;
  average_approved: number | null;
  approved_amount_source: string;
  approved_amount_source_counts: Record<string, number>;
};

type Insights = {
  underwriting_ready: number;
  approved_or_fundable: number;
  underwriting_ready_ratio: number | null;
  approved_or_fundable_ratio: number | null;
  document_ratio: number | null;
  contract_execution_ratio: number | null;
  amount_metrics: AmountMetric;
  top_new_app_industries: CategoryMetric[];
  top_approved_industries: CategoryMetric[];
  top_new_app_towns: LocationMetric[];
  top_approved_towns: LocationMetric[];
  top_new_app_zip_codes: LocationMetric[];
  top_approved_zip_codes: LocationMetric[];
};

type Funnel = {
  opened: number;
  authorizations_sent: number;
  bank_linked: number;
  credit_returned: number;
  verified: number;
  application_submitted: number;
  contract_executed: number;
};

type Production = {
  scope: "own" | "firm";
  since: string | null;
  totals: ProductionTotals;
};

const STAGES: Array<{ key: keyof Funnel; label: string }> = [
  { key: "opened", label: "Opened" },
  { key: "authorizations_sent", label: "Authorizations sent" },
  { key: "bank_linked", label: "Bank linked" },
  { key: "credit_returned", label: "Credit returned" },
  { key: "application_submitted", label: "Application submitted" },
  { key: "contract_executed", label: "Contract executed" },
];

/** Where the funnel actually leaks, said in a sentence.
 *
 * A bar chart shows the drop; it does not say which drop is the one to act on.
 * The largest single fall is almost always sent-to-linked, because that is the
 * only stage that depends on the applicant doing something on their own. */
function reading(f: Funnel): string {
  const pairs = STAGES.slice(1).map((s, i) => ({
    from: STAGES[i].label,
    to: s.label,
    lost: f[STAGES[i].key] - f[s.key],
  }));
  const worst = pairs.reduce((a, b) => (b.lost > a.lost ? b : a), pairs[0]);
  if (!worst || worst.lost <= 0) return "No drop between stages in this window.";
  return `The largest drop is between ${worst.from.toLowerCase()} and ${worst.to.toLowerCase()}: ${worst.lost} application${worst.lost === 1 ? "" : "s"}.`;
}

const WINDOWS = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
];

function pct(n: number, of: number): string {
  if (!of) return "—";
  return `${Math.round((n / of) * 100)}% of opened`;
}

function ratio(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

function money(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function RatioBar({ label, value }: { label: string; value: number | null }) {
  const width = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="barrow">
      <div className="bn">{label}</div>
      <div className="track">
        <div className="fill" style={{ width: `${width}%` }} />
      </div>
      <div className="bv num">{ratio(value)}</div>
    </div>
  );
}

function IndustryTable({ rows }: { rows: CategoryMetric[] }) {
  return (
    <div className="tblwrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Category</th>
            <th className="r">New apps</th>
            <th className="r">Approved / fundable</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.industry}>
              <td>
                <b>{row.industry}</b>
              </td>
              <td className="r num">{row.opened}</td>
              <td className="r num">{row.approved_or_fundable}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="sub">
                No category trend yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function LocationTable({ rows }: { rows: LocationMetric[] }) {
  return (
    <div className="tblwrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Location</th>
            <th className="r">New apps</th>
            <th className="r">Approved / fundable</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.location}-${row.zip ?? ""}`}>
              <td>
                <b>{row.location}</b>
              </td>
              <td className="r num">{row.opened}</td>
              <td className="r num">{row.approved_or_fundable}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="sub">
                No location trend yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function ProductionPage() {
  const { getToken } = useAuth();
  const { isRep, isTeam, isResolving } = useMe();
  const [days, setDays] = useState(90);
  const canViewProduction = isRep || isTeam;

  const q = useQuery({
    queryKey: ["production", days],
    queryFn: async () =>
      api<Production>(`/dealer-os/rep-production?days=${days}`, {
        authToken: (await getToken()) ?? undefined,
      }),
    enabled: canViewProduction,
  });

  if (isResolving) return null;
  if (!canViewProduction) {
    return (
      <div className="card">
        <b>Not available</b>
        <p className="sub mt">Production reporting is available to Field Desk staff.</p>
      </div>
    );
  }

  const d = q.data;
  const t = d?.totals;
  const isOwnScope = d?.scope === "own";

  return (
    <>
      <div className="hd">
        <h2>{isOwnScope ? "Your production" : "Production"}</h2>
        <p className="lede">
          {isOwnScope
            ? "Your field output, measured at the verification line rather than when an application was opened."
            : "Field output measured at the verification line, not at the point an application was opened."}
        </p>
      </div>

      <div className="row mt" style={{ gap: 8 }}>
        <div className="seg">
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              type="button"
              className={days === w.days ? "on" : undefined}
              onClick={() => setDays(w.days)}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {q.isLoading && <p className="sub mt">Loading…</p>}
      {q.isError && <div className="note mt">Could not load production.</div>}

      {t && (
        <div className="kpis production-kpis mt">
          <div className="kpi">
            <span className="lbl">Applications opened</span>
            <b className="knum num">{t.funnel.opened}</b>
            <span className="sub">New applications in this window</span>
          </div>
          <div className="kpi">
            <span className="lbl">Bank evidence</span>
            <b className="knum num">{t.funnel.bank_linked}</b>
            <span className="sub">{pct(t.funnel.bank_linked, t.funnel.opened)}</span>
          </div>
          <div className="kpi">
            <span className="lbl">Underwriting ready</span>
            <b className="knum num">{t.funnel.verified}</b>
            <span className="sub">{ratio(t.insights.underwriting_ready_ratio)}</span>
          </div>
          <div className="kpi">
            <span className="lbl">Approved / fundable</span>
            <b className="knum num">{t.insights.approved_or_fundable}</b>
            <span className="sub">{ratio(t.insights.approved_or_fundable_ratio)}</span>
          </div>
          <div className="kpi">
            <span className="lbl">Contracts executed</span>
            <b className="knum num">{t.funnel.contract_executed}</b>
            <span className="sub">{ratio(t.insights.contract_execution_ratio)}</span>
          </div>
          <div className="kpi">
            <span className="lbl">With documents</span>
            <b className="knum num">{t.with_documents}</b>
            <span className="sub">{ratio(t.insights.document_ratio)}</span>
          </div>
          <div className="kpi">
            <span className="lbl">Avg requested</span>
            <b className="knum num">{money(t.insights.amount_metrics.average_requested)}</b>
            <span className="sub">Funding goal where entered</span>
          </div>
          <div className="kpi">
            <span className="lbl">Avg approved</span>
            <b className="knum num">{money(t.insights.amount_metrics.average_approved)}</b>
            <span className="sub">Source: {t.insights.amount_metrics.approved_amount_source}</span>
          </div>
        </div>
      )}

      {t && (
        <div className="panel mt">
          <div className="panel-h">
            Verification funnel
            <span style={{ flex: 1 }} />
            <span className="sub">{isOwnScope ? "Your book, this window" : "All reps, this window"}</span>
          </div>
          <div className="panel-b">
            {STAGES.map((st) => {
              const v = t.funnel[st.key];
              const top = t.funnel.opened || 1;
              return (
                <div className="barrow" key={st.key}>
                  <div className="bn">{st.label}</div>
                  <div className="track">
                    <div className="fill" style={{ width: `${Math.round((v / top) * 100)}%` }} />
                  </div>
                  <div className="bv num">{v}</div>
                </div>
              );
            })}
            <span className="sub" style={{ display: "block", marginTop: 12 }}>
              {reading(t.funnel)}
            </span>
          </div>
        </div>
      )}

      {t && (
        <div className="cg mt">
          <div className="panel s6">
            <div className="panel-h">Loan ratios</div>
            <div className="panel-b">
              <RatioBar label="Underwriting ready" value={t.insights.underwriting_ready_ratio} />
              <RatioBar label="Approved / fundable" value={t.insights.approved_or_fundable_ratio} />
              <RatioBar label="Document coverage" value={t.insights.document_ratio} />
              <RatioBar label="Contracts executed" value={t.insights.contract_execution_ratio} />
            </div>
          </div>
          <div className="panel s6">
            <div className="panel-h">Approved loan amounts</div>
            <div className="panel-b">
              <div className="kpis">
                <div className="kpi">
                  <span className="lbl">Average requested</span>
                  <b className="knum num">{money(t.insights.amount_metrics.average_requested)}</b>
                  <span className="sub">Applications with a funding goal</span>
                </div>
                <div className="kpi">
                  <span className="lbl">Average approved</span>
                  <b className="knum num">{money(t.insights.amount_metrics.average_approved)}</b>
                  <span className="sub">
                    {Object.entries(t.insights.amount_metrics.approved_amount_source_counts)
                      .map(([source, count]) => `${source}: ${count}`)
                      .join(" · ") || "No approved amount source yet"}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="panel s6">
            <div className="panel-h">Trending new-app categories</div>
            <IndustryTable rows={t.insights.top_new_app_industries} />
          </div>
          <div className="panel s6">
            <div className="panel-h">Approved / fundable categories</div>
            <IndustryTable rows={t.insights.top_approved_industries} />
          </div>
          <div className="panel s6">
            <div className="panel-h">Trending towns</div>
            <LocationTable rows={t.insights.top_new_app_towns} />
          </div>
          <div className="panel s6">
            <div className="panel-h">Trending ZIP codes</div>
            <LocationTable rows={t.insights.top_new_app_zip_codes} />
          </div>
          <div className="panel s6">
            <div className="panel-h">Approved / fundable towns</div>
            <LocationTable rows={t.insights.top_approved_towns} />
          </div>
          <div className="panel s6">
            <div className="panel-h">Approved / fundable ZIP codes</div>
            <LocationTable rows={t.insights.top_approved_zip_codes} />
          </div>
        </div>
      )}

      {d?.since && (
        <p className="sub mt">
          Counting applications opened since {new Date(d.since).toLocaleDateString()}.
        </p>
      )}
    </>
  );
}
