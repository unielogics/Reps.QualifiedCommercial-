"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ExternalLink,
  FileInput,
  FileText,
  Flag,
  Link2,
  MessageSquareText,
  RefreshCw,
  Settings2,
  UserRound,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { ChatComposer } from "@/components/ChatComposer";
import {
  appointmentCrmLabel,
  appointmentRsvpLabel,
  appointmentRsvpTone,
  type ApplyAppointmentOutcomeResult,
  type AppointmentActionResult,
  type AppointmentCrmStatus,
  type AppointmentFileOption,
  type AppointmentOutcomeDefinition,
  type AppointmentOutcomeEffect,
  type AppointmentWorkspace,
  type RepAppointment,
  AppointmentPrecallResult,
} from "@/lib/appointments";
import Drawer from "./Drawer";
import { ConversationBubbles } from "./ConversationBubbles";
import type { UnifiedCommunicationThreadDetail } from "@/lib/communications";

type WorkspaceTab = "overview" | "messages" | "notes" | "outcome" | "file" | "manage";
type EditorMode = "details" | "edit" | "reschedule";
type FileAction = "none" | "update_linked" | "link_existing" | "create_ai_intake" | "create_funding_loan" | "promote_draft";

const TAB_ITEMS: Array<{ key: WorkspaceTab; label: string; icon: typeof UserRound }> = [
  { key: "overview", label: "Overview", icon: UserRound },
  { key: "messages", label: "Messages", icon: MessageSquareText },
  { key: "notes", label: "Notes", icon: MessageSquareText },
  { key: "outcome", label: "Outcome", icon: Flag },
  { key: "file", label: "File", icon: FileText },
  { key: "manage", label: "Manage", icon: Settings2 },
];

const DOCUMENT_OPTIONS = [
  ["tax_returns", "Business tax returns"],
  ["profit_and_loss", "Current year P&L"],
  ["bank_statements", "Recent bank statements"],
  ["debt_schedule", "Business debt schedule"],
  ["entity_documents", "Entity documents"],
] as const;

const FUNDING_APP_URL = process.env.NEXT_PUBLIC_FUNDING_APP_URL ?? "https://app.qualifiedcommercial.com";

function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.body && typeof error.body === "object" && "detail" in error.body) {
    const detail = (error.body as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const messages = detail.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const message = (item as { msg?: unknown }).msg;
        return typeof message === "string" ? [message] : [];
      });
      if (messages.length) return messages.join("; ");
    }
  }
  return error instanceof Error ? error.message : fallback;
}

function formatWhen(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function localInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function money(value: number | string | null): string {
  if (value == null || value === "") return "Not provided";
  if (typeof value === "string") return value;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function statusClass(value: string): string {
  if (["completed", "converted", "confirmed", "sent", "connected", "accepted"].includes(value)) return "c-ok";
  if (["failed", "cancelled", "declined", "not_qualified"].includes(value)) return "c-bad";
  if (["pending", "needs_action", "follow_up", "no_show"].includes(value)) return "c-warn";
  return "c-mut";
}

function actionHref(href: string): string {
  if (href.startsWith("/admin/") || href.startsWith("/loans/")) return `${FUNDING_APP_URL}${href}`;
  return href;
}

function createIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `outcome-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function AppointmentCrmWorkspace({
  appointmentId,
  onClose,
  onChanged,
  onOpenEditor,
}: {
  appointmentId: string;
  onClose: () => void;
  onChanged: () => void;
  onOpenEditor: (appointment: RepAppointment, mode: EditorMode) => void;
}) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<WorkspaceTab>("overview");

  const callApi = async <T,>(path: string, init: RequestInit = {}) => api<T>(path, {
    ...init,
    authToken: (await getToken()) ?? undefined,
  });

  const workspace = useQuery({
    queryKey: ["appointment-crm-workspace", appointmentId],
    queryFn: () => callApi<AppointmentWorkspace>(`/dealer-os/appointments/${appointmentId}/workspace`),
    retry: false,
  });
  const outcomes = useQuery({
    queryKey: ["shared-appointment-outcomes"],
    queryFn: () => callApi<AppointmentOutcomeDefinition[]>("/calendar/outcomes"),
    enabled: Boolean(workspace.data?.capabilities.can_manage_outcomes),
  });

  const tabs = useMemo(() => TAB_ITEMS.filter((item) => {
    const capabilities = workspace.data?.capabilities;
    if (!capabilities) return item.key === "overview";
    // Nothing to show without a number to text.
    if (item.key === "messages") return Boolean(workspace.data?.appointment.invitee_phone);
    if (item.key === "notes") return capabilities.can_add_notes;
    if (item.key === "outcome") return capabilities.can_manage_outcomes;
    if (item.key === "file") return capabilities.can_link_files || capabilities.can_start_application;
    if (item.key === "manage") return capabilities.can_edit || capabilities.can_manage_crm || capabilities.can_retry_delivery;
    return true;
  }), [workspace.data?.capabilities]);

  useEffect(() => {
    if (!tabs.some((item) => item.key === tab)) setTab("overview");
  }, [tab, tabs]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["appointment-crm-workspace", appointmentId] }),
      queryClient.invalidateQueries({ queryKey: ["rep-appointments"] }),
    ]);
    onChanged();
  };

  const appointment = workspace.data?.appointment;
  return (
    <Drawer
      title={appointment?.title ?? "Appointment CRM"}
      width={1600}
      variant="workspace"
      dismissOnBackdrop={false}
      bodyClassName="appointmentCrmModalBody"
      onClose={onClose}
    >
      {workspace.isLoading ? <div className="appointmentCrmLoading"><RefreshCw className="spin" />Loading appointment CRM...</div> : null}
      {workspace.isError ? <div className="appointmentCrmError"><AlertTriangle />{errorText(workspace.error, "The appointment CRM could not be loaded.")}</div> : null}
      {workspace.data ? (
        <div className="appointmentCrmWorkspace">
          <header className="appointmentCrmSummary">
            <div>
              <span className="lbl">{formatWhen(workspace.data.appointment.starts_at)}</span>
              <b>{workspace.data.appointment.invitee_name}</b>
              <small>{[workspace.data.appointment.company, workspace.data.appointment.booked_by_name].filter(Boolean).join(" · ") || "Appointment relationship"}</small>
            </div>
            <span className={`cellchip ${appointmentRsvpTone(workspace.data.appointment)}`}>{appointmentRsvpLabel(workspace.data.appointment)}</span>
            <span className={`cellchip ${statusClass(workspace.data.appointment.crm_status)}`}>{appointmentCrmLabel(workspace.data.appointment.crm_status)}</span>
            {workspace.data.appointment.origin ? <span className="cellchip c-mut" title="Where this booking came from">{workspace.data.appointment.origin === "field_desk" ? "Field desk" : workspace.data.appointment.origin === "calendar" ? "Calendar" : workspace.data.appointment.origin === "public" ? "Public page" : workspace.data.appointment.origin}</span> : null}
            {workspace.data.appointment.join_url ? <a className="btn pri" href={workspace.data.appointment.join_url} target="_blank" rel="noreferrer"><ExternalLink size={16} />Join</a> : null}
          </header>
          <nav className="appointmentCrmTabs" aria-label="Appointment CRM sections">
            {tabs.map(({ key, label, icon: TabIcon }) => (
              <button key={key} type="button" className={tab === key ? "on" : ""} onClick={() => setTab(key)}>
                <TabIcon size={17} />{label}
              </button>
            ))}
          </nav>
          <main className="appointmentCrmContent">
            {tab === "overview" ? <Overview workspace={workspace.data} onTab={setTab} callApi={callApi} refresh={refresh} /> : null}
            {tab === "messages" ? <Messages workspace={workspace.data} callApi={callApi} /> : null}
            {tab === "notes" ? <Notes workspace={workspace.data} callApi={callApi} refresh={refresh} /> : null}
            {tab === "outcome" ? <Outcome workspace={workspace.data} outcomes={outcomes.data ?? []} callApi={callApi} refresh={refresh} onFile={() => setTab("file")} /> : null}
            {tab === "file" ? <FileWorkspace workspace={workspace.data} callApi={callApi} refresh={refresh} onOutcome={() => setTab("outcome")} /> : null}
            {tab === "manage" ? <Manage workspace={workspace.data} callApi={callApi} refresh={refresh} onOpenEditor={onOpenEditor} onClose={onClose} /> : null}
          </main>
        </div>
      ) : null}
    </Drawer>
  );
}

function Overview({ workspace, onTab, callApi, refresh }: { workspace: AppointmentWorkspace; onTab: (tab: WorkspaceTab) => void; callApi: ApiCaller; refresh: () => Promise<void> }) {
  const appointment = workspace.appointment;
  return (
    <div className="appointmentCrmOverview">
      <section className="panel">
        <div className="panel-h"><b>Meeting and relationship</b></div>
        <div className="panel-b appointmentCrmDetails">
          <Detail label="Attendee" value={appointment.invitee_name} />
          <Detail label="Company" value={appointment.company} />
          <Detail label="Email" value={appointment.invitee_email} />
          <Detail label="Phone" value={appointment.invitee_phone} />
          <Detail label="Program" value={appointment.program_name} />
          <Detail label="Requested" value={appointment.requested_amount} />
          <Detail label="Assigned rep" value={appointment.booked_by_name || appointment.owner_name} />
          <Detail label="Meeting mode" value={appointment.meeting_mode?.replaceAll("_", " ")} />
          <Detail label="Location" value={appointment.location} />
          <Detail label="Address" value={appointment.full_address} wide />
          <Detail label="Booking notes" value={appointment.notes} wide />
        </div>
      </section>
      <aside className="appointmentCrmOverviewAside">
        <section className="panel">
          <div className="panel-h"><b>Delivery and status</b></div>
          <div className="panel-b appointmentCrmStatusList">
            <Status label="CRM" value={appointmentCrmLabel(appointment.crm_status)} raw={appointment.crm_status} />
            <Status label="Client RSVP" value={appointmentRsvpLabel(appointment)} raw={appointment.client_rsvp_status} />
            <Status label="Google" value={appointment.google_sync_status || "Unavailable"} raw={appointment.google_sync_status || ""} />
            <Status label="Email" value={appointment.confirmation_email_status || "Not sent"} raw={appointment.confirmation_email_status || ""} />
            <Status label="SMS" value={appointment.confirmation_sms_status || "Not sent"} raw={appointment.confirmation_sms_status || ""} />
            <DeliveryTrouble
              appointment={appointment}
              canRetry={workspace.capabilities.can_retry_delivery}
              callApi={callApi}
              refresh={refresh}
            />
          </div>
        </section>
        {appointment.precall ? <PrecallPanel workspace={workspace} callApi={callApi} refresh={refresh} /> : null}
        <section className="panel">
          <div className="panel-h"><b>Linked file</b><span className="sp" />{workspace.capabilities.can_link_files ? <button className="btn sm" type="button" onClick={() => onTab("file")}>Manage</button> : null}</div>
          <div className="panel-b">
            {workspace.draft_file ? <LinkedSummary label={workspace.draft_file.lifecycle === "draft" ? "Draft file" : "Dealer file"} title={workspace.draft_file.name} detail={[workspace.draft_file.case_ref, workspace.draft_file.draft_source === "booking" ? "opened by this booking" : null].filter(Boolean).join(" · ")} /> : null}
            {workspace.application ? <LinkedSummary label="AI Intake" title={workspace.application.vertical.replaceAll("_", " ")} detail={workspace.application.underwriting_status.replaceAll("_", " ")} /> : null}
            {workspace.funding_file ? <LinkedSummary label="Funding file" title={workspace.funding_file.entity_name || workspace.funding_file.deal_id} detail={`${workspace.funding_file.stage.replaceAll("_", " ")} · ${money(workspace.funding_file.amount)}`} /> : null}
            {!workspace.application && !workspace.funding_file && !workspace.draft_file ? <span className="sub">No file is linked to this appointment.</span> : null}
          </div>
        </section>
        <section className="panel">
          <div className="panel-h"><b>Recent activity</b><span className="sp" />{workspace.capabilities.can_add_notes ? <button className="btn sm" type="button" onClick={() => onTab("notes")}>Open notes</button> : null}</div>
          <div className="panel-b"><ActivityList rows={workspace.activities.slice(0, 5)} /></div>
        </section>
      </aside>
    </div>
  );
}

function Messages({
  workspace,
  callApi,
}: {
  workspace: AppointmentWorkspace;
  callApi: <T,>(path: string, init?: RequestInit) => Promise<T>;
}) {
  const appointment = workspace.appointment;
  const phone = appointment.invitee_phone ?? "";
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  // Addressed by number, not by any stored thread id. The backend normalizes
  // the number and resolves this whether or not the person has ever been
  // texted, so a first message from an appointment works like any other.
  const threadId = `sms:phone:${phone}`;
  const key = ["appointment-sms", phone];

  const thread = useQuery({
    queryKey: key,
    queryFn: () => callApi<UnifiedCommunicationThreadDetail>(`/communications/threads/${threadId}`),
    enabled: Boolean(phone),
    refetchOnWindowFocus: true,
  });

  const send = useMutation({
    mutationFn: () =>
      callApi<UnifiedCommunicationThreadDetail>(`/communications/threads/${threadId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: draft.trim() }),
      }),
    onSuccess: (data) => {
      qc.setQueryData(key, data);
      setDraft("");
      setError("");
      // The same conversation is on the inbox screen; keep it in step.
      void qc.invalidateQueries({ queryKey: ["inbox-contacts"] });
    },
    onError: (reason) =>
      // Carries the real reason — an opted-out number is refused here with the
      // same message the rest of the system gives.
      setError(errorText(reason, "That message could not be sent.")),
  });

  return (
    <div className="appointmentCrmMessages">
      <section className="panel">
        <div className="panel-h">
          <b>Text messages</b>
          <span className="sp" />
          <span className="cellchip c-mut">{appointment.invitee_phone}</span>
        </div>
        <div className="panel-b">
          <ConversationBubbles
            messages={thread.data?.messages ?? []}
            isLoading={thread.isLoading}
            isError={thread.isError}
            counterpartName={appointment.invitee_name}
            emptyLabel="No texts with this number yet. The first one starts the conversation."
          />
          {/* No paperclip: outbound SMS on the handset relay is text only —
              the gateway's send API carries no media field. */}
          <ChatComposer
            value={draft}
            onChange={setDraft}
            onSend={() => send.mutate()}
            sending={send.isPending}
            placeholder={`Text ${appointment.invitee_name || "the client"}...`}
            sendLabel={`Send a text to ${appointment.invitee_name || "the client"}`}
            error={error || null}
            hint="Goes out on the number above and lands in the inbox with this contact. Enter sends, Shift + Enter adds a line."
          />
        </div>
      </section>
    </div>
  );
}


function Notes({ workspace, callApi, refresh }: { workspace: AppointmentWorkspace; callApi: ApiCaller; refresh: () => Promise<void> }) {
  const [body, setBody] = useState("");
  const save = useMutation({
    mutationFn: () => callApi(`/dealer-os/appointments/${workspace.appointment.id}/notes`, { method: "POST", body: JSON.stringify({ body: body.trim() }) }),
    onSuccess: async () => { setBody(""); await refresh(); },
  });
  const snippets = [
    "Client confirmed financing goals and timeline.",
    "Reviewed current documents and identified missing evidence.",
    "Discussed preliminary structure; no commitment was made.",
    "Follow-up required before underwriting can proceed.",
  ];
  return (
    <div className="appointmentCrmTwoColumns">
      <section className="panel">
        <div className="panel-h"><b>Add internal meeting note</b></div>
        <div className="panel-b appointmentCrmForm">
          <div className="appointmentCrmSnippets">{snippets.map((snippet) => <button type="button" key={snippet} onClick={() => setBody((current) => current ? `${current}\n${snippet}` : snippet)}>{snippet}</button>)}</div>
          <label><span className="lbl">Note</span><textarea className="field" rows={9} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Record facts, decisions, risks, and the agreed next step" /></label>
          <button className="btn pri" type="button" disabled={!body.trim() || save.isPending} onClick={() => save.mutate()}><MessageSquareText size={16} />{save.isPending ? "Saving..." : "Add note"}</button>
          {save.isError ? <div className="appointmentCrmInlineError">{errorText(save.error, "The note could not be saved.")}</div> : null}
        </div>
      </section>
      <section className="panel">
        <div className="panel-h"><b>Chronological appointment history</b></div>
        <div className="panel-b"><ActivityList rows={workspace.activities} /></div>
      </section>
    </div>
  );
}

function Outcome({
  workspace,
  outcomes,
  callApi,
  refresh,
  onFile,
}: {
  workspace: AppointmentWorkspace;
  outcomes: AppointmentOutcomeDefinition[];
  callApi: ApiCaller;
  refresh: () => Promise<void>;
  onFile: () => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [note, setNote] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [fileAction, setFileAction] = useState<FileAction>(workspace.application || workspace.funding_file ? "update_linked" : "none");
  const [existingFile, setExistingFile] = useState<AppointmentFileOption | null>(null);
  const [variant, setVariant] = useState<"dealer" | "real_estate" | "main_street" | "mca_refinance">("dealer");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [notifyClient, setNotifyClient] = useState(false);
  const [applyBookingData, setApplyBookingData] = useState(false);
  const [documents, setDocuments] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const [result, setResult] = useState<ApplyAppointmentOutcomeResult | null>(null);
  const selected = outcomes.find((item) => item.id === selectedId) ?? null;
  const effects = new Set<AppointmentOutcomeEffect>(selected?.effects ?? []);

  useEffect(() => {
    if (!selected && outcomes.length) setSelectedId(outcomes[0].id);
  }, [outcomes, selected]);

  const apply = useMutation({
    mutationFn: () => callApi<ApplyAppointmentOutcomeResult>(`/dealer-os/appointments/${workspace.appointment.id}/apply-outcome`, {
      method: "POST",
      body: JSON.stringify({
        outcome_definition_id: selectedId,
        note: note.trim() || null,
        follow_up_at: followUpAt ? new Date(followUpAt).toISOString() : null,
        idempotency_key: idempotencyKey,
        confirm: confirmed,
        file_action: fileAction,
        existing_file_kind: existingFile?.kind ?? null,
        existing_file_id: existingFile?.id ?? null,
        variant,
        secure_room_pin: pin || null,
        notify_client: notifyClient,
        apply_booking_data: applyBookingData,
        requested_document_keys: documents,
      }),
    }),
    onSuccess: async (next) => {
      setResult(next);
      setIdempotencyKey(createIdempotencyKey());
      await refresh();
    },
  });

  const needsConfirmation = effects.has("file_action") || effects.has("close_enquiry");
  const fileReady = !effects.has("file_action") || (fileAction !== "none" && (fileAction !== "link_existing" || Boolean(existingFile)));
  const pinReady = fileAction !== "create_ai_intake" || (/^\d{6}$/.test(pin) && pin === pinConfirm);
  const ready = Boolean(selected && fileReady && pinReady && (!effects.has("schedule_follow_up") || followUpAt) && (!needsConfirmation || (confirmed && note.trim())));

  return (
    <div className="appointmentCrmOutcome">
      <section className="panel">
        <div className="panel-h"><b>Shared outcome catalog</b></div>
        <div className="appointmentCrmOutcomeList">
          {outcomes.map((item) => <button key={item.id} type="button" className={selectedId === item.id ? "on" : ""} onClick={() => { setSelectedId(item.id); setResult(null); }}><i className={`appointmentOutcomeDot ${item.color}`} /><span><b>{item.name}</b><small>{item.description}</small></span><span className={`cellchip ${statusClass(item.target_crm_status)}`}>{appointmentCrmLabel(item.target_crm_status)}</span></button>)}
          {!outcomes.length ? <div className="appointmentCrmEmpty">No active shared outcomes are available.</div> : null}
        </div>
      </section>
      {selected ? (
        <section className="panel">
          <div className="panel-h"><b>Reviewed action</b></div>
          <div className="panel-b appointmentCrmForm">
            <label><span className="lbl">Meeting notes{needsConfirmation ? " *" : ""}</span><textarea className="field" rows={5} value={note} onChange={(event) => setNote(event.target.value)} /></label>
            {effects.has("schedule_follow_up") ? <label><span className="lbl">Follow-up date and time *</span><input className="field" type="datetime-local" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} /></label> : null}
            {effects.has("file_action") ? (
              <>
                <label><span className="lbl">File action *</span><select className="field" value={fileAction} onChange={(event) => { setFileAction(event.target.value as FileAction); setExistingFile(null); }}><option value="none">Choose an action</option>{workspace.draft_file && workspace.draft_file.lifecycle === "draft" ? <option value="promote_draft">Promote draft file{workspace.draft_file.case_ref ? ` ${workspace.draft_file.case_ref}` : ""}</option> : null}{workspace.application || workspace.funding_file ? <option value="update_linked">Update linked file</option> : null}<option value="link_existing">Link an existing file</option><option value="create_ai_intake">Create AI Intake</option>{workspace.capabilities.can_create_funding_loan ? <option value="create_funding_loan">Create Funding file</option> : null}</select></label>
                {fileAction === "link_existing" ? <FilePicker appointmentId={workspace.appointment.id} value={existingFile} onChange={setExistingFile} /> : null}
                {fileAction === "create_ai_intake" ? <div className="appointmentCrmFieldGrid"><label><span className="lbl">Intake type</span><select className="field" value={variant} onChange={(event) => setVariant(event.target.value as typeof variant)}><option value="dealer">Dealer</option><option value="real_estate">Real estate</option><option value="main_street">Main Street</option><option value="mca_refinance">MCA refinance</option></select></label><label><span className="lbl">Six-digit room PIN</span><input className="field" inputMode="numeric" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label><label><span className="lbl">Confirm PIN</span><input className="field" inputMode="numeric" maxLength={6} value={pinConfirm} onChange={(event) => setPinConfirm(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label><CheckRow checked={notifyClient} onChange={setNotifyClient} label="Notify the client with room access instructions" /></div> : null}
                {fileAction !== "none" ? <CheckRow checked={applyBookingData} onChange={setApplyBookingData} label="Apply the reviewed booking data to the destination file" /> : null}
              </>
            ) : null}
            {effects.has("request_documents") ? <div><span className="lbl">Documents to request</span><div className="appointmentCrmChecks">{DOCUMENT_OPTIONS.map(([key, label]) => <CheckRow key={key} checked={documents.includes(key)} onChange={(checked) => setDocuments((current) => checked ? [...current, key] : current.filter((item) => item !== key))} label={label} />)}</div></div> : null}
            <div className="appointmentCrmPreview"><span className="lbl">Action preview</span><div>{selected.effects.map((effect) => <span key={effect} className="cellchip c-mut">{effect.replaceAll("_", " ")}</span>)}</div><p>CRM becomes <b>{appointmentCrmLabel(selected.target_crm_status)}</b>. Each external action reports its own result.</p></div>
            {needsConfirmation ? <CheckRow checked={confirmed} onChange={setConfirmed} label="I reviewed the notes, destination, and proposed changes" emphasized /> : null}
            <button className="btn pri" type="button" disabled={!ready || apply.isPending} onClick={() => apply.mutate()}><Check size={16} />{apply.isPending ? "Applying..." : "Apply outcome"}</button>
            {apply.isError ? <div className="appointmentCrmInlineError">{errorText(apply.error, "The outcome could not be applied.")}</div> : null}
          </div>
        </section>
      ) : null}
      {result ? <ActionResults result={result.actions} label={result.outcome_label} onFile={workspace.application || workspace.funding_file ? onFile : undefined} /> : null}
    </div>
  );
}

function FileWorkspace({ workspace, callApi, refresh, onOutcome }: { workspace: AppointmentWorkspace; callApi: ApiCaller; refresh: () => Promise<void>; onOutcome: () => void }) {
  const [selected, setSelected] = useState<AppointmentFileOption | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const link = useMutation({
    mutationFn: () => callApi(`/dealer-os/appointments/${workspace.appointment.id}/file-link`, { method: "PATCH", body: JSON.stringify({ kind: selected?.kind, file_id: selected?.id, confirm: confirmed }) }),
    onSuccess: async () => { setSelected(null); setConfirmed(false); await refresh(); },
  });
  return (
    <div className="appointmentCrmFileGrid">
      <section className="panel appointmentCrmFileHero">
        <div className="panel-h"><b>Linked file</b></div>
        <div className="panel-b">
          {workspace.draft_file ? <LinkedFile label={workspace.draft_file.lifecycle === "draft" ? "Draft file (opened by this booking)" : "Dealer file"} title={workspace.draft_file.name} detail={workspace.draft_file.case_ref || workspace.draft_file.status} href={workspace.draft_file.href} /> : null}
          {workspace.application ? <LinkedFile label="AI Intake" title={workspace.application.vertical.replaceAll("_", " ")} detail={workspace.application.underwriting_status.replaceAll("_", " ")} href={`${FUNDING_APP_URL}/admin/ai-underwriter-leads?lead=${workspace.application.intake_id}&view=underwriting`} /> : null}
          {workspace.funding_file ? <LinkedFile label="Funding file" title={workspace.funding_file.entity_name || workspace.funding_file.deal_id} detail={`${workspace.funding_file.stage.replaceAll("_", " ")} · ${money(workspace.funding_file.amount)}`} href={`${FUNDING_APP_URL}/loans/${workspace.funding_file.loan_id}`} /> : null}
          {!workspace.application && !workspace.funding_file && !workspace.draft_file ? <div className="appointmentCrmEmpty">No file is linked. Use a reviewed Qualified outcome to create one, or search below.</div> : null}
        </div>
      </section>
      <section className="panel">
        <div className="panel-h"><b>Booking data review</b><span className="sp" /><button className="btn sm" type="button" onClick={onOutcome}>Review outcome</button></div>
        <div className="panel-b appointmentCrmDiffs">{workspace.booking_data_review.map((item) => <div key={item.field}><header><span className="lbl">{item.label}</span><span className={`cellchip ${item.status === "matches" ? "c-ok" : item.status === "conflict" ? "c-bad" : "c-warn"}`}>{item.status.replaceAll("_", " ")}</span></header><small>Current file</small><b>{item.current_value || "Not set"}</b><small>Appointment</small><b>{item.proposed_value || "Not provided"}</b></div>)}</div>
      </section>
      <section className="panel">
        <div className="panel-h"><b>Link an existing file</b></div>
        <div className="panel-b appointmentCrmForm">
          <FilePicker appointmentId={workspace.appointment.id} value={selected} onChange={(item) => { setSelected(item); setConfirmed(false); }} />
          {selected ? <CheckRow checked={confirmed} onChange={setConfirmed} label={`Link exactly to ${selected.label}`} emphasized /> : null}
          <button className="btn pri" type="button" disabled={!selected || !confirmed || link.isPending} onClick={() => link.mutate()}><Link2 size={16} />{link.isPending ? "Linking..." : "Link selected file"}</button>
          {link.isError ? <div className="appointmentCrmInlineError">{errorText(link.error, "The file could not be linked.")}</div> : null}
        </div>
      </section>
    </div>
  );
}

function Manage({ workspace, callApi, refresh, onOpenEditor, onClose }: { workspace: AppointmentWorkspace; callApi: ApiCaller; refresh: () => Promise<void>; onOpenEditor: (appointment: RepAppointment, mode: EditorMode) => void; onClose: () => void }) {
  const appointment = workspace.appointment;
  const [status, setStatus] = useState<AppointmentCrmStatus>(appointment.crm_status);
  const [followUpAt, setFollowUpAt] = useState(localInput(appointment.follow_up_at));
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const crm = useMutation({
    mutationFn: () => callApi(`/dealer-os/appointments/${appointment.id}/crm`, { method: "PATCH", body: JSON.stringify({ status, follow_up_at: followUpAt ? new Date(followUpAt).toISOString() : null, reason: reason.trim() || null, confirm_terminal: confirmed }) }),
    onSuccess: refresh,
  });
  const retry = useMutation({
    mutationFn: (action: "google_sync" | "email_confirmation" | "sms_confirmation") => callApi<{ action: string; status: string; detail: string | null }>(`/dealer-os/appointments/${appointment.id}/delivery/retry`, { method: "POST", body: JSON.stringify({ action }) }),
    onSuccess: refresh,
  });
  const immutable = appointment.crm_status === "converted" || appointment.crm_status === "cancelled";
  const terminal = status === "cancelled" || status === "not_qualified" || appointment.crm_status === "not_qualified";
  const ready = status !== "follow_up" || Boolean(followUpAt);
  return (
    <div className="appointmentCrmManageGrid">
      <section className="panel">
        <div className="panel-h"><b>CRM state</b></div>
        <div className="panel-b appointmentCrmForm">
          <label><span className="lbl">Status</span><select className="field" value={status} disabled={immutable} onChange={(event) => { setStatus(event.target.value as AppointmentCrmStatus); setConfirmed(false); }}><option value="scheduled">Scheduled</option><option value="confirmed">Confirmed</option><option value="completed">Completed</option><option value="follow_up">Follow-up</option><option value="no_show">No-show</option><option value="not_qualified">Not qualified</option><option value="converted" disabled>Converted</option><option value="cancelled">Cancelled</option></select></label>
          {immutable ? <div className="appointmentCrmInlineInfo">{appointment.crm_status === "converted" ? "Converted appointments keep their linked application and cannot be reopened." : "Cancelled meetings stay closed. Create or reschedule a new appointment instead."}</div> : null}
          {status === "follow_up" ? <label><span className="lbl">Follow-up date and time</span><input className="field" type="datetime-local" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} /></label> : null}
          {terminal ? <><label><span className="lbl">Reviewed reason</span><textarea className="field" rows={4} value={reason} onChange={(event) => setReason(event.target.value)} /></label><CheckRow checked={confirmed} onChange={setConfirmed} label="Confirm this terminal or reopen change" emphasized /></> : null}
          <button className="btn pri" type="button" disabled={immutable || !ready || (terminal && (!confirmed || !reason.trim())) || crm.isPending} onClick={() => crm.mutate()}><Check size={16} />{crm.isPending ? "Saving..." : "Update CRM state"}</button>
          {crm.isError ? <div className="appointmentCrmInlineError">{errorText(crm.error, "The CRM state could not be updated.")}</div> : null}
        </div>
      </section>
      <section className="panel">
        <div className="panel-h"><b>Appointment management</b></div>
        <div className="panel-b appointmentCrmCommandList">
          <button type="button" onClick={() => onOpenEditor(appointment, "edit")}><FileInput /><span><b>Edit appointment</b><small>Change client, program, location, notes, or meeting details.</small></span></button>
          <button type="button" onClick={() => onOpenEditor(appointment, "reschedule")}><CalendarClock /><span><b>Reschedule</b><small>Recheck availability and send the updated invitation.</small></span></button>
          {appointment.join_url ? <a href={appointment.join_url} target="_blank" rel="noreferrer"><ExternalLink /><span><b>Join meeting</b><small>Open the current meeting link.</small></span></a> : null}
          <button type="button" onClick={onClose}><UserRound /><span><b>Return to calendar</b><small>Close this workspace without changing the appointment.</small></span></button>
        </div>
      </section>
      <section className="panel">
        <div className="panel-h"><b>Delivery recovery</b></div>
        <div className="panel-b appointmentCrmForm">
          <p className="sub">Retry only the failed or stale channel. Appointment data and recorded outcomes remain intact.</p>
          <div className="appointmentCrmDeliveryButtons"><button className="btn" type="button" disabled={retry.isPending} onClick={() => retry.mutate("google_sync")}><RefreshCw size={15} />Google</button><button className="btn" type="button" disabled={retry.isPending} onClick={() => retry.mutate("email_confirmation")}><RefreshCw size={15} />Email</button><button className="btn" type="button" disabled={retry.isPending} onClick={() => retry.mutate("sms_confirmation")}><RefreshCw size={15} />SMS</button></div>
          {retry.data ? <div className={retry.data.status === "failed" ? "appointmentCrmInlineError" : "appointmentCrmInlineSuccess"}>{retry.data.action.replaceAll("_", " ")}: {retry.data.detail || retry.data.status}</div> : null}
          {retry.isError ? <div className="appointmentCrmInlineError">{errorText(retry.error, "Delivery could not be retried.")}</div> : null}
        </div>
      </section>
    </div>
  );
}

type ApiCaller = <T>(path: string, init?: RequestInit) => Promise<T>;

function FilePicker({ appointmentId, value, onChange }: { appointmentId: string; value: AppointmentFileOption | null; onChange: (value: AppointmentFileOption | null) => void }) {
  const { getToken } = useAuth();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const files = useQuery({
    queryKey: ["appointment-file-options", appointmentId, deferredQuery],
    queryFn: async () => api<{ items: AppointmentFileOption[] }>(`/dealer-os/appointments/${appointmentId}/file-options?q=${encodeURIComponent(deferredQuery.trim())}&limit=50`, { authToken: (await getToken()) ?? undefined }),
    staleTime: 20_000,
  });
  return (
    <div className="appointmentCrmFilePicker">
      <label><span className="lbl">Authorized file search</span><input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Person, company, contact, QC reference, or file ID" /></label>
      {value ? <div className="appointmentCrmSelectedFile"><FileText /><span><b>{value.label}</b><small>{value.subtitle}</small></span><button type="button" className="btn sm" onClick={() => onChange(null)}>Clear</button></div> : null}
      <div className="appointmentCrmFileResults">{(files.data?.items ?? []).slice(0, 12).map((item) => <button key={`${item.kind}:${item.id}`} type="button" className={value?.id === item.id ? "on" : ""} onClick={() => onChange(item)}><span className="cellchip c-mut">{item.kind === "intake" ? "AI Intake" : "Funding"}</span><span><b>{item.label}</b><small>{[item.subtitle, item.status.replaceAll("_", " ")].filter(Boolean).join(" · ")}</small></span></button>)}</div>
    </div>
  );
}

function ActionResults({ result, label, onFile }: { result: AppointmentActionResult[]; label: string; onFile?: () => void }) {
  return <section className="panel appointmentCrmResults"><div className="panel-h"><b>Action results</b><span className="sp" /><span className={`cellchip ${result.some((item) => item.status === "failed") ? "c-warn" : "c-ok"}`}>{label}</span></div><div className="panel-b">{result.map((item) => <div key={item.action}><span className={`appointmentCrmResultIcon ${item.status}`} >{item.status === "completed" ? <Check /> : <AlertTriangle />}</span><span><b>{item.action.replaceAll("_", " ")}</b><small>{item.detail}</small></span><span className={`cellchip ${statusClass(item.status)}`}>{item.status}</span>{item.href ? <a href={actionHref(item.href)} target={item.href.startsWith("/admin/") || item.href.startsWith("/loans/") ? "_blank" : undefined} rel="noreferrer">Open</a> : null}</div>)}{onFile ? <button className="btn" type="button" onClick={onFile}>Review linked file</button> : null}</div></section>;
}

function ActivityList({ rows }: { rows: AppointmentWorkspace["activities"] }) {
  if (!rows.length) return <div className="appointmentCrmEmpty">No appointment activity has been recorded.</div>;
  return <div className="appointmentCrmActivity">{rows.map((row) => <div key={row.id}><span>{row.event_type.includes("outcome") ? <Flag /> : row.event_type.includes("note") ? <MessageSquareText /> : <CalendarClock />}</span><div><b>{row.event_type.replaceAll("_", " ")}</b><p>{row.body || "Activity recorded"}</p><small>{row.actor_name} · {formatWhen(row.created_at)}</small></div></div>)}</div>;
}

function Detail({ label, value, wide = false }: { label: string; value: string | null | undefined; wide?: boolean }) {
  return <div className={wide ? "wide" : undefined}><span className="lbl">{label}</span><b>{value || "Not provided"}</b></div>;
}

/** When a delivery failed, and what to do about it.
 *
 * A stored failure outlives its cause: a provider swap left appointments
 * reading "Configured but SMS_PRODUCTION is disabled" a day after it was
 * re-enabled, with no hint the message was old and no way to act from the panel
 * showing it. So the reason is dated, and retry lives here rather than only
 * under Manage.
 */
function DeliveryTrouble({
  appointment,
  canRetry,
  callApi,
  refresh,
}: {
  appointment: RepAppointment;
  canRetry: boolean;
  callApi: ApiCaller;
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const failed: Array<{ action: "email_confirmation" | "sms_confirmation"; label: string }> = [
    ...(appointment.confirmation_email_status === "failed"
      ? [{ action: "email_confirmation" as const, label: "email" }]
      : []),
    ...(appointment.confirmation_sms_status === "failed"
      ? [{ action: "sms_confirmation" as const, label: "text" }]
      : []),
  ];

  if (!appointment.delivery_error && !failed.length) return null;

  // A malformed address fails at the provider with a generic error. Say what is
  // actually wrong, since the fix is to edit the appointment, not to retry.
  const email = appointment.invitee_email ?? "";
  const emailLooksInvalid = Boolean(email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const retryAll = async () => {
    setBusy(true);
    setError("");
    const problems: string[] = [];
    // Sequential, and each failure is collected rather than thrown: one channel
    // refusing should not stop the other from being retried.
    for (const item of failed) {
      try {
        await callApi(`/dealer-os/appointments/${appointment.id}/delivery/retry`, {
          method: "POST",
          body: JSON.stringify({ action: item.action }),
        });
      } catch (reason) {
        problems.push(`${item.label}: ${errorText(reason, "could not be retried")}`);
      }
    }
    await refresh();
    setBusy(false);
    if (problems.length) setError(problems.join(" · "));
  };

  return (
    <div className="appointmentCrmDelivery">
      {appointment.delivery_error ? (
        <div className="appointmentCrmInlineError">
          <span>{appointment.delivery_error}</span>
          {appointment.delivery_error_at ? (
            <small>Recorded {whenLabel(appointment.delivery_error_at)}</small>
          ) : null}
        </div>
      ) : null}
      {emailLooksInvalid ? (
        <div className="appointmentCrmInlineInfo">
          <b>{email}</b> is not a valid email address, so nothing can be delivered to it.
          Correct it under Manage &rarr; Edit appointment.
        </div>
      ) : null}
      {canRetry && failed.length ? (
        <div className="row">
          <button className="btn sm" type="button" disabled={busy} onClick={retryAll}>
            <RefreshCw size={14} />
            {busy
              ? "Retrying..."
              : failed.length > 1
                ? "Retry all failed"
                : `Retry ${failed[0].label}`}
          </button>
        </div>
      ) : null}
      {error ? <div className="appointmentCrmInlineError">{error}</div> : null}
    </div>
  );
}

/** "yesterday, 7:38 PM" — enough to tell a live failure from an old one. */
function whenLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (date.toDateString() === today.toDateString()) return `today, ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `yesterday, ${time}`;
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
}


function PrecallPanel({ workspace, callApi, refresh }: { workspace: AppointmentWorkspace; callApi: ApiCaller; refresh: () => Promise<void> }) {
  const precall = workspace.appointment.precall!;
  const ready = precall.readiness;
  const canManage = workspace.capabilities.can_manage_precall;
  const [result, setResult] = useState<AppointmentPrecallResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const act = useMutation({
    mutationFn: (body: { action: "resend" | "rotate_pin" | "stop" | "resume"; channel?: "email" | "sms" | "both" }) =>
      callApi<AppointmentPrecallResult>(`/dealer-os/appointments/${workspace.appointment.id}/precall`, { method: "POST", body: JSON.stringify({ channel: "both", ...body }) }),
    onSuccess: async (next) => { setResult(next); await refresh(); },
  });
  const copy = async (label: string, value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(label); window.setTimeout(() => setCopied(null), 1600); } catch { /* clipboard unavailable */ }
  };
  const tone = precall.status === "complete" ? "c-ok" : precall.status === "stopped" ? "c-warn" : precall.status === "disabled" ? "c-mut" : "c-acc";
  const label = precall.status === "complete" ? "Complete" : precall.status === "stopped" ? `Stopped${precall.stop_reason ? ` · ${precall.stop_reason.replaceAll("_", " ")}` : ""}` : precall.status === "disabled" ? "Off" : ready ? `${ready.done_count} of 3 done` : "In progress";
  const steps = precall.steps ?? [];
  return (
    <section className="panel">
      <div className="panel-h"><b>Pre-call prep</b><span className="sp" /><span className={`cellchip ${tone}`}>{label}</span></div>
      <div className="panel-b appointmentCrmStatusList">
        {ready ? <>
          <Status label="Ownership" value={ready.ownership_complete && ready.contact_complete ? "Complete" : `${ready.ownership_total.toFixed(0)}% listed`} raw={ready.ownership_complete && ready.contact_complete ? "sent" : "pending"} />
          <Status label="Bank" value={ready.bank_complete ? ready.bank_detail || "Connected" : "Not connected"} raw={ready.bank_complete ? "sent" : "pending"} />
          <Status label="Credit" value={ready.credit_required ? `${ready.credit_done} of ${ready.credit_required} authorized` : "Waiting on owners"} raw={ready.credit_complete ? "sent" : "pending"} />
        </> : null}
        {precall.pin_delivered_via ? <span className="sub">PIN {precall.pin_delivered_via === "rep" ? "read out by the rep" : `sent by ${precall.pin_delivered_via}`}.</span> : null}
        {precall.next_step_at ? <span className="sub">Next nudge {formatWhen(precall.next_step_at)}.</span> : null}
        {steps.length ? <details className="appointmentCrmTimeline"><summary className="sub">{steps.length} scheduled message{steps.length === 1 ? "" : "s"}</summary>
          <ul>{steps.map((step) => <li key={step.id}><span className={`cellchip ${step.status === "sent" ? "c-ok" : step.status === "pending" ? "c-acc" : step.status === "failed" ? "c-bad" : "c-mut"}`}>{step.status}</span> {step.step_key?.replaceAll("_", " ")} · {step.channel} · {formatWhen(step.due_at)}{step.detail ? ` · ${step.detail.replaceAll("_", " ")}` : ""}</li>)}</ul>
        </details> : null}
        {canManage ? <div className="appointmentCrmActionsRow">
          {precall.room_url ? <button className="btn sm" type="button" onClick={() => void copy("link", precall.room_url!)}>{copied === "link" ? "Copied" : "Copy room link"}</button> : null}
          {workspace.draft_file ? <a className="btn sm" href={workspace.draft_file.href}>Open draft file</a> : null}
          <button className="btn sm" type="button" disabled={act.isPending} onClick={() => act.mutate({ action: "resend" })}>Resend kit</button>
          <button className="btn sm" type="button" disabled={act.isPending} onClick={() => { if (window.confirm("Rotate the room PIN? The old one stops working and the new one is sent to the client (or shown here to read out).")) act.mutate({ action: "rotate_pin" }); }}>Rotate PIN</button>
          {precall.status === "in_progress" ? <button className="btn sm" type="button" disabled={act.isPending} onClick={() => act.mutate({ action: "stop" })}>Pause nudges</button> : null}
          {precall.status === "stopped" ? <button className="btn sm" type="button" disabled={act.isPending} onClick={() => act.mutate({ action: "resume" })}>Resume nudges</button> : null}
        </div> : null}
        {result ? <div className={`appointmentCrmInline ${result.room_passcode ? "emph" : ""}`}>{result.detail}{result.room_passcode ? <> New PIN: <b className="num">{result.room_passcode}</b> <button className="btn sm" type="button" onClick={() => void copy("pin", result.room_passcode!)}>{copied === "pin" ? "Copied" : "Copy"}</button></> : null}</div> : null}
        {act.isError ? <div className="appointmentCrmInlineError">{errorText(act.error, "That did not work.")}</div> : null}
      </div>
    </section>
  );
}

function Status({ label, value, raw }: { label: string; value: string; raw: string }) {
  return <div><span>{label}</span><span className={`cellchip ${statusClass(raw)}`}>{value}</span></div>;
}

function LinkedSummary({ label, title, detail }: { label: string; title: string; detail: string }) {
  return <div className="appointmentCrmLinked"><span className="cellchip c-acc">{label}</span><b>{title}</b><small>{detail}</small></div>;
}

function LinkedFile({ label, title, detail, href }: { label: string; title: string; detail: string; href: string }) {
  return <div className="appointmentCrmLinkedFile"><span><span className="cellchip c-acc">{label}</span><b>{title}</b><small>{detail}</small></span><a className="btn pri" href={href} target="_blank" rel="noreferrer"><ExternalLink size={16} />Open</a></div>;
}

function CheckRow({ checked, onChange, label, emphasized = false }: { checked: boolean; onChange: (checked: boolean) => void; label: string; emphasized?: boolean }) {
  return <label className={`appointmentCrmCheck${emphasized ? " emphasized" : ""}`}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}
