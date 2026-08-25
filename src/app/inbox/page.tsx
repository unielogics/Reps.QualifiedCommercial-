"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import BookingDrawer from "@/components/BookingDrawer";
import ContactShareDrawer from "@/components/ContactShareDrawer";
import InboxComposeModal from "@/components/InboxComposeModal";

type Thread = {
  id: string;
  dealer_id: string | null;
  subject: string;
  channel: string;
  source: string;
  last_message_at: string | null;
  unread_count: number;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  company: string | null;
};

type Message = {
  id: string;
  direction: string;
  channel: string;
  body: string;
  delivery_status: string;
  provider_error: string | null;
  sender: string | null;
  recipient: string | null;
  created_at: string;
};

function when(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function InboxPage() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [compose, setCompose] = useState(false);
  const [booking, setBooking] = useState(false);
  const [share, setShare] = useState(false);
  const threads = useQuery({
    queryKey: ["inbox-threads"],
    queryFn: async () =>
      api<Thread[]>("/dealer-os/inbox/threads", { authToken: (await getToken()) ?? undefined }),
  });
  const selected = useMemo(() => {
    const rows = threads.data ?? [];
    return rows.find((t) => t.id === selectedId) ?? rows[0] ?? null;
  }, [threads.data, selectedId]);
  const messages = useQuery({
    queryKey: ["inbox-messages", selected?.id],
    queryFn: async () =>
      api<Message[]>(`/dealer-os/inbox/threads/${selected?.id}/messages`, {
        authToken: (await getToken()) ?? undefined,
      }),
    enabled: Boolean(selected?.id),
  });
  const send = useMutation({
    mutationFn: async () =>
      api<Message>(`/dealer-os/inbox/threads/${selected?.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: draft.trim() }),
        authToken: (await getToken()) ?? undefined,
      }),
    onSuccess: () => {
      setDraft("");
      void qc.invalidateQueries({ queryKey: ["inbox-messages", selected?.id] });
      void qc.invalidateQueries({ queryKey: ["inbox-threads"] });
    },
  });
  const rows = threads.data ?? [];
  const seed = selected
    ? {
        dealer_id: selected.dealer_id,
        contact_name: selected.contact_name,
        contact_email: selected.contact_email,
        contact_phone: selected.contact_phone,
        company: selected.company,
      }
    : null;

  return (
    <>
      <div className="hd">
        <h2>Inbox</h2>
        <p className="lede">Email and SMS replies from people you booked or shared your contact card with.</p>
      </div>

      <div className="row mt" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn pri" onClick={() => setCompose(true)}>
          New
        </button>
        <button type="button" className="btn" onClick={() => setBooking(true)}>
          Book appointment
        </button>
        <button type="button" className="btn" onClick={() => setShare(true)}>
          Send business card
        </button>
      </div>

      <div className="cg mt" style={{ alignItems: "stretch" }}>
        <div className="s4">
          <div className="panel" style={{ height: "100%" }}>
            <div className="panel-h">
              Threads
              <span style={{ flex: 1 }} />
              <span className="cellchip c-mut">{rows.length}</span>
            </div>
            <div className="panel-b" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {threads.isLoading && <span className="sub">Loading...</span>}
              {!threads.isLoading && rows.length === 0 && (
                <span className="sub">No replies yet. Shared cards and booked appointments will start threads here.</span>
              )}
              {rows.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  className={`rung${selected?.id === thread.id ? " cur" : ""}`}
                  style={{ textAlign: "left", font: "inherit", width: "100%" }}
                  onClick={() => setSelectedId(thread.id)}
                >
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <b style={{ display: "block", fontSize: 13.5 }}>{thread.contact_name ?? thread.subject}</b>
                    <span className="sub">{thread.company || thread.contact_email || thread.contact_phone || thread.source}</span>
                  </span>
                  <span className={`cellchip ${thread.channel === "sms" ? "c-acc" : "c-mut"}`}>{thread.channel}</span>
                  {thread.unread_count > 0 && <span className="navbadge">{thread.unread_count}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="s8">
          <div className="panel">
            <div className="panel-h">
              {selected ? selected.subject : "Conversation"}
              <span style={{ flex: 1 }} />
              {selected && <span className="cellchip c-acc">{selected.channel}</span>}
              {selected && (
                <>
                  <button type="button" className="btn sm" onClick={() => setBooking(true)}>
                    Book
                  </button>
                  <button type="button" className="btn sm" onClick={() => setShare(true)}>
                    Card
                  </button>
                </>
              )}
            </div>
            <div className="panel-b">
              {!selected && <span className="sub">Choose a thread.</span>}
              {selected && (
                <>
                  <div className="thr" style={{ maxHeight: 460 }}>
                    {messages.isLoading && <div className="thr-empty">Loading...</div>}
                    {(messages.data ?? []).map((m) => (
                      <div key={m.id} className={`msg${m.direction === "outbound" ? " mine" : ""}${m.channel === "sms" ? " client-ch" : ""}`}>
                        <div className="msg-h">
                          <span className="msg-who">{m.direction === "outbound" ? "You" : selected.contact_name ?? "Contact"}</span>
                          <span className="msg-when">{when(m.created_at)}</span>
                          <span className="msg-edit">{m.delivery_status}</span>
                        </div>
                        <div className="msg-b">{m.body}</div>
                        {m.provider_error && <div className="note">{m.provider_error}</div>}
                      </div>
                    ))}
                    {!messages.isLoading && (messages.data ?? []).length === 0 && (
                      <div className="thr-empty">No messages in this thread yet.</div>
                    )}
                  </div>

                  <div className="composer">
                    <textarea
                      className="field"
                      rows={4}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={selected.channel === "sms" ? "Reply by SMS" : "Reply by email"}
                    />
                    {send.isError && <div className="note">{send.error instanceof Error ? send.error.message : "That reply did not send."}</div>}
                    <div className="composer-row">
                      <button type="button" className="btn pri" disabled={!draft.trim() || send.isPending} onClick={() => send.mutate()}>
                        {send.isPending ? "Sending..." : selected.channel === "sms" ? "Send SMS" : "Send email"}
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
          seed={seed}
          onClose={() => setCompose(false)}
          onSent={(threadId) => {
            if (threadId) setSelectedId(threadId);
          }}
        />
      )}
      {booking && (
        <BookingDrawer
          initialDealerId={seed?.dealer_id ?? null}
          initialName={seed?.contact_name ?? null}
          initialEmail={seed?.contact_email ?? null}
          initialPhone={seed?.contact_phone ?? null}
          onClose={() => setBooking(false)}
        />
      )}
      {share && (
        <ContactShareDrawer
          initialDealerId={seed?.dealer_id ?? null}
          initialName={seed?.contact_name ?? null}
          initialCompany={seed?.company ?? null}
          initialEmail={seed?.contact_email ?? null}
          initialPhone={seed?.contact_phone ?? null}
          onClose={() => setShare(false)}
        />
      )}
    </>
  );
}
