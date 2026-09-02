"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Mail, MessageSquareText, RefreshCw, Send, ShieldCheck, StickyNote, Users } from "lucide-react";
import { api } from "@/lib/api";
import { ConversationBubbles } from "./ConversationBubbles";
import type { UnifiedCommunicationMessage } from "@/lib/communications";

type MainTab = "desk" | "client" | "note" | "ai";
type ClientChannel = "email" | "sms" | "room";

type DealerSummary = {
  name: string;
  case_ref: string | null;
  email: string | null;
  phone: string | null;
};

type FileMessage = {
  id: string;
  author_user_id: string | null;
  author_name: string | null;
  body: string;
  channel: string;
  edited_at: string | null;
  created_at: string;
};

type AiMessage = { id: string; role: string; body: string; created_at: string };

type ProviderThread = {
  id: string;
  dealer_id: string | null;
  subject: string;
  channel: "email" | "sms";
  unread_count: number;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  last_message_at: string | null;
};

type ProviderMessage = {
  id: string;
  thread_id: string;
  direction: "inbound" | "outbound";
  channel: string;
  body: string;
  provider_error: string | null;
  provider: string | null;
  delivery_status: string;
  sender: string | null;
  created_at: string;
};

type ComposeResult = { threads: ProviderThread[] };

type SmsDisclosure = {
  version: string;
  brand: string;
  transactional: string;
  marketing: string;
  legal: string;
  terms_url: string;
  privacy_url: string;
};

type ConsentMethod = "in_person_device" | "rep_attested";

const MAIN_TABS: Array<{ key: MainTab; label: string; icon: typeof Users }> = [
  { key: "desk", label: "Desk", icon: Users },
  { key: "client", label: "Client", icon: MessageSquareText },
  { key: "note", label: "Notes", icon: StickyNote },
  { key: "ai", label: "Ask AI", icon: Bot },
];

function toUnifiedProvider(message: ProviderMessage): UnifiedCommunicationMessage {
  const deliveryStatus = message.provider === "file_message" && message.delivery_status === "stored"
    ? "room only"
    : message.delivery_status;
  return {
    id: message.id,
    thread_id: message.thread_id,
    body: message.body,
    sender_name: message.direction === "inbound" ? message.sender : "Qualified Commercial",
    sender_type: message.direction === "inbound" ? "client" : "operator",
    direction: message.direction,
    channel: message.channel,
    transport: message.channel,
    created_at: message.created_at,
    seen: true,
    delivery_status: message.direction === "outbound" ? deliveryStatus : null,
    delivery_detail: message.provider_error,
  };
}

export default function CaseMessagingWorkspace({
  dealerId,
  dealer,
  meId,
  canText,
}: {
  dealerId: string;
  dealer: DealerSummary;
  meId: string | undefined;
  canText: boolean;
}) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<MainTab>("client");
  const [clientChannel, setClientChannel] = useState<ClientChannel>(dealer.email ? "email" : dealer.phone ? "sms" : "room");
  const [draft, setDraft] = useState("");
  const [subject, setSubject] = useState(`Qualified Commercial | ${dealer.case_ref || dealer.name}`);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentSaved, setConsentSaved] = useState(false);
  const [consentMethod, setConsentMethod] = useState<ConsentMethod>("rep_attested");
  const [consenterName, setConsenterName] = useState("");
  const [transactionalConsent, setTransactionalConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [legalConsent, setLegalConsent] = useState(false);
  const auth = async () => (await getToken()) ?? undefined;
  const effectiveCanText = canText || consentSaved;

  const providerThreads = useQuery({
    queryKey: ["file-inbox-threads", dealerId],
    queryFn: async () => api<ProviderThread[]>(`/dealer-os/dealers/${dealerId}/inbox/threads`, { authToken: await auth() }),
    refetchOnWindowFocus: true,
  });
  const selectedThread = useMemo(
    () => (providerThreads.data ?? []).find((thread) => thread.channel === clientChannel) ?? null,
    [clientChannel, providerThreads.data],
  );
  const providerMessages = useQuery({
    queryKey: ["file-inbox-messages", dealerId, selectedThread?.id],
    queryFn: async () => api<ProviderMessage[]>(`/dealer-os/dealers/${dealerId}/inbox/threads/${selectedThread?.id}/messages`, { authToken: await auth() }),
    enabled: tab === "client" && clientChannel !== "room" && Boolean(selectedThread),
    refetchOnWindowFocus: true,
  });
  const fileChannel = tab === "note" ? "note" : tab === "client" ? "client" : "desk";
  const fileMessages = useQuery({
    queryKey: ["messages", dealerId, fileChannel],
    queryFn: async () => api<FileMessage[]>(`/dealer-os/dealers/${dealerId}/messages?channel=${fileChannel}`, { authToken: await auth() }),
    enabled: tab !== "ai" && (tab !== "client" || clientChannel === "room"),
    refetchOnWindowFocus: true,
  });
  const aiMessages = useQuery({
    queryKey: ["ai-thread", dealerId],
    queryFn: async () => api<AiMessage[]>(`/dealer-os/dealers/${dealerId}/ai/thread`, { authToken: await auth() }),
    enabled: tab === "ai",
  });
  const smsDisclosure = useQuery({
    queryKey: ["sms-disclosure"],
    queryFn: async () => api<SmsDisclosure>("/dealer-os/sms-disclosure", { authToken: await auth() }),
    enabled: tab === "client" && clientChannel === "sms" && !effectiveCanText && Boolean(dealer.phone),
    staleTime: 60 * 60 * 1000,
  });

  useEffect(() => setDraft(""), [tab, clientChannel]);
  useEffect(() => {
    setConsentSaved(false);
    setConsentOpen(false);
  }, [dealer.phone]);
  useEffect(() => {
    if (canText) setConsentOpen(false);
  }, [canText]);

  const internalSend = useMutation({
    mutationFn: async (body: string) => tab === "ai"
      ? api(`/dealer-os/dealers/${dealerId}/ai/thread`, { method: "POST", body: JSON.stringify({ question: body }), authToken: await auth() })
      : api(`/dealer-os/dealers/${dealerId}/messages`, { method: "POST", body: JSON.stringify({ body, channel: fileChannel }), authToken: await auth() }),
    onSuccess: () => {
      setDraft("");
      void qc.invalidateQueries({ queryKey: tab === "ai" ? ["ai-thread", dealerId] : ["messages", dealerId, fileChannel] });
    },
  });
  const saveNote = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => api(`/dealer-os/dealers/${dealerId}/messages/${id}`, { method: "PATCH", body: JSON.stringify({ body }), authToken: await auth() }),
    onSuccess: () => { setEditing(null); void qc.invalidateQueries({ queryKey: ["messages", dealerId, "note"] }); },
  });
  const externalSend = useMutation({
    mutationFn: async (body: string) => {
      if (selectedThread) {
        return api(`/dealer-os/dealers/${dealerId}/inbox/threads/${selectedThread.id}/messages`, {
          method: "POST",
          body: JSON.stringify({ body, channel: clientChannel }),
          authToken: await auth(),
        });
      }
      return api<ComposeResult>("/dealer-os/inbox/threads", {
        method: "POST",
        body: JSON.stringify({
          dealer_id: dealerId,
          recipient_name: dealer.name,
          company: dealer.name,
          recipient_email: dealer.email,
          recipient_phone: dealer.phone,
          channels: [clientChannel],
          subject,
          body,
          transactional_sms_consent: clientChannel === "sms" && effectiveCanText,
          marketing_sms_consent: false,
          consent_method: "rep_attested",
        }),
        authToken: await auth(),
      });
    },
    onSuccess: async () => {
      setDraft("");
      await qc.invalidateQueries({ queryKey: ["file-inbox-threads", dealerId] });
      await providerThreads.refetch();
      void qc.invalidateQueries({ queryKey: ["file-inbox-messages", dealerId] });
      void qc.invalidateQueries({ queryKey: ["inbox-contacts"] });
      void qc.invalidateQueries({ queryKey: ["unread-summary"] });
    },
  });
  const captureConsent = useMutation({
    mutationFn: async () => api(`/dealer-os/dealers/${dealerId}/sms-consent`, {
      method: "POST",
      body: JSON.stringify({
        phone: dealer.phone,
        transactional: transactionalConsent,
        marketing: marketingConsent,
        accepted_legal: legalConsent,
        method: consentMethod,
        consenter_name: consenterName.trim(),
      }),
      authToken: await auth(),
    }),
    onSuccess: async () => {
      setConsentSaved(true);
      setConsentOpen(false);
      setTransactionalConsent(false);
      setMarketingConsent(false);
      setLegalConsent(false);
      setConsenterName("");
      await qc.invalidateQueries({ queryKey: ["consent", dealerId] });
      await qc.invalidateQueries({ queryKey: ["file-inbox-threads", dealerId] });
      await providerThreads.refetch();
      if (selectedThread) {
        void qc.invalidateQueries({ queryKey: ["file-inbox-messages", dealerId, selectedThread.id] });
      }
      void qc.invalidateQueries({ queryKey: ["audit", dealerId] });
    },
  });

  const providerHistory = (providerMessages.data ?? []).map(toUnifiedProvider);
  const localHistory: UnifiedCommunicationMessage[] = (fileMessages.data ?? []).map((message) => ({
    id: message.id,
    thread_id: `${dealerId}:${fileChannel}`,
    body: message.body,
    sender_name: message.author_name,
    sender_type: message.author_user_id ? "operator" : "client",
    direction: message.author_user_id === meId ? "outbound" : "inbound",
    channel: fileChannel,
    transport: fileChannel === "client" ? "portal" : "internal",
    created_at: message.created_at,
    seen: true,
    delivery_status: fileChannel === "client" && message.author_user_id ? "room only" : null,
  }));
  const aiHistory: UnifiedCommunicationMessage[] = (aiMessages.data ?? []).map((message) => ({
    id: message.id,
    thread_id: `${dealerId}:ai`,
    body: message.body,
    sender_name: message.role === "user" ? "You" : "Analyst",
    sender_type: message.role,
    direction: message.role === "user" ? "outbound" : "system",
    channel: "ai",
    transport: "internal",
    created_at: message.created_at,
    seen: true,
    delivery_status: null,
  }));
  const showingExternal = tab === "client" && clientChannel !== "room";
  const history = tab === "ai" ? aiHistory : showingExternal ? providerHistory : localHistory;
  const historyLoading = tab === "ai" ? aiMessages.isLoading : showingExternal ? providerMessages.isLoading : fileMessages.isLoading;
  const historyError = tab === "ai" ? aiMessages.isError : showingExternal ? providerMessages.isError : fileMessages.isError;
  const sendMutation = showingExternal ? externalSend : internalSend;
  const composerError = sendMutation.error ?? saveNote.error;
  const missingRecipient = clientChannel === "email" ? !dealer.email : clientChannel === "sms" ? !dealer.phone : false;
  const smsBlocked = clientChannel === "sms" && !effectiveCanText;
  const canSend = Boolean(draft.trim() && !missingRecipient && !smsBlocked && !sendMutation.isPending);
  const send = (body = draft.trim()) => {
    if (!body || sendMutation.isPending) return;
    if (showingExternal) externalSend.mutate(body); else internalSend.mutate(body);
  };

  const title = tab === "client"
    ? clientChannel === "email" ? "Client email" : clientChannel === "sms" ? "Client text messages" : "Secure-room messages"
    : tab === "desk" ? "Underwriting desk" : tab === "note" ? "File notes" : "File analyst";
  const subtitle = tab === "client"
    ? clientChannel === "email" ? dealer.email || "No application email" : clientChannel === "sms" ? dealer.phone || "No mobile number" : "Visible after the client enters their room"
    : tab === "desk" ? "Internal staff conversation" : tab === "note" ? "Internal annotations" : "Private to you";

  return (
    <section className="panel caseMessagingWorkspace">
      <div className="caseMessagingTabs" role="tablist" aria-label="File conversations">
        {MAIN_TABS.map(({ key, label, icon: Icon }) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "on" : ""} onClick={() => setTab(key)}><Icon size={16} />{label}</button>)}
      </div>
      {tab === "client" && <div className="caseChannelTabs" role="tablist" aria-label="Client delivery channel">
        <button type="button" role="tab" aria-selected={clientChannel === "email"} className={clientChannel === "email" ? "on" : ""} onClick={() => setClientChannel("email")}><Mail size={15} />Email</button>
        <button type="button" role="tab" aria-selected={clientChannel === "sms"} className={clientChannel === "sms" ? "on" : ""} onClick={() => setClientChannel("sms")}><MessageSquareText size={15} />Text</button>
        <button type="button" role="tab" aria-selected={clientChannel === "room"} className={clientChannel === "room" ? "on" : ""} onClick={() => setClientChannel("room")}><MessageSquareText size={15} />Secure room</button>
      </div>}
      <header className="caseConversationHead">
        <span className="rep-av">{dealer.name.slice(0, 2).toUpperCase()}</span>
        <div><b>{title}</b><span>{subtitle}</span></div>
        <span className="sp" />
        {selectedThread?.unread_count ? <span className="navbadge">{selectedThread.unread_count}</span> : null}
        {showingExternal && <button type="button" className="iconBtn" title="Refresh messages" aria-label="Refresh messages" onClick={() => { void providerThreads.refetch(); if (selectedThread) void providerMessages.refetch(); }}><RefreshCw size={17} /></button>}
      </header>
      {tab === "client" && <div className="caseDeliveryNotice">
        {clientChannel === "email" ? "Email is sent through the configured mail provider. Replies appear here when the connected mailbox receives them." : clientChannel === "sms" ? effectiveCanText ? "Texts use the consent-controlled SMS provider. Carrier delivery status and replies appear here." : "SMS is unavailable until transactional consent is recorded for this exact number." : "Secure-room messages are in-system only. They do not send an email or text."}
      </div>}
      {tab === "client" && clientChannel === "sms" && !effectiveCanText && dealer.phone && (
        <div className="caseConsentCapture">
          {!consentOpen ? (
            <div className="caseConsentPrompt">
              <ShieldCheck size={18} />
              <div><b>Transactional consent required</b><span>Record the client&apos;s permission for {dealer.phone} before sending a text.</span></div>
              <button type="button" className="btn" onClick={() => setConsentOpen(true)}>Record consent</button>
            </div>
          ) : (
            <div className="caseConsentForm">
              <div className="caseConsentFormHead">
                <div><b>Record SMS consent</b><span>The saved proof applies only to {dealer.phone}.</span></div>
                <button type="button" className="btn sm" onClick={() => setConsentOpen(false)}>Cancel</button>
              </div>
              <div className="caseConsentMethod" role="group" aria-label="How consent was given">
                <button type="button" className={consentMethod === "rep_attested" ? "on" : ""} onClick={() => setConsentMethod("rep_attested")}><b>Verbal consent</b><span>The rep heard the client agree.</span></button>
                <button type="button" className={consentMethod === "in_person_device" ? "on" : ""} onClick={() => setConsentMethod("in_person_device")}><b>Client on this device</b><span>The client is reviewing these choices.</span></button>
              </div>
              <label className="caseConsentName">
                <span>Person giving consent <small>Optional</small></span>
                <input className="field" value={consenterName} onChange={(event) => setConsenterName(event.target.value)} placeholder="Client full name, if provided" autoComplete="name" />
              </label>
              {smsDisclosure.isLoading ? <div className="hint">Loading the current consent wording...</div> : smsDisclosure.isError || !smsDisclosure.data ? <div className="warnline">The current disclosure could not be loaded. Consent cannot be recorded yet.</div> : (
                <div className="caseConsentChoices">
                  <label className={transactionalConsent ? "on" : ""}>
                    <input type="checkbox" checked={transactionalConsent} onChange={(event) => setTransactionalConsent(event.target.checked)} />
                    <span><b>Account and application texts</b><small>{smsDisclosure.data.transactional}</small></span>
                  </label>
                  <label className={marketingConsent ? "on" : ""}>
                    <input type="checkbox" checked={marketingConsent} onChange={(event) => setMarketingConsent(event.target.checked)} />
                    <span><b>Program and promotional texts</b><small>{smsDisclosure.data.marketing}</small></span>
                  </label>
                  <label className={legalConsent ? "on" : ""}>
                    <input type="checkbox" checked={legalConsent} onChange={(event) => setLegalConsent(event.target.checked)} />
                    <span><b>Terms and Privacy Policy</b><small>{smsDisclosure.data.legal} <a href={smsDisclosure.data.terms_url} target="_blank" rel="noreferrer">Terms</a> and <a href={smsDisclosure.data.privacy_url} target="_blank" rel="noreferrer">Privacy Policy</a>.</small></span>
                  </label>
                </div>
              )}
              <div className="caseConsentActions">
                <span className="hint">
                  {!transactionalConsent || !legalConsent
                    ? "Select Account and application texts and accept the Terms and Privacy Policy to enable texting."
                    : "Ready to record. Consent is timestamped and retained in the file audit trail."}
                </span>
                <button type="button" className="btn pri" disabled={!smsDisclosure.data || !transactionalConsent || !legalConsent || captureConsent.isPending} onClick={() => captureConsent.mutate()}>{captureConsent.isPending ? "Recording..." : "Record and enable texting"}</button>
              </div>
              {captureConsent.isError && <div className="warnline">{captureConsent.error instanceof Error ? captureConsent.error.message : "Consent could not be recorded."}</div>}
            </div>
          )}
        </div>
      )}
      {!selectedThread && showingExternal && clientChannel === "email" && dealer.email && <label className="caseSubject"><span>Subject</span><input className="field" value={subject} onChange={(event) => setSubject(event.target.value)} /></label>}
      <ConversationBubbles messages={history} isLoading={historyLoading} isError={historyError} counterpartName={dealer.name} emptyLabel={showingExternal ? `No ${clientChannel === "sms" ? "text" : "email"} history for this file yet.` : "No messages here yet."} onRetry={showingExternal ? (message) => externalSend.mutate(message.body) : undefined} />
      {tab === "note" && editing && <div className="caseNoteEditor"><textarea className="field" rows={3} value={editDraft} onChange={(event) => setEditDraft(event.target.value)} /><button type="button" className="btn pri" disabled={!editDraft.trim() || saveNote.isPending} onClick={() => saveNote.mutate({ id: editing, body: editDraft.trim() })}>Save note</button><button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button></div>}
      {tab === "note" && !editing && (fileMessages.data ?? []).some((message) => message.author_user_id === meId) && <button type="button" className="linky caseEditLatest" onClick={() => { const message = [...(fileMessages.data ?? [])].reverse().find((row) => row.author_user_id === meId); if (message) { setEditing(message.id); setEditDraft(message.body); } }}>Edit your latest note</button>}
      <div className="caseMessageComposer">
        {(missingRecipient || smsBlocked) && <div className="warnline">{missingRecipient ? `Add a client ${clientChannel === "email" ? "email address" : "mobile number"} in Step 1 before sending.` : "This number does not have transactional SMS consent."}</div>}
        <textarea className="field" rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={tab === "client" ? clientChannel === "email" ? "Write an email to the client" : clientChannel === "sms" ? "Write a text message" : "Write in the secure room" : tab === "desk" ? "Message the underwriting desk" : tab === "note" ? "Add a note to this file" : "Ask about this file"} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (canSend) send(); } }} />
        <div className="composer-row"><button type="button" className="btn pri" disabled={!canSend} onClick={() => send()}><Send size={15} />{sendMutation.isPending ? "Sending..." : tab === "client" ? clientChannel === "email" ? "Send email" : clientChannel === "sms" ? "Send text" : "Post to room" : tab === "note" ? "Add note" : tab === "ai" ? "Ask" : "Send to desk"}</button><span className="hint">Enter sends. Shift + Enter adds a line.</span></div>
        {composerError && <div className="note">{composerError instanceof Error ? composerError.message : "The message could not be sent."}</div>}
      </div>
    </section>
  );
}
