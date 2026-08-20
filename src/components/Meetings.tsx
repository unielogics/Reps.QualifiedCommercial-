"use client";

// Meetings on this file.
//
// The client sees these read-only with a Join button, so a wrong join link is
// worse than a missing one. That is why the field is optional and the form
// never invents one: an owner clicking through to a dead room loses more than
// a call.

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Session = {
  id: string;
  title: string;
  kind: string;
  starts_at: string;
  join_url: string | null;
  notes: string | null;
};

const KINDS = [
  { key: "call", label: "Call" },
  { key: "review", label: "Review" },
  { key: "training", label: "Training" },
];

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The value a datetime-local input wants, in the viewer's own timezone. */
function defaultSlot(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

export default function Meetings({ dealerId }: { dealerId: string }) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("call");
  const [startsAt, setStartsAt] = useState(defaultSlot());
  const [joinUrl, setJoinUrl] = useState("");

  const list = useQuery({
    queryKey: ["sessions", dealerId],
    queryFn: async () =>
      api<Session[]>(`/dealer-os/dealers/${dealerId}/sessions`, {
        authToken: (await getToken()) ?? undefined,
      }),
  });

  const book = useMutation({
    mutationFn: async () =>
      api<Session>(`/dealer-os/dealers/${dealerId}/sessions`, {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          kind,
          // datetime-local has no zone; the browser reads it as local time and
          // toISOString converts, so the server always stores real UTC.
          starts_at: new Date(startsAt).toISOString(),
          join_url: joinUrl.trim() || null,
        }),
        authToken: (await getToken()) ?? undefined,
      }),
    onSuccess: () => {
      setOpen(false);
      setTitle("");
      setJoinUrl("");
      void qc.invalidateQueries({ queryKey: ["sessions", dealerId] });
    },
  });

  const rows = list.data ?? [];
  const now = Date.now();
  const upcoming = rows.filter((r) => new Date(r.starts_at).getTime() >= now);
  const past = rows.filter((r) => new Date(r.starts_at).getTime() < now);

  return (
    <div className="panel">
      <div className="panel-h">
        Meetings
        <span style={{ flex: 1 }} />
        <button type="button" className="linky" onClick={() => setOpen((o) => !o)}>
          {open ? "Cancel" : "Book one"}
        </button>
      </div>
      <div className="panel-b">
        {open && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            <div>
              <label className="lbl">What is it</label>
              <input
                className="field"
                placeholder="Follow-up on the statements"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="lbl">Kind</label>
              <div className="seg">
                {KINDS.map((k) => (
                  <button
                    key={k.key}
                    type="button"
                    className={kind === k.key ? "on" : undefined}
                    onClick={() => setKind(k.key)}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="lbl">When</label>
              <input
                className="field"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div>
              <label className="lbl">Join link (optional)</label>
              <input
                className="field"
                placeholder="Leave empty if you are meeting in person"
                value={joinUrl}
                onChange={(e) => setJoinUrl(e.target.value)}
              />
              <span className="sub">
                The client sees this as a Join button, so an empty box beats a wrong link.
              </span>
            </div>
            <button
              type="button"
              className="btn pri"
              disabled={!title.trim() || !startsAt || book.isPending}
              onClick={() => book.mutate()}
            >
              {book.isPending ? "Booking…" : "Book it"}
            </button>
            {book.isError && (
              <div className="note">
                {book.error instanceof Error ? book.error.message : "That did not book."}
              </div>
            )}
          </div>
        )}

        {list.isLoading && <span className="sub">Loading…</span>}
        {!list.isLoading && rows.length === 0 && !open && (
          <span className="sub">Nothing booked on this file yet.</span>
        )}

        {upcoming.map((r) => (
          <div key={r.id} style={{ marginBottom: 10 }}>
            <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <b style={{ fontSize: 14 }}>{r.title}</b>
              <span className="cellchip c-acc">{r.kind}</span>
            </div>
            <span className="sub">{when(r.starts_at)}</span>
            {r.join_url && (
              <div>
                <a className="linky" href={r.join_url} target="_blank" rel="noreferrer">
                  Join link
                </a>
              </div>
            )}
          </div>
        ))}

        {past.length > 0 && (
          <>
            <label className="lbl mt">Earlier</label>
            {past.slice(0, 5).map((r) => (
              <div key={r.id} className="sub">
                {r.title} · {when(r.starts_at)}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
