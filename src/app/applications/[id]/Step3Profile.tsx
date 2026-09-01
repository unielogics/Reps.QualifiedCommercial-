"use client";

// Step 3 - the evidence-backed financial profile.
//
// Values carry their source and remain null when evidence cannot support them.
// Extracted estimates can prefill confirmation fields, but only a rep action
// turns them into confirmed application data.

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { useCase } from "@/lib/useCase";
import {
  activeUnderwritingReviewPreference,
  type UnderwritingReviewPreference,
} from "@/lib/underwritingReview";
import StepActions from "@/components/StepActions";
import UnderwritingSlots from "@/components/UnderwritingSlots";
import { useUploadManager } from "@/components/UploadManager";
import FinancialConfirmation from "./FinancialConfirmation";
import Step4DebtSchedule from "./Step4DebtSchedule";

type NumericLike = number | string | null | undefined;

type RawPeriod = {
  period: string;
  deposits: NumericLike;
  starting_balance: NumericLike;
  ending_balance: NumericLike;
  avg_daily_balance: NumericLike;
  low_balance: NumericLike;
  nsf_count: NumericLike;
  account_id: string | null;
};

type Period = Omit<RawPeriod, "deposits" | "starting_balance" | "ending_balance" | "avg_daily_balance" | "low_balance" | "nsf_count"> & {
  deposits: number | null;
  starting_balance: number | null;
  ending_balance: number | null;
  avg_daily_balance: number | null;
  low_balance: number | null;
  nsf_count: number | null;
};

type Coverage = {
  statement_months: string[];
  statement_target: number;
  tax_years: number[];
  tax_target: number;
  has_pl: boolean;
  has_debt_schedule: boolean;
  open_doc_requests: number;
  expected_months: string[];
  missing_months: string[];
  is_current: boolean;
};

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/[$,%x,]/gi, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizePeriod(row: RawPeriod): Period {
  return {
    ...row,
    deposits: finiteNumber(row.deposits),
    starting_balance: finiteNumber(row.starting_balance),
    ending_balance: finiteNumber(row.ending_balance),
    avg_daily_balance: finiteNumber(row.avg_daily_balance),
    low_balance: finiteNumber(row.low_balance),
    nsf_count: finiteNumber(row.nsf_count),
  };
}

function money(n: number | null | undefined, compact = false): string {
  if (n === null || n === undefined) return "—";
  if (compact && Math.abs(n) >= 1000) return "$" + Math.round(n / 1000) + "k";
  return "$" + Math.round(n).toLocaleString();
}

function monthLabel(iso: string): string {
  return new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString(undefined, {
    month: "short",
  });
}

type BalanceKey = "starting_balance" | "ending_balance" | "avg_daily_balance";

const BALANCE_SERIES: Array<{ key: BalanceKey; label: string; color: string }> = [
  { key: "starting_balance", label: "Starting balance", color: "#0d6e63" },
  { key: "ending_balance", label: "Ending balance", color: "#1b4b9e" },
  { key: "avg_daily_balance", label: "Average daily balance", color: "#b78600" },
];

/** Evidence-backed monthly balances. Hover, focus, or tap a month for details. */
function BalanceChart({ rows }: { rows: Period[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  if (rows.length === 0) {
    return (
      <span className="sub">
        No monthly activity yet. Plaid Asset data or uploaded bank PDFs populate this after
        ingestion completes.
      </span>
    );
  }
  const values = rows.flatMap((row) => BALANCE_SERIES.map(({ key }) => row[key])).filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  if (values.length === 0) {
    return <span className="sub">The verified bank months are present, but no readable monthly balance figures were found.</span>;
  }
  const W = 720;
  const H = 230;
  const left = 64;
  const right = 22;
  const top = 24;
  const bottom = 184;
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const spread = Math.max(rawMax - rawMin, Math.abs(rawMax) * 0.1, 1);
  const minimum = rawMin >= 0 ? 0 : rawMin - spread * 0.08;
  const maximum = rawMax + spread * 0.08;
  const slot = (W - left - right) / Math.max(rows.length, 1);
  const x = (index: number) => left + slot * index + slot / 2;
  const y = (value: number) => bottom - ((value - minimum) / Math.max(maximum - minimum, 1)) * (bottom - top);
  const segments = (key: BalanceKey): string[] => {
    const result: string[] = [];
    let current: string[] = [];
    rows.forEach((row, index) => {
      const value = row[key];
      if (value === null || !Number.isFinite(value)) {
        if (current.length > 1) result.push(current.join(" "));
        current = [];
        return;
      }
      current.push(`${x(index)},${y(value)}`);
    });
    if (current.length > 1) result.push(current.join(" "));
    return result;
  };
  const active = activeIndex === null ? null : rows[activeIndex];
  const tickValues = [maximum, (maximum + minimum) / 2, minimum];

  return (
    <div className="balanceChart">
      <svg viewBox={`0 0 ${W} ${H}`} aria-label="Starting, ending, and average daily balances for up to six verified bank months">
        {tickValues.map((value, index) => {
          const tickY = top + ((bottom - top) / 2) * index;
          return (
            <g key={index}>
              <line x1={left} y1={tickY} x2={W - right} y2={tickY} className="balanceGrid" />
              <text x={left - 8} y={tickY + 4} textAnchor="end" className="balanceAxis">{money(value, true)}</text>
            </g>
          );
        })}
        {BALANCE_SERIES.map((series) => (
          <g key={series.key}>
            {segments(series.key).map((points, index) => (
              <polyline key={index} points={points} fill="none" stroke={series.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {rows.map((row, index) => row[series.key] !== null && (
              <circle key={`${series.key}-${row.period}`} cx={x(index)} cy={y(row[series.key] as number)} r={activeIndex === index ? 5 : 3.5} fill={series.color} stroke="var(--surface)" strokeWidth="2" />
            ))}
          </g>
        ))}
        {rows.map((row, index) => (
          <g key={row.period}>
            <rect
              x={left + slot * index}
              y={top}
              width={slot}
              height={bottom - top + 24}
              className={activeIndex === index ? "balanceHit active" : "balanceHit"}
              tabIndex={0}
              role="button"
              aria-label={`${monthLabel(row.period)} financial details`}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
              onFocus={() => setActiveIndex(index)}
              onBlur={() => setActiveIndex(null)}
              onClick={() => setActiveIndex((current) => current === index ? null : index)}
            />
            <text x={x(index)} y={bottom + 25} textAnchor="middle" className="balanceMonth">{monthLabel(row.period)}</text>
          </g>
        ))}
      </svg>
      <div className="lg">
        {BALANCE_SERIES.map((series) => <span key={series.key}><i style={{ background: series.color }} />{series.label}</span>)}
      </div>
      {active ? (
        <div className="balanceDetails" role="status">
          <div><span>Statement month</span><b>{new Date(`${active.period}T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</b></div>
          <div><span>Starting balance</span><b>{money(active.starting_balance)}</b></div>
          <div><span>Ending balance</span><b>{money(active.ending_balance)}</b></div>
          <div><span>Average daily balance</span><b>{money(active.avg_daily_balance)}</b></div>
          <div><span>Deposits</span><b>{money(active.deposits)}</b></div>
          <div><span>Low balance</span><b>{money(active.low_balance)}</b></div>
          <div><span>Returned items</span><b>{active.nsf_count ?? "—"}</b></div>
        </div>
      ) : <p className="balanceHint">Hover, focus, or tap a month to inspect its statement details.</p>}
    </div>
  );
}

function hasBankBalances(row: Period): boolean {
  return [row.starting_balance, row.ending_balance, row.avg_daily_balance, row.deposits]
    .some((value) => value !== null);
}

function combinedBusinessPeriods(periods: Period[]): Period[] {
  const grouped = new Map<string, Period[]>();
  periods.forEach((row) => grouped.set(row.period, [...(grouped.get(row.period) ?? []), row]));
  const sum = (rows: Period[], key: keyof Pick<Period, "deposits" | "starting_balance" | "ending_balance" | "avg_daily_balance" | "low_balance">) => {
    const values = rows.map((row) => row[key]).filter((value): value is number => value !== null);
    return values.length ? values.reduce((total, value) => total + value, 0) : null;
  };
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([period, monthRows]) => {
    const legacy = monthRows.filter((row) => row.account_id === null && hasBankBalances(row));
    if (legacy.length > 0) {
      return [...legacy].sort((left, right) => (
        [right.starting_balance, right.ending_balance, right.avg_daily_balance, right.deposits].filter((value) => value !== null).length
        - [left.starting_balance, left.ending_balance, left.avg_daily_balance, left.deposits].filter((value) => value !== null).length
      ))[0];
    }
    const seen = new Set<string>();
    const attributed = monthRows.filter((row) => {
      if (row.account_id === null || !hasBankBalances(row)) return false;
      const signature = [row.starting_balance, row.ending_balance, row.avg_daily_balance, row.deposits].join("|");
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
    return {
      period,
      account_id: null,
      deposits: sum(attributed, "deposits"),
      starting_balance: sum(attributed, "starting_balance"),
      ending_balance: sum(attributed, "ending_balance"),
      avg_daily_balance: sum(attributed, "avg_daily_balance"),
      low_balance: sum(attributed, "low_balance"),
      nsf_count: attributed.length ? attributed.reduce((total, row) => total + (row.nsf_count ?? 0), 0) : null,
    };
  }).filter(hasBankBalances);
}

function Meter({
  name,
  sub,
  pct,
  value,
}: {
  name: string;
  sub: string;
  pct: number | null;
  value: string;
}) {
  return (
    <div className="meter">
      <div className="mn">
        {name}
        <small>{sub}</small>
      </div>
      <div className="track">
        <div className="fill" style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }} />
      </div>
      <div className="mv num">{value}</div>
    </div>
  );
}

export default function Step3Profile({ dealerId }: { dealerId: string }) {
  const { getToken } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const { decision, workflow, verification } = useCase(dealerId);
  const { uploads } = useUploadManager();
  const [reviewWindowsOpen, setReviewWindowsOpen] = useState(false);

  const periods = useQuery({
    queryKey: ["periods", dealerId],
    queryFn: async () =>
      api<RawPeriod[]>(`/dealer-os/dealers/${dealerId}/periods`, {
        authToken: (await getToken()) ?? undefined,
      }),
    refetchOnWindowFocus: "always",
    refetchInterval: 30_000,
  });

  const coverage = useQuery({
    queryKey: ["coverage", dealerId],
    queryFn: async () =>
      api<Coverage>(`/dealer-os/dealers/${dealerId}/documents/coverage`, {
        authToken: (await getToken()) ?? undefined,
      }),
    refetchOnWindowFocus: "always",
    refetchInterval: 30_000,
  });
  const reviewPreferences = useQuery({
    queryKey: ["underwriting-review-preferences", dealerId],
    queryFn: async () =>
      api<UnderwritingReviewPreference[]>(
        `/dealer-os/dealers/${dealerId}/underwriting-review-preferences`,
        { authToken: (await getToken()) ?? undefined },
      ),
  });
  const activeReviewPreference = activeUnderwritingReviewPreference(reviewPreferences.data);
  const activeUploads = uploads.filter(
    (item) => item.dealerId === dealerId && ["queued", "uploading", "extracting"].includes(item.status),
  );

  const focusSection = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.focus({ preventScroll: true });
  };
  const openBankEvidence = () => router.push(`/applications/${dealerId}?step=2#bank-evidence`);
  const openDocuments = () => router.push(`/applications/${dealerId}/documents`);
  const guidedStepIssues = workflow.step_3.blockers.map((blocker) => ({
    label: blocker,
    onSelect: /review windows/i.test(blocker)
      ? () => setReviewWindowsOpen(true)
      : /debt schedule|business debt/i.test(blocker)
        ? () => focusSection("debt-schedule")
        : () => focusSection("financial-confirmation"),
  }));

  const financial = decision?.financial;
  // Business-level rows only, newest six, oldest first so the chart reads left
  // to right the way a person would.
  const rows = combinedBusinessPeriods((periods.data ?? []).map(normalizePeriod)).slice(-6);
  const statementMonths = [...new Set([
    ...verification.statement_months,
    ...(coverage.data?.statement_months ?? []),
  ])].sort();
  const statementCount = statementMonths.length || rows.length;
  const standardStatementTarget = coverage.data?.statement_target ?? 6;
  const bankExceptionActive = Boolean(
    verification.bank_exception_active && statementCount < standardStatementTarget,
  );
  const acceptedStatementTarget = bankExceptionActive
    ? verification.statement_target
    : standardStatementTarget;
  const bankEvidenceAccepted = statementCount >= standardStatementTarget || (
    bankExceptionActive && statementCount >= acceptedStatementTarget
  );
  const profileState = activeUploads.length
    ? "Processing statements"
    : periods.isError
      ? "Evidence needs attention"
      : statementCount >= standardStatementTarget
        ? `${standardStatementTarget} months verified`
        : bankExceptionActive && bankEvidenceAccepted
          ? `${statementCount} months accepted · exception`
          : statementCount > 0
            ? `${statementCount} of ${standardStatementTarget} months`
            : "Awaiting evidence";

  const dscr = finiteNumber(financial?.dscr);
  const adb = finiteNumber(financial?.avg_daily_balance);
  const nsf = finiteNumber(financial?.returned_items);
  const averageMonthlyDeposits = finiteNumber(financial?.average_monthly_deposits);
  const annualizedDeposits = finiteNumber(financial?.annualized_deposits);

  const flags: Array<{ ok: boolean; text: string; onSelect: () => void }> = [
    ...(decision?.balance_reasons ?? []).map((r) => ({ ok: false, text: r, onSelect: () => focusSection("monthly-balance-trend") })),
    ...(nsf !== null
      ? nsf > 0
        ? [{ ok: false, text: `${nsf} returned item${nsf === 1 ? "" : "s"} in the observed months`, onSelect: () => focusSection("monthly-balance-trend") }]
        : [{ ok: true, text: "No returned items in the observed months", onSelect: () => focusSection("monthly-balance-trend") }]
      : []),
    ...(decision?.balance_passed === true
      ? [{ ok: true, text: "Ending balances holding or growing", onSelect: () => focusSection("monthly-balance-trend") }]
      : []),
  ];
  const openFlags = flags.filter((f) => !f.ok).length;
  const bankChecklistLabel = bankExceptionActive && bankEvidenceAccepted
    ? `${statementCount} current bank months accepted by exception`
    : `${standardStatementTarget} current months from Plaid Assets or bank-produced PDF statements`;
  const bankChecklistDetail = bankExceptionActive && bankEvidenceAccepted
    ? `${standardStatementTarget}-month standard remains open. Accepted target: ${acceptedStatementTarget} months.`
    : verification.missing_statement_months.length
      ? `Missing ${verification.missing_statement_months.join(", ")}`
      : "Open bank evidence to connect another account, refresh Plaid, or upload statements.";

  return (
    <>
      <div className="panel">
        <div className="panel-h">
          Verified financial profile
          <span style={{ flex: 1 }} />
          <span className={`cellchip ${bankEvidenceAccepted && !bankExceptionActive && !activeUploads.length ? "c-ok" : periods.isError ? "c-bad" : "c-warn"}`}>{profileState}</span>
        </div>
        <div className="panel-b">
          <div className="kpis">
            <div className="kpi">
              <span className="lbl">Credit band</span>
              <b className="knum">{financial?.credit_quality_tier ?? "—"}</b>
              <span className="sub">{financial?.credit_score_band ?? financial?.sources?.credit_quality?.label ?? "Soft inquiry"}</span>
            </div>
            <div className="kpi">
              <span className="lbl">Indicative capacity</span>
              <b className="knum num">{money(financial?.indicative_capacity, true)}</b>
              <span className="sub">{financial?.capacity_path ? `Typical · ${financial.capacity_path}` : financial?.sources?.indicative_capacity?.label ?? "Awaiting sizing evidence"}</span>
            </div>
            <div className="kpi">
              <span className="lbl">Avg daily balance</span>
              <b className="knum num">{money(adb)}</b>
              <span className="sub">{financial?.sources?.avg_daily_balance?.label ?? "Awaiting balance evidence"}</span>
            </div>
            <div className="kpi">
              <span className="lbl">Returned items</span>
              <b className="knum num">{nsf ?? "—"}</b>
              {nsf !== null && nsf > 0 && <span className="gapchip g-warn">Above zero</span>}
              {nsf === null && <span className="sub">Awaiting readable activity</span>}
            </div>
            <div className="kpi">
              <span className="lbl">Negative days / 90</span>
              <b className="knum num">{financial?.negative_balance_days_90 ?? "—"}</b>
              <span className="sub">{financial?.sources?.negative_balance_days_90?.label ?? "Awaiting daily balances"}</span>
            </div>
            <div className="kpi">
              <span className="lbl">Coverage (DSCR)</span>
              <b className="knum num">{dscr !== null ? `${dscr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×` : "—"}</b>
              {dscr !== null && (
                <span className={`gapchip ${dscr >= 1.25 ? "g-ok" : "g-warn"}`}>
                  {dscr >= 1.25 ? "Above 1.25×" : "Below 1.25×"}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div id="monthly-balance-trend" className="panel guided-target" tabIndex={-1}>
        <div className="panel-h">
          Monthly balance trend · up to six months
          <span style={{ flex: 1 }} />
          <span className="sub">Source: verified statement evidence across connected accounts</span>
        </div>
        <div className="panel-b">
          {periods.isLoading ? (
            <span className="sub">Loading verified financial periods…</span>
          ) : periods.isError ? (
            <div className="warnline">Financial periods could not be loaded. Retry the page or review failed files in the upload monitor.</div>
          ) : (
            <BalanceChart rows={rows} />
          )}
        </div>
      </div>

      <FinancialConfirmation dealerId={dealerId} />

      <Step4DebtSchedule dealerId={dealerId} />

      <div className="cg">
        <div className="s6">
          <div className="panel">
            <div className="panel-h">Coverage and liquidity</div>
            <div className="panel-b">
              <Meter
                name="Debt service coverage"
                sub="Trailing months observed"
                pct={dscr !== null ? (dscr / 2) * 100 : null}
                value={dscr !== null ? `${dscr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×` : "—"}
              />
              <Meter
                name="Average daily balance"
                sub="Across the observed period"
                pct={adb !== null ? Math.min(100, (adb / 25000) * 100) : null}
                value={money(adb, true)}
              />
              <Meter
                name="Balance stability"
                sub="Endings holding or growing"
                pct={decision?.balance_passed === true ? 100 : decision?.balance_passed === false ? 25 : null}
                value={
                  decision?.balance_passed === true
                    ? "Pass"
                    : decision?.balance_passed === false
                      ? "Fail"
                      : "—"
                }
              />
              <Meter
                name="Average monthly deposits"
                sub={financial?.sources?.average_monthly_deposits?.label ?? "Across qualifying bank months"}
                pct={averageMonthlyDeposits !== null ? 100 : null}
                value={money(averageMonthlyDeposits, true)}
              />
              <Meter
                name="Annualized deposits"
                sub={financial?.sources?.annualized_deposits?.label ?? "Average monthly deposits multiplied by 12"}
                pct={annualizedDeposits !== null ? 100 : null}
                value={money(annualizedDeposits, true)}
              />
            </div>
          </div>
        </div>
        <div className="s6">
          <div className="panel">
            <div className="panel-h">Balance calendar · last 30 days</div>
            <div className="panel-b">
              <span className="sub">
                Not available yet. Only monthly balances are stored today; a day-by-day
                calendar needs the daily series reconstructed from the connected account, which
                is the next piece of this step.
              </span>
              <div className="lg">
                <span>
                  <i style={{ background: "var(--ok)" }} />
                  Above floor
                </span>
                <span>
                  <i style={{ background: "var(--warn)" }} />
                  Under floor
                </span>
                <span>
                  <i style={{ background: "var(--danger)" }} />
                  Negative
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          Program eligibility
          <span style={{ flex: 1 }} />
          <span className="sub">Evidence-backed; estimates remain labeled</span>
        </div>
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Program</th>
                <th>Status</th>
                <th>Condition outstanding</th>
              </tr>
            </thead>
            <tbody>
              {(decision?.programs ?? []).slice(0, 8).map((p) => (
                <tr key={p.key}>
                  <td>
                    <b>{p.label}</b>
                  </td>
                  <td>
                    <span className={`cellchip ${p.eligible ? "c-ok" : "c-mut"}`}>
                      {p.eligible ? "Eligible" : "Not yet"}
                    </span>
                  </td>
                  <td className="sub">
                    {p.needs.length > 0
                      ? p.needs.slice(0, 2).join(" · ")
                      : p.blocked_by.length > 0
                        ? p.blocked_by.slice(0, 2).join(" · ")
                        : "None"}
                  </td>
                </tr>
              ))}
              {(decision?.programs ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="sub">
                    No programs screened yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="panel-b" style={{ paddingTop: 12 }}>
          <span className="sub">
            Maximum, term and indicative rate appear here once the desk&apos;s rate card is
            loaded. Until then this shows what the file reaches and what stands in the way,
            rather than a number nobody can stand behind.
          </span>
        </div>
      </div>

      <div className="cg">
        <div className="s6">
          <div className="panel">
            <div className="panel-h">
              Risk flags
              <span style={{ flex: 1 }} />
              <span className={`cellchip ${openFlags ? "c-warn" : "c-ok"}`}>
                {openFlags} open
              </span>
            </div>
            <div className="panel-b">
              {flags.map((f, i) => (
                <button type="button" className="req req-action" key={i} onClick={f.onSelect}>
                  <span className={`ic ${f.ok ? "ok" : "no"}`}>{f.ok ? "✓" : "!"}</span>
                  <span className="req-copy">{f.text}</span>
                  <ChevronRight size={16} aria-hidden />
                </button>
              ))}
              {flags.length === 0 && <span className="sub">Nothing flagged yet.</span>}
            </div>
          </div>
        </div>
        <div className="s6">
          <div className="panel">
            <div className="panel-h">
              Document checklist
              <span style={{ flex: 1 }} />
              {coverage.data && (
                <span className="sub num">
                  {bankExceptionActive && bankEvidenceAccepted
                    ? `${statementCount} accepted · ${standardStatementTarget} standard`
                    : `${statementCount} of ${standardStatementTarget} verified months`}
                </span>
              )}
              <span className="sub">{financial?.sources?.dscr?.label ?? "Awaiting cash flow and debt"}</span>
            </div>
            <div className="panel-b">
              {coverage.data && [
                { label: bankChecklistLabel, detail: bankChecklistDetail, met: bankEvidenceAccepted, onSelect: openBankEvidence },
                { label: "Current-year profit and loss statement", detail: coverage.data.has_pl ? "Verified document on file." : "Open Documents to upload or review the current-year P&L.", met: coverage.data.has_pl, onSelect: openDocuments },
              ].map((item) => (
                <button type="button" className="req req-action" key={item.label} onClick={item.onSelect}>
                  <span className={`ic ${item.met ? "ok" : "no"}`}>{item.met ? "✓" : "!"}</span>
                  <span className="req-copy"><span>{item.label}</span><small>{item.detail}</small></span>
                  <ChevronRight size={16} aria-hidden />
                </button>
              ))}
              {!coverage.data && (
                <span className="sub">
                  {coverage.isLoading ? "Loading…" : "No checklist on this file yet."}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {activeReviewPreference && (
        <div className="reviewWindowSaved">
          <span><CalendarClock size={18} /></span>
          <div>
            <b>Three client review windows saved</b>
            <p>{activeReviewPreference.slots.map((slot) => `${slot.date_label} · ${slot.label}`).join("  |  ")}</p>
          </div>
          <button type="button" className="btn sm" onClick={() => setReviewWindowsOpen(true)}>Edit windows</button>
        </div>
      )}

      <StepActions
        ready={workflow.step_3.complete}
        message={workflow.step_3.complete
          ? "The financial profile, debt schedule, and client review windows are ready."
          : workflow.step_3.blockers[0] || "Complete the financial profile before Step 4."}
        buttonLabel={activeReviewPreference ? "Continue to Step 4" : "Choose three review windows"}
        actionEnabled={!activeReviewPreference}
        issues={guidedStepIssues}
        onContinue={() => activeReviewPreference
          ? router.push(`/applications/${dealerId}?step=4`)
          : setReviewWindowsOpen(true)}
      />

      {reviewWindowsOpen && (
        <UnderwritingSlots
          dealerId={dealerId}
          existing={activeReviewPreference}
          onClose={() => setReviewWindowsOpen(false)}
          onComplete={() => {
            void (async () => {
              await qc.refetchQueries({ queryKey: ["decision", dealerId] });
              router.push(`/applications/${dealerId}?step=4`);
            })();
          }}
        />
      )}
    </>
  );
}
