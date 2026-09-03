// MIRROR: keep identical to QCRep/src/production-package/*
import { money, num } from "../format";
import { Derived, PPanel, type StepCtx } from "../ui";

export function Step8Projection({ ctx }: { ctx: StepCtx }) {
  const p = ctx.computed.projection;
  const e = ctx.computed.econ;
  const peak = p.peak || 1;
  return (
    <>
      <PPanel title="Repayment and earnout timeline" sub={`${p.span} months · originations stop at month ${p.term}`}>
        <div className="pp-bars" role="img" aria-label="Monthly repayment, commission and reserve">
          {p.bars.map((b) => (
            <div key={b.m} className="pp-barcol" title={`Month ${b.m} · repayment ${money(b.repay)} · commission ${money(b.comm)} · reserve ${money(b.reserve)}`}>
              <span className="b-repay" style={{ height: `${Math.max(b.repay > 0 ? 1 : 0, Math.round((b.repay / peak) * 128))}px` }} />
              <span className="b-comm" style={{ height: `${Math.max(b.comm > 0 ? 1 : 0, Math.round((b.comm / peak) * 128))}px` }} />
              <span className="b-reserve" style={{ height: `${Math.max(b.reserve > 0 ? 1 : 0, Math.round((b.reserve / peak) * 128))}px` }} />
            </div>
          ))}
        </div>
        <div className="pp-legend">
          <span><i className="b-repay" />Repayment <b>{money(p.totals.repay)}</b></span>
          <span><i className="b-comm" />Commissions <b>{money(p.totals.comm)}</b></span>
          <span><i className="b-reserve" />Earned reserves <b>{money(p.totals.reserve)}</b></span>
        </div>
      </PPanel>
      <div className="pp-cols three">
        <PPanel title="Ramp" sub="The first month and where the reserve steadies.">
          <Derived label="Month 1" value={money(p.first_month_total)} />
          <Derived label="Reserve steadies" value={p.steady_from_month ? `month ${p.steady_from_month}` : "not within the term"} />
        </PPanel>
        <PPanel title="Over the term" sub="What a steady month looks like.">
          <Derived label="Plateau" value={money(p.plateau_monthly)} note="repayment + commission + reserve a month" />
          <Derived label="Advance retired" value={p.retire_month ? `month ${p.retire_month}` : "never at this rate"} />
        </PPanel>
        <PPanel title="Retirement" sub="Reserves keep earning after the last contract.">
          <Derived label="Roll-off" value={`${num(p.roll_off_months)} months after the last contract`} />
          <Derived label="Products covered" value={e.covered_labels.length ? e.covered_labels.join("; ") : "none"} />
        </PPanel>
      </div>
    </>
  );
}
