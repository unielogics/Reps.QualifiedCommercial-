"use client";

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
// Locking here is presentation only. Temporary review mode may remove those
// visual locks for a super admin; server action validation remains authoritative.

export type Step = { n: number; title: string; blurb: string };

export const STEPS: Step[] = [
  { n: 1, title: "Applicant intake", blurb: "Entity, principals, request" },
  { n: 2, title: "Verification", blurb: "Bank link · credit authorization" },
  { n: 3, title: "Financial profile", blurb: "Metrics, credit band, capacity" },
  { n: 4, title: "Underwriting package", blurb: "Route evidence · calculations" },
  { n: 5, title: "Super-admin desk review", blurb: "Decision · status · closing" },
];

/** Steps at or beyond this index need both authorizations back. */
export const GATED_FROM = 3;

export default function StepRail({
  step,
  unlocked,
  intakeReady,
  reviewTimesReady,
  packageReady,
  applicationExecuted,
  canOpenStep5,
  reviewMode,
  gateLabel,
  onGo,
}: {
  step: number;
  unlocked: boolean;
  intakeReady: boolean;
  reviewTimesReady: boolean;
  packageReady: boolean;
  applicationExecuted: boolean;
  canOpenStep5: boolean;
  reviewMode: boolean;
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
          const processLocked = (s.n === 2 && !intakeReady)
            || (s.n >= GATED_FROM && !unlocked)
            || (s.n >= 4 && !reviewTimesReady)
            || (s.n === 5 && (!packageReady || !applicationExecuted));
          const locked = (reviewMode ? false : processLocked)
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
                      background: unlocked ? "var(--ok)" : "var(--line2)",
                      opacity: unlocked ? 0.45 : 1,
                    }}
                  />
                  <span
                    className="lbl"
                    style={{ color: unlocked ? "var(--ok)" : "var(--muted)", whiteSpace: "nowrap" }}
                  >
                    {gateLabel}
                  </span>
                  <span
                    aria-hidden
                    style={{
                      flex: 1,
                      height: 1,
                      background: unlocked ? "var(--ok)" : "var(--line2)",
                      opacity: unlocked ? 0.45 : 1,
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
                title={s.n === 2 && !intakeReady
                  ? "Complete all required Step 1 fields"
                  : s.n >= 4 && !reviewTimesReady
                    ? "Choose three client review windows at the end of Step 3"
                    : s.n === 5 && !packageReady
                      ? "Complete the Step 4 evidence package before desk review"
                      : s.n === 5 && !applicationExecuted
                        ? "The primary signer must execute the QC application at the end of Step 4"
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
