"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Bot, CalendarDays, ExternalLink, Mail, MessageSquareText, Plus, StickyNote } from "lucide-react";
import { api } from "@/lib/api";
import {
  displayDate,
  initials,
  type ProspectCcScope,
  type ProspectDetail,
  type ProspectEmailDraft,
  type ProspectFollowUpChoice,
  type ProspectFollowUpSuggestion,
  type ProspectOutcome,
  type ProspectStage,
  type ProspectTimelinePage,
} from "@/lib/prospects";
import BookingDrawer from "@/components/BookingDrawer";
import InboxComposeModal from "@/components/InboxComposeModal";
import ProspectEmailComposer from "@/components/ProspectEmailComposer";
import ProspectMoveDialog from "@/components/ProspectMoveDialog";
import MarketingCloseLink from "@/components/MarketingCloseLink";
import ProspectCallAction from "@/components/ProspectCallAction";
import FollowUpCountdown from "@/components/FollowUpCountdown";
import ProspectCcControl from "@/components/ProspectCcControl";
import ProspectEmailVoidAction from "@/components/ProspectEmailVoidAction";

type OutcomeResult = ProspectDetail | { prospect: ProspectDetail; email_action?: string | null; workflow_action?: string | null; email_draft_id?: string | null; email_disposition?: "none" | "pending_review" | "skipped" };
type DraftList = { items: ProspectEmailDraft[] };
const FUNDING_APP_URL = process.env.NEXT_PUBLIC_FUNDING_APP_URL ?? process.env.NEXT_PUBLIC_FUNDING_URL ?? "https://app.qualifiedcommercial.com";

function humanize(value: string): string { return value.replaceAll("_", " ").replace(/\b\w/g, (part) => part.toUpperCase()); }

function displayDateInTimezone(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function isActiveOutreachDraft(draft: ProspectEmailDraft): boolean {
  const delivery = String(draft.delivery_status ?? "").toLowerCase();
  if (["delivered", "bounced", "complaint", "failed", "blocked", "cancelled", "unavailable"].includes(delivery)) return false;
  return ["drafting", "pending_review", "editing", "queued", "sending"].includes(draft.status);
}

function timelineCcEmails(metadata?: Record<string, unknown> | null): string[] {
  const raw = metadata?.cc_emails;
  return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string" && Boolean(value.trim())) : [];
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
  const [outcomeAiInstructions, setOutcomeAiInstructions] = useState("");
  const [outcomeCcEmails, setOutcomeCcEmails] = useState<string[]>([]);
  const [outcomeCcScope, setOutcomeCcScope] = useState<ProspectCcScope>("this_email");
  const [outcomeCcValid, setOutcomeCcValid] = useState(true);
  const [skipEmailDraft, setSkipEmailDraft] = useState(false);
  const [outcomeStep, setOutcomeStep] = useState<"note" | "email">("note");
  const [followUp, setFollowUp] = useState("");
  const [followUpChoice, setFollowUpChoice] = useState<ProspectFollowUpChoice>("next_business_day");
  const [bookingOutcomeKey, setBookingOutcomeKey] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [outcomeDraftError, setOutcomeDraftError] = useState<string | null>(null);
  const [outcomeSavedMessage, setOutcomeSavedMessage] = useState<string | null>(null);
  const [moveConflict, setMoveConflict] = useState<string | null>(null);
  const composeLinkHandledFor = useRef<string | null>(null);

  const detail = useQuery({
    queryKey: ["dealer-prospect", id],
    queryFn: async () => api<ProspectDetail>(`/dealer-os/prospects/${id}`, { authToken: (await getToken()) ?? undefined }),
  });
  const stageQuery = useQuery({ queryKey: ["prospect-stages"], queryFn: async () => api<ProspectStage[]>("/dealer-os/prospect-stages", { authToken: (await getToken()) ?? undefined }) });
  const outcomeQuery = useQuery({ queryKey: ["prospect-outcomes"], queryFn: async () => api<ProspectOutcome[]>("/dealer-os/prospect-outcomes", { authToken: (await getToken()) ?? undefined }) });
  const draftQuery = useQuery({
    queryKey: ["prospect-email-drafts", id],
    queryFn: async () => api<DraftList>(`/dealer-os/prospects/${id}/email-drafts`, { authToken: (await getToken()) ?? undefined }),
    refetchInterval: (query) => (query.state.data?.items ?? []).some(isActiveOutreachDraft) ? 2_000 : false,
  });
  const timelineQuery = useInfiniteQuery({
    queryKey: ["prospect-timeline", id],
    initialPageParam: "",
    queryFn: async ({ pageParam }) => api<ProspectTimelinePage>(`/dealer-os/prospects/${id}/timeline?limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, { authToken: (await getToken()) ?? undefined }),
    getNextPageParam: (page) => page.next_cursor || undefined,
    refetchInterval: 15_000,
  });
  const row = detail.data;
  const stages = useMemo(() => (stageQuery.data ?? []).filter((item) => item.is_active !== false).sort((a, b) => a.position - b.position), [stageQuery.data]);
  const outcomes = useMemo(() => (outcomeQuery.data ?? []).filter((item) => item.is_active !== false).sort((a, b) => a.position - b.position), [outcomeQuery.data]);
  const stageCatalogUnavailable = stageQuery.isError || (stageQuery.isSuccess && !stages.length);
  const outcomeCatalogUnavailable = outcomeQuery.isError || (outcomeQuery.isSuccess && !outcomes.length);
  const selectedOutcome = outcomes.find((item) => item.key === outcomeKey);
  const outcomeRequiresAppointment = Boolean(selectedOutcome?.requires_appointment || selectedOutcome?.action_config?.requires_appointment);
  const outcomeBooksAppointment = Boolean(outcomeRequiresAppointment || selectedOutcome?.action_config?.workflow_action === "book_appointment" || ["booked", "wants_to_book"].includes(outcomeKey));
  const outcomeNeedsFollowUp = Boolean(selectedOutcome?.requires_follow_up || selectedOutcome?.action_config?.requires_follow_up);
  // Appointment outcomes are completed by the booking workflow, which owns
  // its transactional confirmations. The controls below configure only the
  // separate Marketing outcome draft created by this endpoint.
  const outcomeCreatesEmail = Boolean(selectedOutcome?.creates_email_draft || selectedOutcome?.action_config?.email_action) && !selectedOutcome?.action_config?.suppress_email && !outcomeBooksAppointment;
  const suggestedFollowUpChoice: ProspectFollowUpChoice = row?.stage_key === "new" ? "next_business_day" : "two_business_days";
  const firmFollowUpClock = useQuery({
    queryKey: ["prospect-follow-up-suggestion", id, "next_business_day"],
    queryFn: async () => api<ProspectFollowUpSuggestion>(`/dealer-os/prospects/${id}/follow-up-suggestion?choice=next_business_day`, { authToken: (await getToken()) ?? undefined }),
    enabled: Boolean(row),
    staleTime: 5 * 60_000,
  });
  const followUpSuggestion = useQuery({
    queryKey: ["prospect-follow-up-suggestion", id, followUpChoice],
    queryFn: async () => api<ProspectFollowUpSuggestion>(`/dealer-os/prospects/${id}/follow-up-suggestion?choice=${followUpChoice}`, { authToken: (await getToken()) ?? undefined }),
    enabled: Boolean(row && outcomeNeedsFollowUp && followUpChoice !== "custom"),
  });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["dealer-prospect", id] }); void qc.invalidateQueries({ queryKey: ["dealer-prospects"] }); void qc.invalidateQueries({ queryKey: ["prospect-email-drafts", id] }); void qc.invalidateQueries({ queryKey: ["prospect-timeline", id] }); };

  const applyOutcome = useMutation({
    mutationFn: async () => api<OutcomeResult>(`/dealer-os/prospects/${id}/outcomes`, {
      method: "POST",
      // datetime-local has no zone by design. Send the wall-clock value so the
      // server can interpret it in the firm's booking timezone rather than the
      // employee browser's timezone.
      body: JSON.stringify({
        outcome_key: outcomeKey,
        note: outcomeNote.trim() || null,
        ai_draft_instructions: outcomeCreatesEmail && !skipEmailDraft ? outcomeAiInstructions.trim() || null : null,
        cc_emails: outcomeCreatesEmail && !skipEmailDraft ? outcomeCcEmails : [],
        cc_scope: outcomeCcScope,
        skip_email_draft: outcomeCreatesEmail ? skipEmailDraft : false,
        follow_up_choice: outcomeNeedsFollowUp ? followUpChoice : null,
        next_follow_up_at: outcomeNeedsFollowUp && followUpChoice === "custom" && followUp ? followUp : null,
        expected_version: row?.version,
      }),
      authToken: (await getToken()) ?? undefined,
    }),
    onSuccess: async (result) => {
      const envelope = "prospect" in result ? result : null;
      qc.setQueryData(["dealer-prospect", id], envelope?.prospect ?? result);
      refresh();
      setOutcomeSavedMessage(envelope?.email_disposition === "skipped" ? "Outcome saved without creating or scheduling an email." : envelope?.email_disposition === "pending_review" ? "Outcome saved and the email is ready for review." : "Outcome saved.");
      setOutcomeKey(""); setOutcomeNote(""); setOutcomeAiInstructions(""); setOutcomeCcEmails(envelope?.prospect.default_cc_emails ?? []); setOutcomeCcScope("this_email"); setOutcomeCcValid(true); setSkipEmailDraft(false); setOutcomeStep("note"); setFollowUp(""); setFollowUpChoice("next_business_day");
      setOutcomeDraftError(null);
      if (envelope?.workflow_action === "book_appointment") { setBookingOutcomeKey(outcomeKey); setBooking(true); }
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
  const undoActivity = useMutation({
    mutationFn: async (activityId: string) => api<ProspectDetail>(`/dealer-os/prospects/${id}/activities/${activityId}/undo`, { method: "POST", body: JSON.stringify({ expected_version: row?.version }), authToken: (await getToken()) ?? undefined }),
    onSuccess: (updated) => { qc.setQueryData(["dealer-prospect", id], updated); refresh(); },
    onError: refresh,
  });

  const emailDrafts = draftQuery.data?.items ?? row?.email_drafts ?? [];
  const activeDraft = emailDrafts.find(isActiveOutreachDraft);
  const latestDraft = emailDrafts[0];
  const latestCancelledDraft = !activeDraft && latestDraft?.status === "cancelled" ? latestDraft : null;
  const timelineItems = useMemo(() => {
    const candidates = timelineQuery.data?.pages.flatMap((page) => page.items) ?? (row?.activities ?? []).map((activity) => ({
      id: activity.id,
      source: "prospect_activity",
      source_id: activity.id,
      kind: activity.kind,
      body: activity.body,
      metadata: activity.metadata,
      actor_name: activity.actor_name,
      occurred_at: activity.created_at,
    }));
    const seen = new Set<string>();
    return candidates.filter((activity) => {
      // Timeline records expose a canonical id per event. A single
      // appointment intentionally has separate scheduled, delivery, and
      // lifecycle events with the same source record id; collapsing on
      // source/source_id silently hid those distinct audit entries.
      const canonicalId = activity.id;
      if (seen.has(canonicalId)) return false;
      seen.add(canonicalId);
      return true;
    });
  }, [row?.activities, timelineQuery.data?.pages]);

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
  const hasActiveBooking = row.stage_key === "booked" && Boolean(row.appointment_id);

  return <div className="prospectDetailPage">
    <header className="contactHero prospectHero">
      <MarketingCloseLink label="Close prospect and return to Marketing" />
      <div><Link href="/marketing" className="backLink">← Marketing pipeline</Link><div className="contactIdentity"><div className="contactAvatar large">{initials(row.name)}</div><div><span className="eyebrow">Marketing prospect</span><h2>{row.dealer_name}</h2><p>{row.name} · {row.owner_name || "Unassigned"}</p></div></div></div>
      <div className="prospectHeroStatus"><span className="prospectStageBadge">{row.stage_label ?? humanize(row.stage_key)}</span><span className="sub">Version {row.version}</span></div>
      <div className="contactQuick"><button type="button" className="btn" disabled={row.do_not_contact} onClick={() => setComposerDraft(activeDraft ?? null)}><Mail size={16} /> Email</button><ProspectCallAction phone={row.phone} prospectId={row.id} disabled={row.do_not_contact} onInitiated={refresh} /></div>
    </header>

    <div className="prospectActionBar">
      <button type="button" className="btn pri" disabled={row.do_not_contact} onClick={() => setComposerDraft(activeDraft ?? null)}><Bot size={17} /> {activeDraft ? "Resume active email" : "Draft dealer email"}</button>
      <button type="button" className="btn" disabled={row.do_not_contact || !row.marketing_sms_consent} title={!row.marketing_sms_consent ? "Record marketing SMS consent before texting this prospect." : undefined} onClick={() => setComposeMode("sms")}><MessageSquareText size={16} /> Text</button>
      {hasActiveBooking
        ? <Link className="btn" href={`/calendar?appointment=${row.appointment_id}`}><CalendarDays size={16} /> Manage appointment</Link>
        : <button type="button" className="btn" disabled={row.do_not_contact || stageQuery.isLoading || stageCatalogUnavailable} title={row.do_not_contact ? "Reactivate outreach before booking this contact." : stageCatalogUnavailable ? "Stage configuration must be restored before booking." : undefined} onClick={() => setBooking(true)}><CalendarDays size={16} /> Book appointment</button>}
      {!row.converted_intake_id && !row.converted_application_id && <button type="button" className="btn" disabled={stageQuery.isLoading || stageCatalogUnavailable} title={stageCatalogUnavailable ? "Stage configuration must be restored before conversion." : undefined} onClick={() => setMoveStage(stages.find((stage) => stage.key === "converted") ?? null)}><Plus size={16} /> Convert prospect</button>}
      {row.converted_application_id && <Link className="btn" href={`/applications/${row.converted_application_id}`}>Open Portfolio application <ExternalLink size={15} /></Link>}
      {row.converted_intake_id && <a className="btn" target="_blank" rel="noreferrer" href={`${FUNDING_APP_URL}/admin/ai-underwriter-leads?lead=${row.converted_intake_id}&view=underwriting`}>Open AI Intake <ExternalLink size={15} /></a>}
      <Link className="btn" href={emailDrafts[0] ? `/inbox?view=marketing&draft_id=${emailDrafts[0].id}` : `/inbox?view=marketing&q=${encodeURIComponent(row.dealer_name)}`}><Mail size={16} /> Email activity</Link>
      <label className="prospectInlineMove"><span className="lbl">Move stage</span><select className="field" value="" disabled={stageQuery.isLoading || stageCatalogUnavailable} onChange={(event) => setMoveStage(stages.find((stage) => stage.key === event.target.value) ?? null)}><option value="">{stageQuery.isLoading ? "Loading…" : stageCatalogUnavailable ? "Unavailable" : "Choose…"}</option>{stages.filter((stage) => stage.key !== row.stage_key).map((stage) => <option value={stage.key} key={stage.key}>{stage.label}</option>)}</select></label>
    </div>
    {activeDraft && ["pending_review", "editing"].includes(activeDraft.status) && <div className="prospectPendingEmailBanner" role="status"><span><b>Dealer email awaiting action</b><small>{activeDraft.subject || "Untitled email"}</small></span><button type="button" className="btn" onClick={() => setComposerDraft(activeDraft)}>Review email</button><ProspectEmailVoidAction source="prospect_banner" compact showCountdown draft={activeDraft} onDraftChange={(updated) => { qc.setQueryData<DraftList>(["prospect-email-drafts", id], (current) => current ? { ...current, items: current.items.map((item) => item.id === updated.id ? updated : item) } : current); refresh(); }} /></div>}
    {activeDraft?.status === "sending" && <div className="note mt" role="alert"><b>Delivery already started and cannot be recalled.</b><span style={{ display: "block", marginTop: 4 }}>The latest provider state is being refreshed automatically.</span></div>}
    {latestCancelledDraft && <div className="prospectVoidedNotice mt" role="status"><Ban size={18} /><span><b>Voided before send</b><small>“{latestCancelledDraft.subject}” will not be delivered.</small></span></div>}
    {row.do_not_contact && <div className="prospectDoNotContact">Prospect outreach is disabled for this contact.</div>}
    {stageCatalogUnavailable && <div className="note mt" role="alert"><b>Authoritative stage configuration is unavailable.</b><span style={{ display: "block", marginTop: 4 }}>Stage movement and conversion are paused; no built-in fallback stages are being substituted.</span><button type="button" className="btn mt" disabled={stageQuery.isFetching} onClick={() => void stageQuery.refetch()}>{stageQuery.isFetching ? "Retrying…" : "Retry stages"}</button></div>}
    {moveConflict && <div className="note mt" role="alert">{moveConflict}</div>}

    <div className="prospectDetailGrid mt"><main>
      <section className="panel prospectDetailSection"><div className="panel-h"><b>Call outcome</b><span className="sp" /><span className="sub">{row.call_attempt_count} attempts</span></div><div className="panel-b prospectOutcomeForm">
        {outcomeQuery.isLoading || stageQuery.isLoading ? <div className="empty compact" role="status">Loading authoritative workflow configuration…</div> : outcomeCatalogUnavailable || stageCatalogUnavailable ? <div className="note" role="alert"><b>Call outcome configuration is unavailable.</b><span style={{ display: "block", marginTop: 4 }}>No fallback automation will be applied. Retry the authoritative stages and outcomes before recording an outcome.</span><button type="button" className="btn mt" disabled={outcomeQuery.isFetching || stageQuery.isFetching} onClick={() => { void outcomeQuery.refetch(); void stageQuery.refetch(); }}>{outcomeQuery.isFetching || stageQuery.isFetching ? "Retrying…" : "Retry workflow configuration"}</button></div> : <>
        <fieldset className="prospectOutcomeChoices"><legend className="lbl">What happened?</legend>{outcomes.map((outcome) => { const selected = outcome.key === outcomeKey; return <button type="button" role="radio" aria-checked={selected} className={selected ? "selected" : ""} key={outcome.key} onClick={() => { setOutcomeKey(outcome.key); setOutcomeNote(""); setOutcomeAiInstructions(""); setOutcomeCcEmails(row.default_cc_emails ?? []); setOutcomeCcScope("this_email"); setOutcomeCcValid(true); setSkipEmailDraft(false); setOutcomeStep("note"); setOutcomeSavedMessage(null); setFollowUp(""); setFollowUpChoice(outcome.key === "client_will_call_back" ? "two_business_days" : suggestedFollowUpChoice); }}><b>{outcome.label}</b><small>{outcome.action_config?.workflow_action === "book_appointment" || outcome.requires_appointment ? "Choose a time and book this prospect" : outcome.requires_follow_up || outcome.action_config?.requires_follow_up ? "Schedules the next follow-up" : outcome.creates_email_draft ? "Creates a reviewable email draft" : outcome.action_config?.set_do_not_contact ? "Stops future outreach" : "Records this call outcome"}</small></button>; })}</fieldset>
        {outcomeNeedsFollowUp && <section className="prospectFollowUpPicker"><span className="lbl">Next follow-up</span><div className="prospectFollowUpChoices" role="radiogroup" aria-label="Follow-up timing"><button type="button" role="radio" aria-checked={followUpChoice === "next_business_day"} className={followUpChoice === "next_business_day" ? "selected" : ""} onClick={() => setFollowUpChoice("next_business_day")}>Next business day</button><button type="button" role="radio" aria-checked={followUpChoice === "two_business_days"} className={followUpChoice === "two_business_days" ? "selected" : ""} onClick={() => setFollowUpChoice("two_business_days")}>+2 business days</button><button type="button" role="radio" aria-checked={followUpChoice === "custom"} className={followUpChoice === "custom" ? "selected" : ""} onClick={() => setFollowUpChoice("custom")}>Custom</button></div>{followUpChoice === "custom" ? <label><span className="lbl">Date and time · 10 AM–6 PM</span><input className="field" type="datetime-local" value={followUp} onChange={(event) => setFollowUp(event.target.value)} /></label> : <div className="prospectFollowUpSuggestion">{followUpSuggestion.isLoading ? "Finding the next business-time block…" : followUpSuggestion.data ? <><b>{displayDateInTimezone(followUpSuggestion.data.scheduled_at, followUpSuggestion.data.timezone)}</b><span>{followUpSuggestion.data.timezone}</span></> : "The server will choose the next 10:00 AM block."}</div>}</section>}
        {selectedOutcome && <section className="prospectOutcomeSteps">
          <nav aria-label="Optional outcome details">
            <button type="button" className={outcomeStep === "note" ? "selected" : ""} aria-current={outcomeStep === "note" ? "step" : undefined} onClick={() => setOutcomeStep("note")}><span>1</span><b>Internal note</b><small>Optional · private</small></button>
            {outcomeCreatesEmail && <button type="button" className={outcomeStep === "email" ? "selected" : ""} aria-current={outcomeStep === "email" ? "step" : undefined} onClick={() => setOutcomeStep("email")}><span>2</span><b>AI email</b><small>Optional · review first</small></button>}
          </nav>
          {outcomeStep === "note" || !outcomeCreatesEmail ? <div className="prospectOutcomeStepPanel"><label><span className="lbl">Internal note <small>optional</small></span><textarea className="field" rows={2} maxLength={2000} value={outcomeNote} onChange={(event) => setOutcomeNote(event.target.value)} placeholder="What did the dealer say? This stays private and is never sent to AI." /><small className="prospectFieldHelp">Saved to the activity timeline; excluded from the AI prompt and dealer email.</small></label>{outcomeCreatesEmail && <button type="button" className="btn prospectStepNext" onClick={() => setOutcomeStep("email")}>Continue to AI email</button>}</div> : <div className="prospectOutcomeStepPanel">
            <button type="button" className={`prospectSkipEmail${skipEmailDraft ? " selected" : ""}`} aria-pressed={skipEmailDraft} onClick={() => setSkipEmailDraft((current) => !current)}><span>{skipEmailDraft ? "✓" : ""}</span><span><b>Do not send an email for this outcome</b><small>The outcome and follow-up still save. No draft, attachment snapshot, or countdown is created.</small></span></button>
            {!skipEmailDraft && <>
              <label><span className="lbl">AI Draft Instructions <small>optional</small></span><textarea className="field" rows={3} maxLength={1500} value={outcomeAiInstructions} onChange={(event) => setOutcomeAiInstructions(event.target.value)} placeholder="Mention what was discussed, preferred tone, and the next action. Current instructions take priority over earlier customer-safe history." /><small className="prospectFieldHelp">QC safeguards and approved product facts remain authoritative.</small></label>
              <ProspectCcControl value={outcomeCcEmails} primaryEmail={row.email} onValidityChange={setOutcomeCcValid} onChange={setOutcomeCcEmails} />
              <div className="prospectCcScope" role="radiogroup" aria-label="CC recipient scope"><button type="button" role="radio" aria-checked={outcomeCcScope === "this_email"} className={outcomeCcScope === "this_email" ? "selected" : ""} onClick={() => setOutcomeCcScope("this_email")}><b>This email only</b><small>Do not change future drafts</small></button><button type="button" role="radio" aria-checked={outcomeCcScope === "this_and_future"} className={outcomeCcScope === "this_and_future" ? "selected" : ""} onClick={() => setOutcomeCcScope("this_and_future")}><b>This and future emails</b><small>Save for this prospect</small></button></div>
              {Boolean(row.default_cc_emails?.length) && <button type="button" className="btn sm danger prospectClearSavedCc" onClick={() => { setOutcomeCcEmails([]); setOutcomeCcScope("this_and_future"); }}>Clear saved CCs with this outcome</button>}
            </>}
          </div>}
        </section>}
        {outcomeBooksAppointment && <div className="prospectEffectSummary"><b>Appointment required</b><span>The dealer details are already linked. Applying this outcome opens the shared QC calendar; nothing changes if you cancel.</span></div>}
        {outcomeCreatesEmail && <div className={`prospectEffectSummary${skipEmailDraft ? " danger" : ""}`}><b>{skipEmailDraft ? "Email skipped" : "Email review follows"}</b><span>{skipEmailDraft ? "No email will be drafted or scheduled for this outcome. This does not mark the prospect do-not-contact." : `A reviewable email will be created${outcomeCcEmails.length ? ` with ${outcomeCcEmails.length} CC recipient${outcomeCcEmails.length === 1 ? "" : "s"}` : ""}. You can edit, approve, or permanently void it during review.`}</span></div>}
        {applyOutcome.isError && <div className="note" role="alert">{applyOutcome.error instanceof Error ? applyOutcome.error.message : "The outcome could not be saved."}</div>}
        {outcomeDraftError && <div className="note" role="alert">{outcomeDraftError}</div>}
        {outcomeSavedMessage && <div className="prospectSuccess" role="status">{outcomeSavedMessage}</div>}
        {outcomeBooksAppointment && hasActiveBooking
          ? <Link className="btn pri prospectApplyOutcome" href={`/calendar?appointment=${row.appointment_id}`}><CalendarDays size={16} /> Manage booked appointment</Link>
          : <button type="button" className="btn pri prospectApplyOutcome" disabled={!outcomeKey || (!skipEmailDraft && outcomeCreatesEmail && !outcomeCcValid) || (outcomeBooksAppointment && row.do_not_contact) || (outcomeNeedsFollowUp && followUpChoice === "custom" && !followUp) || applyOutcome.isPending} title={outcomeBooksAppointment && row.do_not_contact ? "Reactivate outreach before booking this contact." : undefined} onClick={() => { if (outcomeBooksAppointment) { setBookingOutcomeKey(outcomeKey); setBooking(true); } else applyOutcome.mutate(); }}>{applyOutcome.isPending ? "Applying…" : outcomeBooksAppointment ? "Choose time & book" : skipEmailDraft && outcomeCreatesEmail ? "Apply outcome without email" : "Apply outcome"}</button>}
        </>}
      </div></section>

      <section className="panel prospectDetailSection mt"><div className="panel-h"><b>Activity timeline</b><span className="sp" /><span className="cellchip c-mut">{timelineItems.length}</span></div><div className="panel-b prospectTimeline">
        <form className="prospectNoteComposer" onSubmit={(event) => { event.preventDefault(); if (note.trim()) addNote.mutate(); }}><StickyNote size={17} /><textarea className="field" rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add an internal note…" /><button className="btn" type="submit" disabled={!note.trim() || addNote.isPending}><Plus size={16} /> Add note</button></form>
        {addNote.isError && <div className="note" role="alert">{addNote.error instanceof Error ? addNote.error.message : "The note could not be saved."}</div>}
        {undoActivity.isError && <div className="note" role="alert">{undoActivity.error instanceof Error ? undoActivity.error.message : "That activity can no longer be undone."}</div>}
        {timelineQuery.isError && <div className="note" role="alert">Live delivery and message history could not be loaded. Showing the saved prospect activity instead.</div>}
        {timelineItems.map((activity) => {
          const ccEmails = timelineCcEmails(activity.metadata);
          return <article key={activity.id} className={`prospectTimelineItem source-${activity.source}`}><span className="prospectTimelineDot" /><div><header><b>{humanize(activity.kind)}</b><span><time>{displayDate(activity.occurred_at, true)}</time>{["prospect", "prospect_activity"].includes(activity.source) && activity.metadata?.reversible === true && <button type="button" className="btn sm" disabled={undoActivity.isPending} onClick={() => undoActivity.mutate(activity.source_id)}>Undo</button>}</span></header>{activity.body && <p>{activity.body}</p>}{ccEmails.length > 0 && <p className="sub">CC: {ccEmails.join(", ")}</p>}<small>{activity.actor_name || "System"} · {activity.source === "prospect" ? "Marketing" : humanize(activity.source)}</small></div></article>;
        })}
        {!timelineItems.length && <div className="empty compact">No prospect activity yet.</div>}
        {timelineQuery.hasNextPage && <button type="button" className="btn" disabled={timelineQuery.isFetchingNextPage} onClick={() => void timelineQuery.fetchNextPage()}>{timelineQuery.isFetchingNextPage ? "Loading older activity…" : "Load older activity"}</button>}
      </div></section>
    </main><aside>
       <section className="panel prospectDetailSection"><div className="panel-h"><b>Contact</b></div><div className="panel-b prospectContactFacts"><div><span>Email</span><b>{row.email}</b></div><div><span>Phone</span><a href={`tel:${row.phone}`}>{row.phone}</a></div><div><span>Next follow-up</span><FollowUpCountdown at={row.next_follow_up_at} state={row.follow_up_state} timeZone={firmFollowUpClock.data?.timezone} /></div><div><span>Last activity</span><b>{displayDate(row.last_activity_at ?? row.updated_at, true)}</b></div></div></section>
      <section className="panel prospectDetailSection mt"><div className="panel-h"><b>Communication history</b><span className="sp" /><span className="cellchip c-mut">{emailDrafts.length} emails</span></div><div className="panel-b"><p className="sub" style={{ marginTop: 0 }}>Email delivery, replies, text messages, calls, and appointments now appear in the unified timeline.</p><Link className="btn" href={emailDrafts[0] ? `/inbox?view=marketing&draft_id=${emailDrafts[0].id}` : `/inbox?view=marketing&q=${encodeURIComponent(row.dealer_name)}`}><Mail size={16} /> Open Marketing email log</Link></div></section>
      <section className="panel prospectDetailSection mt"><div className="panel-h"><b>Current state</b></div><div className="panel-b prospectContactFacts"><div><span>Stage</span><b>{row.stage_label ?? humanize(row.stage_key)}</b></div><div><span>Last outcome</span><b>{row.last_outcome_label || "No call logged"}</b></div><div><span>Created</span><b>{displayDate(row.created_at)}</b></div><div><span>SMS marketing consent</span><b>{row.marketing_sms_consent ? "Recorded" : "Not recorded"}</b></div></div></section>
    </aside></div>

    {composerDraft !== undefined && <ProspectEmailComposer prospect={row} initialDraft={composerDraft} onClose={() => setComposerDraft(undefined)} />}
    {composeMode && <InboxComposeModal onClose={() => setComposeMode(null)} seed={seed} initialChannel={composeMode} initialMarketingConsent={row.marketing_sms_consent === true} requireMarketingSmsConsent />}
    {booking && <BookingDrawer prospect={row} triggerOutcomeKey={bookingOutcomeKey} initialNotes={bookingOutcomeKey ? outcomeNote : null} onClose={() => { setBooking(false); setBookingOutcomeKey(null); refresh(); }} onBooked={(_appointment, updated) => { if (updated) qc.setQueryData(["dealer-prospect", id], updated); setOutcomeKey(""); setOutcomeNote(""); setOutcomeAiInstructions(""); setOutcomeCcEmails(updated?.default_cc_emails ?? row.default_cc_emails ?? []); setOutcomeCcScope("this_email"); setSkipEmailDraft(false); setOutcomeStep("note"); setFollowUp(""); setFollowUpChoice("next_business_day"); refresh(); }} initialCompany={row.dealer_name} initialName={row.name} initialEmail={row.email} initialPhone={row.phone} initialKind="program_intro" />}
    {moveStage && <ProspectMoveDialog prospect={row} stages={stages} destination={moveStage} onClose={() => setMoveStage(null)} onConflict={setMoveConflict} onBook={() => { setMoveStage(null); setBooking(true); }} onEmailDraft={(_moved, draft) => setComposerDraft(draft)} onMoved={() => { setMoveStage(null); refresh(); }} />}
  </div>;
}
