"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type {
  DealerProspect,
  PortfolioConversionFields,
  ProspectConversionAction,
  ProspectConversionCandidate,
  ProspectConversionCandidates,
  ProspectConversionTarget,
  ProspectEmailDraft,
  ProspectStage,
} from "@/lib/prospects";
import Modal from "./Modal";

type MoveResult = {
  prospect: DealerProspect;
  intake_id?: string | null;
  application_id?: string | null;
  route?: string | null;
  email_draft_id?: string | null;
  status?: string;
};

const PURPOSES = [
  ["working_capital", "Working capital"],
  ["equipment", "Equipment"],
  ["real_estate", "Real estate"],
  ["refinance", "Refinance existing debt"],
  ["floorplan", "Floorplan"],
  ["other", "Not sure yet"],
] as const;

const EMPTY_PORTFOLIO: PortfolioConversionFields = {
  entity_type: "",
  requested_amount: 0,
  funding_purpose: "",
  use_of_proceeds_note: "",
  secure_room_pin: "",
};

function targetLabel(target: ProspectConversionTarget): string {
  return target === "portfolio_application" ? "Portfolio application" : "Dealer AI Intake";
}

export default function ProspectMoveDialog({
  prospect,
  stages,
  destination,
  onClose,
  onMoved,
  onBook,
  onEmailDraft,
  onConflict,
}: {
  prospect: DealerProspect;
  stages: ProspectStage[];
  destination: ProspectStage;
  onClose: () => void;
  onMoved: (prospect: DealerProspect) => void;
  onBook?: () => void;
  onEmailDraft?: (prospect: DealerProspect, draft: ProspectEmailDraft) => void;
  onConflict?: (message: string) => void;
}) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [action, setAction] = useState("");
  const [confirmedDoNotContact, setConfirmedDoNotContact] = useState(false);
  const [conversionTarget, setConversionTarget] = useState<ProspectConversionTarget | "">("");
  const [conversionAction, setConversionAction] = useState<ProspectConversionAction>("detect");
  const [candidateId, setCandidateId] = useState("");
  const [detectedCandidates, setDetectedCandidates] = useState<ProspectConversionCandidate[]>([]);
  const [restrictedMatch, setRestrictedMatch] = useState(false);
  const [portfolio, setPortfolio] = useState<PortfolioConversionFields>(EMPTY_PORTFOLIO);
  const current = useMemo(() => stages.find((stage) => stage.key === prospect.stage_key), [prospect.stage_key, stages]);
  const isBooked = destination.key === "booked";
  const isConverted = destination.key === "converted";
  const isNotInterested = destination.key === "not_interested";

  const conversionCandidates = useQuery({
    queryKey: ["prospect-conversion-candidates", prospect.id, conversionTarget],
    queryFn: async () => api<ProspectConversionCandidates>(`/dealer-os/prospects/${prospect.id}/conversion-candidates?target=${conversionTarget}`, { authToken: (await getToken()) ?? undefined }),
    enabled: isConverted && Boolean(conversionTarget),
  });
  const candidates = detectedCandidates.length ? detectedCandidates : conversionCandidates.data?.candidates ?? [];
  const selectedCandidate = candidates.find((candidate) => candidate.id === candidateId);
  const needsCreateFields = conversionTarget === "portfolio_application" && (conversionAction === "detect" || conversionAction === "create");
  const portfolioComplete = !needsCreateFields || Boolean(
    portfolio.entity_type
    && portfolio.requested_amount > 0
    && portfolio.funding_purpose
    && portfolio.use_of_proceeds_note.trim()
    && /^\d{6}$/.test(portfolio.secure_room_pin),
  );

  const selectTarget = (target: ProspectConversionTarget) => {
    setConversionTarget(target);
    setConversionAction("detect");
    setCandidateId("");
    setDetectedCandidates([]);
    setRestrictedMatch(false);
  };

  const move = useMutation({
    mutationFn: async (): Promise<{ prospect: DealerProspect; emailDraftId?: string | null }> => {
      if (isConverted) {
        if (!conversionTarget) throw new Error("Choose where to create the funding file.");
        const result = await api<MoveResult>(`/dealer-os/prospects/${prospect.id}/convert`, {
          method: "POST",
          body: JSON.stringify({
            target: conversionTarget,
            action: conversionAction,
            expected_version: prospect.version,
            candidate_id: conversionAction === "link" || conversionAction === "reactivate" ? candidateId : null,
            note: note.trim() || null,
            portfolio_application: needsCreateFields ? portfolio : null,
          }),
          authToken: (await getToken()) ?? undefined,
        });
        return { prospect: result.prospect };
      }
      const result = await api<MoveResult>(`/dealer-os/prospects/${prospect.id}/move-stage`, {
        method: "POST",
        body: JSON.stringify({
          stage_key: destination.key,
          expected_version: prospect.version,
          note: note.trim() || null,
          action: action || null,
          confirm_do_not_contact: isNotInterested ? confirmedDoNotContact : false,
        }),
        authToken: (await getToken()) ?? undefined,
      });
      const moved = result.prospect;
      if (action !== "draft_email") return { prospect: moved };
      return { prospect: moved, emailDraftId: result.email_draft_id };
    },
    onSuccess: (result) => {
      // The stage transition is already committed at this point. Close the
      // confirmation and render the authoritative stage immediately; opening
      // the optional draft is a separate, recoverable UI step.
      onMoved(result.prospect);
      if (result.emailDraftId === undefined) return;
      if (!result.emailDraftId) {
        onConflict?.("The stage moved successfully, but the email draft could not be opened because the server did not return its reference. Review it in Email activity.");
        return;
      }
      const draftId = result.emailDraftId;
      void (async () => {
        try {
          const emailDraft = await api<ProspectEmailDraft>(`/dealer-os/prospect-email-drafts/${draftId}`, { authToken: (await getToken()) ?? undefined });
          onEmailDraft?.(result.prospect, emailDraft);
        } catch (error) {
          onConflict?.(`The stage moved successfully, but its email draft could not be opened. ${error instanceof Error ? error.message : "Review it in Email activity."}`);
        }
      })();
    },
    onError: (error) => {
      void qc.invalidateQueries({ queryKey: ["dealer-prospects"] });
      void qc.invalidateQueries({ queryKey: ["dealer-prospect", prospect.id] });
      if (!(error instanceof ApiError) || error.status !== 409) return;
      const detail = (error.body as { detail?: unknown } | null)?.detail;
      if (isConverted && detail && typeof detail === "object" && (detail as { code?: unknown }).code === "prospect_conversion_choice_required") {
        const rows = (detail as { candidates?: unknown }).candidates;
        if (Array.isArray(rows)) setDetectedCandidates(rows as ProspectConversionCandidate[]);
        return;
      }
      if (isConverted && detail && typeof detail === "object" && (detail as { code?: unknown }).code === "prospect_conversion_restricted_match") {
        setRestrictedMatch(true);
        setDetectedCandidates([]);
        setCandidateId("");
        setConversionAction("detect");
        return;
      }
      const message = detail && typeof detail === "object" && typeof (detail as { message?: unknown }).message === "string"
        ? String((detail as { message: string }).message)
        : "This prospect changed in another session. The current server state has been reloaded.";
      onConflict?.(message);
      onClose();
    },
  });

  const candidatesRequireChoice = isConverted && candidates.length > 0 && conversionAction === "detect";
  const restrictedMatchRequiresChoice = isConverted && restrictedMatch && conversionAction !== "create";
  const candidateChoiceComplete = conversionAction === "detect" || conversionAction === "create" || Boolean(candidateId);
  const canMove = !isBooked
    && (!isNotInterested || confirmedDoNotContact)
    && (!isConverted || (Boolean(conversionTarget) && !conversionCandidates.isLoading && !candidatesRequireChoice && !restrictedMatchRequiresChoice && candidateChoiceComplete && portfolioComplete));
  const summary = isConverted
    ? "Choose one destination. Marketing history stays here; borrower records are created or linked only after this conversion succeeds."
    : isBooked
      ? "Choose a time below. The appointment and Booked stage will be created together; there is no appointment ID to copy or link."
      : isNotInterested
        ? "The next follow-up will be cleared and prospect outreach will be disabled. No email will be sent."
        : "This changes the pipeline stage. No email is sent unless you explicitly choose one below.";

  return <Modal title={isConverted ? `Convert ${prospect.name}` : `Move ${prospect.name}`} width={760} onClose={onClose}>
    <div className="prospectMoveDialog">
      <div className="prospectMoveRoute"><span><small>Current stage</small><b>{current?.label ?? prospect.stage_label ?? prospect.stage_key}</b></span><span aria-hidden>→</span><span><small>Destination</small><b>{destination.label}</b></span></div>
      <div className={`prospectEffectSummary${isNotInterested ? " danger" : ""}`}><b>What will happen</b><span>{summary}</span></div>

      {isConverted && <section className="prospectConversionPanel">
        <div><b>1. Choose the destination</b><small>Create or link exactly one operational file.</small></div>
        <div className="prospectConversionTargets" role="radiogroup" aria-label="Conversion destination">
          <button type="button" role="radio" aria-checked={conversionTarget === "portfolio_application"} className={conversionTarget === "portfolio_application" ? "selected" : ""} onClick={() => selectTarget("portfolio_application")}><b>Portfolio application</b><small>Open a standard funding application in Portfolio.</small></button>
          <button type="button" role="radio" aria-checked={conversionTarget === "dealer_ai_intake"} className={conversionTarget === "dealer_ai_intake" ? "selected" : ""} onClick={() => selectTarget("dealer_ai_intake")}><b>Dealer AI Intake</b><small>Open the dealer-specific AI Intake and evidence bucket.</small></button>
        </div>
        {conversionTarget && <>
          <div className="prospectConversionStep"><b>2. Resolve matching files</b><small>{conversionCandidates.isLoading ? "Checking accessible records…" : candidates.length ? `${candidates.length} possible match${candidates.length === 1 ? "" : "es"} found. Choose explicitly.` : `No matching ${targetLabel(conversionTarget).toLowerCase()} found. Confirm to create one.`}</small></div>
          {conversionCandidates.isError && <div className="note" role="alert">Candidate lookup failed. Retry before converting so duplicate handling stays explicit.</div>}
          {candidates.length > 0 && <div className="prospectConversionChoices">
            {candidates.map((candidate) => <label key={candidate.id} className={`prospectIntakeCandidate${candidateId === candidate.id ? " selected" : ""}`}><input type="radio" name="conversion-candidate" value={candidate.id} checked={candidateId === candidate.id} onChange={() => { setCandidateId(candidate.id); setConversionAction(candidate.archived ? "reactivate" : "link"); }} /><span><b>{candidate.display_name}</b><small>{candidate.email || candidate.phone || "No contact details"} · {candidate.status}{candidate.archived ? " · archived" : ""}</small>{candidate.match_reasons?.length ? <em>Matched by {candidate.match_reasons.join(", ")}</em> : null}</span></label>)}
            <div className="prospectConversionActions"><label><input type="radio" name="conversion-action" checked={conversionAction === "link"} onChange={() => setConversionAction("link")} disabled={!candidateId || selectedCandidate?.archived === true} /> Link existing</label><label><input type="radio" name="conversion-action" checked={conversionAction === "reactivate"} onChange={() => setConversionAction("reactivate")} disabled={!candidateId || selectedCandidate?.archived !== true} /> Reactivate and link</label><label><input type="radio" name="conversion-action" checked={conversionAction === "create"} onChange={() => { setConversionAction("create"); setCandidateId(""); }} /> Create a separate record</label></div>
          </div>}
          {restrictedMatch && <div className="note" role="alert"><b>A possible matching file cannot be shown with your current access.</b><br />Conversion stopped to prevent an accidental duplicate. Ask an authorized user to resolve the existing file, or explicitly choose to create a separate record.<label className={`consent${conversionAction === "create" ? " on" : ""}`}><input type="checkbox" checked={conversionAction === "create"} onChange={(event) => { setConversionAction(event.target.checked ? "create" : "detect"); setCandidateId(""); }} /><span className="ctext"><span className="ctitle">Create a separate record</span>I understand this may create a separate destination file.</span></label></div>}
          {needsCreateFields && <div className="prospectPortfolioFields">
            <div className="prospectConversionStep"><b>3. Portfolio application details</b><small>These required facts create the secure Portfolio application; they are not copied into Marketing history.</small></div>
            <div className="prospectFieldGrid">
              <label><span className="lbl">Entity type</span><select className="field" required value={portfolio.entity_type} onChange={(event) => setPortfolio((value) => ({ ...value, entity_type: event.target.value }))}><option value="">Choose…</option><option value="Limited liability company">Limited liability company</option><option value="S corporation">S corporation</option><option value="C corporation">C corporation</option><option value="Partnership">Partnership</option><option value="Sole proprietorship">Sole proprietorship</option></select></label>
              <label><span className="lbl">Requested amount</span><input className="field" type="number" inputMode="decimal" min="1" step="1000" required value={portfolio.requested_amount || ""} onChange={(event) => setPortfolio((value) => ({ ...value, requested_amount: Number(event.target.value) || 0 }))} /></label>
              <label><span className="lbl">Funding purpose</span><select className="field" required value={portfolio.funding_purpose} onChange={(event) => setPortfolio((value) => ({ ...value, funding_purpose: event.target.value }))}><option value="">Choose…</option>{PURPOSES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
              <label><span className="lbl">Six-digit room PIN</span><input className="field" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{6}" maxLength={6} required value={portfolio.secure_room_pin} onChange={(event) => setPortfolio((value) => ({ ...value, secure_room_pin: event.target.value.replace(/\D/g, "").slice(0, 6) }))} placeholder="6 digits" /></label>
            </div>
            <label><span className="lbl">Use of proceeds</span><textarea className="field" rows={3} required value={portfolio.use_of_proceeds_note} onChange={(event) => setPortfolio((value) => ({ ...value, use_of_proceeds_note: event.target.value }))} placeholder="Explain how the requested funds will be used." /></label>
          </div>}
        </>}
      </section>}

      {isBooked && <div className="prospectBookingRequirement"><span><b>Appointment required</b><small>{prospect.do_not_contact ? "Reactivate outreach before booking this contact." : "The dealer and contact information will be filled from this prospect."}</small></span>{onBook && <button type="button" className="btn pri" disabled={prospect.do_not_contact} onClick={onBook}>Choose appointment time</button>}</div>}
      {!isConverted && !isBooked && !isNotInterested && <label><span className="lbl">Optional action</span><select className="field" value={action} onChange={(event) => setAction(event.target.value)}><option value="">Stage change only</option><option value="draft_email">Create a reviewable email draft</option></select></label>}
      <label><span className="lbl">Internal note</span><textarea className="field" rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional context for the activity timeline" /></label>
      {isNotInterested && <label className={`consent${confirmedDoNotContact ? " on" : ""}`}><input type="checkbox" checked={confirmedDoNotContact} onChange={(event) => setConfirmedDoNotContact(event.target.checked)} /><span className="ctext"><span className="ctitle">Confirm do-not-contact</span>Clear follow-up and stop future prospect outreach for this contact.</span></label>}
      {move.isError && !(move.error instanceof ApiError && move.error.status === 409 && (detectedCandidates.length > 0 || restrictedMatch)) && <div className="note" role="alert">{move.error instanceof Error ? move.error.message : "The prospect could not be moved."}</div>}
      <div className="prospectDialogActions"><button type="button" className="btn" onClick={onClose}>Cancel</button>{!isBooked && <button type="button" className={`btn ${isNotInterested ? "danger" : "pri"}`} disabled={!canMove || move.isPending} onClick={() => move.mutate()}>{move.isPending ? "Confirming…" : isConverted ? candidates.length ? `Confirm ${conversionAction === "create" ? "separate creation" : conversionAction}` : `Create ${conversionTarget ? targetLabel(conversionTarget) : "selected destination"}` : "Confirm move"}</button>}</div>
    </div>
  </Modal>;
}
