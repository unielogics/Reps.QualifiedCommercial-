"use client";

// What the field team is bringing in. Super-admin only, enforced server-side.
//
// The headline number is deliberately NOT files opened. A rep can open twenty
// files in an afternoon and none of them are worth anything until a client
// actually sends something, so leading with the count would reward exactly the
// wrong behaviour. "With documents" is the number that separates a visit from
// a file.

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMe } from "@/lib/useMe";

type FileRow = {
  dealer_id: string;
  name: string;
  city: string | null;
  state: string | null;
  industry: string | null;
  status: string | null;
  decision: string | null;
  score: number | null;
  documents: number;
  created_at: string;
  last_activity: string | null;
};

type Rep = {
  funnel: Funnel;
  rep_user_id: string | null;
  rep_name: string;
  rep_email: string | null;
  files_opened: number;
  active: number;
  complete: number;
  declined: number;
  stalled: number;
  with_documents: number;
  fundable: number;
  avg_score: number | null;
  last_activity: string | null;
  insights: Insights;
  files: FileRow[];
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

type Production = { since: string | null; totals: Rep; reps: Rep[] };

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

function ago(iso: string | null): string {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
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
  const { isSuperAdmin, isResolving } = useMe();
  const [days, setDays] = useState(90);

  const q = useQuery({
    queryKey: ["production", days],
    queryFn: async () =>
      api<Production>(`/dealer-os/rep-production?days=${days}`, {
        authToken: (await getToken()) ?? undefined,
      }),
    enabled: isSuperAdmin,
  });

  if (isResolving) return null;
  if (!isSuperAdmin) {
    return (
      <div className="card">
        <b>Not available</b>
        <p className="sub mt">Production reporting is limited to super admins.</p>
      </div>
    );
  }

  const d = q.data;
  const t = d?.totals;

  return (
    <>
      <div className="hd">
        <h2>Production</h2>
        <p className="lede">
          Field output measured at the verification line, not at the point an application was opened.
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
        <div className="kpis mt">
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
            <span className="sub">All reps, this window</span>
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

      {d && d.reps.length === 0 && (
        <div className="card mt">
          <b>No field applications yet</b>
          <p className="sub mt">
            Once a rep opens their first application it appears here, along with whether the client
            has sent anything.
          </p>
        </div>
      )}

      {d?.reps.map((r) => (
        <div className="panel mt" key={r.rep_user_id ?? r.rep_name}>
          <div className="panel-h" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <b>{r.rep_name}</b>
            {r.rep_email && <span className="sub">{r.rep_email}</span>}
            <span style={{ flex: 1 }} />
            <span className="sub">last active {ago(r.last_activity)}</span>
          </div>
          <div className="panel-b">
            <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
              <span className="cellchip c-acc">{r.funnel.opened} opened</span>
              <span className="cellchip c-ok">{r.funnel.verified} verified</span>
              <span className="cellchip c-mut">{r.funnel.bank_linked} bank evidence</span>
              <span className="cellchip c-mut">{r.active} working</span>
              <span className="cellchip c-acc">{ratio(r.insights.underwriting_ready_ratio)} underwriting ready</span>
              <span className="cellchip c-ok">{r.insights.approved_or_fundable} approved/fundable</span>
              {r.complete > 0 && <span className="cellchip c-ok">{r.complete} complete</span>}
              {r.stalled > 0 && <span className="cellchip c-warn">{r.stalled} stalled</span>}
              {r.declined > 0 && <span className="cellchip c-bad">{r.declined} declined</span>}
              {r.avg_score !== null && <span className="sub">avg score {r.avg_score}</span>}
              <span className="sub">avg requested {money(r.insights.amount_metrics.average_requested)}</span>
            </div>
          </div>
        </div>
      ))}

      {d?.since && (
        <p className="sub mt">
          Counting applications opened since {new Date(d.since).toLocaleDateString()}.
        </p>
      )}
    </>
  );
}
