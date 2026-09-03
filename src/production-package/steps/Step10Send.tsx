// MIRROR: keep identical to QCRep/src/production-package/*
import { useEffect, useState } from "react";
import type { ManualSignatureBody, PackageClient } from "../client";
import { dateLabel, errorDetail, errorMessage, openSignedUrl, whenLabel } from "../format";
import { IconLock } from "../icons";
import { Callout, Field, PBtn, PChip, PPanel, type StepCtx } from "../ui";
import type { HistoryEvent, ProductionPackage, Signature } from "../types";

function partyLabel(party: Signature["party"], ctx: StepCtx): string {
  if (party === "qc") return "Qualified Commercial LLC";
  if (party === "dealer") return String(ctx.draft.dealer_name || "Dealer");
  return ctx.pkg.sponsor?.name || String(ctx.draft.sponsor_name || "Sponsor");
}

function sigState(s: Signature | undefined, sent: boolean): { label: string; tone: "ok" | "warn" | "mut" } {
  if (s?.status === "signed") return { label: `Signed ${whenLabel(s.signed_at)}`, tone: "ok" };
  if (s?.status === "pending") return { label: s.viewed_at ? `Opened ${whenLabel(s.viewed_at)} · awaiting signature` : "Sent · not opened", tone: "warn" };
  return { label: sent ? "Awaiting record" : "Not sent", tone: "mut" };
}

export function Step10Send({ ctx, client, onPackage, onPresentation }: { ctx: StepCtx; client: PackageClient; onPackage: (p: ProductionPackage) => void; onPresentation: () => void }) {
  const { pkg, notify } = ctx;
  const caps = pkg.capabilities;
  const rev = pkg.active_revision;
  const sigs = rev?.signatures ?? [];
  const byParty = (p: Signature["party"]) => sigs.find((s) => s.party === p && s.status !== "voided");
  const [channel, setChannel] = useState<"sms" | "email">(pkg.sms_consent.status === "granted" ? "sms" : "email");
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [askReason, setAskReason] = useState<"reopen" | "void" | null>(null);
  const [record, setRecord] = useState<"qc" | "sponsor" | null>(null);
  const [form, setForm] = useState<ManualSignatureBody>({ party: "qc", signer_name: "", signer_title: "", signed_on: new Date().toISOString().slice(0, 10), attestation: false });
  const [consentName, setConsentName] = useState(String(ctx.draft.dealer_signer_name || ""));
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [outcome, setOutcome] = useState<{ tone: "ok" | "warn" | "bad"; text: string } | null>(null);
  const attention = pkg.status === "draft" ? pkg.computed.attention : [];
  const sent = pkg.status !== "draft";

  useEffect(() => { client.history?.().then((h) => setHistory(h.events)).catch(() => undefined); }, [client, pkg.version]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (err) {
      const detail = errorDetail(err);
      if (detail?.code === "attention" && Array.isArray(detail.items)) {
        const first = detail.items[0] as { step?: import("../types").StepKey };
        notify("Clear the open items first — a blank field is not enforceable.", "warn");
        if (first?.step) ctx.go(first.step);
      } else if (detail?.code === "sponsor_missing" || detail?.code === "sponsor_agreement_missing") {
        notify(String(detail.message ?? "The sponsor needs a signed agreement."), "bad");
        ctx.go("parties");
      } else {
        notify(errorMessage(err), "bad");
      }
    } finally { setBusy(null); }
  };

  const send = () => run("send", async () => {
    const result = await client.send!({ channel });
    onPackage(result.package);
    if (result.already_sent) { setOutcome({ tone: "warn", text: result.detail }); return; }
    const who = [result.emailed ? `Emailed ${pkg.client_email ?? "the client"}` : null, result.texted ? `texted ${pkg.client_phone ?? ""}` : null].filter(Boolean).join(" and ");
    setOutcome(result.delivered
      ? { tone: result.texted || channel === "email" ? "ok" : "warn", text: `${who}. They will be asked to sign when they log in to their room.${!result.texted && channel === "sms" ? ` ${result.detail}` : ""}` }
      : { tone: "bad", text: result.detail || "Nothing was delivered." });
  });

  const remind = () => run("remind", async () => {
    const result = await client.remind!({ channel });
    onPackage(result.package);
    setOutcome({ tone: result.delivered ? "ok" : "bad", text: result.delivered ? `Reminder sent${result.texted ? " by email and text" : " by email"}.` : result.detail });
  });

  const reopen = () => run("reopen", async () => { onPackage(await client.reopen!(reason)); setAskReason(null); setReason(""); notify("Package reopened — the outstanding signature request was voided.", "acc"); ctx.go("parties"); });
  const voidIt = () => run("void", async () => { onPackage(await client.voidPackage!(reason)); setAskReason(null); setReason(""); notify("Package voided.", "mut"); });
  const execute = () => run("execute", async () => { onPackage(await client.execute!()); notify("Production commitment fully executed. The client has been emailed the executed copy.", "ok"); });
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
    notify(`${record === "qc" ? "Qualified Commercial" : "Sponsor"} signature recorded.`, "ok");
  });

  const dealer = byParty("dealer");
  const qc = byParty("qc");
  const sponsor = byParty("sponsor");
  const allSigned = dealer?.status === "signed" && qc?.status === "signed" && sponsor?.status === "signed";

  return (
    <>
      <PPanel title="Stage one — Production Commitment and Capital Engagement Agreement" sub="Schedules A, B and E. The dealer signs electronically at login; Qualified Commercial and the sponsor are recorded by the desk."
        right={<PChip tone={pkg.status === "executed" ? "ok" : pkg.status === "out_for_signature" ? "warn" : pkg.status === "void" ? "mut" : "acc"}>{pkg.status === "executed" ? "Fully executed" : pkg.status === "out_for_signature" ? "Out for signature" : pkg.status === "void" ? "Voided" : "Not sent"}</PChip>}>
        <table className="pp-tbl sigs">
          <thead><tr><th>Party</th><th>Who</th><th>State</th><th /></tr></thead>
          <tbody>
            {([["qc", "Program manager"], ["dealer", "Dealer"], ["sponsor", "Warranty provider, administrator, or sales organization"]] as const).map(([party, who]) => {
              const s = byParty(party);
              const st = sigState(s, sent);
              return (
                <tr key={party}>
                  <td><b>{partyLabel(party, ctx)}</b>{s?.method === "manual" && s.status === "signed" ? <div className="pp-sub">{s.signer_name}, {s.signer_title} · signed {dateLabel(s.signed_on)} · recorded by {s.recorded_by_name ?? "the desk"}</div> : null}{party === "dealer" && s?.typed_name ? <div className="pp-sub">Typed {s.typed_name}</div> : null}</td>
                  <td className="muted">{who}</td>
                  <td><PChip tone={st.tone}>{st.label}</PChip></td>
                  <td className="n">
                    {party !== "dealer" && caps.can_record && !s ? <PBtn size="sm" onClick={() => { setRecord(party); setForm({ party, signer_name: party === "sponsor" ? String((rev?.sponsor_snapshot as { signer_name?: string } | null)?.signer_name ?? "") : "", signer_title: party === "sponsor" ? String((rev?.sponsor_snapshot as { signer_title?: string } | null)?.signer_title ?? "") : "", signed_on: new Date().toISOString().slice(0, 10), attestation: false }); }}>Record signature</PBtn> : null}
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
            {client.mode === "operator" ? (
              <>
                <div className="pp-grid">
                  <div className="pp-kv"><span className="pp-lbl">Client email</span><span className="pp-val">{pkg.client_email ?? "—"}</span></div>
                  <div className="pp-kv"><span className="pp-lbl">Client mobile</span><span className="pp-val">{pkg.client_phone ?? "—"} <PChip tone={pkg.sms_consent.status === "granted" ? "ok" : pkg.sms_consent.status === "opted_out" ? "bad" : "warn"}>{pkg.sms_consent.status === "granted" ? "Text consent on file" : pkg.sms_consent.status === "opted_out" ? "Opted out" : pkg.sms_consent.status === "no_phone" ? "No number" : "No text consent"}</PChip></span></div>
                  <div className="pp-kv"><span className="pp-lbl">Send by</span><span className="pp-val">
                    <label className="pp-radio"><input type="radio" name="pp-channel" checked={channel === "sms"} onChange={() => setChannel("sms")} disabled={pkg.sms_consent.status !== "granted"} /> Email and text</label>
                    <label className="pp-radio"><input type="radio" name="pp-channel" checked={channel === "email"} onChange={() => setChannel("email")} /> Email only</label>
                  </span></div>
                </div>
                {pkg.sms_consent.status === "missing" && caps.can_capture_consent ? (
                  <div className="pp-row consent">
                    <span className="pp-sub">{pkg.sms_consent.detail}</span>
                    <input className="pp-input" placeholder="Who gave consent (name)" value={consentName} onChange={(e) => setConsentName(e.target.value)} />
                    <PBtn size="sm" onClick={captureConsent} busy={busy === "consent"} disabled={!consentName.trim()}>Record text consent</PBtn>
                  </div>
                ) : null}
                <div className="pp-row">
                  <PBtn variant="pri" onClick={send} busy={busy === "send"} disabled={!caps.can_send || attention.length > 0}>{attention.length ? "Clear the red items first" : "Request signature"}</PBtn>
                  <PBtn onClick={onPresentation}>Presentation PDF</PBtn>
                  {caps.can_void ? <PBtn variant="danger" onClick={() => setAskReason("void")}>Void</PBtn> : null}
                </div>
              </>
            ) : <Callout tone="mut">The desk sends the package for signature.</Callout>}
          </div>
        ) : null}

        {pkg.status === "out_for_signature" && client.mode === "operator" ? (
          <div className="pp-row" style={{ marginTop: 12 }}>
            <PBtn onClick={remind} busy={busy === "remind"} disabled={dealer?.status === "signed"}>Send a reminder</PBtn>
            {caps.can_reopen ? <PBtn onClick={() => setAskReason("reopen")}>Reopen to edit</PBtn> : null}
            {caps.can_execute ? <PBtn variant="pri" onClick={execute} busy={busy === "execute"} disabled={!allSigned} title={allSigned ? undefined : "Every party must sign the same revision first"}>Execute</PBtn> : null}
            {caps.can_void ? <PBtn variant="danger" onClick={() => setAskReason("void")}>Void</PBtn> : null}
            {rev?.current_url ? <PBtn onClick={() => openSignedUrl(rev.current_url)}>Current PDF</PBtn> : null}
          </div>
        ) : null}
        {pkg.status === "executed" && pkg.executed_url ? <div className="pp-row" style={{ marginTop: 12 }}><PBtn variant="pri" onClick={() => openSignedUrl(pkg.executed_url)}>Download the executed bundle</PBtn></div> : null}
        {outcome ? <Callout tone={outcome.tone}>{outcome.text}</Callout> : null}

        {askReason ? (
          <div className="pp-inline">
            <b>{askReason === "reopen" ? "Reopen this package?" : "Void this package?"}</b>
            <p className="pp-sub">{askReason === "reopen" ? "The outstanding signature request is voided; the client will sign again after the next send." : "Nothing can be sent from a voided package; share links are revoked."}</p>
            <input className="pp-input" placeholder="Reason (kept in the audit trail)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="pp-row"><PBtn variant={askReason === "void" ? "danger" : "pri"} onClick={askReason === "reopen" ? reopen : voidIt} busy={busy === askReason} disabled={reason.trim().length < 3}>{askReason === "reopen" ? "Reopen" : "Void"}</PBtn><PBtn onClick={() => setAskReason(null)}>Cancel</PBtn></div>
          </div>
        ) : null}

        {record ? (
          <div className="pp-inline">
            <b>Record the {record === "qc" ? "Qualified Commercial" : "sponsor"} signature</b>
            <p className="pp-sub">For a signature captured outside this system. It is stamped on the current copy and listed on the execution record.</p>
            <div className="pp-grid">
              <label className="pp-field"><span className="pp-lbl">Signer name</span><input className="pp-input" value={form.signer_name} onChange={(e) => setForm({ ...form, signer_name: e.target.value })} /></label>
              <label className="pp-field"><span className="pp-lbl">Title</span><input className="pp-input" value={form.signer_title} onChange={(e) => setForm({ ...form, signer_title: e.target.value })} /></label>
              <label className="pp-field"><span className="pp-lbl">Signed on</span><input type="date" className="pp-input" value={form.signed_on} onChange={(e) => setForm({ ...form, signed_on: e.target.value })} /></label>
              <label className="pp-field span-3"><span className="pp-lbl">Note (optional)</span><input className="pp-input" value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
              {record === "sponsor" ? <label className="pp-field span-3"><span className="pp-lbl">Reason if the signer differs from the agreement</span><input className="pp-input" value={form.override_reason ?? ""} onChange={(e) => setForm({ ...form, override_reason: e.target.value })} /></label> : null}
            </div>
            <label className="pp-check"><input type="checkbox" checked={form.attestation} onChange={(e) => setForm({ ...form, attestation: e.target.checked })} /> I hold or witnessed the original signed copy of this revision for this party, and the signer, title and date are as they appear on it.</label>
            <div className="pp-row"><PBtn variant="pri" onClick={submitRecord} busy={busy === "record"} disabled={!form.attestation || !form.signer_name.trim() || !form.signer_title.trim()}>Record</PBtn><PBtn onClick={() => setRecord(null)}>Cancel</PBtn></div>
          </div>
        ) : null}
      </PPanel>

      <PPanel title="Stage two — Program Activation and Production Agreement" sub="Carries Addendum A, Schedule 3 and the funding activation certificate." right={<PChip tone="mut"><IconLock />Locked</PChip>}>
        <Callout tone="mut">Available after stage one is executed and actual funding at or above the minimum activation amount is recorded. A prequalification, a term sheet, an approval that has not funded, or a partial advance below the minimum activation amount does not activate this agreement.</Callout>
        <div className="pp-grid locked-fields">
          <Field ctx={ctx} k="funding_party" scope="stage_two" />
          <Field ctx={ctx} k="funding_date" scope="stage_two" />
          <Field ctx={ctx} k="funded_amount" scope="stage_two" />
          <Field ctx={ctx} k="commencement" scope="stage_two" />
          <Field ctx={ctx} k="activation_date" scope="stage_two" />
          <Field ctx={ctx} k="maturity" scope="stage_two" />
        </div>
      </PPanel>

      {client.mode === "operator" ? (
        <PPanel title="History" sub="Sends, views, signatures, records and edits.">
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
