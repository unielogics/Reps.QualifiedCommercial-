"use client";

import type { ApplicationWorkflow } from "@/lib/useCase";

// The application sequence, and where this file has got to.
//
// Five steps with the gate sitting between 2 and 3, which is the whole shape of
// the product: intake and verification are things a rep does, everything after
// them is only meaningful once the applicant has returned both authorizations.
// So the gate is drawn as a break in the rail rather than as a disabled style
// on three buttons — a rep should see that the file stops there, not that three
// buttons happen to be greyed.
//
// Neither this app nor Capital OS had a stepper. Built from `.rung`, which is
// already a vertical progress rail with `.cur` and `.done` states, plus the
// `.prio .n` numbered badge. No new CSS.
//
// Locking here is presentation only. A persisted per-file ungated setting may
// open Steps 1-4; server action validation remains authoritative.

export type Step = { n: number; title: string; blurb: string };

export const STEPS: Step[] = [
  { n: 1, title: "Applicant intake", blurb: "Entity, principals, request" },
  { n: 2, title: "Verification and underwriting", blurb: "Bank · credit · business questions" },
  { n: 3, title: "Financial profile", blurb: "Cash flow · debt · review windows" },
  { n: 4, title: "Routing and execution", blurb: "Program · package · signing" },
  { n: 5, title: "Super-admin desk review", blurb: "Decision · status · closing" },
];

/** Steps at or beyond this index need both authorizations back. */
export const GATED_FROM = 3;

export default function StepRail({
  step,
  workflow,
  reviewTimesReady,
  applicationExecuted,
  canOpenStep5,
  workflowUngated,
  gateLabel,
  onGo,
}: {
  step: number;
  workflow: ApplicationWorkflow;
  reviewTimesReady: boolean;
  packageReady: boolean;
  applicationExecuted: boolean;
  canOpenStep5: boolean;
  workflowUngated: boolean;
  gateLabel: string;
  onGo: (n: number) => void;
}) {
  return (
    <div className="panel">
      <div className="panel-h">
        <span className="lbl">Application sequence</span>
        <span style={{ flex: 1 }} />
        <span className="sub num">Step {step} of {STEPS.length}</span>
      </div>
      <div className="panel-b" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {STEPS.map((s) => {
          const readiness = s.n <= 4
            ? workflow[`step_${s.n}` as "step_1" | "step_2" | "step_3" | "step_4"]
            : null;
          const processLocked = s.n <= 4 && !readiness?.available;
          const locked = (workflowUngated ? false : processLocked)
            || (s.n === 5 && !canOpenStep5);
          const cur = s.n === step;
          const done = s.n < step && !locked;
          return (
            <div key={s.n} style={{ display: "contents" }}>
              {/* The gate reads as a break in the rail, above the first step it
                  holds, so it explains the three below it rather than being one
                  more row among them. */}
              {s.n === GATED_FROM && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    margin: "2px 0",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      flex: 1,
                      height: 1,
                      background: workflow.step_2.complete ? "var(--ok)" : "var(--line2)",
                      opacity: workflow.step_2.complete ? 0.45 : 1,
                    }}
                  />
                  <span
                    className="lbl"
                    style={{ color: workflow.step_2.complete ? "var(--ok)" : "var(--muted)", whiteSpace: "nowrap" }}
                  >
                    {gateLabel}
                  </span>
                  <span
                    aria-hidden
                    style={{
                      flex: 1,
                      height: 1,
                      background: workflow.step_2.complete ? "var(--ok)" : "var(--line2)",
                      opacity: workflow.step_2.complete ? 0.45 : 1,
                    }}
                  />
                </div>
              )}
              {s.n === 4 && (
                <div className={`stepCheckpoint${reviewTimesReady ? " complete" : ""}`}>
                  <span />
                  <b>{reviewTimesReady ? "3 review windows saved" : "Choose 3 review windows"}</b>
                  <span />
                </div>
              )}
              {s.n === 5 && (
                <div className={`stepCheckpoint${applicationExecuted ? " complete" : ""}`}>
                  <span />
                  <b>{applicationExecuted ? "Application executed" : "Application signature pending"}</b>
                  <span />
                </div>
              )}
              <button
                type="button"
                className={`rung${cur ? " cur" : ""}${done ? " done" : ""}`}
                disabled={locked}
                onClick={() => !locked && onGo(s.n)}
                title={s.n <= 4 && locked && !workflowUngated
                  ? readiness?.blockers.slice(0, 3).join(" ") || "Complete the prior workflow requirements"
                  : s.n === 5 && !canOpenStep5
                          ? "Step 5 is reserved for the super admin"
                      : locked ? gateLabel : undefined}
                style={{
                  textAlign: "left",
                  font: "inherit",
                  width: "100%",
                  cursor: locked ? "not-allowed" : "pointer",
                  opacity: locked ? 0.5 : undefined,
                  gap: 10,
                }}
              >
                <span
                  className="n"
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 800,
                    fontSize: 13,
                    flexShrink: 0,
                    background: cur ? "var(--accent)" : "var(--sunken)",
                    color: cur ? "#fff" : "var(--muted)",
                  }}
                >
                  {s.n}
                </span>
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <b style={{ fontFamily: "var(--fh)", fontWeight: 680, fontSize: 13.5 }}>
                    {s.title}
                  </b>
                  <span className="sub" style={{ fontSize: 11.5 }}>
                    {s.blurb}
                  </span>
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
