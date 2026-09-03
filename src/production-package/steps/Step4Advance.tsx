// MIRROR: keep identical to QCRep/src/production-package/*
import { money, num, pct } from "../format";
import { SIZING_MODES } from "../options";
import { Callout, Derived, Field, LockedChip, PChip, PPanel, Picks, type StepCtx } from "../ui";

export function Step4Advance({ ctx }: { ctx: StepCtx }) {
  const { draft, prov, computed, saving, readOnly, set, pkg } = ctx;
  const two = pkg.stage === 2;
  const adv = computed.advance;
  const sizing = draft.sizing === "fixed" ? "fixed" : "backsolve";
  const clears = prov.clears;
  return (
    <>
      <div className="pp-cols">
        <PPanel title={two ? "The facility as approved" : "The request"} sub={two ? "The approved amount, rate and term from the term sheet; the advance is fixed to the funded amount." : "What the dealer is asking for and how the advance is sized."}>
          <div className="pp-grid">
            <Field ctx={ctx} k="requested" label={two ? "Approved amount" : undefined} />
            <Field ctx={ctx} k="min_activation" />
            <Field ctx={ctx} k="facility_type" label={two ? "Facility type" : undefined} />
            <Field ctx={ctx} k="term" />
            <Field ctx={ctx} k="dealer_cof" label={two ? "Rate" : undefined} />
            <Field ctx={ctx} k="exclusivity" />
            <Field ctx={ctx} k="debt_service" />
            <Field ctx={ctx} k="markup" />
          </div>
          <div className="pp-row" style={{ marginTop: 12 }}>
            <Picks options={SIZING_MODES} value={sizing} onChange={(k) => set("sizing", k)} disabled={readOnly || two} />
            {two ? <LockedChip>Fixed to the funded amount by the term sheet</LockedChip> : null}
          </div>
          <div className="pp-grid" style={{ marginTop: 10 }}>
            <Derived label={sizing === "backsolve" ? "Advance the repayment stream supports" : "Cost of funds this advance implies"} value={sizing === "backsolve" ? money(prov.supported) : pct(prov.implied_rate)}
              note={sizing === "backsolve" ? `${money(prov.repay_m)} a month for ${num(Number(draft.term) || 1)} months at ${pct(Number(draft.dealer_cof) || 0)}` : `on ${money(Number(draft.requested) || 0)} repaid by ${money(prov.repay_m)} a month`} provisional={saving} />
            <Derived label="Advance" value={money(prov.advance)} provisional={saving} />
          </div>
        </PPanel>
        <PPanel title="Programme cost" sub="Bank capital is close to free; the real cost is the consulting, underwriting and professional work, plus running management.">
          <div className="pp-grid">
            <Field ctx={ctx} k="bank_cof" />
            <Field ctx={ctx} k="orig_cost" />
            <Field ctx={ctx} k="prof_fees" />
            <Field ctx={ctx} k="mgmt_fee" />
            <Field ctx={ctx} k="loss_prov" />
            <Derived label="All-in cost over the term" value={money(prov.total_cost)} note={`${pct(prov.cost_rate)} a year against a ${money(prov.advance)} advance`} provisional={saving} />
          </div>
          <table className="pp-tbl" style={{ marginTop: 10 }}>
            <thead><tr><th>Cost line</th><th className="n">Amount</th><th>When</th><th className="n">Share</th></tr></thead>
            <tbody>{adv.cost_lines.map((l) => <tr key={l.key}><td>{l.label}</td><td className="n">{money(l.amount)}</td><td className="muted">{l.when}</td><td className="n">{l.share_pct === null ? "—" : pct(l.share_pct)}</td></tr>)}</tbody>
          </table>
        </PPanel>
      </div>
      {!two ? (
        <PPanel title="Commitment header dates" sub="Optional. Both print in the header of the Production Commitment when entered; the agreement expires if unfunded by the outside funding date.">
          <div className="pp-grid">
            <Field ctx={ctx} k="written_approval_date" />
            <Field ctx={ctx} k="outside_funding_date" />
          </div>
        </PPanel>
      ) : null}
      <PPanel title="Does this deal clear?" sub="A deal clears when its return meaningfully exceeds what the programme costs to run — three points or more."
        right={<PChip tone={clears ? "ok" : "bad"}>{clears ? "Clears underwriting" : "Does not clear"}</PChip>} tone={clears ? "ok" : "bad"}>
        <div className="pp-grid">
          <Derived label="Projected return" value={pct(prov.implied_rate)} provisional={saving} />
          <Derived label="All-in programme cost" value={pct(prov.cost_rate)} provisional={saving} />
          <Derived label="Spread" value={`${prov.spread >= 0 ? "+" : ""}${pct(prov.spread)}`} tone={clears ? "ok" : "bad"} note={clears ? "clears the 3 point floor" : "under the 3 point floor"} provisional={saving} />
        </div>
        <Callout tone={clears ? "ok" : "bad"}>
          {clears
            ? <>This one clears, by {pct(prov.spread)}. The capital is nearly free; the cost is the consulting, underwriting and professional work behind it.</>
            : <>Projected return of {pct(prov.implied_rate)} against an all-in programme cost of {pct(prov.cost_rate)}. Raise the repayment withheld per contract, lift attachment, lengthen the term, or take cost out of the build.</>}
        </Callout>
      </PPanel>
    </>
  );
}
