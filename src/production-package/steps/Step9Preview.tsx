// MIRROR: keep identical to QCRep/src/production-package/*
import { Fragment, useEffect, useMemo, useState } from "react";
import type { PackageClient } from "../client";
import { dateLabel, openSignedUrl } from "../format";
import { Callout, PBtn, PChip, PPanel, type StepCtx } from "../ui";
import type { Comparison } from "../types";

const STAGE_ONE_TITLE = "Production Commitment and Capital Engagement Agreement";
const STAGE_TWO_TITLE = "Program Activation and Production Agreement";

export function Step9Preview({ ctx, client }: { ctx: StepCtx; client: PackageClient }) {
  const { computed, pkg, draft } = ctx;
  const two = pkg.stage === 2;
  const [stage, setStage] = useState<"one" | "two">(two ? "two" : "one");
  const [onlyChanges, setOnlyChanges] = useState(true);
  const [section, setSection] = useState<string | null>(null);
  const [fetched, setFetched] = useState<Comparison | null>(null);
  const cmp = pkg.comparison ?? fetched;
  useEffect(() => {
    if (!two || pkg.comparison || !pkg.capabilities.can_compare || !client.comparison) return;
    client.comparison().then(setFetched).catch(() => undefined);
  }, [two, pkg.comparison, pkg.capabilities.can_compare, client, pkg.version]);
  const rows = computed.preview[stage];
  const blanks = rows.filter((r) => r.blank).length;
  const rev = pkg.active_revision;
  const sections = useMemo(() => (cmp ? Array.from(new Set(cmp.rows.map((r) => r.section))) : []), [cmp]);
  const changedBySection = useMemo(() => (cmp ? cmp.rows.reduce<Record<string, number>>((acc, r) => { if (r.changed) acc[r.section] = (acc[r.section] ?? 0) + 1; return acc; }, {}) : {}), [cmp]);
  const visible = cmp ? cmp.rows.filter((r) => (!onlyChanges || r.changed) && (!section || r.section === section)) : [];
  const grouped = sections.map((s) => ({ section: s, rows: visible.filter((r) => r.section === s) })).filter((g) => g.rows.length);
  const joinder = draft.fp_joinder === "yes";

  return (
    <>
      {!two && pkg.status === "executed" && pkg.final_package_id ? (
        <div className="pp-banner">
          <span><b>A final package has been drafted from this executed commitment.</b> <span className="pp-sub">Final · {pkg.final_status === "out_for_signature" ? "out for signature" : pkg.final_status ?? "draft"}. The figures below are frozen; the Activation agreement supersedes them where a figure appears in both.</span></span>
          {ctx.onOpenFinal ? <PBtn size="sm" variant="pri" onClick={() => ctx.onOpenFinal?.(pkg.final_package_id as string)}>Open the final</PBtn> : null}
        </div>
      ) : null}

      {two ? (
        <PPanel
          title={`Original (executed ${dateLabel(pkg.original?.executed_at)}) vs Final`}
          sub="Field by field: what the executed commitment says, and what the Activation agreement will say. Where a figure appears in both, the Activation agreement controls (Commitment §4.8, Activation §1.8). The dealer sees the visible changes at signing."
          right={
            <span className="pp-row">
              {cmp ? <PChip tone={cmp.changed_count ? "warn" : "ok"}>{cmp.changed_count} change{cmp.changed_count === 1 ? "" : "s"}</PChip> : null}
              {cmp ? <PChip tone="mut">{cmp.source === "frozen" ? "Frozen at send" : "Live"}</PChip> : null}
              {pkg.original?.executed_url ? <PBtn size="sm" onClick={() => openSignedUrl(pkg.original?.executed_url)}>Open the executed commitment</PBtn> : null}
              {ctx.onOpenOriginal && pkg.parent_package_id ? <PBtn size="sm" onClick={() => ctx.onOpenOriginal?.(pkg.parent_package_id as string)}>Commitment package</PBtn> : null}
            </span>
          }
        >
          {cmp ? (
            <>
              <div className="pp-compare-tools">
                <label className="pp-check"><input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} /> Show only changes</label>
                <button type="button" className={`pp-chipbtn${section === null ? " on" : ""}`} onClick={() => setSection(null)}>All sections</button>
                {sections.map((s) => (
                  <button key={s} type="button" className={`pp-chipbtn${section === s ? " on" : ""}`} onClick={() => setSection(section === s ? null : s)}>{s}{changedBySection[s] ? ` · ${changedBySection[s]}` : ""}</button>
                ))}
              </div>
              <div className="pp-tblwrap">
                <table className="pp-tbl compare">
                  <thead><tr><th>Field</th><th>Original</th><th>Final</th></tr></thead>
                  <tbody>
                    {grouped.map((g) => (
                      <Fragment key={g.section}>
                        <tr><td className="sect" colSpan={3}>{g.section}</td></tr>
                        {g.rows.map((r) => (
                          <tr key={r.key} className={`${r.changed ? "changed" : ""}${r.dealer_visible ? "" : " hidden"}`} title={r.dealer_visible ? undefined : "Desk only — not shown to the dealer"}>
                            <td>{r.label}{!r.dealer_visible ? <> <PChip tone="mut">desk only</PChip></> : null}</td>
                            <td className="before">{r.original_blank ? "—" : r.before}</td>
                            <td className="after">{r.after}</td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              {!visible.length ? <Callout tone="ok">Nothing differs from the executed commitment{section ? " in this section" : ""}.</Callout> : null}
            </>
          ) : <Callout tone="mut">{pkg.capabilities.can_compare ? "Loading the comparison…" : "The comparison is available to the desk."}</Callout>}
        </PPanel>
      ) : null}

      <PPanel
        title={stage === "one" ? STAGE_ONE_TITLE : STAGE_TWO_TITLE}
        sub={stage === "one" ? "Stage one — signed at approval · Schedule A and Schedule E — requested facility and production baseline" : "Stage two — signed at closing · Addendum A and Schedules 1–5 — operative thresholds, funding and disclosures"}
        right={
          <span className="pp-row">
            {!two ? <PBtn size="sm" variant={stage === "one" ? "pri" : "ghost"} onClick={() => setStage("one")}>Stage one</PBtn> : null}
            {!two ? <PBtn size="sm" variant={stage === "two" ? "pri" : "ghost"} onClick={() => setStage("two")}>Stage two</PBtn> : null}
            {rev?.current_url ? <PBtn size="sm" onClick={() => openSignedUrl(rev.current_url)}>Open the sent PDF</PBtn> : null}
          </span>
        }
      >
        <table className="pp-tbl preview">
          <thead><tr><th>Schedule</th><th>Field</th><th>Prints as</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={`${r.schedule}:${r.label}`} className={r.blank ? "bad" : ""}><td className="muted">{r.schedule}</td><td>{r.label}</td><td>{r.blank ? <PChip tone="bad">Blank</PChip> : r.value}</td></tr>)}</tbody>
        </table>
        {two || stage === "one" ? (
          blanks ? <Callout tone="bad">{blanks} field{blanks === 1 ? "" : "s"} print blank on this agreement. A blank field is not enforceable.</Callout>
            : <Callout tone="ok">Every field on this agreement carries a value. This is what the parties will sign.</Callout>
        ) : <Callout tone="mut">Stage two is drafted as the final package once this commitment is executed and a term sheet is recorded; these are the figures as they stand today.</Callout>}
      </PPanel>
      <PPanel title="Covered products" sub="Each carries a production commitment on the agreement.">
        <p>{computed.econ.covered_labels.length ? computed.econ.covered_labels.join("; ") + "." : "None checked — no product carries a production commitment."}</p>
      </PPanel>
      <PPanel title="Signature page" sub={two ? "Who signs the Activation agreement: Schedule 5 and the master signature page." : "Who signs stage one."}>
        <table className="pp-tbl">
          <tbody>
            <tr><td>Qualified Commercial LLC</td><td className="muted">Program manager — placed from the company signature on file{two ? " (Schedule 5 and master page)" : ""}</td></tr>
            <tr><td>{String(draft.dealer_name || "Dealer")}</td><td className="muted">Dealer — {String(draft.dealer_signer_name || "authorized signer")} signs electronically at login{two ? ", with initials, on Schedule 5 and the master page" : ", with initials"}</td></tr>
            <tr><td>{pkg.sponsor?.name || String(draft.sponsor_name || "Sponsor")}</td><td className="muted">Warranty provider, administrator, or sales organization — placed from the sponsor&apos;s signature on file</td></tr>
            <tr><td>{String(draft.rm_name || "Relationship manager")}</td><td className="muted">Relationship manager — Schedule {two ? "2" : "B"} acknowledgment, placed from their signature on file</td></tr>
            {two && joinder ? <tr><td>{String(draft.funding_party_name || draft.funding_party || "Funding Party")}</td><td className="muted">Funding Party joinder — signed in wet ink outside this system; never stamped</td></tr> : null}
          </tbody>
        </table>
      </PPanel>
    </>
  );
}
