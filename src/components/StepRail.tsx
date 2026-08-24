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
// Locking here is presentation only. The server refuses locked-step data
// regardless, which is the part that actually matters.

export type Step = { n: number; title: string; blurb: string };

export const STEPS: Step[] = [
  { n: 1, title: "Applicant intake", blurb: "Entity, principals, request" },
  { n: 2, title: "Verification", blurb: "Bank link · credit authorization" },
  { n: 3, title: "Financial profile", blurb: "Metrics, credit band, capacity" },
  { n: 4, title: "Credit application", blurb: "Full submission package" },
  { n: 5, title: "Contracts and execution", blurb: "Field fill, review, signature" },
];

/** Steps at or beyond this index need both authorizations back. */
export const GATED_FROM = 3;

export default function StepRail({
  step,
  unlocked,
  intakeReady,
  formsReady,
  gateLabel,
  onGo,
}: {
  step: number;
  unlocked: boolean;
  intakeReady: boolean;
  formsReady: boolean;
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
          const locked = (s.n === 2 && !intakeReady) || (s.n >= GATED_FROM && !unlocked) || (s.n === 5 && !formsReady);
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
              <button
                type="button"
                className={`rung${cur ? " cur" : ""}${done ? " done" : ""}`}
                disabled={locked}
                onClick={() => !locked && onGo(s.n)}
                title={s.n === 2 && !intakeReady ? "Complete all required Step 1 fields" : s.n === 5 && !formsReady ? "Complete Step 4 and clear underwriting before contracts" : locked ? gateLabel : undefined}
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
