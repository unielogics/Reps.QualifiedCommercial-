// MIRROR: keep identical to QCRep/src/production-package/*
import { useEffect, useState } from "react";
import type { ManualSignatureBody, PackageClient } from "../client";
import { dateLabel, errorDetail, errorMessage, money, openSignedUrl, pct, toNumber, whenLabel } from "../format";
import { IconLock } from "../icons";
import { Callout, KV, PBtn, PChip, PPanel, SigOnFileChip, type StepCtx } from "../ui";
import type { HistoryEvent, ProductionPackage, SendRequest, Signature, SignatureParty, SignaturesOnFile, StepKey } from "../types";

const STAGE_ONE_TITLE = "Production Commitment and Capital Engagement Agreement";
const STAGE_TWO_TITLE = "Program Activation and Production Agreement";
// Display copy of FUNDING_ATTESTATION_TEXT (production_signing.py); the server stores its own version with the revision.
const FUNDING_ATTESTATION_TEXT = "I confirm that the Funding Party named on the certificate disbursed the stated amount to the Dealer, that the funds cleared on the stated date, and that the amount is at or above the Minimum Activation Amount.";

type PlacedParty = "qc" | "sponsor" | "rm";
type RowState = { label: string; tone: "ok" | "warn" | "bad" | "mut"; fix?: string | null };

function partyLabel(party: SignatureParty, ctx: StepCtx): string {
  if (party === "qc") return "Qualified Commercial LLC";
  if (party === "dealer") return String(ctx.draft.dealer_name || "Dealer");
  if (party === "rm") return String(ctx.draft.rm_name || "Relationship manager");
  if (party === "fp") return String(ctx.draft.funding_party_name || ctx.draft.funding_party || "Funding Party");
  return ctx.pkg.sponsor?.name || String(ctx.draft.sponsor_name || "Sponsor");
}

function dealerState(s: Signature | undefined, sent: boolean): RowState {
  if (s?.status === "signed") return { label: `Signed ${whenLabel(s.signed_at)}${s.initials ? ` · initials ${s.initials}` : ""}`, tone: "ok" };
  if (s?.status === "pending") return { label: s.viewed_at ? `Opened ${whenLabel(s.viewed_at)} · awaiting signature` : "Sent · not opened", tone: "warn" };
  return { label: sent ? "Awaiting signature" : "Signs electronically at login", tone: "mut" };
}

function placedState(party: PlacedParty, s: Signature | undefined, sent: boolean, sof: SignaturesOnFile): RowState {
  if (s?.status === "signed" && s.method === "stored") return { label: `Placed from file · adopted ${dateLabel(s.stored_adopted_at)}`, tone: "ok" };
  if (s?.status === "signed" && s.method === "manual") return { label: `Recorded · signed ${dateLabel(s.signed_on)}`, tone: "ok" };
  if (s?.status === "signed") return { label: `Signed ${whenLabel(s.signed_at)}`, tone: "ok" };
  const onFile = sof[party];
  if (!onFile) return { label: sent ? "Awaiting record" : "Placed from the signature on file when sent", tone: "mut" };
  if (onFile.present) return { label: sent ? "Awaiting record" : `Signature on file · adopted ${dateLabel(onFile.adopted_at)}`, tone: sent ? "warn" : "ok" };
  return { label: "No signature on file", tone: "bad", fix: onFile.how_to_fix };
}

export function Step10Send({ ctx, client, onPackage, onPresentation }: { ctx: StepCtx; client: PackageClient; onPackage: (p: ProductionPackage) => void; onPresentation: () => void }) {
  const { pkg, notify, draft } = ctx;
  const caps = pkg.capabilities;
  const two = pkg.stage === 2;
  const operator = pkg.mode === "operator";
  const rev = pkg.active_revision;
  const sigs = rev?.signatures ?? [];
  const byParty = (p: SignatureParty) => sigs.find((s) => s.party === p && s.status !== "voided");
  const sof = pkg.signatures_on_file ?? {};
  const [channel, setChannel] = useState<"sms" | "email">(pkg.sms_consent.status === "granted" ? "sms" : "email");
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [askReason, setAskReason] = useState<"reopen" | "void" | null>(null);
  const [record, setRecord] = useState<PlacedParty | null>(null);
  const [form, setForm] = useState<ManualSignatureBody>({ party: "qc", signer_name: "", signer_title: "", signed_on: new Date().toISOString().slice(0, 10), attestation: false });
  const [consentName, setConsentName] = useState(String(draft.dealer_signer_name || ""));
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [outcome, setOutcome] = useState<{ tone: "ok" | "warn" | "bad"; text: string } | null>(null);
  const [fixes, setFixes] = useState<Record<string, string> | null>(null);
  const [attest, setAttest] = useState({
    actual_funding_date: String(draft.funding_date ?? "").slice(0, 10), amount_funded: String(draft.funded_amount ?? ""),
    funding_party_name: String(draft.funding_party_name ?? ""), funding_reference: "", note: "", confirm: false,
  });
  const attention = pkg.status === "draft" ? pkg.computed.attention : [];
  const sent = pkg.status !== "draft";
  const title = two ? STAGE_TWO_TITLE : STAGE_ONE_TITLE;

  useEffect(() => { if (client.history) client.history().then((h) => setHistory(h.events)).catch(() => undefined); }, [client, pkg.version]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (err) {
      const detail = errorDetail(err);
      const code = typeof detail?.code === "string" ? detail.code : "";
      const message = typeof detail?.message === "string" ? detail.message : errorMessage(err);
      if (code === "attention" && Array.isArray(detail?.items)) {
        const first = detail?.items[0] as { step?: StepKey } | undefined;
        notify("Clear the open items first — a blank field is not enforceable.", "warn");
        if (first?.step) ctx.go(first.step);
      } else if (code === "sponsor_missing" || code === "sponsor_agreement_missing") {
        if (operator) { notify(message, "bad"); ctx.go("parties"); } else { notify(`${message} The desk chooses the sponsor — ask the desk to pick it, then send again.`, "bad"); }
      } else if (code === "signature_on_file_missing") {
        const how = detail?.how_to_fix && typeof detail.how_to_fix === "object" ? (detail.how_to_fix as Record<string, string>) : {};
        setFixes(how);
        notify(operator ? message : `${message} The desk puts the missing signatures on file.`, "bad");
      } else if (code === "funding_not_yet_occurred" || code === "funding_mismatch" || code === "funding_attestation_required" || code === "funding_docs_before_commitment") {
        notify(message, "bad");
        if (code === "funding_not_yet_occurred" || code === "funding_docs_before_commitment") ctx.go("funding");
      } else if (code === "final_exists") {
        notify(message, "warn");
        const id = typeof detail?.final_package_id === "string" ? detail.final_package_id : pkg.final_package_id;
        if (id && ctx.onOpenFinal) ctx.onOpenFinal(id); else onPackage(await client.load());
      } else if (code === "terms_missing") {
        notify(message, "warn");
        ctx.onOpenTermSheet?.();
      } else if (code === "stage_one_not_executed" || code === "final_out_for_signature" || code === "final_executed" || code === "package_frozen") {
        notify(message, "warn");
        onPackage(await client.load().catch(() => pkg));
      } else {
        notify(message, "bad");
      }
    } finally { setBusy(null); }
  };

  const send = () => run("send", async () => {
    setFixes(null);
    const body: SendRequest = { channel: operator ? channel : "email" };
    if (two) {
      body.funding_attestation = {
        confirm: attest.confirm, actual_funding_date: attest.actual_funding_date, amount_funded: toNumber(attest.amount_funded),
        funding_party_name: attest.funding_party_name.trim(), funding_reference: attest.funding_reference.trim() || null, note: attest.note.trim() || null,
      };
    }
    const result = await client.send!(body);
    onPackage(result.package);
    if (result.already_sent) { setOutcome({ tone: "warn", text: result.detail }); return; }
    const to = operator ? (pkg.client_email ?? "the client") : (pkg.recipient_preview ?? "the client's intake email");
    const who = [result.emailed ? `Emailed ${to}` : null, result.texted ? `texted ${pkg.client_phone ?? ""}` : null].filter(Boolean).join(" and ");
    setOutcome(result.delivered
      ? { tone: result.texted || body.channel === "email" ? "ok" : "warn", text: `${who}. ${two ? "They will be asked to review what changed since their commitment and sign the Activation agreement when they log in to their room; it executes on their signature." : "They will be asked to sign when they log in to their room; it executes on their signature."}${!result.texted && body.channel === "sms" ? ` ${result.detail}` : ""}` }
      : { tone: "bad", text: result.detail || "Nothing was delivered." });
  });

  const remind = () => run("remind", async () => {
    const result = await client.remind!({ channel: operator ? channel : "email" });
    onPackage(result.package);
    setOutcome({ tone: result.delivered ? "ok" : "bad", text: result.delivered ? `Reminder sent${result.texted ? " by email and text" : " by email"}.` : result.detail });
  });

  const reopen = () => run("reopen", async () => { onPackage(await client.reopen!(reason)); setAskReason(null); setReason(""); notify("Package reopened — the outstanding signature request was voided.", "acc"); ctx.go(two ? "funding" : "parties"); });
  const voidIt = () => run("void", async () => { onPackage(await client.voidPackage!(reason)); setAskReason(null); setReason(""); notify(two ? "Final voided. A new final can be drafted from the commitment." : "Package voided.", "mut"); });
  const retryExecute = () => run("execute", async () => { onPackage(await client.execute!()); notify(`${title} executed. The executed bundle has been emailed.`, "ok"); });
  const captureConsent = () => run("consent", async () => {
    const res = await client.captureSmsConsent!({ phone: pkg.client_phone ?? "", consenter_name: consentName, method: "rep_verbal" });
    onPackage({ ...pkg, sms_consent: res });
    if (res.status === "granted") setChannel("sms");
    notify(res.detail, res.status === "granted" ? "ok" : "warn");
  });
  const submitRecord = () => run("record", async () => {
    const result = await client.recordManual!({ ...form, party: record! });
    onPackage(result.package);
    setRecord(null);
    notify(`${partyLabel(record!, ctx)} signature recorded.`, "ok");
  });
  const draftFinal = () => run("final", async () => {
    const child = await client.draftFinal!();
    notify(`Final package drafted from the executed commitment${child.original ? ` (R${child.original.revision_no})` : ""}${child.term_sheet ? ` and term sheet v${child.term_sheet.version}` : ""}. It opens on the funding step.`, "ok");
    if (ctx.onOpenFinal) ctx.onOpenFinal(child.id); else onPackage(await client.load());
  });

  const dealer = byParty("dealer");
  const parties: Array<[SignatureParty, string]> = [
    ["qc", "Program manager"], ["dealer", "Dealer"], ["sponsor", "Warranty provider, administrator, or sales organization"],
    ["rm", two ? "Relationship manager — Schedule 2 acknowledgment" : "Relationship manager — Schedule B acknowledgment"],
    ...(two && draft.fp_joinder === "yes" ? [["fp", "Funding Party joinder (wet ink)"] as [SignatureParty, string]] : []),
  ];
  const statusChip = <PChip tone={pkg.status === "executed" ? "ok" : pkg.status === "out_for_signature" ? "warn" : pkg.status === "void" ? "mut" : "acc"}>{pkg.status === "executed" ? "Fully executed" : pkg.status === "out_for_signature" ? (pkg.execution_pending ? "Signed · bundle pending" : "Out for signature") : pkg.status === "void" ? "Voided" : "Not sent"}</PChip>;
  const missingOnFile = (["qc", "sponsor", "rm"] as PlacedParty[]).filter((p) => sof[p] && !sof[p]?.present);
  const ts = pkg.term_sheet;
  const draftReason = caps.can_draft_final ? null
    : pkg.final_package_id ? `A final already exists (${pkg.final_status === "out_for_signature" ? "out for signature" : pkg.final_status ?? "draft"}).`
      : !ts ? "Record the term sheet first — the final is drafted from it."
        : pkg.status !== "executed" ? "Available once the commitment is executed."
          : "Only a super admin or underwriter drafts the final.";
  const funding = rev?.funding ?? null;

  return (
    <>
      <PPanel title={`${two ? "Final" : "Stage one"} — ${title}`}
        sub={two
          ? "Addendum A and Schedules 1–5. The dealer signs fresh at login; Qualified Commercial, the sponsor and the relationship manager are placed from their signatures on file when the final is sent, and it executes on the dealer's signature."
          : "Schedules A–E. The dealer signs electronically at login; Qualified Commercial, the sponsor and the relationship manager are placed from their signatures on file when it is sent, and it executes on the dealer's signature."}
        right={statusChip}>
        <table className="pp-tbl sigs">
          <thead><tr><th>Party</th><th>Who</th><th>State</th><th /></tr></thead>
          <tbody>
            {parties.map(([party, who]) => {
              const s = byParty(party);
              const st: RowState = party === "dealer" ? dealerState(s, sent)
                : party === "fp" ? { label: "Signs in wet ink outside the system", tone: "mut" }
                  : placedState(party, s, sent, sof);
              const canFallback = party !== "dealer" && party !== "fp" && caps.can_record && !s && sent;
              return (
                <tr key={party}>
                  <td>
                    <b>{partyLabel(party, ctx)}</b>
                    {s?.method === "manual" && s.status === "signed" ? <div className="pp-sub">{s.signer_name}, {s.signer_title} · signed {dateLabel(s.signed_on)} · recorded by {s.recorded_by_name ?? "the desk"}</div> : null}
                    {s?.method === "stored" && s.status === "signed" ? <div className="pp-sub">{s.signer_name ?? s.typed_name ?? ""}{s.signer_title ? `, ${s.signer_title}` : ""} · placed {whenLabel(s.placed_at)}</div> : null}
                    {party === "dealer" && s?.typed_name ? <div className="pp-sub">Typed {s.typed_name}</div> : null}
                    {st.fix ? <div className="pp-hint bad">{st.fix}</div> : null}
                  </td>
                  <td className="muted">{who}</td>
                  <td><PChip tone={st.tone}>{st.label}</PChip></td>
                  <td className="n">
                    {party === "sponsor" && st.tone === "bad" && caps.can_adopt_sponsor_signature ? <PBtn size="sm" onClick={() => ctx.go("parties")}>Authorize on the sponsor row</PBtn> : null}
                    {canFallback ? <PBtn size="sm" onClick={() => { setRecord(party as PlacedParty); setForm({ party: party as PlacedParty, signer_name: party === "sponsor" ? String((rev?.sponsor_snapshot as { signer_name?: string } | null)?.signer_name ?? "") : party === "rm" ? String(draft.rm_name ?? "") : "", signer_title: party === "sponsor" ? String((rev?.sponsor_snapshot as { signer_title?: string } | null)?.signer_title ?? "") : "", signed_on: new Date().toISOString().slice(0, 10), attestation: false }); }}>Record a signature</PBtn> : null}
                    {s?.scan_url ? <PBtn size="sm" onClick={() => openSignedUrl(s.scan_url)}>Scan</PBtn> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {pkg.status === "draft" ? (
          <div className="pp-send">
            {attention.length ? <Callout tone="bad">{attention.length} item{attention.length === 1 ? " is" : "s are"} still open. Clear the red items first.</Callout> : <Callout tone="ok">Every field carries a value. Goes to the dealer to sign at login.</Callout>}
            {operator && missingOnFile.length ? (
              <Callout tone="warn">
                <b>Signatures on file are missing for {missingOnFile.map((p) => partyLabel(p, ctx)).join(", ")}.</b> Every counterparty signature is placed from file when the package is sent; nothing goes out until they are on file.
                <ul className="pp-fixlist">{missingOnFile.map((p) => <li key={p}>{sof[p]?.how_to_fix}</li>)}</ul>
              </Callout>
            ) : null}
            {fixes && Object.keys(fixes).length ? (
              <Callout tone="bad">
                <b>Not sent — a signature on file is missing.</b>{operator ? " Fix these, then send again:" : " The desk fixes these:"}
                <ul className="pp-fixlist">{Object.entries(fixes).map(([p, how]) => <li key={p}><b>{partyLabel(p as SignatureParty, ctx)}</b> — {how}</li>)}</ul>
              </Callout>
            ) : null}
            {caps.can_send ? (
              <>
                {operator ? (
                  <div className="pp-grid">
                    <div className="pp-kv"><span className="pp-lbl">Client email</span><span className="pp-val">{pkg.client_email ?? "—"}</span></div>
                    <div className="pp-kv"><span className="pp-lbl">Client mobile</span><span className="pp-val">{pkg.client_phone ?? "—"} <PChip tone={pkg.sms_consent.status === "granted" ? "ok" : pkg.sms_consent.status === "opted_out" ? "bad" : "warn"}>{pkg.sms_consent.status === "granted" ? "Text consent on file" : pkg.sms_consent.status === "opted_out" ? "Opted out" : pkg.sms_consent.status === "no_phone" ? "No number" : "No text consent"}</PChip></span></div>
                    <div className="pp-kv"><span className="pp-lbl">Send by</span><span className="pp-val">
                      <label className="pp-radio"><input type="radio" name="pp-channel" checked={channel === "sms"} onChange={() => setChannel("sms")} disabled={pkg.sms_consent.status !== "granted"} /> Email and text</label>
                      <label className="pp-radio"><input type="radio" name="pp-channel" checked={channel === "email"} onChange={() => setChannel("email")} /> Email only</label>
                    </span></div>
                  </div>
                ) : (
                  <Callout tone="acc">
                    Goes to the client&apos;s intake email{pkg.recipient_preview ? ` (${pkg.recipient_preview})` : ""}. The desk chooses the sponsor — ask the desk if the sponsor row is red.
                    {" "}Qualified Commercial, the sponsor and the relationship manager are placed from their signatures on file; the desk puts those on file.
                  </Callout>
                )}
                {operator && pkg.sms_consent.status === "missing" && caps.can_capture_consent ? (
                  <div className="pp-row consent">
                    <span className="pp-sub">{pkg.sms_consent.detail}</span>
                    <input className="pp-input" placeholder="Who gave consent (name)" value={consentName} onChange={(e) => setConsentName(e.target.value)} />
                    <PBtn size="sm" onClick={captureConsent} busy={busy === "consent"} disabled={!consentName.trim()}>Record text consent</PBtn>
                  </div>
                ) : null}
                {two ? (
                  <div className="pp-attest">
                    <b>Funding attestation</b>
                    <p className="pp-sub">The final is sent after funding has cleared. What you attest here must match the Funding Activation Certificate as it prints (funding date, amount and Funding Party from the funding step); it is stored with the revision and listed on the execution record.</p>
                    <div className="pp-grid">
                      <label className="pp-field"><span className="pp-lbl">Actual funding date</span><input type="date" className="pp-input" value={attest.actual_funding_date} onChange={(e) => setAttest({ ...attest, actual_funding_date: e.target.value })} /></label>
                      <label className="pp-field"><span className="pp-lbl">Amount funded</span><span className="pp-num u-money"><span className="pp-affix">$</span><input className="pp-input" inputMode="decimal" value={attest.amount_funded} onChange={(e) => setAttest({ ...attest, amount_funded: e.target.value.replace(/[^0-9.]/g, "") })} /></span></label>
                      <label className="pp-field"><span className="pp-lbl">Funding party</span><input className="pp-input" value={attest.funding_party_name} onChange={(e) => setAttest({ ...attest, funding_party_name: e.target.value })} /></label>
                      <label className="pp-field"><span className="pp-lbl">Funding reference (optional)</span><input className="pp-input" placeholder="Wire or ACH reference" value={attest.funding_reference} onChange={(e) => setAttest({ ...attest, funding_reference: e.target.value })} /></label>
                      <label className="pp-field span-2"><span className="pp-lbl">Note (optional)</span><input className="pp-input" value={attest.note} onChange={(e) => setAttest({ ...attest, note: e.target.value })} /></label>
                    </div>
                    <label className="pp-check"><input type="checkbox" checked={attest.confirm} onChange={(e) => setAttest({ ...attest, confirm: e.target.checked })} /> <span className="pp-attest-text">{FUNDING_ATTESTATION_TEXT}</span></label>
                  </div>
                ) : null}
                <div className="pp-row">
                  <PBtn variant="pri" onClick={send} busy={busy === "send"} disabled={!caps.can_send || attention.length > 0 || (two && (!attest.confirm || !attest.actual_funding_date || !toNumber(attest.amount_funded) || !attest.funding_party_name.trim()))}>
                    {attention.length ? "Clear the red items first" : two ? "Send the final for signature" : "Request signature"}
                  </PBtn>
                  {!two && caps.can_generate ? <PBtn onClick={onPresentation}>Presentation PDF</PBtn> : null}
                  {caps.can_void ? <PBtn variant="danger" onClick={() => setAskReason("void")}>Void</PBtn> : null}
                </div>
              </>
            ) : <Callout tone="mut">{two ? "Only a super admin or underwriter sends the final." : operator ? "Only a super admin or underwriter sends the package for signature." : "The desk sends the package for signature."}</Callout>}
          </div>
        ) : null}

        {pkg.status === "out_for_signature" ? (
          <>
            {pkg.sent_at ? <p className="pp-sub" style={{ marginTop: 10 }}>Sent {whenLabel(pkg.sent_at)}{pkg.sent_by_name ? ` by ${pkg.sent_by_name}` : ""}{pkg.sent_via === "share_link" ? " via a shared link" : pkg.sent_via === "partner" ? " by the dealer partner" : ""}.</p> : null}
            {pkg.execution_pending ? <Callout tone="warn"><b>The dealer has signed, but the executed bundle could not be assembled.</b> {caps.can_execute ? "Retry below — nothing is re-signed; the signed document is assembled into the executed bundle and emailed." : "The desk retries the executed bundle."}</Callout> : null}
            <div className="pp-row" style={{ marginTop: 12 }}>
              {caps.can_remind ? <PBtn onClick={remind} busy={busy === "remind"} disabled={dealer?.status === "signed"}>Send a reminder</PBtn> : null}
              {caps.can_reopen ? <PBtn onClick={() => setAskReason("reopen")}>Reopen to edit</PBtn> : null}
              {pkg.execution_pending && caps.can_execute ? <PBtn variant="pri" onClick={retryExecute} busy={busy === "execute"}>Retry the executed bundle</PBtn> : null}
              {caps.can_void ? <PBtn variant="danger" onClick={() => setAskReason("void")}>Void</PBtn> : null}
              {rev?.current_url ? <PBtn onClick={() => openSignedUrl(rev.current_url)}>Current PDF</PBtn> : null}
            </div>
          </>
        ) : null}
        {pkg.status === "executed" ? (
          <div className="pp-row" style={{ marginTop: 12 }}>
            {pkg.executed_url ? <PBtn variant="pri" onClick={() => openSignedUrl(pkg.executed_url)}>Download the executed bundle</PBtn> : null}
            {pkg.executed_at ? <span className="pp-sub">Executed {whenLabel(pkg.executed_at)}{pkg.sent_by_name ? ` · sent by ${pkg.sent_by_name}` : ""}</span> : null}
          </div>
        ) : null}
        {two && funding && sent ? (
          <div className="pp-grid" style={{ marginTop: 12 }}>
            <KV label="Funding attested" value={`${money(funding.amount_funded ?? null)} on ${dateLabel(funding.actual_funding_date)}`} />
            <KV label="Funding party" value={funding.funding_party_name ?? "—"} />
            <KV label="Attested by" value={`${funding.attested_by_name ?? "—"} · ${whenLabel(funding.attested_at)}`} />
            {funding.funding_reference ? <KV label="Reference" value={funding.funding_reference} /> : null}
          </div>
        ) : null}
        {outcome ? <Callout tone={outcome.tone}>{outcome.text}</Callout> : null}

        {askReason ? (
          <div className="pp-inline">
            <b>{askReason === "reopen" ? "Reopen this package?" : two ? "Void this final?" : "Void this package?"}</b>
            <p className="pp-sub">{askReason === "reopen" ? "The outstanding signature request is voided; the client will sign again after the next send." : two ? "The final and its signature request are voided; the commitment is untouched and a new final can be drafted from it." : "Nothing can be sent from a voided package; share links are revoked."}</p>
            <input className="pp-input" placeholder="Reason (kept in the audit trail)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="pp-row"><PBtn variant={askReason === "void" ? "danger" : "pri"} onClick={askReason === "reopen" ? reopen : voidIt} busy={busy === askReason} disabled={reason.trim().length < 3}>{askReason === "reopen" ? "Reopen" : "Void"}</PBtn><PBtn onClick={() => setAskReason(null)}>Cancel</PBtn></div>
          </div>
        ) : null}

        {record ? (
          <div className="pp-inline">
            <b>Fallback: record a signature captured outside the system — {partyLabel(record, ctx)}</b>
            <p className="pp-sub">Only for a party with no signature on file. It is stamped on the current copy with typed initials and listed on the execution record; put the signature on file so the next package places it automatically.</p>
            <div className="pp-grid">
              <label className="pp-field"><span className="pp-lbl">Signer name</span><input className="pp-input" value={form.signer_name} onChange={(e) => setForm({ ...form, signer_name: e.target.value })} /></label>
              <label className="pp-field"><span className="pp-lbl">Title</span><input className="pp-input" value={form.signer_title} onChange={(e) => setForm({ ...form, signer_title: e.target.value })} /></label>
              <label className="pp-field"><span className="pp-lbl">Signed on</span><input type="date" className="pp-input" value={form.signed_on} onChange={(e) => setForm({ ...form, signed_on: e.target.value })} /></label>
              <label className="pp-field"><span className="pp-lbl">Initials</span><input className="pp-input" maxLength={4} placeholder="From the name if blank" value={form.initials ?? ""} onChange={(e) => setForm({ ...form, initials: e.target.value.toUpperCase() })} /></label>
              <label className="pp-field span-2"><span className="pp-lbl">Note (optional)</span><input className="pp-input" value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
              {record === "sponsor" ? <label className="pp-field span-3"><span className="pp-lbl">Reason if the signer differs from the agreement</span><input className="pp-input" value={form.override_reason ?? ""} onChange={(e) => setForm({ ...form, override_reason: e.target.value })} /></label> : null}
            </div>
            <label className="pp-check"><input type="checkbox" checked={form.attestation} onChange={(e) => setForm({ ...form, attestation: e.target.checked })} /> I hold or witnessed the original signed copy of this revision for this party, and the signer, title and date are as they appear on it.</label>
            <div className="pp-row"><PBtn variant="pri" onClick={submitRecord} busy={busy === "record"} disabled={!form.attestation || !form.signer_name.trim() || !form.signer_title.trim()}>Record</PBtn><PBtn onClick={() => setRecord(null)}>Cancel</PBtn></div>
          </div>
        ) : null}
      </PPanel>

      {!two && pkg.status === "executed" ? (
        <PPanel title="Closing — the final package" sub="The Program Activation and Production Agreement is drafted from this executed commitment once the loan terms are recorded on the term sheet. Only a super admin or underwriter drafts and sends it."
          right={pkg.final_package_id ? <PChip tone={pkg.final_status === "executed" ? "ok" : pkg.final_status === "out_for_signature" ? "warn" : "acc"}>Final · {pkg.final_status === "out_for_signature" ? "out for signature" : pkg.final_status ?? "draft"}</PChip> : <PChip tone="mut"><IconLock />Not drafted</PChip>}>
          {ts ? (
            <div className="pp-grid">
              <KV label="Term sheet" value={`v${ts.version} · ${ts.entered_by_name ?? "the desk"} · ${whenLabel(ts.entered_at)}`} />
              <KV label="Funding party" value={`${ts.funding_party_kind} · ${ts.funding_party_name}`} />
              <KV label="Facility" value={ts.facility_type} />
              <KV label="Approved amount" value={money(ts.approved_amount)} />
              <KV label="Minimum activation" value={money(ts.min_activation_amount)} />
              <KV label="Rate · term" value={`${pct(ts.rate_pct, 2)} · ${ts.term_months} months`} />
              <KV label="Monthly debt service" value={`${money(ts.monthly_debt_service, 2)}${ts.debt_service_is_level_payment ? " · level" : ""}`} />
              <KV label="Expected funding" value={dateLabel(ts.expected_funding_date)} />
              <KV label="Maturity" value={dateLabel(ts.maturity_date)} />
            </div>
          ) : <Callout tone="warn">No term sheet on this file. <b>Draft final package only works once terms are provided.</b>{caps.can_manage_terms ? "" : " Ask a super admin or underwriter to record them."}</Callout>}
          <div className="pp-row" style={{ marginTop: 12 }}>
            {caps.can_manage_terms ? <PBtn onClick={() => ctx.onOpenTermSheet?.()} disabled={!ctx.onOpenTermSheet}>{ts ? "Edit loan terms" : "Record loan terms"}</PBtn> : null}
            <PBtn variant="pri" onClick={draftFinal} busy={busy === "final"} disabled={!caps.can_draft_final} title={draftReason ?? undefined}>Draft final package</PBtn>
            {pkg.final_package_id ? <PBtn onClick={() => ctx.onOpenFinal?.(pkg.final_package_id as string)} disabled={!ctx.onOpenFinal}>Open the final</PBtn> : null}
            {draftReason ? <span className="pp-sub">{draftReason}</span> : null}
          </div>
          {pkg.previous_finals.length ? (
            <>
              <h4 className="pp-sect" style={{ marginTop: 14 }}>Earlier finals</h4>
              <table className="pp-tbl"><thead><tr><th>Drafted</th><th>State</th><th>Voided</th></tr></thead>
                <tbody>{pkg.previous_finals.map((f) => <tr key={f.id}><td className="muted">{whenLabel(f.created_at)}</td><td><PChip tone="mut">{f.status}</PChip></td><td className="muted">{f.voided_at ? whenLabel(f.voided_at) : "—"}</td></tr>)}</tbody></table>
            </>
          ) : null}
        </PPanel>
      ) : null}

      {!two && pkg.status !== "executed" ? (
        <PPanel title="Stage two — Program Activation and Production Agreement" sub="Carries Addendum A, Schedules 1–5 and the Funding Activation Certificate." right={<PChip tone="mut"><IconLock />Locked</PChip>}>
          <Callout tone="mut">Drafted as the final package once this commitment is executed and a super admin or underwriter records the loan terms on the term sheet. The dealer signs it after actual funding at or above the minimum activation amount has cleared. A prequalification, a term sheet alone, an approval that has not funded, or a partial advance below the minimum activation amount does not activate the agreement.</Callout>
        </PPanel>
      ) : null}

      {two && pkg.original ? (
        <PPanel title="Original commitment" sub={`Drafted from the executed ${pkg.original.title ?? STAGE_ONE_TITLE} (R${pkg.original.revision_no}, executed ${dateLabel(pkg.original.executed_at)}). The original record is immutable; where a figure appears in both agreements, this one controls.`}>
          <div className="pp-row">
            {pkg.original.executed_url ? <PBtn onClick={() => openSignedUrl(pkg.original?.executed_url)}>Open the executed commitment</PBtn> : null}
            {ctx.onOpenOriginal && pkg.parent_package_id ? <PBtn onClick={() => ctx.onOpenOriginal?.(pkg.parent_package_id as string)}>Commitment package</PBtn> : null}
            <PBtn onClick={() => ctx.go("preview")}>Original vs final</PBtn>
            {pkg.comparison ? <span className="pp-sub">{pkg.comparison.changed_count} change{pkg.comparison.changed_count === 1 ? "" : "s"} · {pkg.comparison.source === "frozen" ? "frozen at send" : "live"}</span> : null}
          </div>
        </PPanel>
      ) : null}

      {operator ? (
        <PPanel title="History" sub="Sends, views, signatures, records, term sheets and edits.">
          {pkg.delivery_history.length ? (
            <table className="pp-tbl"><thead><tr><th>When</th><th>What</th><th>To</th><th>Result</th></tr></thead>
              <tbody>{[...pkg.delivery_history].reverse().map((d, i) => <tr key={i}><td className="muted">{whenLabel(d.at)}</td><td>{d.action === "production_package_reminder" ? "Reminder" : "Signature request"} · {d.by}</td><td>{[d.recipient_email, d.recipient_phone].filter(Boolean).join(" · ")}</td><td><PChip tone={d.emailed || d.texted ? "ok" : "bad"}>{[d.emailed ? "emailed" : null, d.texted ? "texted" : null].filter(Boolean).join(" + ") || "failed"}</PChip> <span className="pp-sub">{d.detail}</span></td></tr>)}</tbody></table>
          ) : null}
          {history.length ? (
            <ul className="pp-log">{history.slice(0, 40).map((h) => <li key={h.id}><span className="muted">{whenLabel(h.occurred_at)}</span> <b>{h.summary}</b>{h.actor_name ? <span className="pp-sub"> · {h.actor_name}</span> : null}</li>)}</ul>
          ) : <p className="pp-sub">Nothing yet.</p>}
        </PPanel>
      ) : null}
    </>
  );
}
