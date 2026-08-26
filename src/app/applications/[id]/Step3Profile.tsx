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

type Period = {
  period: string;
  deposits: number | null;
  ending_balance: number | null;
  avg_daily_balance: number | null;
  low_balance: number | null;
  nsf_count: number | null;
  account_id: string | null;
};

type Health = { snapshot: { metrics: Record<string, number | null> } | null };

type Coverage = {
  received: number;
  expected: number;
  items?: Array<{ label: string; met: boolean; detail?: string | null }>;
};

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

/** Bars for deposits with an average-daily-balance line over them, as designed. */
function DepositsChart({ rows }: { rows: Period[] }) {
  if (rows.length === 0) {
    return (
      <span className="sub">
        No monthly activity yet. Statements arrive with the bank connection and populate this
        within a few minutes.
      </span>
    );
  }
  const W = 640;
  const H = 190;
  const top = 36;
  const base = 150;
  const maxDep = Math.max(...rows.map((r) => r.deposits ?? 0), 1);
  const maxAdb = Math.max(...rows.map((r) => r.avg_daily_balance ?? 0), 1);
  const slot = (W - 56) / rows.length;
  const barW = Math.min(54, slot * 0.56);

  const x = (i: number) => 40 + slot * i + slot / 2;
  const yDep = (v: number) => base - (v / maxDep) * (base - top);
  const yAdb = (v: number) => base - (v / maxAdb) * (base - top) * 0.72;

  const line = rows
    .map((r, i) => `${x(i)},${yAdb(r.avg_daily_balance ?? 0)}`)
    .join(" ");

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} aria-label="Monthly deposits with average daily balance overlay">
        <line x1="40" y1={base} x2={W - 20} y2={base} stroke="rgba(15,23,32,0.16)" strokeWidth="1" />
        <line x1="40" y1="100" x2={W - 20} y2="100" stroke="rgba(15,23,32,0.06)" strokeWidth="1" />
        <line x1="40" y1="50" x2={W - 20} y2="50" stroke="rgba(15,23,32,0.06)" strokeWidth="1" />
        {rows.map((r, i) => {
          const v = r.deposits ?? 0;
          const y = yDep(v);
          return (
            <rect
              key={r.period}
              x={x(i) - barW / 2}
              y={y}
              width={barW}
              height={Math.max(0, base - y)}
              rx="3"
              fill="#1b4b9e"
            />
          );
        })}
        <polyline points={line} fill="none" stroke="#8a6a1f" strokeWidth="2" />
        {rows.map((r, i) => (
          <circle key={`d${r.period}`} cx={x(i)} cy={yAdb(r.avg_daily_balance ?? 0)} r="3" fill="#8a6a1f" />
        ))}
        {rows.map((r, i) => (
          <text key={`t${r.period}`} x={x(i)} y="170" textAnchor="middle" fontFamily="Inter" fontSize="11" fill="#5a6675">
            {monthLabel(r.period)}
          </text>
        ))}
        <text x="34" y="54" textAnchor="end" fontFamily="Inter" fontSize="10" fill="#8b97a6">
          {money(maxDep, true)}
        </text>
        <text x="34" y={base + 4} textAnchor="end" fontFamily="Inter" fontSize="10" fill="#8b97a6">
          $0
        </text>
      </svg>
      <div className="lg">
        <span>
          <i style={{ background: "#1b4b9e" }} />
          Monthly deposits
        </span>
        <span>
          <i style={{ background: "#8a6a1f" }} />
          Average daily balance
        </span>
      </div>
    </>
  );
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
  const [reviewWindowsOpen, setReviewWindowsOpen] = useState(false);

  const periods = useQuery({
    queryKey: ["periods", dealerId],
    queryFn: async () =>
      api<Period[]>(`/dealer-os/dealers/${dealerId}/periods`, {
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

  const m = health.data?.snapshot?.metrics ?? {};
  // Business-level rows only, newest six, oldest first so the chart reads left
  // to right the way a person would.
  const rows = (periods.data ?? [])
    .filter((p) => p.account_id === null)
    .slice(0, 6)
    .reverse();

  const dscr = m.dscr ?? null;
  const adb = m.adb ?? null;
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
          <span className="cellchip c-ok">Bank + credit verified</span>
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
              <b className="knum num">{dscr !== null ? `${dscr.toFixed(2)}×` : "—"}</b>
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
          Deposits and balance · six months
          <span style={{ flex: 1 }} />
          <span className="sub">Source: the connected bank</span>
        </div>
        <div className="panel-b">
          {periods.isLoading ? <span className="sub">Loading…</span> : <DepositsChart rows={rows} />}
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
                value={dscr !== null ? `${dscr.toFixed(2)}×` : "—"}
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
                  {coverage.data.received} of {coverage.data.expected} received
                </span>
              )}
            </div>
            <div className="panel-b">
              {(coverage.data?.items ?? []).slice(0, 8).map((it, i) => (
                <div className="req" key={i}>
                  <span className={`ic ${it.met ? "ok" : "no"}`}>{it.met ? "✓" : "!"}</span>
                  {it.label}
                </div>
              ))}
              {(coverage.data?.items ?? []).length === 0 && (
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
