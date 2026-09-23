"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, CalendarDays, ExternalLink, Mail, MessageSquareText, Phone, Plus, Send, StickyNote } from "lucide-react";
import { api } from "@/lib/api";
import {
  DEFAULT_PROSPECT_OUTCOMES,
  DEFAULT_PROSPECT_STAGES,
  displayDate,
  initials,
  type ProspectDetail,
  type ProspectEmailDraft,
  type ProspectOutcome,
  type ProspectStage,
} from "@/lib/prospects";
import BookingDrawer from "@/components/BookingDrawer";
import InboxComposeModal from "@/components/InboxComposeModal";
import ProspectEmailComposer from "@/components/ProspectEmailComposer";
import ProspectMoveDialog from "@/components/ProspectMoveDialog";

type OutcomeResult = ProspectDetail | { prospect: ProspectDetail; email_action?: string | null; workflow_action?: string | null; email_draft_id?: string | null };
type DraftList = { items: ProspectEmailDraft[] };
type ProspectReply = { id: string; draft_id?: string | null; provider?: string | null; provider_message_id?: string | null; from_email: string; subject?: string | null; body: string; received_at: string; created_at: string };
type ReplyList = { items: ProspectReply[] };
const FUNDING_APP_URL = process.env.NEXT_PUBLIC_FUNDING_APP_URL ?? process.env.NEXT_PUBLIC_FUNDING_URL ?? "https://app.qualifiedcommercial.com";

function humanize(value: string): string { return value.replaceAll("_", " ").replace(/\b\w/g, (part) => part.toUpperCase()); }

function isActiveOutreachDraft(draft: ProspectEmailDraft): boolean {
  const delivery = String(draft.delivery_status ?? "").toLowerCase();
  if (["delivered", "bounced", "complaint", "failed", "blocked", "cancelled", "unavailable"].includes(delivery)) return false;
  return ["drafting", "pending_review", "editing", "queued", "sending"].includes(draft.status);
}

export default function ProspectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [composerDraft, setComposerDraft] = useState<ProspectEmailDraft | null | undefined>(undefined);
  const [composeMode, setComposeMode] = useState<"sms" | null>(null);
  const [booking, setBooking] = useState(false);
  const [moveStage, setMoveStage] = useState<ProspectStage | null>(null);
  const [outcomeKey, setOutcomeKey] = useState("");
  const [outcomeNote, setOutcomeNote] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [outcomeAppointmentId, setOutcomeAppointmentId] = useState("");
  const [note, setNote] = useState("");
  const [outcomeDraftError, setOutcomeDraftError] = useState<string | null>(null);
  const [moveConflict, setMoveConflict] = useState<string | null>(null);
  const composeLinkHandledFor = useRef<string | null>(null);

  const detail = useQuery({
    queryKey: ["dealer-prospect", id],
    queryFn: async () => api<ProspectDetail>(`/dealer-os/prospects/${id}`, { authToken: (await getToken()) ?? undefined }),
  });
  const stageQuery = useQuery({ queryKey: ["prospect-stages"], queryFn: async () => api<ProspectStage[]>("/dealer-os/prospect-stages", { authToken: (await getToken()) ?? undefined }) });
  const outcomeQuery = useQuery({ queryKey: ["prospect-outcomes"], queryFn: async () => api<ProspectOutcome[]>("/dealer-os/prospect-outcomes", { authToken: (await getToken()) ?? undefined }) });
  const draftQuery = useQuery({ queryKey: ["prospect-email-drafts", id], queryFn: async () => api<DraftList>(`/dealer-os/prospects/${id}/email-drafts`, { authToken: (await getToken()) ?? undefined }) });
  const repliesQuery = useQuery({ queryKey: ["prospect-replies", id], queryFn: async () => api<ReplyList>(`/dealer-os/prospects/${id}/replies`, { authToken: (await getToken()) ?? undefined }), refetchInterval: 15_000 });
  const row = detail.data;
  const stages = useMemo(() => (stageQuery.data?.length ? stageQuery.data : DEFAULT_PROSPECT_STAGES).filter((item) => item.is_active !== false).sort((a, b) => a.position - b.position), [stageQuery.data]);
  const outcomes = useMemo(() => (outcomeQuery.data?.length ? outcomeQuery.data : DEFAULT_PROSPECT_OUTCOMES).filter((item) => item.is_active !== false).sort((a, b) => a.position - b.position), [outcomeQuery.data]);
  const selectedOutcome = outcomes.find((item) => item.key === outcomeKey);
  const outcomeRequiresAppointment = Boolean(selectedOutcome?.requires_appointment || selectedOutcome?.action_config?.requires_appointment);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["dealer-prospect", id] }); void qc.invalidateQueries({ queryKey: ["dealer-prospects"] }); void qc.invalidateQueries({ queryKey: ["prospect-email-drafts", id] }); void qc.invalidateQueries({ queryKey: ["prospect-replies", id] }); };

  const applyOutcome = useMutation({
    mutationFn: async () => api<OutcomeResult>(`/dealer-os/prospects/${id}/outcomes`, {
      method: "POST",
      body: JSON.stringify({ outcome_key: outcomeKey, note: outcomeNote.trim() || null, next_follow_up_at: followUp ? new Date(followUp).toISOString() : null, appointment_id: outcomeAppointmentId.trim() || null, expected_version: row?.version }),
      authToken: (await getToken()) ?? undefined,
    }),
    onSuccess: async (result) => {
      const envelope = "prospect" in result ? result : null;
      qc.setQueryData(["dealer-prospect", id], envelope?.prospect ?? result);
      refresh(); setOutcomeKey(""); setOutcomeNote(""); setFollowUp(""); setOutcomeAppointmentId("");
      setOutcomeDraftError(null);
      if (envelope?.workflow_action === "book_appointment") setBooking(true);
      if (envelope?.email_draft_id) {
        try {
          const created = await api<ProspectEmailDraft>(`/dealer-os/prospect-email-drafts/${envelope.email_draft_id}`, { authToken: (await getToken()) ?? undefined });
          setComposerDraft(created);
          refresh();
        } catch (error) {
          setOutcomeDraftError(error instanceof Error ? error.message : "The outcome was saved, but the email draft could not be created.");
        }
      }
    },
  });
  const addNote = useMutation({
    mutationFn: async () => api(`/dealer-os/prospects/${id}/activities`, { method: "POST", body: JSON.stringify({ kind: "internal_note", body: note.trim() }), authToken: (await getToken()) ?? undefined }),
    onSuccess: () => { setNote(""); refresh(); },
  });
  const completeBookedMove = useMutation({
    mutationFn: async (appointmentId: string) => api<ProspectDetail>(`/dealer-os/prospects/${id}/move-stage`, { method: "POST", body: JSON.stringify({ stage_key: "booked", expected_version: row?.version, appointment_id: appointmentId, action: "book_appointment" }), authToken: (await getToken()) ?? undefined }),
    onSuccess: (updated) => { qc.setQueryData(["dealer-prospect", id], updated); refresh(); },
    onError: refresh,
  });
  const undoActivity = useMutation({
    mutationFn: async (activityId: string) => api<ProspectDetail>(`/dealer-os/prospects/${id}/activities/${activityId}/undo`, { method: "POST", body: JSON.stringify({ expected_version: row?.version }), authToken: (await getToken()) ?? undefined }),
    onSuccess: (updated) => { qc.setQueryData(["dealer-prospect", id], updated); refresh(); },
    onError: refresh,
  });

  const emailDrafts = draftQuery.data?.items ?? row?.email_drafts ?? [];
  const activeDraft = emailDrafts.find(isActiveOutreachDraft);

  useEffect(() => {
    if (params.get("compose") !== "email") {
      composeLinkHandledFor.current = null;
      return;
    }
    if (composeLinkHandledFor.current === id || draftQuery.isLoading) return;
    composeLinkHandledFor.current = id;
    setComposerDraft(activeDraft ?? null);
  }, [activeDraft, draftQuery.isLoading, id, params]);

  if (detail.isLoading) return <div className="empty">Loading dealer prospect…</div>;
  if (detail.isError || !row) return <div className="note" role="alert">{detail.error instanceof Error ? detail.error.message : "Dealer prospect unavailable."}</div>;
  const seed = { prospect_id: row.id, contact_name: row.name, company: row.dealer_name, contact_email: row.email, contact_phone: row.phone };

  return <div className="prospectDetailPage">
    <header className="contactHero prospectHero">
      <div><Link href="/marketing" className="backLink">← Marketing pipeline</Link><div className="contactIdentity"><div className="contactAvatar large">{initials(row.name)}</div><div><span className="eyebrow">Marketing prospect</span><h2>{row.dealer_name}</h2><p>{row.name} · {row.owner_name || "Unassigned"}</p></div></div></div>
      <div className="prospectHeroStatus"><span className="prospectStageBadge">{row.stage_label ?? humanize(row.stage_key)}</span><span className="sub">Version {row.version}</span></div>
      <div className="contactQuick"><button type="button" className="btn" disabled={row.do_not_contact} onClick={() => setComposerDraft(activeDraft ?? null)}><Mail size={16} /> Email</button><a className="btn pri" href={`tel:${row.phone}`}><Phone size={16} /> Call</a></div>
    </header>

    <div className="prospectActionBar">
      <button type="button" className="btn pri" disabled={row.do_not_contact} onClick={() => setComposerDraft(activeDraft ?? null)}><Bot size={17} /> {activeDraft ? "Resume active email" : "Draft dealer email"}</button>
      <button type="button" className="btn" disabled={row.do_not_contact || !row.marketing_sms_consent} title={!row.marketing_sms_consent ? "Record marketing SMS consent before texting this prospect." : undefined} onClick={() => setComposeMode("sms")}><MessageSquareText size={16} /> Text</button>
      <button type="button" className="btn" onClick={() => setBooking(true)}><CalendarDays size={16} /> Book appointment</button>
      {!row.converted_intake_id && !row.converted_application_id && <button type="button" className="btn" onClick={() => setMoveStage(stages.find((stage) => stage.key === "converted") ?? null)}><Plus size={16} /> Convert prospect</button>}
      {row.converted_application_id && <Link className="btn" href={`/applications/${row.converted_application_id}`}>Open Portfolio application <ExternalLink size={15} /></Link>}
      {row.converted_intake_id && <a className="btn" target="_blank" rel="noreferrer" href={`${FUNDING_APP_URL}/admin/ai-underwriter-leads?lead=${row.converted_intake_id}&view=underwriting`}>Open AI Intake <ExternalLink size={15} /></a>}
      <Link className="btn" href={emailDrafts[0] ? `/inbox?view=marketing&draft_id=${emailDrafts[0].id}` : `/inbox?view=marketing&q=${encodeURIComponent(row.dealer_name)}`}><Mail size={16} /> Email activity</Link>
      <label className="prospectInlineMove"><span className="lbl">Move stage</span><select className="field" value="" onChange={(event) => setMoveStage(stages.find((stage) => stage.key === event.target.value) ?? null)}><option value="">Choose…</option>{stages.filter((stage) => stage.key !== row.stage_key).map((stage) => <option value={stage.key} key={stage.key}>{stage.label}</option>)}</select></label>
    </div>
    {row.do_not_contact && <div className="prospectDoNotContact">Prospect outreach is disabled for this contact.</div>}
    {moveConflict && <div className="note mt" role="alert">{moveConflict}</div>}
    {completeBookedMove.isError && <div className="note mt" role="alert">The appointment was booked, but the prospect could not move to Booked. {completeBookedMove.error instanceof Error ? completeBookedMove.error.message : "Refresh and link the appointment from this page."}</div>}

    <div className="prospectDetailGrid mt"><main>
      <section className="panel prospectDetailSection"><div className="panel-h"><b>Call outcome</b><span className="sp" /><span className="sub">{row.call_attempt_count} attempts</span></div><div className="panel-b prospectOutcomeForm">
        <label><span className="lbl">Outcome</span><select className="field" value={outcomeKey} onChange={(event) => setOutcomeKey(event.target.value)}><option value="">Select what happened…</option>{outcomes.map((outcome) => <option key={outcome.key} value={outcome.key}>{outcome.label}</option>)}</select></label>
        {selectedOutcome?.requires_follow_up && <label><span className="lbl">Callback date and time</span><input className="field" type="datetime-local" value={followUp} onChange={(event) => setFollowUp(event.target.value)} /></label>}
        {outcomeRequiresAppointment && <label><span className="lbl">Appointment ID</span><input className="field" value={outcomeAppointmentId} onChange={(event) => setOutcomeAppointmentId(event.target.value)} placeholder="Link the confirmed appointment" /></label>}
        <label><span className="lbl">Internal outcome note</span><textarea className="field" rows={3} value={outcomeNote} onChange={(event) => setOutcomeNote(event.target.value)} placeholder="What did the dealer say?" /></label>
        {selectedOutcome?.creates_email_draft && <div className="prospectEffectSummary"><b>Email review follows</b><span>This outcome creates an approved-template draft. You can edit or approve it before the 60-second automatic send.</span></div>}
        {applyOutcome.isError && <div className="note" role="alert">{applyOutcome.error instanceof Error ? applyOutcome.error.message : "The outcome could not be saved."}</div>}
        {outcomeDraftError && <div className="note" role="alert">{outcomeDraftError}</div>}
        <button type="button" className="btn pri" disabled={!outcomeKey || (selectedOutcome?.requires_follow_up && !followUp) || (outcomeRequiresAppointment && !outcomeAppointmentId.trim()) || applyOutcome.isPending} onClick={() => applyOutcome.mutate()}>{applyOutcome.isPending ? "Applying…" : "Apply outcome"}</button>
      </div></section>

      <section className="panel prospectDetailSection mt"><div className="panel-h"><b>Activity timeline</b><span className="sp" /><span className="cellchip c-mut">{row.activities.length}</span></div><div className="panel-b prospectTimeline">
        <form className="prospectNoteComposer" onSubmit={(event) => { event.preventDefault(); if (note.trim()) addNote.mutate(); }}><StickyNote size={17} /><textarea className="field" rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add an internal note…" /><button className="btn" type="submit" disabled={!note.trim() || addNote.isPending}><Plus size={16} /> Add note</button></form>
        {addNote.isError && <div className="note" role="alert">{addNote.error instanceof Error ? addNote.error.message : "The note could not be saved."}</div>}
        {undoActivity.isError && <div className="note" role="alert">{undoActivity.error instanceof Error ? undoActivity.error.message : "That activity can no longer be undone."}</div>}
        {row.activities.map((activity) => <article key={activity.id} className="prospectTimelineItem"><span className="prospectTimelineDot" /><div><header><b>{humanize(activity.kind)}</b><span><time>{displayDate(activity.created_at, true)}</time>{activity.metadata?.reversible === true && <button type="button" className="btn sm" disabled={undoActivity.isPending} onClick={() => undoActivity.mutate(activity.id)}>Undo</button>}</span></header>{activity.body && <p>{activity.body}</p>}<small>{activity.actor_name || "System"}</small></div></article>)}
        {!row.activities.length && <div className="empty compact">No prospect activity yet.</div>}
      </div></section>
    </main><aside>
      <section className="panel prospectDetailSection"><div className="panel-h"><b>Contact</b></div><div className="panel-b prospectContactFacts"><div><span>Email</span><b>{row.email}</b></div><div><span>Phone</span><a href={`tel:${row.phone}`}>{row.phone}</a></div><div><span>Next follow-up</span><b>{displayDate(row.next_follow_up_at, true)}</b></div><div><span>Last activity</span><b>{displayDate(row.last_activity_at ?? row.updated_at, true)}</b></div></div></section>
      <section className="panel prospectDetailSection mt"><div className="panel-h"><b>Email delivery</b><span className="sp" /><span className="cellchip c-mut">{emailDrafts.length}</span></div><div className="panel-b prospectDraftHistory">{emailDrafts.map((draft) => <button type="button" key={draft.id} onClick={() => setComposerDraft(draft)}><span><b>{draft.subject}</b><small>{displayDate(draft.sent_at ?? draft.created_at, true)}</small></span><span className={`prospectDraftStatus status-${draft.status}`}>{humanize(draft.status)}</span></button>)}{draftQuery.isLoading && <div className="empty compact">Loading email history…</div>}{!draftQuery.isLoading && !emailDrafts.length && <div className="empty compact">No dealer outreach drafted.</div>}</div></section>
      <section className="panel prospectDetailSection mt"><div className="panel-h"><b>Dealer replies</b><span className="sp" /><span className="cellchip c-mut">{repliesQuery.data?.items.length ?? 0}</span></div><div className="panel-b prospectReplies">{repliesQuery.isLoading && <div className="empty compact">Loading replies…</div>}{repliesQuery.isError && <div className="note" role="alert">{repliesQuery.error instanceof Error ? repliesQuery.error.message : "Replies could not be loaded."}</div>}{(repliesQuery.data?.items ?? []).map((reply) => <article key={reply.id}><header><b>{reply.subject || "Dealer reply"}</b><time>{displayDate(reply.received_at, true)}</time></header><small>From {reply.from_email}</small><p>{reply.body}</p></article>)}{!repliesQuery.isLoading && !repliesQuery.isError && !(repliesQuery.data?.items ?? []).length && <div className="empty compact">No replies received yet.</div>}</div></section>
      <section className="panel prospectDetailSection mt"><div className="panel-h"><b>Current state</b></div><div className="panel-b prospectContactFacts"><div><span>Stage</span><b>{row.stage_label ?? humanize(row.stage_key)}</b></div><div><span>Last outcome</span><b>{row.last_outcome_label || "No call logged"}</b></div><div><span>Created</span><b>{displayDate(row.created_at)}</b></div><div><span>SMS marketing consent</span><b>{row.marketing_sms_consent ? "Recorded" : "Not recorded"}</b></div></div></section>
    </aside></div>

    {composerDraft !== undefined && <ProspectEmailComposer prospect={row} initialDraft={composerDraft} onClose={() => setComposerDraft(undefined)} />}
    {composeMode && <InboxComposeModal onClose={() => setComposeMode(null)} seed={seed} initialChannel={composeMode} initialMarketingConsent={row.marketing_sms_consent === true} requireMarketingSmsConsent />}
    {booking && <BookingDrawer onClose={() => { setBooking(false); refresh(); }} onBooked={(appointment) => completeBookedMove.mutate(appointment.id)} initialName={row.name} initialEmail={row.email} initialPhone={row.phone} initialKind="program_intro" />}
    {moveStage && <ProspectMoveDialog prospect={row} stages={stages} destination={moveStage} onClose={() => setMoveStage(null)} onConflict={setMoveConflict} onBook={() => { setMoveStage(null); setBooking(true); }} onEmailDraft={(_moved, draft) => setComposerDraft(draft)} onMoved={() => { setMoveStage(null); refresh(); }} />}
  </div>;
}
