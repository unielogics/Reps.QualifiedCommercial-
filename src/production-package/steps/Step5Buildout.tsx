// MIRROR: keep identical to QCRep/src/production-package/*
import { money, num, pct, signedMoney } from "../format";
import { BUILDOUT_MODES } from "../options";
import { Callout, Derived, Field, PBtn, PChip, PPanel, Picks, type StepCtx } from "../ui";

export function Step5Buildout({ ctx }: { ctx: StepCtx }) {
  const { draft, computed, prov, saving, readOnly, set, setProduct, notify } = ctx;
  const b = computed.buildout;
  const mode = draft.buildout_mode === "forward" ? "forward" : "reverse";
  const applySolve = () => {
    b.solve_rows.forEach((r) => { setProduct(r.key, "repay", r.solve_repay); setProduct(r.key, "premium", r.needed); });
    notify(`Repayment reverse-solved to fund ${pct(b.fund_target_pct, 0)} of the monthly payment from policy production.`, "acc");
  };
  const funded = prov.funded_pct;
  const tone = prov.loan_free ? "ok" : funded >= 50 ? "warn" : "bad";
  return (
    <>
      <PPanel title="Does the product carry the payment?" sub="Repayment withheld on every contract, against the monthly facility payment."
        right={<PChip tone={tone}>{prov.loan_free ? "Loan is free to the dealer" : `${pct(Math.min(999, funded))} funded by policies`}</PChip>} tone={tone}>
        <div className="pp-grid">
          <Derived label="Monthly payment" value={money(b.debt_service)} />
          <Derived label="Funded by policies" value={money(prov.repay_m)} tone={tone} provisional={saving} />
          <Derived label="Out of pocket" value={money(prov.out_of_pocket)} provisional={saving} />
        </div>
        <Callout tone={tone}>
          {prov.loan_free
            ? <>At these numbers the arrangement pays for itself: {money(prov.repay_m)} of policy production a month against a {money(b.debt_service)} payment. The dealer keeps the capital and the full economics of every contract once the advance is retired.</>
            : <>The gap is {money(prov.out_of_pocket)} a month. Reverse-solve the markup below, or lift attachment on the products the dealer already sells, and the payment moves off their operating cash.</>}
        </Callout>
      </PPanel>
      <PPanel title="Build the repayment into the product" sub="Reverse-solve the withheld amount so policy production funds the payment, or set the repayment per contract by hand on the products step.">
        <div className="pp-row"><Picks options={BUILDOUT_MODES} value={mode} onChange={(k) => set("buildout_mode", k)} disabled={readOnly} /></div>
        {mode === "reverse" ? (
          <>
            <div className="pp-grid" style={{ marginTop: 10 }}>
              <Field ctx={ctx} k="fund_target" />
              <Derived label="Required per contract" value={money(b.required_per_contract)} note={`+${pct(b.required_uplift_pct)} on today's average premium — ${b.required_uplift_pct > 25 ? "a steep lift" : "within normal pricing room"}`} tone={b.required_uplift_pct > 25 ? "warn" : "ok"} />
            </div>
            <table className="pp-tbl" style={{ marginTop: 10 }}>
              <thead><tr><th>Product</th><th className="n">Contracts / mo</th><th className="n">Today premium</th><th className="n">Withhold / contract</th><th className="n">Premium needed</th><th className="n">Uplift</th></tr></thead>
              <tbody>{b.solve_rows.map((r) => <tr key={r.key}><td>{r.label}</td><td className="n">{num(r.contracts)}</td><td className="n">{money(r.cur_premium)}</td><td className="n">{money(r.solve_repay)}</td><td className="n">{money(r.needed)}</td><td className={`n ${r.steep ? "c-warn" : "c-ok"}`}>{signedMoney(r.uplift)}</td></tr>)}</tbody>
            </table>
            <div className="pp-row" style={{ marginTop: 8 }}>
              <PBtn variant="pri" size="sm" onClick={applySolve} disabled={readOnly || !b.solve_rows.length}>Write these into the product table</PBtn>
              <span className="pp-sub">Writes the suggested repayment and the premium it needs into every covered product.</span>
            </div>
          </>
        ) : (
          <Callout tone="mut">Set the repayment withheld per contract on the products step; this page shows what it funds.</Callout>
        )}
      </PPanel>
      <div className="pp-cols">
        {(["without", "with"] as const).map((k) => {
          const s = b.scenarios[k];
          return (
            <PPanel key={k} title={s.title} sub={s.sub} tone={s.free ? "ok" : undefined} right={<PChip tone={s.free ? "ok" : k === "with" ? "acc" : "mut"}>{s.tag}</PChip>}>
              <div className="pp-bigv" style={{ color: s.free ? "var(--ok)" : s.from_operations > 0 && k === "with" ? "var(--warn)" : "var(--ink)" }}>{money(s.from_operations)}<small> / month from operations</small></div>
              <div className="pp-bar"><span style={{ width: `${Math.max(0, Math.min(100, s.funded_pct))}%`, background: s.free ? "var(--ok)" : "var(--accent)" }} /></div>
              <div className="pp-grid">
                <Derived label="Payment" value={money(s.payment)} />
                <Derived label="Funded by policies" value={money(s.funded)} tone={s.funded > 0 ? "ok" : "mut"} />
                <Derived label="Over the term" value={money(s.total_from_operations)} />
                <Derived label="Product gross / month" value={money(s.gross)} />
              </div>
              <p className="pp-sub" style={{ marginTop: 8 }}>
                {s.free ? "The policies cover the whole payment. The dealer takes the capital and pays nothing out of pocket for it."
                  : k === "with" ? `Policies cover ${pct(Math.min(100, s.funded_pct))} of the payment. Raising attachment or the withheld amount closes the rest.`
                    : `The dealer pays ${money(s.payment)} a month from operations, and product gross stays where it is today.`}
              </p>
            </PPanel>
          );
        })}
      </div>
    </>
  );
}
