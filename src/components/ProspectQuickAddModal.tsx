"use client";

import { useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CircleAlert, Mail, PenLine, ShieldCheck, Sparkles } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type {
  DealerProspect,
  DealerProspectCreateRequest,
  ProspectEmailDraft,
  ProspectEmailDraftCreateRequest,
  ProspectSenderIdentity,
} from "@/lib/prospects";
import { useMe } from "@/lib/useMe";
import Modal from "./Modal";
import ProspectCollateralSelector, { type ProspectCollateralSelection } from "./ProspectCollateralSelector";
import ProspectEmailComposer from "./ProspectEmailComposer";
import ProspectSenderIdentityCard from "./ProspectSenderIdentityCard";

type CreateIntent = "prospect_only" | "first_email";
type CreateVariables = {
  intent: CreateIntent;
  request: DealerProspectCreateRequest;
  emailRequest?: ProspectEmailDraftCreateRequest;
};

export default function ProspectQuickAddModal({
  onClose,
  onCreated,
  onProspectSaved,
  onOpenExisting,
  initialValues,
}: {
  onClose: () => void;
  onCreated: (prospect: DealerProspect) => void;
  onProspectSaved?: (prospect: DealerProspect) => void;
  onOpenExisting: (prospectId: string) => void;
  initialValues?: { contact_id?: string | null; name?: string | null; dealer_name?: string | null; email?: string | null; phone?: string | null };
}) {
  const { getToken } = useAuth();
  const me = useMe();
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState(initialValues?.name ?? "");
  const [dealerName, setDealerName] = useState(initialValues?.dealer_name ?? "");
  const [email, setEmail] = useState(initialValues?.email ?? "");
  const [phone, setPhone] = useState(initialValues?.phone ?? "");
  const [firstNote, setFirstNote] = useState("");
  const [composeMode, setComposeMode] = useState<"ai" | "manual">("ai");
  const [verifiedContext, setVerifiedContext] = useState("");
  const [instructions, setInstructions] = useState("");
  const [manualSubject, setManualSubject] = useState("");
  const [manualBody, setManualBody] = useState("");
  const [collateralSelection, setCollateralSelection] = useState<ProspectCollateralSelection>({ includeAll: true, selectedIds: [], sendWithoutPdfs: false });
  const [collateralReady, setCollateralReady] = useState(false);
  const [createdProspect, setCreatedProspect] = useState<DealerProspect | null>(null);
  const [frozenEmailRequest, setFrozenEmailRequest] = useState<ProspectEmailDraftCreateRequest | null>(null);
  const [firstDraft, setFirstDraft] = useState<ProspectEmailDraft | null>(null);
  const [reviewDraft, setReviewDraft] = useState<ProspectEmailDraft | null>(null);

  const senderPreview = useQuery({
    queryKey: ["prospect-outreach", "sender-preview"],
    queryFn: async () => api<ProspectSenderIdentity>("/dealer-os/prospect-outreach/sender-preview", { authToken: (await getToken()) ?? undefined }),
    staleTime: 60_000,
  });

  const createDraft = useMutation({
    mutationFn: async ({ prospect, request }: { prospect: DealerProspect; request: ProspectEmailDraftCreateRequest }) => api<ProspectEmailDraft>(`/dealer-os/prospects/${prospect.id}/email-drafts`, {
      method: "POST",
      body: JSON.stringify(request),
      authToken: (await getToken()) ?? undefined,
    }),
    onSuccess: (draft) => {
      setFirstDraft(draft);
      setReviewDraft(draft);
    },
  });

  const create = useMutation({
    mutationFn: async ({ request }: CreateVariables) => api<DealerProspect>("/dealer-os/prospects", {
      method: "POST",
      body: JSON.stringify(request),
      authToken: (await getToken()) ?? undefined,
    }),
    onSuccess: (prospect, variables) => {
      setCreatedProspect(prospect);
      if (variables.intent === "prospect_only") {
        onCreated(prospect);
        return;
      }
      onProspectSaved?.(prospect);
      if (!variables.emailRequest) return;
      setFrozenEmailRequest(variables.emailRequest);
      createDraft.mutate({ prospect, request: variables.emailRequest });
    },
  });

  const canCreate = Boolean(name.trim() && dealerName.trim() && email.trim() && phone.trim());
  const duplicateDetail = create.error instanceof ApiError && create.error.status === 409
    ? (create.error.body as { detail?: { code?: string; candidates?: Array<{ prospect_id?: string }>; assignment_required?: boolean } } | null)?.detail
    : null;
  const duplicates = duplicateDetail?.code === "duplicate_prospect" ? duplicateDetail.candidates ?? [] : [];
  const setupLocked = create.isPending || createDraft.isPending || Boolean(createdProspect);
  const canStartEmail = canCreate && collateralReady && senderPreview.isSuccess && !setupLocked && (composeMode === "ai" || Boolean(manualSubject.trim() && manualBody.trim()));
  const draftFailureIsResolved = createDraft.error instanceof ApiError && createDraft.error.status >= 400 && createDraft.error.status < 500;
  const reviewIsSending = reviewDraft != null && ["pending_review", "queued", "sending"].includes(reviewDraft.status);
  const setupDirty = name !== (initialValues?.name ?? "")
    || dealerName !== (initialValues?.dealer_name ?? "")
    || email !== (initialValues?.email ?? "")
    || phone !== (initialValues?.phone ?? "")
    || Boolean(firstNote || verifiedContext || instructions || manualSubject || manualBody)
    || composeMode !== "ai"
    || !collateralSelection.includeAll
    || collateralSelection.selectedIds.length > 0
    || collateralSelection.sendWithoutPdfs;

  const prospectRequest = (): DealerProspectCreateRequest => ({
    contact_id: initialValues?.contact_id ?? null,
    contact_name: name.trim(),
    dealer_name: dealerName.trim(),
    email: email.trim(),
    phone: phone.trim(),
    source: "quick_add",
    initial_note: firstNote.trim() || null,
  });

  const emailRequest = (): ProspectEmailDraftCreateRequest => ({
    idempotency_key: crypto.randomUUID(),
    compose_mode: composeMode,
    purpose: "dealer_information",
    private_note: null,
    verified_conversation_context: composeMode === "ai" ? verifiedContext.trim().replace(/\s+/g, " ") || null : null,
    ai_instructions: composeMode === "ai" ? instructions.trim() || null : null,
    subject: composeMode === "manual" ? manualSubject.trim() : null,
    body: composeMode === "manual" ? manualBody.trim() : null,
    include_collateral: collateralSelection.includeAll,
    collateral_asset_ids: collateralSelection.selectedIds,
  });

  const addProspectOnly = () => {
    if (!formRef.current?.reportValidity() || !canCreate || setupLocked) return;
    create.mutate({ intent: "prospect_only", request: prospectRequest() });
  };

  const addProspectAndEmail = () => {
    if (!formRef.current?.reportValidity() || !canStartEmail) return;
    create.mutate({ intent: "first_email", request: prospectRequest(), emailRequest: emailRequest() });
  };

  const retryExactEmail = () => {
    if (!createdProspect || !frozenEmailRequest || createDraft.isPending) return;
    createDraft.mutate({ prospect: createdProspect, request: frozenEmailRequest });
  };

  const finish = () => {
    if (createdProspect) onCreated(createdProspect);
    else onClose();
  };

  const requestReviewClose = () => {
    if (reviewIsSending) {
      const confirmed = window.confirm("This email is still scheduled for delivery. Closing this window will NOT stop the countdown or scheduled send. Choose Cancel send inside the review if you want to stop it.\n\nKeep sending and open the prospect anyway?");
      if (!confirmed) return;
    }
    finish();
  };

  const requestSetupClose = () => {
    if (create.isPending || createDraft.isPending) {
      window.alert("Please wait while this request finishes. Closing now could hide the email review before its delivery status is known.");
      return;
    }
    if (createdProspect && createDraft.isError && !draftFailureIsResolved) {
      const confirmed = window.confirm("The prospect is saved, but the email request status is unresolved. The server may already have started the 60-second countdown. Retrying the exact request is the safest way to recover its status.\n\nOpen the prospect without resolving the email status?");
      if (!confirmed) return;
    } else if (setupDirty) {
      const confirmed = window.confirm(createdProspect
        ? "The prospect is saved, but its first email is not scheduled. Closing will discard the email setup on this screen.\n\nOpen the saved prospect anyway?"
        : "Discard the prospect details, first note, and email setup entered on this screen?");
      if (!confirmed) return;
    }
    finish();
  };

  if (createdProspect && firstDraft) {
    return <Modal title="Review first dealer email" width={960} onClose={requestReviewClose}>
      <div className="prospectQuickStartReview">
        <div className="prospectQuickStartSaved" role="status"><ShieldCheck size={19} /><span><b>{createdProspect.dealer_name} was added to the Marketing pipeline.</b><small>{firstNote.trim() ? "The first internal note is saved. " : ""}{firstDraft.compose_mode === "manual" ? "Review and explicitly approve the manual email below; there is no automatic countdown." : "Review the email below; closing this window does not stop its server-side countdown."}</small></span></div>
        <ProspectEmailComposer prospect={createdProspect} initialDraft={firstDraft} onClose={requestReviewClose} onDraftChange={setReviewDraft} embedded />
        <div className="prospectDialogActions"><button type="button" className="btn" onClick={requestReviewClose}>{reviewIsSending ? "Keep sending & open prospect" : "Open prospect"}</button></div>
      </div>
    </Modal>;
  }

  return <Modal title={createdProspect ? "Finish first dealer email" : "Add dealer prospect"} width={960} onClose={requestSetupClose}>
    <form ref={formRef} className="prospectQuickAdd" onSubmit={(event) => event.preventDefault()}>
      <p className="sub">Add the dealer and start the first outreach from one place. Possible duplicates are checked before any email is prepared.</p>
      <section className="prospectQuickStartSection">
        <header><span>1</span><div><b>Prospect details</b><small>The four details collected during the call.</small></div></header>
        <div className="prospectFieldGrid">
          <label><span className="lbl">Contact name</span><input className="field" autoFocus autoComplete="name" required disabled={setupLocked} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label><span className="lbl">Dealer name</span><input className="field" autoComplete="organization" required disabled={setupLocked} value={dealerName} onChange={(event) => setDealerName(event.target.value)} /></label>
          <label><span className="lbl">Email</span><input className="field" type="email" autoComplete="email" required disabled={setupLocked} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label><span className="lbl">Phone number</span><input className="field" type="tel" autoComplete="tel" required disabled={setupLocked} value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
        </div>
        <label className="prospectQuickStartNote"><span className="lbl">First internal note <small>Optional</small></span><textarea className="field" rows={3} maxLength={4000} disabled={setupLocked} value={firstNote} onChange={(event) => setFirstNote(event.target.value)} placeholder="What happened on the call, what the dealer needs, and the next step." /><small>This is saved privately on the prospect. It is never sent to the dealer or the AI.</small></label>
      </section>

      <section className="prospectQuickStartSection prospectQuickStartEmail">
        <header><span>2</span><div><b>Prepare the first email</b><small>Personalize approved copy and choose exactly which dealer PDFs to include.</small></div><span className="cellchip c-ok"><Mail size={13} /> Ready from here</span></header>
        <div className="prospectQuickStartRecipient"><small>To</small><b>{name.trim() || "Contact name"} · {dealerName.trim() || "Dealer name"}</b><span>{email.trim() || "Email address"}</span></div>
        <div className="prospectComposeMode" role="tablist" aria-label="First email drafting method"><button type="button" role="tab" aria-selected={composeMode === "ai"} className={composeMode === "ai" ? "on" : ""} disabled={setupLocked} onClick={() => setComposeMode("ai")}><Sparkles size={16} /> AI-assisted</button><button type="button" role="tab" aria-selected={composeMode === "manual"} className={composeMode === "manual" ? "on" : ""} disabled={setupLocked} onClick={() => setComposeMode("manual")}><PenLine size={16} /> Write manually</button></div>
        {composeMode === "ai" ? <>
          <label><span className="lbl">Verified conversation context <small>Optional</small></span><textarea className="field" rows={3} maxLength={500} disabled={setupLocked} value={verifiedContext} onChange={(event) => setVerifiedContext(event.target.value)} placeholder="We spoke earlier today at 10:00 AM about renovating your facility." /><small>Only enter facts you can verify. This context may appear in the dealer&apos;s email.</small></label>
          <label><span className="lbl">AI tone and format instructions <small>Optional</small></span><textarea className="field" rows={3} maxLength={1500} disabled={setupLocked} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Keep it concise and use bullets instead of long paragraphs." /><small>Controls wording and structure only; approved products, claims, links, and compliance language stay locked.</small></label>
        </> : <>
          <label><span className="lbl">Subject</span><input className="field" maxLength={220} required disabled={setupLocked} value={manualSubject} onChange={(event) => setManualSubject(event.target.value)} placeholder={`A note for ${dealerName.trim() || "your dealership"}`} /></label>
          <label><span className="lbl">Message</span><textarea className="field prospectEmailBody" rows={10} required disabled={setupLocked} value={manualBody} onChange={(event) => setManualBody(event.target.value)} placeholder="Write the message in your own words. QC adds the locked signature, disclosures, reply guidance, and unsubscribe controls." /><small>Manual copy is validated against firm policy and waits for your explicit approval; it never auto-sends.</small></label>
        </>}
        <ProspectSenderIdentityCard identity={senderPreview.data} fallbackName={me.name} fallbackEmail={me.email} />
        {senderPreview.isError && <div className="note" role="alert">The verified sender identity could not be loaded. You can add the prospect without email, or retry when sender settings are available.</div>}
        <ProspectCollateralSelector value={collateralSelection} disabled={setupLocked} onChange={setCollateralSelection} onReadyChange={setCollateralReady} />
      </section>

      {duplicates.length > 0 && <div className="prospectDuplicateWarning" role="alert"><b>This dealer/contact already exists.</b><span>No email was created. Open the existing prospect instead of creating a duplicate.</span>{duplicates.map((candidate) => candidate.prospect_id && <button type="button" className="btn" key={candidate.prospect_id} onClick={() => onOpenExisting(candidate.prospect_id!)}>Open existing prospect</button>)}</div>}
      {duplicateDetail?.assignment_required && <div className="note" role="alert">A matching prospect belongs to another agent. No email was created. Ask a team administrator to assign it to you.</div>}
      {create.isError && !duplicateDetail && <div className="note" role="alert">No email was created. {create.error instanceof Error ? create.error.message : "The prospect could not be created."}</div>}
      {createdProspect && createDraft.isError && <div className="prospectTestUncertain" role="alert"><CircleAlert size={19} /><span><b>{draftFailureIsResolved ? "Prospect saved; email not scheduled." : "Prospect saved; email status unresolved."}</b><small>{createDraft.error instanceof Error ? createDraft.error.message : "The draft request did not complete."} {draftFailureIsResolved ? "The server rejected this draft before scheduling it." : "A network failure may have hidden the server result. Do not start a different draft."} The prospect will not be created again. Retrying uses the exact same request and idempotency key.</small></span></div>}
      {createdProspect && createDraft.isPending && <div className="prospectQuickStartSaved" role="status"><Mail size={19} /><span><b>{firstNote.trim() ? "Prospect and first note saved." : "Prospect saved."}</b><small>Preparing the email and starting its 60-second review…</small></span></div>}

      <div className="prospectQuickStartActions">
        <button type="button" className="btn" onClick={requestSetupClose}>{createdProspect ? "Open saved prospect" : "Cancel"}</button>
        <span />
        {!createdProspect && <button type="button" className="btn" disabled={!canCreate || create.isPending} onClick={addProspectOnly}>{create.isPending ? "Saving…" : "Add prospect only"}</button>}
        {!createdProspect && <button type="button" className="btn pri" disabled={!canStartEmail} onClick={addProspectAndEmail}>{create.isPending ? "Saving prospect…" : senderPreview.isLoading ? "Loading sender…" : composeMode === "manual" ? "Create prospect & review manual email" : "Create prospect & start 60-second review"}</button>}
        {createdProspect && createDraft.isError && <button type="button" className="btn pri" disabled={createDraft.isPending} onClick={retryExactEmail}>Retry exact email request</button>}
      </div>
    </form>
  </Modal>;
}
