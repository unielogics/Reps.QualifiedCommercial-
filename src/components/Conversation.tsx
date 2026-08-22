"use client";

// The four conversations that live on a file, in one panel.
//
//   Desk    rep, underwriter and super admin working the file together
//   Client  the business owner, who can read and reply
//   Notes   annotations pinned to the file, not a conversation
//   Ask AI  a private thread, one per person, about this file's actual numbers
//
// They share a composer because switching channel should feel like switching
// who you are talking to, not like moving to a different screen. What must
// never happen is a remark meant for the desk reaching the borrower, so the
// client channel is separated by more than a tab: its messages carry a
// different ground, and the composer states plainly who will read what you
// type. The default channel is Desk, and reaching the client is always a
// deliberate act.
//
// The server enforces all of this independently. A rep's message is internal
// unless it explicitly says otherwise, and a client login can only ever write
// to the client channel. This component is the part that makes the rule
// visible; it is not the part that makes it true.

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Channel = "desk" | "client" | "note";
type Tab = Channel | "ai";

type Message = {
  id: string;
  author_user_id: string | null;
  author_name: string | null;
  body: string;
  internal: boolean;
  channel: string;
  edited_at: string | null;
  created_at: string;
};

type AIMessage = { id: string; role: string; body: string; created_at: string };

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "desk", label: "Desk" },
  { key: "client", label: "Client" },
  { key: "note", label: "Notes" },
  { key: "ai", label: "Ask AI" },
];

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return "Today";
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Group by calendar day so a month of history reads as days, not one wall. */
function byDay<T extends { created_at: string }>(rows: T[]): Array<[string, T[]]> {
  const out: Array<[string, T[]]> = [];
  for (const r of rows) {
    const label = dayLabel(r.created_at);
    const last = out[out.length - 1];
    if (last && last[0] === label) last[1].push(r);
    else out.push([label, [r]]);
  }
  return out;
}

export default function Conversation({
  dealerId,
  meId,
}: {
  dealerId: string;
  meId: string | undefined;
}) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("desk");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const scroller = useRef<HTMLDivElement | null>(null);

  const isAI = tab === "ai";

  const messages = useQuery({
    queryKey: ["messages", dealerId, tab],
    queryFn: async () =>
      api<Message[]>(`/dealer-os/dealers/${dealerId}/messages?channel=${tab}`, {
        authToken: (await getToken()) ?? undefined,
      }),
    enabled: !isAI,
  });

  useEffect(() => {
    if (isAI || !messages.isSuccess) return;
    let cancelled = false;
    void (async () => {
      try {
        await api(`/dealer-os/dealers/${dealerId}/messages/seen`, {
          method: "POST",
          authToken: (await getToken()) ?? undefined,
        });
        if (!cancelled) {
          void qc.invalidateQueries({ queryKey: ["unread-summary"] });
        }
      } catch {
        /* A seen marker is an affordance; failing it should not block reading. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dealerId, getToken, isAI, messages.isSuccess, qc, tab]);

  const aiThread = useQuery({
    queryKey: ["ai-thread", dealerId],
    queryFn: async () =>
      api<AIMessage[]>(`/dealer-os/dealers/${dealerId}/ai/thread`, {
        authToken: (await getToken()) ?? undefined,
      }),
    enabled: isAI,
  });

  // Follow the conversation down as it grows, and when switching channel.
  const rowCount = (isAI ? aiThread.data?.length : messages.data?.length) ?? 0;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rowCount, tab]);

  const post = useMutation({
    mutationFn: async (body: string) => {
      const token = (await getToken()) ?? undefined;
      if (isAI) {
        return api<AIMessage>(`/dealer-os/dealers/${dealerId}/ai/thread`, {
          method: "POST",
          body: JSON.stringify({ question: body }),
          authToken: token,
        });
      }
      return api<Message>(`/dealer-os/dealers/${dealerId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body, channel: tab }),
        authToken: token,
      });
    },
    onSuccess: () => {
      setDraft("");
      void qc.invalidateQueries({
        queryKey: isAI ? ["ai-thread", dealerId] : ["messages", dealerId, tab],
      });
      void qc.invalidateQueries({ queryKey: ["unread", dealerId] });
      void qc.invalidateQueries({ queryKey: ["unread-summary"] });
      void qc.invalidateQueries({ queryKey: ["inbox-threads"] });
    },
  });

  const saveEdit = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) =>
      api<Message>(`/dealer-os/dealers/${dealerId}/messages/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ body }),
        authToken: (await getToken()) ?? undefined,
      }),
    onSuccess: () => {
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ["messages", dealerId, "note"] });
    },
  });

  const grouped = useMemo(() => {
    if (isAI) return byDay(aiThread.data ?? []);
    return byDay(messages.data ?? []);
  }, [isAI, aiThread.data, messages.data]);

  const loading = isAI ? aiThread.isLoading : messages.isLoading;
  const canSend = draft.trim().length > 0 && !post.isPending;

  function send() {
    if (canSend) post.mutate(draft.trim());
  }

  const placeholder =
    tab === "desk"
      ? "Ask the underwriter, flag something, or bring the desk up to date."
      : tab === "client"
        ? "Write to the business owner. They will see this."
        : tab === "note"
          ? "Something worth remembering about this file."
          : "Ask about this file. The answer comes from its own numbers.";

  return (
    <div className="panel">
      <div className="panel-h">
        <div className="seg">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={tab === t.key ? "on" : undefined}
              onClick={() => {
                setTab(t.key);
                setDraft("");
                setEditing(null);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <span className="sub">
          {tab === "desk"
            ? "Not visible to the client"
            : tab === "client"
              ? "The business owner sees this thread"
              : tab === "note"
                ? "Desk only"
                : "Private to you"}
        </span>
      </div>

      <div className="panel-b">
        <div className="thr" ref={scroller}>
          {loading && <div className="thr-empty">Loading…</div>}

          {!loading && grouped.length === 0 && (
            <div className="thr-empty">
              {tab === "desk"
                ? "Nothing here yet. Anything you write is visible to the underwriter and the super admin, and never to the client."
                : tab === "client"
                  ? "You have not written to the business owner from this file yet."
                  : tab === "note"
                    ? "No notes yet. Notes are for the things a thread buries: who you met, when to follow up, what the owner said about their bank."
                    : "Ask anything about this file. It answers from the file's own numbers, and says so plainly when a number is not in yet."}
            </div>
          )}

          {grouped.map(([day, rows]) => (
            <div key={day} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="thr-day">{day}</div>
              {rows.map((r) => {
                if (isAI) {
                  const m = r as AIMessage;
                  const mine = m.role === "user";
                  return (
                    <div key={m.id} className={`msg${mine ? " mine" : " ai"}`}>
                      <div className="msg-h">
                        <span className="msg-who">{mine ? "You" : "Analyst"}</span>
                        <span className="msg-when">{timeLabel(m.created_at)}</span>
                      </div>
                      <div className="msg-b">{m.body}</div>
                    </div>
                  );
                }
                const m = r as Message;
                const mine = meId !== undefined && m.author_user_id === meId;
                const isNote = m.channel === "note";
                return (
                  <div
                    key={m.id}
                    className={`msg${mine ? " mine" : ""}${m.channel === "client" ? " client-ch" : ""}`}
                  >
                    <div className="msg-h">
                      <span className="msg-who">{m.author_name ?? "Someone"}</span>
                      <span className="msg-when">{timeLabel(m.created_at)}</span>
                      {m.edited_at && <span className="msg-edit">edited</span>}
                      {isNote && mine && editing !== m.id && (
                        <button
                          type="button"
                          className="linky"
                          onClick={() => {
                            setEditing(m.id);
                            setEditDraft(m.body);
                          }}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    {editing === m.id ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <textarea
                          className="field"
                          rows={3}
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                        />
                        <div className="composer-row">
                          <button
                            type="button"
                            className="btn pri"
                            disabled={!editDraft.trim() || saveEdit.isPending}
                            onClick={() => saveEdit.mutate({ id: m.id, body: editDraft.trim() })}
                          >
                            {saveEdit.isPending ? "Saving…" : "Save"}
                          </button>
                          <button type="button" className="linky" onClick={() => setEditing(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="msg-b">{m.body}</div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {isAI && post.isPending && (
            <div className="msg ai">
              <div className="msg-h">
                <span className="msg-who">Analyst</span>
              </div>
              <div className="msg-b">Reading the file…</div>
            </div>
          )}
        </div>

        <div className="composer">
          {tab === "client" && (
            <div className="warnline">
              Anything you send here goes to the business owner. For a remark meant for the
              underwriter, use the Desk tab.
            </div>
          )}

          <textarea
            className="field"
            rows={3}
            placeholder={placeholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />

          <div className="composer-row">
            <button type="button" className="btn pri" disabled={!canSend} onClick={send}>
              {post.isPending
                ? isAI
                  ? "Thinking…"
                  : "Sending…"
                : tab === "client"
                  ? "Send to client"
                  : tab === "note"
                    ? "Add note"
                    : isAI
                      ? "Ask"
                      : "Send to desk"}
            </button>
            <span className="hint">Enter sends, Shift and Enter makes a new line.</span>
          </div>

          {post.isError && (
            <div className="note">
              {post.error instanceof Error ? post.error.message : "That did not send."}
            </div>
          )}
          {saveEdit.isError && (
            <div className="note">
              {saveEdit.error instanceof Error ? saveEdit.error.message : "That did not save."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
