// MIRROR: keep identical to QCRep/src/production-package/*
import { useState } from "react";
import type { PackageClient } from "../client";
import { dateLabel, errorDetail, errorMessage, openSignedUrl, toNumber } from "../format";
import { IconLink } from "../icons";
import { Callout, Field, PBtn, PChip, PPanel, SigOnFileChip, type StepCtx } from "../ui";
import type { OwnerRow, ProductionPackage, SponsorOption } from "../types";

export function Step1Parties({ ctx, sponsors, client, onPackage }: { ctx: StepCtx; sponsors: SponsorOption[]; client?: PackageClient; onPackage?: (p: ProductionPackage) => void }) {
  const { pkg, draft, readOnly, mode } = ctx;
  const two = pkg.stage === 2;
  const operator = mode === "operator";
  const [editSponsor, setEditSponsor] = useState(false);
  const canPick = pkg.capabilities.can_pick_sponsor && !readOnly;
  const sponsor = pkg.sponsor;
  const agreement = sponsor?.agreement ?? null;
  const [query, setQuery] = useState("");
  const filtered = sponsors.filter((s) => !query.trim() || s.name.toLowerCase().includes(query.trim().toLowerCase()));
  const sof = pkg.signatures_on_file ?? {};
  const [authAsk, setAuthAsk] = useState(false);
  const [authNote, setAuthNote] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const canAuthorize = pkg.capabilities.can_adopt_sponsor_signature && Boolean(sponsor && agreement) && sof.sponsor !== undefined && !sof.sponsor.present && Boolean(client?.adoptSponsorSignature);
  const authorize = async () => {
    if (!client?.adoptSponsorSignature) return;
    setAuthBusy(true);
    try {
      await client.adoptSponsorSignature(authNote.trim());
      if (onPackage) onPackage(await client.load());
      ctx.notify(`${sponsor?.name ?? "Sponsor"}'s signature on file is authorized for production agreements.`, "ok");
      setAuthAsk(false);
      setAuthNote("");
    } catch (err) {
      const detail = errorDetail(err);
      ctx.notify(typeof detail?.message === "string" ? detail.message : errorMessage(err, "The signature could not be authorized."), "bad");
    } finally { setAuthBusy(false); }
  };
  const owners = Array.isArray(draft.owners) ? (draft.owners as OwnerRow[]) : [];
  const ownerPct = owners.reduce((acc, o) => acc + toNumber(o.pct), 0);

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
          {two ? <Field ctx={ctx} k="dealer_notice_email" /> : null}
        </div>
      </PPanel>

      {two ? (
        <>
          <PPanel title="Business identity (§9.1)" sub="The dealer's formation particulars as they print on the Activation agreement. Prefilled from the dealer file where it has them.">
            <div className="pp-grid">
              <Field ctx={ctx} k="identity_formation_date" />
              <Field ctx={ctx} k="identity_ein" placeholder="12-3456789" />
              <Field ctx={ctx} k="identity_naics" placeholder="441110" />
              <Field ctx={ctx} k="identity_license" />
              <Field ctx={ctx} k="identity_website" span={2} placeholder="https://" />
            </div>
          </PPanel>
          <PPanel title="Ownership schedule (§9.2)" sub="Every owner, totalling exactly 100.00%. At most five rows print."
            right={owners.length ? <PChip tone={Math.abs(ownerPct - 100) <= 0.01 ? "ok" : "bad"}>{ownerPct.toLocaleString("en-US", { maximumFractionDigits: 2 })}% of 100%</PChip> : null}>
            <div className="pp-grid"><Field ctx={ctx} k="owners" span={3} /></div>
          </PPanel>
        </>
      ) : null}

      <PPanel
        title="Sponsor" sub={two ? "Carried from the executed commitment. The sponsor is not changed on the final." : "Warranty provider, administrator, or sales organization — must hold a signed Strategic Referral, Capital Advisory and Business Relationship Protection Agreement."}
        right={agreement ? (
          <span className="pp-agree">
            <PChip tone="ok">Agreement on file · {agreement.contract_number} · signed {dateLabel(agreement.signed_at)}</PChip>
            {operator ? <SigOnFileChip sof={sof.sponsor} /> : null}
            {agreement.certificate_url ? <PBtn size="sm" onClick={() => openSignedUrl(agreement.certificate_url)}>Certificate</PBtn> : null}
            {agreement.admin_url ? <a className="pp-btn v-link s-sm" href={agreement.admin_url} target="_blank" rel="noreferrer"><IconLink />Agreement record</a> : null}
          </span>
        ) : sponsor ? <PChip tone="bad">No signed agreement</PChip> : null}
      >
        {!operator ? (
          <Callout tone="mut">The sponsor is chosen by the desk{sponsor ? `: ${sponsor.name}` : ""}.{!sponsor ? " Ask the desk to choose it before the package is sent." : ""}</Callout>
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
            {!sponsor && !readOnly && !two ? (
              <div className="pp-hint">
                Not on the list? Send the sponsor the agreement:&nbsp;
                <button type="button" className="pp-btn v-link s-sm" onClick={() => { navigator.clipboard?.writeText(pkg.sponsor_signing_url); ctx.notify("Signing link copied — the package can be sent once the sponsor has signed.", "ok"); }}>Copy signing link</button>
              </div>
            ) : null}
          </div>
        )}
        {operator && sponsor && sof.sponsor && !sof.sponsor.present ? (
          <div className="pp-inline">
            <b>No sponsor signature on file.</b>
            <p className="pp-sub">{sof.sponsor.how_to_fix ?? "Authorize the sponsor's agreement signature for use on production agreements."} Every counterparty signature is placed from file when the package is sent.</p>
            {canAuthorize && !authAsk ? <div className="pp-row"><PBtn variant="pri" size="sm" onClick={() => setAuthAsk(true)}>Authorize signature on file</PBtn></div> : null}
            {authAsk ? (
              <>
                <p className="pp-sub">The officer signature captured on {agreement?.contract_number ?? "the Referral Protection Agreement"} ({agreement?.signer_name ?? "signer"}{agreement?.signer_title ? `, ${agreement.signer_title}` : ""}) will be placed on every production agreement this sponsor is party to. Note the authorization — it is kept in the audit trail.</p>
                <input className="pp-input" placeholder="Authorization note (e.g. confirmed with the sponsor's officer on the phone)" value={authNote} onChange={(e) => setAuthNote(e.target.value)} />
                <div className="pp-row"><PBtn variant="pri" size="sm" onClick={authorize} busy={authBusy} disabled={authNote.trim().length < 3}>Authorize</PBtn><PBtn size="sm" onClick={() => setAuthAsk(false)}>Cancel</PBtn></div>
              </>
            ) : null}
          </div>
        ) : null}
        <div className="pp-grid" style={{ marginTop: 10 }}>
          {sponsor && (!editSponsor || two) && operator ? (
            <>
              <div className="pp-kv"><span className="pp-lbl">Legal name</span><span className="pp-val">{String(draft.sponsor_name || sponsor.name)}</span></div>
              <div className="pp-kv"><span className="pp-lbl">Entity / state</span><span className="pp-val">{[draft.sponsor_entity, draft.sponsor_state].filter(Boolean).join(" / ") || "—"}</span></div>
              <div className="pp-kv"><span className="pp-lbl">Principal address</span><span className="pp-val">{String(draft.sponsor_address || "—")}</span></div>
              <div className="pp-kv"><span className="pp-lbl">Notice email</span><span className="pp-val">{String(draft.sponsor_email || "—")}</span></div>
              {!readOnly && !two ? <div><PBtn size="sm" onClick={() => setEditSponsor(true)}>Edit sponsor details</PBtn></div> : null}
            </>
          ) : operator && !two ? (
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

      <PPanel title="Relationship manager" sub="Schedule 2 names the manager and their compensation category. Their acknowledgment is placed from the signature on file when the package is sent."
        right={operator ? <SigOnFileChip sof={sof.rm} /> : null}>
        <div className="pp-grid">
          <Field ctx={ctx} k="rm_name" teamPicker={operator} kind={operator ? "select" : "text"} />
          <Field ctx={ctx} k="rm_employer" />
          <Field ctx={ctx} k="rm_email" />
          <Field ctx={ctx} k="rm_phone" placeholder="(973) 555-0148" />
        </div>
        {operator && sof.rm && !sof.rm.present ? <Callout tone="warn">{sof.rm.how_to_fix}</Callout> : null}
      </PPanel>
    </>
  );
}
