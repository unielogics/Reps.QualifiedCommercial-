"use client";

// The rep's inbox, grouped by person.
//
// Previously a flat list of rep-inbox threads. It now reads the shared
// /communications endpoints, which means one row per contact across every
// channel — text, email, and in-system — with a person's SMS and MMS in a
// single conversation however their number happens to be written. The backend
// scopes a FIELD_REP to the contacts they own, so there is no rep-specific
// view to keep in step with the operator one.
//
// Booking, business-card sharing, compose and close are unchanged; they are the
// reason a rep opens this screen. What changed is the list, the message
// rendering, and the way it behaves on a phone.

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, Paperclip, UserRound, X } from "lucide-react";
import { api } from "@/lib/api";
import BookingDrawer from "@/components/BookingDrawer";
import ContactShareDrawer from "@/components/ContactShareDrawer";
import InboxComposeModal from "@/components/InboxComposeModal";
import { ConversationBubbles } from "@/components/ConversationBubbles";
import {
  shortDate,
  type UnifiedCommunicationThread,
  type UnifiedCommunicationThreadDetail,
  type UnifiedContactPage,
} from "@/lib/communications";

type ActionContext = "global" | "thread" | null;

function channelLabel(channel: string): string {
  return ({ sms: "text", email: "email", client: "chat", desk: "desk" } as Record<string, string>)[channel] ?? channel;
}

export default function InboxPage() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const params = useSearchParams();

  const [openKey, setOpenKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(params.get("thread"));
  const [view, setView] = useState<"list" | "thread">("list");
  const [draft, setDraft] = useState("");
  const [compose, setCompose] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [bookingContext, setBookingContext] = useState<ActionContext>(null);
  const [shareContext, setShareContext] = useState<ActionContext>(null);

  const contacts = useQuery({
    queryKey: ["inbox-contacts"],
    queryFn: async () =>
      api<UnifiedContactPage>("/communications/contacts?limit=100", {
        authToken: (await getToken()) ?? undefined,
      }),
    refetchInterval: 20000,
  });

  const groups = useMemo(() => contacts.data?.items ?? [], [contacts.data]);
  const selected: UnifiedCommunicationThread | null = useMemo(
    () => groups.flatMap((g) => g.threads).find((t) => t.id === selectedId) ?? null,
    [groups, selectedId],
  );

  const messages = useQuery({
    queryKey: ["inbox-thread", selectedId],
    queryFn: async () =>
      api<UnifiedCommunicationThreadDetail>(`/communications/threads/${selectedId}`, {
        authToken: (await getToken()) ?? undefined,
      }),
    enabled: Boolean(selectedId),
    refetchInterval: 8000,
  });

  const send = useMutation({
    mutationFn: async () =>
      api<UnifiedCommunicationThreadDetail>(`/communications/threads/${selectedId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: draft.trim() }),
        authToken: (await getToken()) ?? undefined,
      }),
    onSuccess: (data) => {
      qc.setQueryData(["inbox-thread", selectedId], data);
      setDraft("");
      void qc.invalidateQueries({ queryKey: ["inbox-contacts"] });
    },
  });

  // Keep the selection valid as the list refreshes.
  useEffect(() => {
    if (!groups.length || !selectedId) return;
    if (!groups.flatMap((g) => g.threads).some((t) => t.id === selectedId)) setSelectedId(null);
  }, [groups, selectedId]);

  // Their drawers seed from the conversation's contact. A unified thread
  // carries the same facts under different names.
  const threadSeed = selected
    ? {
        dealer_id: selected.source_kind === "rep" ? selected.source_id : null,
        contact_name: selected.participant_name,
        contact_email: selected.participant_email,
        contact_phone: selected.participant_phone,
        company: selected.source_label,
      }
    : null;
  const bookingSeed = bookingContext === "thread" ? threadSeed : null;
  const shareSeed = shareContext === "thread" ? threadSeed : null;

  const openContact = (key: string, latestThreadId: string, threadCount: number) => {
    setOpenKey(key);
    setSelectedId(latestThreadId);
    setAttachmentOpen(false);
    // One conversation: go straight in. Several: let them pick.
    if (threadCount <= 1) setView("thread");
  };

  return (
    <>
      <div className="hd">
        <h2>Inbox</h2>
        <p className="lede">Everyone you talk to — text, email, and in-system — grouped by contact.</p>
      </div>

      <div className="row mt" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn pri" onClick={() => setCompose(true)}>
          New
        </button>
        <button type="button" className="btn" onClick={() => setBookingContext("global")}>
          Book appointment
        </button>
        <button type="button" className="btn" onClick={() => setShareContext("global")}>
          Send business card
        </button>
      </div>

      <div className={`cg mt inbox-2col v-${view}`} style={{ alignItems: "stretch" }}>
        <div className="s4 inbox-listcol">
          <div className="panel" style={{ height: "100%" }}>
            <div className="panel-h">
              Contacts
              <span style={{ flex: 1 }} />
              <span className="cellchip c-mut">{contacts.data?.total ?? 0}</span>
            </div>
            <div className="panel-b rep-rows">
              {contacts.isLoading && <span className="sub">Loading...</span>}
              {!contacts.isLoading && !groups.length && (
                <span className="sub">
                  No conversations yet. Shared cards, booked appointments and texts start threads here.
                </span>
              )}
              {groups.map((group) => {
                const expanded = openKey === group.key && group.threads.length > 1;
                return (
                  <div key={group.key} className={expanded ? "rep-contact open" : "rep-contact"}>
                    <button
                      type="button"
                      className={`rep-row${openKey === group.key ? " on" : ""}`}
                      aria-expanded={expanded}
                      onClick={() => openContact(group.key, group.latest_thread_id, group.threads.length)}
                    >
                      <span className="rep-av">{group.name.slice(0, 2).toUpperCase()}</span>
                      <span className="rep-body">
                        <span className="rep-top">
                          <b>{group.name}</b>
                          <time>{shortDate(group.latest_at)}</time>
                        </span>
                        <span className="rep-prev">{group.latest_snippet || "Conversation"}</span>
                        <span className="rep-chips">
                          {group.channels.map((channel) => (
                            <span key={channel} className="tag">{channelLabel(channel)}</span>
                          ))}
                          {group.threads.length > 1 && (
                            <span className="tag">{group.threads.length} conversations</span>
                          )}
                          {group.unread_total > 0 && <span className="navbadge">{group.unread_total}</span>}
                        </span>
                      </span>
                    </button>
                    {expanded && (
                      <div className="rep-threads">
                        {group.threads.map((thread) => (
                          <button
                            key={thread.id}
                            type="button"
                            className={`rep-thread${selectedId === thread.id ? " on" : ""}`}
                            onClick={() => { setSelectedId(thread.id); setView("thread"); setAttachmentOpen(false); }}
                          >
                            <span className="tag">{channelLabel(thread.channel)}</span>
                            <span className="grow">{thread.title}</span>
                            <time>{shortDate(thread.latest_at)}</time>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="s8 inbox-threadcol">
          <div className="panel">
            <div className="panel-h">
              <button type="button" className="rep-back" onClick={() => setView("list")}>
                <ChevronLeft size={16} /> All
              </button>
              {selected ? selected.participant_name || selected.title : "Conversation"}
              <span style={{ flex: 1 }} />
              {selected && <span className="cellchip c-acc">{channelLabel(selected.channel)}</span>}
              {selected && (
                <button
                  type="button"
                  className="conversationClose"
                  aria-label="Close conversation"
                  title="Close conversation"
                  onClick={() => { setSelectedId(null); setAttachmentOpen(false); }}
                >
                  <X size={17} />
                </button>
              )}
            </div>
            <div className="panel-b">
              {!selected && <span className="sub">Choose a contact.</span>}
              {selected && (
                <>
                  <ConversationBubbles
                    messages={messages.data?.messages ?? []}
                    isLoading={messages.isLoading}
                    isError={messages.isError}
                    counterpartName={selected.participant_name}
                  />

                  <div className="composer">
                    <textarea
                      className="field"
                      rows={3}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder={
                        selected.can_reply
                          ? selected.channel === "sms" ? "Reply by text" : "Reply"
                          : "This conversation is read-only"
                      }
                      disabled={!selected.can_reply}
                    />
                    {send.isError && (
                      <div className="note">
                        {send.error instanceof Error ? send.error.message : "That reply did not send."}
                      </div>
                    )}
                    <div className="composer-row">
                      <div className="popwrap composerAttachment">
                        <button
                          type="button"
                          className="composerAttachmentButton"
                          aria-label="Add a conversation action"
                          title="Add an action"
                          aria-expanded={attachmentOpen}
                          onClick={() => setAttachmentOpen((current) => !current)}
                        >
                          <Paperclip size={18} />
                        </button>
                        {attachmentOpen && (
                          <div className="popmenu composerActionMenu" role="menu">
                            <button
                              type="button"
                              className="mi composerAction"
                              role="menuitem"
                              onClick={() => { setAttachmentOpen(false); setShareContext("thread"); }}
                            >
                              <UserRound size={17} />
                              <span>Send business card<small>Use this conversation&apos;s contact.</small></span>
                            </button>
                            <button
                              type="button"
                              className="mi composerAction"
                              role="menuitem"
                              onClick={() => { setAttachmentOpen(false); setBookingContext("thread"); }}
                            >
                              <CalendarDays size={17} />
                              <span>Book appointment<small>Use this conversation&apos;s contact.</small></span>
                            </button>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn pri"
                        disabled={!draft.trim() || send.isPending || !selected.can_reply}
                        onClick={() => send.mutate()}
                      >
                        {send.isPending ? "Sending..." : selected.channel === "sms" ? "Send text" : "Send"}
                      </button>
                      <span className="hint">Replies stay in this inbox and keep provider delivery status.</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {compose && (
        <InboxComposeModal
          seed={null}
          onClose={() => setCompose(false)}
          onSent={(threadId) => {
            if (threadId) setSelectedId(threadId);
            void qc.invalidateQueries({ queryKey: ["inbox-contacts"] });
          }}
        />
      )}
      {bookingContext && (
        <BookingDrawer
          initialDealerId={bookingSeed?.dealer_id ?? null}
          initialName={bookingSeed?.contact_name ?? null}
          initialEmail={bookingSeed?.contact_email ?? null}
          initialPhone={bookingSeed?.contact_phone ?? null}
          onClose={() => setBookingContext(null)}
        />
      )}
      {shareContext && (
        <ContactShareDrawer
          initialDealerId={shareSeed?.dealer_id ?? null}
          initialName={shareSeed?.contact_name ?? null}
          initialCompany={shareSeed?.company ?? null}
          initialEmail={shareSeed?.contact_email ?? null}
          initialPhone={shareSeed?.contact_phone ?? null}
          onClose={() => setShareContext(null)}
        />
      )}
    </>
  );
}
