"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { DealerProspect, ProspectEmailDraft, ProspectStage } from "@/lib/prospects";
import Modal from "./Modal";

type MoveResult = { prospect: DealerProspect; intake_id?: string | null; email_draft_id?: string | null; status?: string };
type IntakeCandidate = { id: string; full_name: string; business_name?: string | null; status: string; outcome_status?: string | null; created_at?: string };

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
  const [followUp, setFollowUp] = useState("");
  const [action, setAction] = useState("");
  const [appointmentId, setAppointmentId] = useState("");
  const [confirmedDoNotContact, setConfirmedDoNotContact] = useState(false);
  const [conversionCandidates, setConversionCandidates] = useState<IntakeCandidate[]>([]);
  const [conversionAction, setConversionAction] = useState<"detect" | "link" | "reactivate" | "create">("detect");
  const [conversionIntakeId, setConversionIntakeId] = useState("");
  const current = useMemo(() => stages.find((stage) => stage.key === prospect.stage_key), [prospect.stage_key, stages]);
  const isBooked = destination.key === "booked";
  const isConverted = destination.key === "converted";
  const isNotInterested = destination.key === "not_interested";

  const move = useMutation({
    mutationFn: async (): Promise<{ prospect: DealerProspect; emailDraft?: ProspectEmailDraft }> => {
      if (isConverted) {
        const result = await api<MoveResult>(`/dealer-os/prospects/${prospect.id}/convert-to-ai-intake`, {
          method: "POST",
          body: JSON.stringify({ action: conversionAction, intake_id: conversionAction === "link" || conversionAction === "reactivate" ? conversionIntakeId || null : null, expected_version: prospect.version, note: note.trim() || null }),
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
          next_follow_up_at: followUp ? new Date(followUp).toISOString() : null,
          action: action || null,
          appointment_id: appointmentId.trim() || null,
          confirm_do_not_contact: isNotInterested ? confirmedDoNotContact : false,
        }),
        authToken: (await getToken()) ?? undefined,
      });
      const moved = result.prospect;
      if (action !== "draft_email") return { prospect: moved };
      let emailDraft: ProspectEmailDraft | undefined;
      try {
        if (!result.email_draft_id) throw new Error("No email draft reference was returned.");
        emailDraft = await api<ProspectEmailDraft>(`/dealer-os/prospect-email-drafts/${result.email_draft_id}`, { authToken: (await getToken()) ?? undefined });
      } catch (error) {
        throw new Error(`The stage changed and its email was created, but the review window could not be opened. Refresh the prospect to resume it. ${error instanceof Error ? error.message : ""}`.trim());
      }
      return { prospect: moved, emailDraft };
    },
    onSuccess: (result) => { if (result.emailDraft) onEmailDraft?.(result.prospect, result.emailDraft); onMoved(result.prospect); },
    onError: (error) => {
      void qc.invalidateQueries({ queryKey: ["dealer-prospects"] });
      void qc.invalidateQueries({ queryKey: ["dealer-prospect", prospect.id] });
      if (!(error instanceof ApiError) || error.status !== 409) return;
      const detail = (error.body as { detail?: unknown } | null)?.detail;
      if (isConverted && detail && typeof detail === "object" && (detail as { code?: unknown }).code === "prospect_conversion_choice_required") {
        const candidates = (detail as { candidates?: unknown }).candidates;
        if (Array.isArray(candidates)) setConversionCandidates(candidates as IntakeCandidate[]);
        return;
      }
      const message = detail && typeof detail === "object" && typeof (detail as { message?: unknown }).message === "string"
        ? String((detail as { message: string }).message)
        : "This prospect changed in another session. The current server state has been reloaded.";
      onConflict?.(message);
      onClose();
    },
  });

  const canMove = (!isBooked || Boolean(appointmentId.trim())) && (!isNotInterested || confirmedDoNotContact) && (!isConverted || conversionAction === "detect" || conversionAction === "create" || Boolean(conversionIntakeId));
  const summary = isConverted
    ? "An AI Intake file will be created or linked. The card moves only after conversion succeeds."
    : isBooked
      ? "A booked prospect must be linked to an appointment before the stage changes."
      : isNotInterested
        ? "The next follow-up will be cleared and prospect outreach will be disabled. No email will be sent."
        : "This changes the pipeline stage. No email is sent unless you explicitly choose one below.";

  return <Modal title={`Move ${prospect.name}`} width={720} onClose={onClose}>
    <div className="prospectMoveDialog">
      <div className="prospectMoveRoute">
        <span><small>Current stage</small><b>{current?.label ?? prospect.stage_label ?? prospect.stage_key}</b></span>
        <span aria-hidden>→</span>
        <span><small>Destination</small><b>{destination.label}</b></span>
      </div>
      <div className={`prospectEffectSummary${isNotInterested ? " danger" : ""}`}><b>What will happen</b><span>{summary}</span></div>
      {isConverted && conversionCandidates.length > 0 && <div className="prospectConversionChoices"><div><b>A matching AI Intake already exists</b><span>Choose exactly how to handle the matching file. A new intake is never created silently.</span></div>{conversionCandidates.map((candidate) => <label key={candidate.id} className={`prospectIntakeCandidate${conversionIntakeId === candidate.id ? " selected" : ""}`}><input type="radio" name="conversion-intake" value={candidate.id} checked={conversionIntakeId === candidate.id} onChange={() => { setConversionIntakeId(candidate.id); if (conversionAction === "detect" || conversionAction === "create") setConversionAction("link"); }} /><span><b>{candidate.business_name || candidate.full_name}</b><small>{candidate.full_name} · {candidate.status}{candidate.outcome_status ? ` · ${candidate.outcome_status}` : ""}</small></span></label>)}<div className="prospectConversionActions"><label><input type="radio" name="conversion-action" checked={conversionAction === "link"} onChange={() => setConversionAction("link")} disabled={!conversionIntakeId} /> Link existing</label><label><input type="radio" name="conversion-action" checked={conversionAction === "reactivate"} onChange={() => setConversionAction("reactivate")} disabled={!conversionIntakeId} /> Reactivate and link</label><label><input type="radio" name="conversion-action" checked={conversionAction === "create"} onChange={() => { setConversionAction("create"); setConversionIntakeId(""); }} /> Create a separate intake</label></div></div>}
      {isBooked && <div className="prospectBookingRequirement">
        <label><span className="lbl">Appointment ID</span><input className="field" value={appointmentId} onChange={(event) => setAppointmentId(event.target.value)} placeholder="Link the confirmed appointment" /></label>
        {onBook && <button type="button" className="btn" onClick={onBook}>Create appointment</button>}
      </div>}
      {!isConverted && !isBooked && !isNotInterested && <label><span className="lbl">Optional action</span><select className="field" value={action} onChange={(event) => setAction(event.target.value)}><option value="">Stage change only</option><option value="draft_email">Create a reviewable email draft</option></select></label>}
      {!isConverted && !isNotInterested && <label><span className="lbl">Next follow-up</span><input className="field" type="datetime-local" value={followUp} onChange={(event) => setFollowUp(event.target.value)} /></label>}
      <label><span className="lbl">Internal note</span><textarea className="field" rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional context for the activity timeline" /></label>
      {isNotInterested && <label className={`consent${confirmedDoNotContact ? " on" : ""}`}><input type="checkbox" checked={confirmedDoNotContact} onChange={(event) => setConfirmedDoNotContact(event.target.checked)} /><span className="ctext"><span className="ctitle">Confirm do-not-contact</span>Clear follow-up and stop future prospect outreach for this contact.</span></label>}
      {move.isError && !conversionCandidates.length && <div className="note" role="alert">{move.error instanceof Error ? move.error.message : "The prospect could not be moved."}</div>}
      <div className="prospectDialogActions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className={`btn ${isNotInterested ? "danger" : "pri"}`} disabled={!canMove || move.isPending} onClick={() => move.mutate()}>{move.isPending ? "Confirming…" : isConverted && conversionCandidates.length ? "Confirm AI Intake choice" : isConverted ? "Check and create AI Intake" : "Confirm move"}</button></div>
    </div>
  </Modal>;
}
