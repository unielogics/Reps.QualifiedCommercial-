"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Clock3, FileText, PenLine, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { prospectGenerationReasonLabel } from "@/lib/prospects";
import type { DealerProspect, ProspectEmailDraft, ProspectEmailDraftCreateRequest, ProspectSenderIdentity } from "@/lib/prospects";
import { useMe } from "@/lib/useMe";
import Drawer from "./Drawer";
import ProspectCollateralSelector, { type ProspectCollateralSelection } from "./ProspectCollateralSelector";
import ProspectSenderIdentityCard from "./ProspectSenderIdentityCard";

const WEBSITE = "https://qualifiedcommercial.com/industries/auto";

function secondsUntil(value?: string | null): number {
  if (!value) return 0;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 1000));
}

export default function ProspectEmailComposer({
  prospect,
  initialDraft,
  onClose,
  embedded = false,
  onDraftChange,
}: {
  prospect: DealerProspect;
  initialDraft?: ProspectEmailDraft | null;
  onClose: () => void;
  embedded?: boolean;
  onDraftChange?: (draft: ProspectEmailDraft | null) => void;
}) {
  const { getToken } = useAuth();
  const me = useMe();
  const qc = useQueryClient();
  const [composeMode, setComposeMode] = useState<"ai" | "manual">(initialDraft?.compose_mode ?? "ai");
  const [privateNote, setPrivateNote] = useState("");
  const [verifiedContext, setVerifiedContext] = useState("");
  const [instructions, setInstructions] = useState("");
  const [collateralSelection, setCollateralSelection] = useState<ProspectCollateralSelection>({ includeAll: true, selectedIds: [], sendWithoutPdfs: false });
  const [collateralReady, setCollateralReady] = useState(false);
  const [generationKey, setGenerationKey] = useState(() => crypto.randomUUID());
  const [submittedGeneration, setSubmittedGeneration] = useState<ProspectEmailDraftCreateRequest | null>(null);
  const [subject, setSubject] = useState(initialDraft?.subject ?? "");
  const [body, setBody] = useState(initialDraft?.editable_body ?? initialDraft?.body ?? "");
  const [draft, setDraft] = useState<ProspectEmailDraft | null>(initialDraft ?? null);
  const [editing, setEditing] = useState(initialDraft?.status === "editing");
  const [remaining, setRemaining] = useState(() => secondsUntil(initialDraft?.send_after));
  const normalizedDelivery = String(draft?.delivery_status ?? "").toLowerCase();
  const awaitingDelivery = draft?.status === "sent" && normalizedDelivery === "provider_accepted";
  const shouldPollDraft = Boolean(
    draft
    && (
      draft.status === "drafting"
      || draft.status === "queued"
      || draft.status === "pending_review"
      || (draft.status === "sending" && normalizedDelivery !== "unavailable")
      || awaitingDelivery
    )
  );
  const terminalDraft = Boolean(draft && ["sent", "failed", "blocked", "cancelled"].includes(draft.status));
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["dealer-prospect", prospect.id] });
    void qc.invalidateQueries({ queryKey: ["dealer-prospects"] });
    void qc.invalidateQueries({ queryKey: ["prospect-email-drafts", prospect.id] });
  };

  const liveDraft = useQuery({
    queryKey: ["prospect-email-draft-live", draft?.id],
    queryFn: async () => api<ProspectEmailDraft>(`/dealer-os/prospect-email-drafts/${draft?.id}`, { authToken: (await getToken()) ?? undefined }),
    enabled: Boolean(draft?.id && shouldPollDraft),
    refetchInterval: shouldPollDraft ? 2_000 : false,
  });

  useEffect(() => {
    const current = liveDraft.data;
    if (!current || current.id !== draft?.id) return;
    setDraft(current);
    setRemaining(current.countdown_seconds ?? secondsUntil(current.send_after));
    if (!editing) { setSubject(current.subject); setBody(current.editable_body ?? current.body); }
    if (["sent", "failed", "blocked", "cancelled"].includes(current.status)) refresh();
    // refresh is intentionally omitted: it is stable in behavior but recreated
    // on render, and including it would retrigger this synchronization loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.id, editing, liveDraft.data]);

  useEffect(() => {
    if (draft?.status !== "pending_review" || !draft.send_after) return;
    const update = () => setRemaining(secondsUntil(draft.send_after));
    update();
    const timer = window.setInterval(update, 500);
    return () => window.clearInterval(timer);
  }, [draft?.send_after, draft?.status]);

  const generate = useMutation({
    mutationFn: async (request: ProspectEmailDraftCreateRequest) => api<ProspectEmailDraft>(`/dealer-os/prospects/${prospect.id}/email-drafts`, {
      method: "POST",
      body: JSON.stringify(request),
      authToken: (await getToken()) ?? undefined,
    }),
    onMutate: (request) => setSubmittedGeneration(request),
    onSuccess: (created) => {
      setDraft(created);
      setSubject(created.subject);
      setBody(created.editable_body ?? created.body);
      setComposeMode(created.compose_mode ?? composeMode);
      setEditing(created.status === "editing");
      setRemaining(secondsUntil(created.send_after));
      refresh();
    },
  });

  const submitGeneration = () => {
    const request = generate.isError && submittedGeneration ? submittedGeneration : {
      idempotency_key: generationKey,
      compose_mode: composeMode,
      private_note: privateNote.trim() || null,
      verified_conversation_context: composeMode === "ai" ? verifiedContext.trim().replace(/\s+/g, " ") || null : null,
      ai_instructions: composeMode === "ai" ? instructions.trim() || null : null,
      subject: composeMode === "manual" ? subject.trim() : null,
      body: composeMode === "manual" ? body.trim() : null,
      purpose: "dealer_information" as const,
      include_collateral: collateralSelection.includeAll,
      collateral_asset_ids: collateralSelection.selectedIds,
    };
    generate.mutate(request);
  };

  useEffect(() => {
    onDraftChange?.(draft);
  }, [draft, onDraftChange]);

  const senderPreview = useQuery({
    queryKey: ["prospect-outreach", "sender-preview"],
    queryFn: async () => api<ProspectSenderIdentity>("/dealer-os/prospect-outreach/sender-preview", { authToken: (await getToken()) ?? undefined }),
    staleTime: 60_000,
  });

  const startSeparateGeneration = () => {
    generate.reset();
    setSubmittedGeneration(null);
    setGenerationKey(crypto.randomUUID());
  };

  const startFollowUp = () => {
    generate.reset();
    setDraft(null);
    setComposeMode("ai");
    setPrivateNote("");
    setVerifiedContext("");
    setInstructions("");
    setCollateralSelection({ includeAll: true, selectedIds: [], sendWithoutPdfs: false });
    setCollateralReady(false);
    setSubmittedGeneration(null);
    setGenerationKey(crypto.randomUUID());
    setSubject("");
    setBody("");
    setEditing(false);
    setRemaining(0);
  };

  const stopForEdit = useMutation({
    mutationFn: async () => api<ProspectEmailDraft>(`/dealer-os/prospect-email-drafts/${draft?.id}/edit`, {
      method: "POST",
      body: JSON.stringify({ expected_version: draft?.version ?? 1 }),
      authToken: (await getToken()) ?? undefined,
    }),
    onSuccess: (updated) => { setDraft(updated); setSubject(updated.subject); setBody(updated.editable_body ?? updated.body); setEditing(true); setRemaining(0); refresh(); },
  });

  const approve = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("Create a draft first.");
      let expectedVersion = draft.version ?? 1;
      if (editing) {
        const saved = await api<ProspectEmailDraft>(`/dealer-os/prospect-email-drafts/${draft.id}`, {
          method: "PATCH",
          body: JSON.stringify({ expected_version: draft.version ?? 1, subject: subject.trim(), body: body.trim() }),
          authToken: (await getToken()) ?? undefined,
        });
        expectedVersion = saved.version ?? expectedVersion;
      }
      return api<ProspectEmailDraft>(`/dealer-os/prospect-email-drafts/${draft.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ expected_version: expectedVersion }),
        authToken: (await getToken()) ?? undefined,
      });
    },
    onSuccess: (updated) => { setDraft(updated); setEditing(false); refresh(); },
  });

  const cancel = useMutation({
    mutationFn: async () => {
      if (!draft) return null;
      return api<ProspectEmailDraft>(`/dealer-os/prospect-email-drafts/${draft.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ expected_version: draft.version ?? 1 }),
        authToken: (await getToken()) ?? undefined,
      });
    },
    onSuccess: (updated) => { if (updated) setDraft(updated); refresh(); },
  });
  const useSecureBundle = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("Create a draft first.");
      return api<ProspectEmailDraft>(`/dealer-os/prospect-email-drafts/${draft.id}/use-secure-bundle`, {
        method: "POST",
        body: JSON.stringify({ expected_version: draft.version ?? 1 }),
        authToken: (await getToken()) ?? undefined,
      });
    },
    onSuccess: (updated) => { setDraft(updated); setSubject(updated.subject); setBody(updated.editable_body ?? updated.body); setRemaining(updated.countdown_seconds ?? secondsUntil(updated.send_after)); setEditing(false); refresh(); },
  });

  const error = generate.error || stopForEdit.error || approve.error || cancel.error || useSecureBundle.error || liveDraft.error || (!draft && senderPreview.error);
  const busy = generate.isPending || stopForEdit.isPending || approve.isPending || cancel.isPending || useSecureBundle.isPending;
  const unresolvedGeneration = Boolean(generate.isError && submittedGeneration && !draft);
  const generationFieldsLocked = generate.isPending || unresolvedGeneration;
  const manualReady = composeMode === "manual" ? Boolean(subject.trim() && body.trim()) : true;
  const statusLabel = useMemo(() => {
    if (!draft) return "Not generated";
    if (draft.status === "pending_review") return remaining > 0 ? `Auto-sends in ${remaining}s` : "Queued for delivery";
    if (normalizedDelivery === "delivered") return "Delivered";
    if (normalizedDelivery === "provider_accepted") return "Provider accepted—awaiting confirmation";
    if (normalizedDelivery === "bounced") return "Bounced";
    if (normalizedDelivery === "complaint") return "Complaint";
    if (normalizedDelivery === "failed") return "Failed";
    if (normalizedDelivery === "blocked") return "Blocked";
    if (normalizedDelivery === "cancelled") return "Cancelled";
    if (normalizedDelivery === "unavailable") return "Delivery record unavailable";
    return draft.status.replaceAll("_", " ");
  }, [draft, normalizedDelivery, remaining]);
  const generationReason = prospectGenerationReasonLabel(draft?.generation_reason);
  const submittedVerifiedContext = submittedGeneration?.verified_conversation_context?.trim() ?? "";
  const toneInstructionsNotApplied = draft?.instruction_disposition === "not_applied_fallback";
  const toneInstructionsSubmitted = draft?.instruction_disposition === "submitted_to_ai";
  const toneInstructionStatusUnknown = draft?.draft_source === "ai" && draft?.instruction_disposition === "unknown";
  const senderIdentity: ProspectSenderIdentity = draft ? {
    sender_display_name: draft.sender_display_name,
    sender_title: draft.sender_title,
    sender_phone: draft.sender_phone,
    sender_display_email: draft.sender_display_email,
    sender_from_name: draft.sender_from_name,
    envelope_from_email: draft.envelope_from_email || draft.from_email,
    reply_contact_email: draft.reply_contact_email || draft.reply_to,
    alternate_contact_email: draft.alternate_contact_email,
  } : senderPreview.data ?? { sender_display_name: me.name, sender_display_email: me.email };

  const content = <div className="prospectComposer">
      <section className="panel">
        <div className="panel-h"><b>Draft controls</b><span className={`prospectDraftStatus status-${draft?.status ?? "empty"}`}><Clock3 size={14} />{statusLabel}</span></div>
        <div className="panel-b prospectComposerControls">
          <div className="prospectRecipient"><span><small>To</small><b>{prospect.name} · {prospect.dealer_name}</b></span><span>{prospect.email}</span></div>
          {!draft && <>
            <div className="prospectComposeMode" role="tablist" aria-label="Email drafting method">
              <button type="button" role="tab" aria-selected={composeMode === "ai"} className={composeMode === "ai" ? "on" : ""} disabled={generationFieldsLocked} onClick={() => setComposeMode("ai")}><Sparkles size={16} /> AI-assisted</button>
              <button type="button" role="tab" aria-selected={composeMode === "manual"} className={composeMode === "manual" ? "on" : ""} disabled={generationFieldsLocked} onClick={() => setComposeMode("manual")}><PenLine size={16} /> Write manually</button>
            </div>
            <label><span className="lbl">Private internal note</span><textarea className="field" rows={3} value={privateNote} disabled={generationFieldsLocked} onChange={(event) => setPrivateNote(event.target.value)} placeholder="Call notes for the activity history. This is never sent to AI or the recipient." /><small className="prospectFieldHelp">Private to your team; excluded from the AI prompt and email.</small></label>
            {composeMode === "ai" ? <>
              <label><span className="lbl">Verified conversation context</span><textarea className="field" rows={3} maxLength={500} value={verifiedContext} disabled={generationFieldsLocked} onChange={(event) => setVerifiedContext(event.target.value)} placeholder="We spoke earlier today at 10:00 AM." /><small className="prospectFieldHelp">Enter one short fact you can verify. It is inserted exactly into AI and deterministic fallback drafts, then checked by QC&apos;s safeguards.</small></label>
              <label><span className="lbl">AI tone and format instructions</span><textarea className="field" rows={4} maxLength={1500} value={instructions} disabled={generationFieldsLocked} onChange={(event) => setInstructions(event.target.value)} placeholder="Keep the introduction warm and concise. Use bullets instead of long paragraphs." /><small className="prospectFieldHelp">Guides wording and structure only. It cannot select programs, change approved claims, or override blocked phrases.</small></label>
            </> : <>
              <label><span className="lbl">Subject</span><input className="field" maxLength={220} value={subject} disabled={generationFieldsLocked} onChange={(event) => setSubject(event.target.value)} placeholder={`A note for ${prospect.dealer_name}`} /></label>
              <label><span className="lbl">Message</span><textarea className="field prospectEmailBody" rows={12} value={body} disabled={generationFieldsLocked} onChange={(event) => setBody(event.target.value)} placeholder="Write the message in your own words. QC adds the locked signature, disclosures, reply guidance, and unsubscribe controls." /><small className="prospectFieldHelp">Manual messages are validated against firm policy and require explicit approval. They never start an automatic countdown.</small></label>
            </>}
            <ProspectSenderIdentityCard identity={senderIdentity} fallbackName={me.name} fallbackEmail={me.email} />
            <ProspectCollateralSelector value={collateralSelection} disabled={generationFieldsLocked} onChange={setCollateralSelection} onReadyChange={setCollateralReady} />
            <div className="prospectGuardrail"><ShieldCheck size={18} /><span><b>Approved content stays authoritative</b><small>The AI cannot change program facts, promises, website link, signature, compliance footer, or collateral.</small></span></div>
            {unresolvedGeneration && <div className="prospectTestUncertain" role="alert"><CircleAlert size={19} /><span><b>Draft creation did not return a resolved result.</b><small>{generate.error instanceof Error ? generate.error.message : "The network or API request did not complete."} The exact inputs and idempotency key are frozen. Retry the same request first. Starting separately uses a new key and could duplicate a draft if the first request reached the server; check the prospect activity or shared outbox before doing so.</small></span></div>}
            <div className="prospectDialogActions">{unresolvedGeneration && <button type="button" className="btn" disabled={generate.isPending} onClick={startSeparateGeneration}>I checked activity — start a separate draft</button>}<button type="button" className="btn pri" disabled={generate.isPending || !manualReady || (!unresolvedGeneration && (senderPreview.isLoading || senderPreview.isError || !collateralReady))} onClick={submitGeneration}>{generate.isPending ? (composeMode === "manual" ? "Preparing…" : "Drafting…") : unresolvedGeneration ? "Retry the exact same draft request" : senderPreview.isLoading ? "Loading sender identity…" : composeMode === "manual" ? "Prepare manual email for approval" : "Generate draft and start 60-second review"}</button></div>
          </>}
          {draft && <>
            <ProspectSenderIdentityCard identity={senderIdentity} fallbackName={me.name} fallbackEmail={me.email} />
            {draft.compose_mode === "manual" ? <div className="prospectGenerationStatus manual" role="status"><PenLine size={20} /><span><b>Written manually</b><small>No AI drafted this message and no automatic countdown is active. Review the exact copy, then approve it explicitly.</small></span></div> : draft.draft_source && <div className={`prospectGenerationStatus ${draft.draft_source === "ai" ? "ai" : "fallback"}`} role="status">{draft.draft_source === "ai" ? <Sparkles size={20} /> : <ShieldCheck size={20} />}<span><b>{draft.draft_source === "ai" ? "AI draft used" : "Deterministic safe fallback — AI was not used"}</b><small>{draft.draft_source === "ai" ? "AI prepared the personalized wording under QC's safeguards. Verified conversation context was inserted deterministically, and programs and claims remained centrally controlled." : "QC's fixed approved template prepared this draft. Verified conversation context was still inserted deterministically; AI tone and format instructions did not shape the copy."}</small>{generationReason && <small><b>Reason:</b> {generationReason}</small>}{submittedVerifiedContext && <small className="prospectVerifiedContext"><b>Verified context included exactly:</b> {submittedVerifiedContext}</small>}{toneInstructionsSubmitted && <small className="prospectInstructionApplied">Tone and format instructions were submitted to AI. Exact wording may vary.</small>}{toneInstructionsNotApplied && <small className="prospectInstructionWarning"><CircleAlert size={14} /><span><b>Tone instructions were not applied.</b> Verified conversation context remains included deterministically.</span></small>}{toneInstructionStatusUnknown && <small className="prospectInstructionWarning"><CircleAlert size={14} /><span><b>AI instruction handling is unknown for this earlier draft.</b> Verified conversation context remains deterministic.</span></small>}</span></div>}
            <label><span className="lbl">Subject</span><input className="field" value={subject} readOnly={!editing} onChange={(event) => setSubject(event.target.value)} /></label>
            <label><span className="lbl">Message</span><textarea className="field prospectEmailBody" rows={15} value={body} readOnly={!editing} onChange={(event) => setBody(event.target.value)} /></label>
            {draft.locked_footer_text && <div className="prospectLockedFooter"><span className="lbl">Locked signature and compliance footer</span><pre>{draft.locked_footer_text}</pre><small>This section is added by the system and cannot be edited or removed.</small></div>}
            <a className="prospectWebsitePreview" href={WEBSITE} target="_blank" rel="noreferrer">Dealer capabilities page · {WEBSITE}</a>
            <div className="prospectAttachmentList"><b>Approved dealer collateral</b>{(draft.attachment_names ?? []).map((name) => <span key={name}><FileText size={15} />{name}</span>)}{!(draft.attachment_names ?? []).length && <small>{draft.attachment_count ?? 0} approved PDF attachment{draft.attachment_count === 1 ? "" : "s"}</small>}</div>
            {draft.secure_bundle_link_required && <div className="prospectSecureBundle"><span><b>Attachment bundle is too large</b><small>Use one secure seven-day ZIP link for the complete approved bundle. Nothing will be silently omitted.</small></span><button type="button" className="btn" disabled={busy} onClick={() => useSecureBundle.mutate()}>{useSecureBundle.isPending ? "Preparing secure link…" : "Use secure bundle link"}</button></div>}
            {draft.delivery_mode === "secure_link" && <div className="prospectSuccess">Complete collateral will be delivered through a secure bundle link{draft.secure_bundle_expires_at ? ` expiring ${new Date(draft.secure_bundle_expires_at).toLocaleString()}` : ""}.</div>}
            {draft.status === "pending_review" && <div className="prospectCountdown"><Clock3 size={20} /><span><b>{remaining > 0 ? `${remaining} seconds to review` : "Handing off to the delivery queue"}</b><small>The countdown continues if this window or browser closes.</small></span></div>}
            {(draft.status === "pending_review" || draft.status === "editing") && <div className="prospectDialogActions">
              <button type="button" className="btn" disabled={busy} onClick={() => cancel.mutate()}>Cancel send</button>
              {!editing && <button type="button" className="btn" disabled={busy} onClick={() => stopForEdit.mutate()}>Edit</button>}
              <button type="button" className="btn pri" disabled={busy || !subject.trim() || !body.trim()} onClick={() => approve.mutate()}>{approve.isPending ? "Sending…" : editing ? "Approve edited email" : "Approve and send now"}</button>
            </div>}
            {draft.status === "sent" && normalizedDelivery === "delivered" && <div className="prospectSuccess">Delivery confirmed{draft.delivered_at ? ` · ${new Date(draft.delivered_at).toLocaleString()}` : ""}.{draft.opened_at ? ` Opened ${new Date(draft.opened_at).toLocaleString()} (secondary event).` : ""}</div>}
            {draft.status === "sent" && normalizedDelivery === "provider_accepted" && <div className="prospectDeliveryPending">Provider accepted the email{draft.sent_at ? ` · ${new Date(draft.sent_at).toLocaleString()}` : ""}. Delivery is not yet confirmed.</div>}
            {(draft.status === "sent" || draft.status === "sending") && (!normalizedDelivery || normalizedDelivery === "unavailable") && <div className="note">A confirmed delivery record is unavailable. Do not treat this email as delivered or retry it automatically.</div>}
            {(normalizedDelivery === "bounced" || normalizedDelivery === "complaint") && <div className="note" role="alert">{normalizedDelivery === "bounced" ? "The recipient server bounced this email." : "The provider recorded a complaint for this email."}</div>}
            {draft.status === "sent" && normalizedDelivery === "failed" && <div className="note" role="alert">Provider delivery failed after the draft left the Marketing queue.</div>}
            {draft.status === "cancelled" && <div className="note">This email was cancelled before delivery.</div>}
            {(draft.status === "failed" || draft.status === "blocked") && <div className="note" role="alert">{draft.error || (draft.status === "blocked" ? "Delivery is blocked. Review suppression and collateral requirements before retrying." : "Delivery failed. Review the prospect and try again.")}</div>}
            {terminalDraft && <div className="prospectDialogActions"><button type="button" className="btn pri" onClick={startFollowUp}>Create a new follow-up email</button></div>}
          </>}
          {error && !unresolvedGeneration && <div className="note" role="alert">{error instanceof Error ? error.message : "The email action could not be completed."}</div>}
        </div>
      </section>
    </div>;

  if (embedded) return content;
  return <Drawer title="Dealer outreach email" width={920} onClose={onClose} dismissOnBackdrop={false}>{content}</Drawer>;
}
