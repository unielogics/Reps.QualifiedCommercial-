// MIRROR: keep identical to QCRep/src/production-package/*
import { useState } from "react";
import { dateLabel, openSignedUrl } from "../format";
import { IconLink } from "../icons";
import { Callout, Field, PBtn, PChip, PPanel, type StepCtx } from "../ui";
import type { SponsorOption } from "../types";

export function Step1Parties({ ctx, sponsors }: { ctx: StepCtx; sponsors: SponsorOption[] }) {
  const { pkg, draft, readOnly, mode } = ctx;
  const [editSponsor, setEditSponsor] = useState(false);
  const canPick = pkg.capabilities.can_pick_sponsor && !readOnly;
  const sponsor = pkg.sponsor;
  const agreement = sponsor?.agreement ?? null;
  const [query, setQuery] = useState("");
  const filtered = sponsors.filter((s) => !query.trim() || s.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <>
      <PPanel title="Dealer" sub="The business receiving the advance, exactly as it should print on both agreements.">
        <div className="pp-grid">
          <Field ctx={ctx} k="dealer_name" span={2} />
          <Field ctx={ctx} k="dealer_dba" />
          <Field ctx={ctx} k="dealer_entity" />
          <Field ctx={ctx} k="dealer_state" />
          <Field ctx={ctx} k="dealer_address" span={2} placeholder="Street, city, state ZIP" />
          <Field ctx={ctx} k="dealer_signer_name" placeholder="Full legal name" />
          <Field ctx={ctx} k="dealer_signer_title" placeholder="Managing member, President…" />
        </div>
      </PPanel>

      <PPanel
        title="Sponsor" sub="Warranty provider, administrator, or sales organization — must hold a signed Strategic Referral, Capital Advisory and Business Relationship Protection Agreement."
        right={agreement ? (
          <span className="pp-agree">
            <PChip tone="ok">Agreement on file · {agreement.contract_number} · signed {dateLabel(agreement.signed_at)}</PChip>
            {agreement.certificate_url ? <PBtn size="sm" onClick={() => openSignedUrl(agreement.certificate_url)}>Certificate</PBtn> : null}
            {agreement.admin_url ? <a className="pp-btn v-link s-sm" href={agreement.admin_url} target="_blank" rel="noreferrer"><IconLink />Agreement record</a> : null}
          </span>
        ) : sponsor ? <PChip tone="bad">No signed agreement</PChip> : null}
      >
        {mode === "rep" ? (
          <Callout tone="mut">The sponsor is chosen by the desk{sponsor ? `: ${sponsor.name}` : ""}.</Callout>
        ) : (
          <div className="pp-field" id="pp-field-sponsor_name">
            <label className="pp-lbl" htmlFor="pp-in-sponsor_name">Sponsor company<span className="pp-req">*</span></label>
            {canPick ? (
              <div className="pp-sponsor-pick">
                <input id="pp-in-sponsor_name" className="pp-input" placeholder="Search signed companies…" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
                <select className="pp-input" value={sponsor?.company_id ?? ""} onChange={(e) => ctx.set("sponsor_company_id", e.target.value || null)}>
                  <option value="">Choose a sponsor…</option>
                  {filtered.map((s) => <option key={s.company_id} value={s.company_id}>{s.name}{s.agreement ? ` · ${s.agreement.contract_number}` : ""}</option>)}
                </select>
              </div>
            ) : (
              <div className="pp-static">{sponsor?.name || String(draft.sponsor_name || "") || "—"}</div>
            )}
            {!sponsor && !readOnly ? (
              <div className="pp-hint">
                Not on the list? Send the sponsor the agreement:&nbsp;
                <button type="button" className="pp-btn v-link s-sm" onClick={() => { navigator.clipboard?.writeText(pkg.sponsor_signing_url); ctx.notify("Signing link copied — the package can be sent once the sponsor has signed.", "ok"); }}>Copy signing link</button>
              </div>
            ) : null}
          </div>
        )}
        <div className="pp-grid" style={{ marginTop: 10 }}>
          {sponsor && !editSponsor && mode === "operator" ? (
            <>
              <div className="pp-kv"><span className="pp-lbl">Legal name</span><span className="pp-val">{String(draft.sponsor_name || sponsor.name)}</span></div>
              <div className="pp-kv"><span className="pp-lbl">Entity / state</span><span className="pp-val">{[draft.sponsor_entity, draft.sponsor_state].filter(Boolean).join(" / ") || "—"}</span></div>
              <div className="pp-kv"><span className="pp-lbl">Principal address</span><span className="pp-val">{String(draft.sponsor_address || "—")}</span></div>
              <div className="pp-kv"><span className="pp-lbl">Notice email</span><span className="pp-val">{String(draft.sponsor_email || "—")}</span></div>
              {!readOnly ? <div><PBtn size="sm" onClick={() => setEditSponsor(true)}>Edit sponsor details</PBtn></div> : null}
            </>
          ) : mode === "operator" ? (
            <>
              <Field ctx={ctx} k="sponsor_entity" />
              <Field ctx={ctx} k="sponsor_state" />
              <Field ctx={ctx} k="sponsor_address" span={2} />
              <Field ctx={ctx} k="sponsor_email" />
            </>
          ) : null}
          <Field ctx={ctx} k="sponsor_platform" placeholder="The administration platform on Schedule A" />
        </div>
      </PPanel>

      <PPanel title="Relationship manager" sub="Schedule 2 names the manager and their compensation category.">
        <div className="pp-grid">
          <Field ctx={ctx} k="rm_name" teamPicker={mode === "operator"} kind={mode === "operator" ? "select" : "text"} />
          <Field ctx={ctx} k="rm_employer" />
          <Field ctx={ctx} k="rm_email" />
          <Field ctx={ctx} k="rm_phone" placeholder="(973) 555-0148" />
        </div>
      </PPanel>
    </>
  );
}
