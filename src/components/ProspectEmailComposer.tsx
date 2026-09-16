"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Clock3, FileText, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { prospectGenerationReasonLabel } from "@/lib/prospects";
import type { DealerProspect, ProspectEmailDraft, ProspectEmailDraftCreateRequest } from "@/lib/prospects";
import Drawer from "./Drawer";

const WEBSITE = "https://qualifiedcommercial.com/industries/auto";

function secondsUntil(value?: string | null): number {
  if (!value) return 0;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 1000));
}

export default function ProspectEmailComposer({
  prospect,
  initialDraft,
  onClose,
}: {
  prospect: DealerProspect;
  initialDraft?: ProspectEmailDraft | null;
  onClose: () => void;
}) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [privateNote, setPrivateNote] = useState("");
  const [verifiedContext, setVerifiedContext] = useState("");
  const [instructions, setInstructions] = useState("");
  const [generationKey, setGenerationKey] = useState(() => crypto.randomUUID());
  const [submittedGeneration, setSubmittedGeneration] = useState<ProspectEmailDraftCreateRequest | null>(null);
  const [subject, setSubject] = useState(initialDraft?.subject ?? "");
  const [body, setBody] = useState(initialDraft?.body ?? "");
  const [draft, setDraft] = useState<ProspectEmailDraft | null>(initialDraft ?? null);
  const [editing, setEditing] = useState(initialDraft?.status === "editing");
  const [remaining, setRemaining] = useState(() => secondsUntil(initialDraft?.send_after));
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["dealer-prospect", prospect.id] });
    void qc.invalidateQueries({ queryKey: ["dealer-prospects"] });
    void qc.invalidateQueries({ queryKey: ["prospect-email-drafts", prospect.id] });
  };

  const liveDraft = useQuery({
    queryKey: ["prospect-email-draft-live", draft?.id],
    queryFn: async () => api<ProspectEmailDraft>(`/dealer-os/prospect-email-drafts/${draft?.id}`, { authToken: (await getToken()) ?? undefined }),
    enabled: Boolean(draft?.id && (draft.status === "pending_review" || draft.status === "sending")),
    refetchInterval: draft?.status === "pending_review" || draft?.status === "sending" ? 2_000 : false,
  });

  useEffect(() => {
    const current = liveDraft.data;
    if (!current || current.id !== draft?.id) return;
    setDraft(current);
    setRemaining(current.countdown_seconds ?? secondsUntil(current.send_after));
    if (!editing) { setSubject(current.subject); setBody(current.body); }
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
      setBody(created.body);
      setEditing(false);
      setRemaining(secondsUntil(created.send_after));
      refresh();
    },
  });

  const submitGeneration = () => {
    const request = generate.isError && submittedGeneration ? submittedGeneration : {
      idempotency_key: generationKey,
      private_note: privateNote.trim() || null,
      verified_conversation_context: verifiedContext.trim().replace(/\s+/g, " ") || null,
      ai_instructions: instructions.trim() || null,
      purpose: "dealer_information" as const,
    };
    generate.mutate(request);
  };

  const startSeparateGeneration = () => {
    generate.reset();
    setSubmittedGeneration(null);
    setGenerationKey(crypto.randomUUID());
  };

  const stopForEdit = useMutation({
    mutationFn: async () => api<ProspectEmailDraft>(`/dealer-os/prospect-email-drafts/${draft?.id}/edit`, {
      method: "POST",
      body: JSON.stringify({ expected_version: draft?.version ?? 1 }),
      authToken: (await getToken()) ?? undefined,
    }),
    onSuccess: (updated) => { setDraft(updated); setEditing(true); setRemaining(0); refresh(); },
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
    onSuccess: (updated) => { setDraft(updated); setSubject(updated.subject); setBody(updated.body); setRemaining(updated.countdown_seconds ?? secondsUntil(updated.send_after)); setEditing(false); refresh(); },
  });

  const error = generate.error || stopForEdit.error || approve.error || cancel.error || useSecureBundle.error || liveDraft.error;
  const busy = generate.isPending || stopForEdit.isPending || approve.isPending || cancel.isPending || useSecureBundle.isPending;
  const unresolvedGeneration = Boolean(generate.isError && submittedGeneration && !draft);
  const generationFieldsLocked = generate.isPending || unresolvedGeneration;
  const statusLabel = useMemo(() => {
    if (!draft) return "Not generated";
    if (draft.status === "pending_review") return remaining > 0 ? `Auto-sends in ${remaining}s` : "Queued for delivery";
    return draft.status.replaceAll("_", " ");
  }, [draft, remaining]);
  const generationReason = prospectGenerationReasonLabel(draft?.generation_reason);
  const submittedVerifiedContext = submittedGeneration?.verified_conversation_context?.trim() ?? "";
  const toneInstructionsNotApplied = draft?.instruction_disposition === "not_applied_fallback";
  const toneInstructionsSubmitted = draft?.instruction_disposition === "submitted_to_ai";
  const toneInstructionStatusUnknown = draft?.draft_source === "ai" && draft?.instruction_disposition === "unknown";

  return <Drawer title="Dealer outreach email" width={920} onClose={onClose} dismissOnBackdrop={false}>
    <div className="prospectComposer">
      <section className="panel">
        <div className="panel-h"><b>Draft controls</b><span className={`prospectDraftStatus status-${draft?.status ?? "empty"}`}><Clock3 size={14} />{statusLabel}</span></div>
        <div className="panel-b prospectComposerControls">
          <div className="prospectRecipient"><span><small>To</small><b>{prospect.name} · {prospect.dealer_name}</b></span><span>{prospect.email}</span></div>
          {!draft && <>
            <label><span className="lbl">Private internal note</span><textarea className="field" rows={3} value={privateNote} disabled={generationFieldsLocked} onChange={(event) => setPrivateNote(event.target.value)} placeholder="Call notes for the activity history. This is never sent to AI or the recipient." /><small className="prospectFieldHelp">Private to your team; excluded from the AI prompt and email.</small></label>
            <label><span className="lbl">Verified conversation context</span><textarea className="field" rows={3} maxLength={500} value={verifiedContext} disabled={generationFieldsLocked} onChange={(event) => setVerifiedContext(event.target.value)} placeholder="We spoke earlier today at 10:00 AM." /><small className="prospectFieldHelp">Enter one short fact you can verify. It is inserted exactly into AI and deterministic fallback drafts, then checked by QC&apos;s safeguards.</small></label>
            <label><span className="lbl">AI tone and format instructions</span><textarea className="field" rows={4} maxLength={1500} value={instructions} disabled={generationFieldsLocked} onChange={(event) => setInstructions(event.target.value)} placeholder="Keep the introduction warm and concise. Use bullets instead of long paragraphs." /><small className="prospectFieldHelp">Guides wording and structure only. It cannot select programs, change approved claims, or override blocked phrases.</small></label>
            <div className="prospectGuardrail"><ShieldCheck size={18} /><span><b>Approved content stays authoritative</b><small>The AI cannot change program facts, promises, website link, signature, compliance footer, or collateral.</small></span></div>
            {unresolvedGeneration && <div className="prospectTestUncertain" role="alert"><CircleAlert size={19} /><span><b>Draft creation did not return a resolved result.</b><small>{generate.error instanceof Error ? generate.error.message : "The network or API request did not complete."} The exact inputs and idempotency key are frozen. Retry the same request first. Starting separately uses a new key and could duplicate a draft if the first request reached the server; check the prospect activity or shared outbox before doing so.</small></span></div>}
            <div className="prospectDialogActions">{unresolvedGeneration && <button type="button" className="btn" disabled={generate.isPending} onClick={startSeparateGeneration}>I checked activity — start a separate draft</button>}<button type="button" className="btn pri" disabled={generate.isPending} onClick={submitGeneration}>{generate.isPending ? "Drafting…" : unresolvedGeneration ? "Retry the exact same draft request" : "Generate draft and start 60-second review"}</button></div>
          </>}
          {draft && <>
            {draft.draft_source && <div className={`prospectGenerationStatus ${draft.draft_source === "ai" ? "ai" : "fallback"}`} role="status">{draft.draft_source === "ai" ? <Sparkles size={20} /> : <ShieldCheck size={20} />}<span><b>{draft.draft_source === "ai" ? "AI draft used" : "Deterministic safe fallback — AI was not used"}</b><small>{draft.draft_source === "ai" ? "AI prepared the personalized wording under QC's safeguards. Verified conversation context was inserted deterministically, and programs and claims remained centrally controlled." : "QC's fixed approved template prepared this draft. Verified conversation context was still inserted deterministically; AI tone and format instructions did not shape the copy."}</small>{generationReason && <small><b>Reason:</b> {generationReason}</small>}{submittedVerifiedContext && <small className="prospectVerifiedContext"><b>Verified context included exactly:</b> {submittedVerifiedContext}</small>}{toneInstructionsSubmitted && <small className="prospectInstructionApplied">Tone and format instructions were submitted to AI. Exact wording may vary.</small>}{toneInstructionsNotApplied && <small className="prospectInstructionWarning"><CircleAlert size={14} /><span><b>Tone instructions were not applied.</b> Verified conversation context remains included deterministically.</span></small>}{toneInstructionStatusUnknown && <small className="prospectInstructionWarning"><CircleAlert size={14} /><span><b>AI instruction handling is unknown for this earlier draft.</b> Verified conversation context remains deterministic.</span></small>}</span></div>}
            <label><span className="lbl">Subject</span><input className="field" value={subject} readOnly={!editing} onChange={(event) => setSubject(event.target.value)} /></label>
            <label><span className="lbl">Message</span><textarea className="field prospectEmailBody" rows={15} value={body} readOnly={!editing} onChange={(event) => setBody(event.target.value)} /></label>
            <a className="prospectWebsitePreview" href={WEBSITE} target="_blank" rel="noreferrer">Dealer capabilities page · {WEBSITE}</a>
            <div className="prospectAttachmentList"><b>Approved dealer collateral</b>{(draft.attachment_names ?? []).map((name) => <span key={name}><FileText size={15} />{name}</span>)}{!(draft.attachment_names ?? []).length && <small>{draft.attachment_count ?? 0} approved PDF attachment{draft.attachment_count === 1 ? "" : "s"}</small>}</div>
            {draft.secure_bundle_link_required && <div className="prospectSecureBundle"><span><b>Attachment bundle is too large</b><small>Use one secure seven-day ZIP link for the complete approved bundle. Nothing will be silently omitted.</small></span><button type="button" className="btn" disabled={busy} onClick={() => useSecureBundle.mutate()}>{useSecureBundle.isPending ? "Preparing secure link…" : "Use secure bundle link"}</button></div>}
            {draft.delivery_mode === "secure_link" && <div className="prospectSuccess">Complete collateral will be delivered through a secure bundle link{draft.secure_bundle_expires_at ? ` expiring ${new Date(draft.secure_bundle_expires_at).toLocaleString()}` : ""}.</div>}
            {draft.status === "pending_review" && <div className="prospectCountdown"><Clock3 size={20} /><span><b>{remaining > 0 ? `${remaining} seconds to review` : "Handing off to the delivery queue"}</b><small>The countdown continues if this drawer or browser closes.</small></span></div>}
            {(draft.status === "pending_review" || draft.status === "editing") && <div className="prospectDialogActions">
              <button type="button" className="btn" disabled={busy} onClick={() => cancel.mutate()}>Cancel send</button>
              {!editing && <button type="button" className="btn" disabled={busy} onClick={() => stopForEdit.mutate()}>Edit</button>}
              <button type="button" className="btn pri" disabled={busy || !subject.trim() || !body.trim()} onClick={() => approve.mutate()}>{approve.isPending ? "Sending…" : editing ? "Approve edited email" : "Approve and send now"}</button>
            </div>}
            {draft.status === "sent" && <div className="prospectSuccess">Email sent successfully{draft.sent_at ? ` · ${new Date(draft.sent_at).toLocaleString()}` : ""}.</div>}
            {draft.status === "cancelled" && <div className="note">This email was cancelled before delivery.</div>}
            {(draft.status === "failed" || draft.status === "blocked") && <div className="note" role="alert">{draft.error || (draft.status === "blocked" ? "Delivery is blocked. Review suppression and collateral requirements before retrying." : "Delivery failed. Review the prospect and try again.")}</div>}
          </>}
          {error && !unresolvedGeneration && <div className="note" role="alert">{error instanceof Error ? error.message : "The email action could not be completed."}</div>}
        </div>
      </section>
    </div>
  </Drawer>;
}
