// MIRROR: keep identical to QCRep/src/production-package/*
import { useState } from "react";
import type { PackageClient } from "../client";
import { openSignedUrl } from "../format";
import { Callout, PBtn, PChip, PPanel, type StepCtx } from "../ui";

export function Step9Preview({ ctx, client }: { ctx: StepCtx; client: PackageClient }) {
  const { computed, pkg } = ctx;
  const [stage, setStage] = useState<"one" | "two">("one");
  const rows = computed.preview[stage];
  const blanks = rows.filter((r) => r.blank).length;
  const rev = pkg.active_revision;
  return (
    <>
      <PPanel
        title={stage === "one" ? "Production Commitment and Capital Engagement Agreement" : "Program Activation and Production Agreement"}
        sub={stage === "one" ? "Stage one — signed at approval · Schedule A and Schedule E — requested facility and production baseline" : "Stage two — signed at closing · Addendum A and Schedule 1 — operative thresholds and funding (deferred)"}
        right={
          <span className="pp-row">
            <PBtn size="sm" variant={stage === "one" ? "pri" : "ghost"} onClick={() => setStage("one")}>Stage one</PBtn>
            <PBtn size="sm" variant={stage === "two" ? "pri" : "ghost"} onClick={() => setStage("two")}>Stage two</PBtn>
            {rev?.current_url && client.mode === "operator" ? <PBtn size="sm" onClick={() => openSignedUrl(rev.current_url)}>Open the sent PDF</PBtn> : null}
          </span>
        }
      >
        <table className="pp-tbl preview">
          <thead><tr><th>Schedule</th><th>Field</th><th>Prints as</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={`${r.schedule}:${r.label}`} className={r.blank ? "bad" : ""}><td className="muted">{r.schedule}</td><td>{r.label}</td><td>{r.blank ? <PChip tone="bad">Blank</PChip> : r.value}</td></tr>)}</tbody>
        </table>
        {stage === "one" ? (
          blanks ? <Callout tone="bad">{blanks} field{blanks === 1 ? "" : "s"} print blank on this stage. A blank field is not enforceable.</Callout>
            : <Callout tone="ok">Every field on this stage carries a value. This is what the parties will sign.</Callout>
        ) : <Callout tone="mut">Stage two is executed only after actual funding at or above the minimum activation amount. It is not built into this release.</Callout>}
      </PPanel>
      <PPanel title="Covered products" sub="Each carries a production commitment on the agreement.">
        <p>{computed.econ.covered_labels.length ? computed.econ.covered_labels.join("; ") + "." : "None checked — no product carries a production commitment."}</p>
      </PPanel>
      <PPanel title="Signature page" sub="Who signs stage one.">
        <table className="pp-tbl">
          <tbody>
            <tr><td>Qualified Commercial LLC</td><td className="muted">Program manager — recorded by the desk</td></tr>
            <tr><td>{String(ctx.draft.dealer_name || "Dealer")}</td><td className="muted">Dealer — {String(ctx.draft.dealer_signer_name || "authorized signer")} signs electronically at login</td></tr>
            <tr><td>{pkg.sponsor?.name || String(ctx.draft.sponsor_name || "Sponsor")}</td><td className="muted">Warranty provider, administrator, or sales organization — recorded by the desk</td></tr>
          </tbody>
        </table>
      </PPanel>
    </>
  );
}
