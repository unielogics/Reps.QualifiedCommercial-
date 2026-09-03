// MIRROR: keep identical to QCRep/src/production-package/*
// Stage two only: Schedule 1 (funding facility) and the Schedule 5 certificate inputs.
import { money, pct, whenLabel } from "../format";
import { Callout, Field, KV, PBtn, PChip, PPanel, type StepCtx } from "../ui";

export function StepFunding({ ctx }: { ctx: StepCtx }) {
  const { pkg, draft } = ctx;
  const ts = pkg.term_sheet;
  const caps = pkg.capabilities;
  const uof = draft.use_of_funds && typeof draft.use_of_funds === "object" ? draft.use_of_funds : null;
  const uofBlank = !uof || !Object.entries(uof).some(([k, v]) => k !== "other_label" && v !== "" && v !== null && Number(v) !== 0);
  return (
    <>
      <PPanel
        title="Terms as recorded"
        sub={ts
          ? `Term sheet v${ts.version} · ${money(ts.approved_amount)} at ${pct(ts.rate_pct, 2)} for ${ts.term_months} months · recorded by ${ts.entered_by_name ?? "the desk"} ${whenLabel(ts.entered_at)}`
          : "The loan terms this final was drafted from."}
        right={
          <span className="pp-row">
            {ts ? <PChip tone="gold">Term sheet v{ts.version}</PChip> : null}
            {caps.can_manage_terms && ctx.onOpenTermSheet ? <PBtn size="sm" onClick={ctx.onOpenTermSheet}>Edit loan terms</PBtn> : null}
          </span>
        }
      >
        <div className="pp-grid locked-fields">
          <Field ctx={ctx} k="funding_party" />
          <Field ctx={ctx} k="funding_party_name" span={2} />
          <Field ctx={ctx} k="funded_amount" label="Actual funding amount" />
          <Field ctx={ctx} k="min_activation" />
          <Field ctx={ctx} k="debt_service" label="Monthly scheduled debt service" />
          <Field ctx={ctx} k="funding_date" />
          <Field ctx={ctx} k="activation_date" />
          <Field ctx={ctx} k="commencement" />
          <Field ctx={ctx} k="maturity" />
        </div>
        {ts?.conditions || ts?.notes ? (
          <div className="pp-grid" style={{ marginTop: 10 }}>
            {ts.conditions ? <KV label="Conditions" value={ts.conditions} /> : null}
            {ts.notes ? <KV label="Notes" value={ts.notes} /> : null}
          </div>
        ) : null}
        <Callout tone="mut">
          These print on Schedule 1 and the Funding Activation Certificate. They are changed on the term sheet, not here; recording a new sheet re-applies it to this draft.
          The final goes out only after the funding date has passed, and whoever sends it attests the amount that cleared.
        </Callout>
      </PPanel>

      <PPanel title="Funding documents and accounts (Schedule 1)" sub="The date the final Funding Documents were executed, and the accounts the program runs through.">
        <div className="pp-grid">
          <Field ctx={ctx} k="funding_docs_executed_date" />
          <Field ctx={ctx} k="controlled_account" placeholder="Bank · account ending 1234" />
          <Field ctx={ctx} k="ach_account" placeholder="Bank · account ending 1234" />
        </div>
      </PPanel>

      <PPanel title="Approved use of funds (Schedule 1)" sub="How the funded amount is allocated across approved purposes. The total must equal the funded amount.">
        <div className="pp-grid"><Field ctx={ctx} k="use_of_funds" span={3} /></div>
        {uofBlank ? <Callout tone="warn">Use of funds is allocated on the term sheet. {caps.can_manage_terms ? "Record it there and it is re-applied here." : "Ask the desk to record it on the term sheet."}</Callout> : null}
      </PPanel>

      <PPanel title="Program support provided (Schedule 1)" sub="The support Qualified Commercial and the sponsor provide under the program; each checked line prints on Schedule 1.">
        <div className="pp-grid">
          <Field ctx={ctx} k="program_support" span={3} />
          {Array.isArray(draft.program_support) && (draft.program_support as string[]).includes("other") ? <Field ctx={ctx} k="program_support_other" span={3} /> : null}
        </div>
      </PPanel>

      <PPanel title="Notices" sub="Formal notice under the agreement is served by confirmed email to these addresses.">
        <div className="pp-grid">
          <Field ctx={ctx} k="dealer_notice_email" />
          <KV label="Sponsor notice email" value={String(draft.sponsor_email || "—")} />
          <KV label="Qualified Commercial" value="From company settings" />
        </div>
      </PPanel>

      <PPanel title="Funding Party joinder (Schedule 5)" sub="Whether the Funding Party joins the activation certificate.">
        <div className="pp-grid"><Field ctx={ctx} k="fp_joinder" /></div>
        {draft.fp_joinder === "yes" ? <Callout tone="mut">The Funding Party&apos;s joinder block prints on Schedule 5 and is signed in wet ink outside this system; it is never stamped, and execution does not wait for it.</Callout> : null}
      </PPanel>
    </>
  );
}
