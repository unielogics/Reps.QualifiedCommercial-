"use client";

// Where this file stands, in one answer.
//
// The whole point is that there is exactly one verdict on screen. The program
// grid and the balance rule are computed together on the server and collapse
// into a single result, so a green headline can never sit above an amber note
// that contradicts it. This component renders that result and does no judging
// of its own.
//
// When the balance rule pulled the verdict down, say so explicitly. A rep
// looking at a readiness percentage in the nineties and a "not fundable yet"
// banner will assume the system is broken unless the reason is right there.

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Blocking = { label?: string; detail?: string };

type Decision = {
  verdict: string;
  headline: string;
  blocking: Blocking[];
  balance_passed: boolean | null;
  balance_reasons: string[];
  capped_by_balance: boolean;
  best_path: { label?: string; path_key?: string } | null;
  goal_feasible: boolean | null;
  ready_for_forms: boolean;
};

function tone(v: string, capped: boolean): string {
  if (capped) return "c-bad";
  if (v === "fundable") return "c-ok";
  if (v === "conditional") return "c-warn";
  if (v === "no_data") return "c-mut";
  return "c-bad";
}

function label(v: string): string {
  if (v === "fundable") return "Fundable";
  if (v === "conditional") return "Conditional";
  if (v === "no_data") return "Nothing to judge yet";
  return "Not yet";
}

export default function Decision({ dealerId }: { dealerId: string }) {
  const { getToken } = useAuth();

  const q = useQuery({
    queryKey: ["decision", dealerId],
    queryFn: async () =>
      api<Decision>(`/dealer-os/dealers/${dealerId}/decision`, {
        authToken: (await getToken()) ?? undefined,
      }),
  });

  const d = q.data;

  return (
    <div className="panel">
      <div className="panel-h">
        Where this stands
        {d && <span className={`cellchip ${tone(d.verdict, d.capped_by_balance)}`}>{label(d.verdict)}</span>}
      </div>
      <div className="panel-b">
        {q.isLoading && <span className="sub">Working it out…</span>}
        {q.isError && <span className="sub">Could not read the numbers on this file.</span>}

        {d && (
          <>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55 }}>{d.headline}</p>

            {d.capped_by_balance && (
              <div className="warnline mt">
                The program grid rates this higher, but the balances decide it. Fix the
                balances and the rest of the file is already close.
              </div>
            )}

            {d.balance_reasons.length > 0 && (
              <>
                <label className="lbl mt">Balances</label>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6 }}>
                  {d.balance_reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </>
            )}

            {d.balance_passed === null && d.verdict !== "no_data" && (
              <p className="sub mt">
                Balances are not judged yet. Three months of statements is what it takes.
              </p>
            )}

            {d.blocking.length > 0 && (
              <>
                <label className="lbl mt">To fix, on the strongest program</label>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6 }}>
                  {d.blocking.slice(0, 6).map((b, i) => (
                    <li key={b.label ?? i}>
                      {b.label ?? "Requirement"}
                      {b.detail ? <span className="sub"> {b.detail}</span> : null}
                    </li>
                  ))}
                </ul>
                {d.blocking.length > 6 && (
                  <span className="sub">and {d.blocking.length - 6} more.</span>
                )}
              </>
            )}

            <div className="mt">
              <span className={`cellchip ${d.ready_for_forms ? "c-ok" : "c-mut"}`}>
                {d.ready_for_forms ? "Ready for forms" : "Not ready for forms"}
              </span>
              <span className="sub" style={{ display: "block", marginTop: 6 }}>
                {d.ready_for_forms
                  ? "Send the application and signatures whenever you are ready."
                  : "Paperwork on a file that is not fundable yet costs the owner time and us credibility, so hold it until this clears."}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
