// MIRROR: keep identical to QCRep/src/production-package/*
import { money, pct, num, whenLabel } from "./format";
import { IconCheck } from "./icons";
import { KV, PChip } from "./ui";
import type { ProductionPackage } from "./types";

export function AllClearSummary({ pkg }: { pkg: ProductionPackage }) {
  const e = pkg.computed.econ;
  const adv = pkg.computed.advance;
  const sp = pkg.computed.sponsor;
  const dealerSig = pkg.active_revision?.signatures.find((s) => s.party === "dealer");
  return (
    <section className="pp-att clear" aria-label="Summary">
      <header className="pp-att-h">
        {pkg.status === "draft" ? <><IconCheck /><b>All clear</b><span className="pp-sub">Every field carries a value. This is what the parties will sign.</span></> : <><b>Agreement state</b></>}
      </header>
      <div className="pp-sumgrid">
        <KV label="Contracts / month" value={num(e.contracts)} />
        <KV label="Gross / month" value={money(e.gross)} />
        <KV label="Repayment / month" value={money(e.repay_m)} />
        <KV label="Advance" value={money(adv.advance)} />
        <KV label="Spread" value={`${adv.spread >= 0 ? "+" : ""}${pct(adv.spread)}`} tone={adv.clears ? "ok" : "bad"} />
        <KV label="Sponsor / term" value={money(sp.total_over_term)} />
      </div>
      <div className="pp-sumstate">
        <PChip tone={pkg.status === "executed" ? "ok" : pkg.status === "out_for_signature" ? "warn" : pkg.status === "void" ? "mut" : "acc"}>
          {pkg.status === "draft" ? "Not sent" : pkg.status === "out_for_signature" ? "Out for signature" : pkg.status === "executed" ? "Fully executed" : "Voided"}
        </PChip>
        {pkg.sent_at ? <span className="pp-sub">Sent {whenLabel(pkg.sent_at)}</span> : null}
        {dealerSig?.signed_at ? <span className="pp-sub">Dealer signed {whenLabel(dealerSig.signed_at)}</span> : null}
        {pkg.executed_at ? <span className="pp-sub">Executed {whenLabel(pkg.executed_at)}</span> : null}
      </div>
    </section>
  );
}
