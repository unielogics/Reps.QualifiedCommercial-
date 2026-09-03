// MIRROR: keep identical to QCRep/src/production-package/*
import { money, num, pct } from "../format";
import { Derived, Field, PPanel, type StepCtx } from "../ui";

export function Step2Lot({ ctx }: { ctx: StepCtx }) {
  const { prov, saving } = ctx;
  return (
    <>
      <PPanel title="The lot" sub="What the dealer has on the ground today.">
        <div className="pp-grid">
          <Field ctx={ctx} k="lot_units" />
          <Field ctx={ctx} k="avg_cost" />
          <Derived label="Lot value" value={money(prov.lot_value)} provisional={saving} />
          <Derived label="Inventory on hand" value={prov.months_of_inventory ? `${prov.months_of_inventory.toFixed(1)} months` : "—"} note="lot ÷ monthly retail units" provisional={saving} />
          <Derived label="Sell-through" value={prov.sell_through_pct !== null ? pct(prov.sell_through_pct) : "—"} provisional={saving} />
        </div>
      </PPanel>
      <PPanel title="Verified baseline (Addendum A.1)" sub="The trailing production the thresholds are derived from.">
        <div className="pp-grid">
          <Field ctx={ctx} k="monthly_units" />
          <Field ctx={ctx} k="cancels" />
          <Field ctx={ctx} k="chargebacks" />
          <Field ctx={ctx} k="base_from" />
          <Field ctx={ctx} k="base_through" />
          <Derived label="Retail units / month" value={num(prov.units)} provisional={saving} />
          <Field ctx={ctx} k="evidence" span={3} />
          <Field ctx={ctx} k="seasonality" span={3} placeholder="December and January run under the twelve-month average…" />
        </div>
      </PPanel>
    </>
  );
}
