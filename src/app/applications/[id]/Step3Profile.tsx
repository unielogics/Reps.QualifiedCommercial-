"use client";

// Step 3 — the profile, computed from verified data only.
//
// Everything on this screen comes from the bank connection and the bureau. The
// header says so, and it is not a decoration: a rep reading a coverage ratio to
// a business owner needs to know it came from their statements rather than from
// the revenue they claimed in step 1.
//
// Two panels are drawn but not yet fed, and they say so rather than showing a
// zero. The balance calendar needs daily balances, which nothing stores yet —
// only monthly aggregates exist. The eligibility table's Maximum, Term and
// Indicative rate need the desk's rate card. A rep quoting an invented rate to
// a business owner is worse than a rep quoting none, so those columns stay out
// until the numbers are real.

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { api } from "@/lib/api";
import { useCase } from "@/lib/useCase";
import {
  activeUnderwritingReviewPreference,
  type UnderwritingReviewPreference,
} from "@/lib/underwritingReview";
import StepActions from "@/components/StepActions";
import UnderwritingSlots from "@/components/UnderwritingSlots";
import { useUploadManager } from "@/components/UploadManager";

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

type Health = { snapshot: { metrics: Record<string, unknown> } | null };

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

function metricNumber(value: unknown, keys: string[] = ["current", "value", "amount"]): number | null {
  const direct = finiteNumber(value);
  if (direct !== null) return direct;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    for (const key of keys) {
      const nested = finiteNumber(object[key]);
      if (nested !== null) return nested;
    }
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
        No monthly activity yet. Statements arrive with the bank connection and populate this
        within a few minutes.
      </span>
    );
  }
  const values = rows.flatMap((row) => BALANCE_SERIES.map(({ key }) => row[key])).filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  if (values.length === 0) {
    return <span className="sub">The statement months are present, but no readable monthly balance figures were found.</span>;
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
      <svg viewBox={`0 0 ${W} ${H}`} aria-label="Starting, ending, and average daily balances for up to six statement months">
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
  const { decision } = useCase(dealerId);
  const { uploads } = useUploadManager();
  const [reviewWindowsOpen, setReviewWindowsOpen] = useState(false);

  const periods = useQuery({
    queryKey: ["periods", dealerId],
    queryFn: async () =>
      api<RawPeriod[]>(`/dealer-os/dealers/${dealerId}/periods`, {
        authToken: (await getToken()) ?? undefined,
      }),
  });

  const health = useQuery({
    queryKey: ["health", dealerId],
    queryFn: async () =>
      api<Health>(`/dealer-os/dealers/${dealerId}/health`, {
        authToken: (await getToken()) ?? undefined,
      }),
  });

  const coverage = useQuery({
    queryKey: ["coverage", dealerId],
    queryFn: async () =>
      api<Coverage>(`/dealer-os/dealers/${dealerId}/documents/coverage`, {
        authToken: (await getToken()) ?? undefined,
      }),
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

  const m = health.data?.snapshot?.metrics ?? {};
  // Business-level rows only, newest six, oldest first so the chart reads left
  // to right the way a person would.
  const rows = combinedBusinessPeriods((periods.data ?? []).map(normalizePeriod)).slice(-6);
  const statementCount = coverage.data?.statement_months.length ?? rows.length;
  const profileState = activeUploads.length
    ? "Processing statements"
    : periods.isError || health.isError
      ? "Evidence needs attention"
      : statementCount >= 6
        ? "Six months verified"
        : statementCount > 0
          ? `${statementCount} of 6 months`
          : "Awaiting evidence";

  const dscr = metricNumber(m.dscr, ["current", "coverage", "value"]);
  const adb = metricNumber(m.adb, ["current", "average", "value"]);
  const nsf = rows.reduce((a, r) => a + (r.nsf_count ?? 0), 0);

  const flags: Array<{ ok: boolean; text: string }> = [
    ...(decision?.balance_reasons ?? []).map((r) => ({ ok: false, text: r })),
    ...(nsf > 0
      ? [{ ok: false, text: `${nsf} returned item${nsf === 1 ? "" : "s"} in the observed months` }]
      : [{ ok: true, text: "No returned items in the observed months" }]),
    ...(decision?.balance_passed === true
      ? [{ ok: true, text: "Ending balances holding or growing" }]
      : []),
  ];
  const openFlags = flags.filter((f) => !f.ok).length;

  return (
    <>
      <div className="panel">
        <div className="panel-h">
          Verified financial profile
          <span style={{ flex: 1 }} />
          <span className={`cellchip ${statementCount >= 6 && !activeUploads.length ? "c-ok" : periods.isError || health.isError ? "c-bad" : "c-warn"}`}>{profileState}</span>
        </div>
        <div className="panel-b">
          <div className="kpis">
            <div className="kpi">
              <span className="lbl">Credit band</span>
              <b className="knum num">—</b>
              <span className="sub">Soft inquiry</span>
            </div>
            <div className="kpi">
              <span className="lbl">Indicative capacity</span>
              <b className="knum num">—</b>
              <span className="sub">Needs the rate card</span>
            </div>
            <div className="kpi">
              <span className="lbl">Avg daily balance</span>
              <b className="knum num">{money(adb)}</b>
            </div>
            <div className="kpi">
              <span className="lbl">Returned items</span>
              <b className="knum num">{nsf}</b>
              {nsf > 0 && <span className="gapchip g-warn">Above zero</span>}
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

      <div className="panel">
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
                name="Monthly deposits"
                sub="Most recent observed month"
                pct={rows.length ? 100 : null}
                value={money(rows[rows.length - 1]?.deposits ?? null, true)}
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
          <span className="sub">Computed from verified data only</span>
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
                <div className="req" key={i}>
                  <span className={`ic ${f.ok ? "ok" : "no"}`}>{f.ok ? "✓" : "!"}</span>
                  {f.text}
                </div>
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
                  {coverage.data.statement_months.length} of {coverage.data.statement_target} statement months
                </span>
              )}
            </div>
            <div className="panel-b">
              {coverage.data && [
                { label: "Six current bank-produced statement months", met: coverage.data.statement_months.length >= 6 },
                { label: "Current-year profit and loss statement", met: coverage.data.has_pl },
                { label: "Debt schedule", met: coverage.data.has_debt_schedule },
              ].map((item) => (
                <div className="req" key={item.label}>
                  <span className={`ic ${item.met ? "ok" : "no"}`}>{item.met ? "✓" : "!"}</span>
                  {item.label}
                </div>
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
        ready={!reviewPreferences.isLoading}
        message={activeReviewPreference
          ? "The verified financial profile and client review windows are ready."
          : "Before Step 4, choose three weekday windows when the desk can review the file with the client."}
        buttonLabel={activeReviewPreference ? "Continue to Step 4" : "Choose three review windows"}
        onContinue={() => activeReviewPreference
          ? router.push(`/applications/${dealerId}?step=4`)
          : setReviewWindowsOpen(true)}
      />

      {reviewWindowsOpen && (
        <UnderwritingSlots
          dealerId={dealerId}
          existing={activeReviewPreference}
          onClose={() => setReviewWindowsOpen(false)}
          onComplete={() => router.push(`/applications/${dealerId}?step=4`)}
        />
      )}
    </>
  );
}
