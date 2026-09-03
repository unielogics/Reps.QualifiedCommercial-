// MIRROR: keep identical to QCRep/src/production-package/*
import { dateLabel, money, pct, num, whenLabel } from "./format";
import { IconCheck, IconFlag } from "./icons";
import { KV, PChip } from "./ui";
import type { ProductionPackage } from "./types";

export function AllClearSummary({ pkg, openItems = 0 }: { pkg: ProductionPackage; openItems?: number }) {
  const e = pkg.computed.econ;
  const adv = pkg.computed.advance;
  const sp = pkg.computed.sponsor;
  const two = pkg.stage === 2;
  const dealerSig = pkg.active_revision?.signatures.find((s) => s.party === "dealer" && s.status !== "voided");
  const ts = pkg.term_sheet;
  // A draft with open items is not "all clear" — the list itself lives behind the container's flag.
  const blocking = pkg.status === "draft" && openItems > 0;
  return (
    <section className={`pp-att${blocking ? "" : " clear"}`} aria-label="Summary">
      <header className="pp-att-h">
        {blocking
          ? <><IconFlag /><b>Draft in progress</b><span className="pp-sub">{openItems} item{openItems === 1 ? "" : "s"} still need{openItems === 1 ? "s" : ""} attention. Open the list from the flag beside the title.</span></>
          : pkg.status === "draft"
          ? <><IconCheck /><b>All clear</b><span className="pp-sub">{two ? "Every field carries a value. This is what the dealer will sign at closing." : "Every field carries a value. This is what the parties will sign."}</span></>
          : <><b>{two ? "Final agreement state" : "Agreement state"}</b></>}
      </header>
      <div className="pp-sumgrid">
        <KV label="Contracts / month" value={num(e.contracts)} />
        <KV label="Gross / month" value={money(e.gross)} />
        <KV label="Repayment / month" value={money(e.repay_m)} />
        <KV label={two ? "Funded amount" : "Advance"} value={money(adv.advance)} />
        <KV label="Spread" value={`${adv.spread >= 0 ? "+" : ""}${pct(adv.spread)}`} tone={adv.clears ? "ok" : "bad"} />
        <KV label="Sponsor / term" value={money(sp.total_over_term)} />
      </div>
      <div className="pp-sumstate">
        <PChip tone={pkg.status === "executed" ? "ok" : pkg.status === "out_for_signature" ? "warn" : pkg.status === "void" ? "mut" : "acc"}>
          {pkg.status === "draft" ? "Not sent" : pkg.status === "out_for_signature" ? (pkg.execution_pending ? "Signed · bundle pending" : "Out for signature") : pkg.status === "executed" ? (two ? "Final executed" : "Fully executed") : "Voided"}
        </PChip>
        {pkg.sent_at ? <span className="pp-sub">Sent {whenLabel(pkg.sent_at)}{pkg.sent_by_name ? ` by ${pkg.sent_by_name}` : ""}</span> : null}
        {dealerSig?.signed_at ? <span className="pp-sub">Dealer signed {whenLabel(dealerSig.signed_at)}</span> : null}
        {pkg.executed_at ? <span className="pp-sub">Executed {whenLabel(pkg.executed_at)}</span> : null}
      </div>
      {two && pkg.original ? (
        <div className="pp-sumstate"><span className="pp-sub">Drafted from the executed commitment (R{pkg.original.revision_no}, {dateLabel(pkg.original.executed_at)}){pkg.comparison ? ` · ${pkg.comparison.changed_count} change${pkg.comparison.changed_count === 1 ? "" : "s"}` : ""}</span></div>
      ) : null}
      {!two && (ts || pkg.final_package_id) ? (
        <div className="pp-sumstate">
          {ts ? <PChip tone="gold">Term sheet v{ts.version}</PChip> : null}
          {ts ? <span className="pp-sub">{money(ts.approved_amount)} at {pct(ts.rate_pct, 2)} for {ts.term_months} mo</span> : null}
          {pkg.final_package_id ? <PChip tone={pkg.final_status === "executed" ? "ok" : pkg.final_status === "out_for_signature" ? "warn" : "acc"}>Final · {pkg.final_status === "out_for_signature" ? "out for signature" : pkg.final_status ?? "draft"}</PChip> : null}
        </div>
      ) : null}
    </section>
  );
}
