// MIRROR: keep identical to QCRep/src/production-package/*
import { ADJUSTMENTS, CADENCES } from "../options";
import { Callout, Field, PChip, PPanel, Picks, type StepCtx } from "../ui";

export function Step7Shortfall({ ctx }: { ctx: StepCtx }) {
  const { draft, readOnly, set } = ctx;
  const cadence = (draft.cadence as string) || "quarter";
  const adj = (draft.adj as "none" | "bps" | "rate") || "none";
  return (
    <>
      <PPanel title="Shortfall billing cadence" sub="How a month that comes in light is measured and billed.">
        <div className="pp-cards">
          {CADENCES.map((c) => (
            <button key={c.key} type="button" className={`pp-card${cadence === c.key ? " on" : ""}`} onClick={() => set("cadence", c.key)} disabled={readOnly} aria-pressed={cadence === c.key}>
              <div className="pp-card-h"><b>{c.label}</b><PChip tone={c.tone}>{c.tag}</PChip></div>
              <p className="pp-sub">{c.detail}</p>
            </button>
          ))}
        </div>
      </PPanel>
      <PPanel title="Cure and corrective period (Addendum A.6)" sub="What the dealer gets to fix a shortage before it becomes a default.">
        <div className="pp-grid">
          <Field ctx={ctx} k="cure_days" />
          <Field ctx={ctx} k="corrective" span={2} placeholder="Next complete reporting month" />
        </div>
      </PPanel>
      <PPanel title="Program rate adjustment" sub="Applies only on an uncured program default, and only as written here.">
        <div className="pp-row"><Picks options={ADJUSTMENTS} value={adj} onChange={(k) => set("adj", k)} disabled={readOnly} /></div>
        {adj !== "none" ? <div className="pp-grid" style={{ marginTop: 10 }}><Field ctx={ctx} k="adj_value" label={adj === "bps" ? "Basis points" : "Exact adjusted rate (%)"} /></div> : <Callout tone="mut">Left as none — no program-related rate adjustment applies.</Callout>}
      </PPanel>
      <PPanel title="Exclusions (A.5) and sponsor-caused shortfalls (A.9)" sub="Approved exclusions are carved out of the dealer's shortfall.">
        <div className="pp-grid"><Field ctx={ctx} k="exclusions" span={3} placeholder="Approved exclusions, if any" /></div>
        <Callout tone="mut">A shortfall caused by the sponsor's own platform, remittance or administration failure is excluded from the dealer's shortfall (A.9).</Callout>
      </PPanel>
    </>
  );
}
