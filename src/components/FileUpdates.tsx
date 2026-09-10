"use client";

// What happened on this file, and who is on it.
//
// The rep's file here is a dealer; its timeline lives on the file record the
// backend keeps behind it. That record exists only once someone has opened
// the dealer as a file, so the first question is whether there is one at all,
// asked read-only and never created from here.
//
// Rows are what the backend says happened at the caller's tier; the server
// never sends a row above it, so a rep sees team and client rows and never a
// desk row. The team line is read-only in this app: seats are the desk's.

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ClipboardCheck,
  FileCheck2,
  FileQuestion,
  Flag,
  MessageSquare,
  MessageSquareReply,
  Send,
  StickyNote,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { findFileId, groupByDay, latestTeamChange, relativeTime, teamSummary } from "@/lib/fileUpdates";
import type { FileEvent, FileTeam, Timeline } from "@/lib/fileUpdates";

const ICONS: Record<string, LucideIcon> = {
  "document.requested": FileQuestion,
  "document.received": FileCheck2,
  "message.sent": MessageSquare,
  "status.changed": Flag,
  "team.changed": Users,
  "note.added": StickyNote,
  "review.completed": ClipboardCheck,
  "offer.sent": Send,
  "offer.answered": MessageSquareReply,
};

// The timeline's unread count comes from the same notifications the bell
// shows, and the event stream (useCommunicationEvents) invalidates the
// ["field-notifications"] root on every notification.created. Keying the
// timeline under that root gives it the live refresh without touching the
// stream hook; the 30 s interval covers a burst the server coalesced into
// one notice, and a stream that is down.
const TIMELINE_ROOT = "field-notifications";

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function FileUpdates({ dealerId }: { dealerId: string }) {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  const file = useQuery({
    queryKey: ["file-record", "dealer", dealerId],
    queryFn: async () => findFileId(dealerId, (await getToken()) ?? undefined),
    staleTime: 60_000,
  });
  const profileId = file.data ?? null;

  const timeline = useQuery({
    queryKey: [TIMELINE_ROOT, "file-timeline", profileId],
    queryFn: async () =>
      api<Timeline>(`/application-profiles/${profileId}/timeline?limit=50`, {
        authToken: (await getToken()) ?? undefined,
      }),
    enabled: profileId !== null,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const team = useQuery({
    queryKey: ["file-team", profileId],
    queryFn: async () =>
      api<FileTeam>(`/application-profiles/${profileId}/team`, {
        authToken: (await getToken()) ?? undefined,
      }),
    enabled: profileId !== null,
    staleTime: 5 * 60_000,
  });

  // The team line follows the timeline: a new team.changed row means the
  // seats moved, so re-read them. The first observation is skipped because
  // the team query fetches on its own at mount.
  const events = timeline.data?.events;
  const teamVersion = events ? latestTeamChange(events) : undefined;
  const seenTeamVersion = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (teamVersion === undefined) return;
    if (seenTeamVersion.current !== undefined && seenTeamVersion.current !== teamVersion) {
      void qc.invalidateQueries({ queryKey: ["file-team", profileId] });
    }
    seenTeamVersion.current = teamVersion;
  }, [profileId, qc, teamVersion]);

  const seen = useMutation({
    mutationFn: async () =>
      api(`/application-profiles/${profileId}/timeline/seen`, {
        method: "POST",
        authToken: (await getToken()) ?? undefined,
      }),
    onSuccess: () => {
      // The bell and this timeline read the same notifications.
      void qc.invalidateQueries({ queryKey: [TIMELINE_ROOT] });
    },
  });

  // Relative times drift while the tab sits open; a minute tick keeps them honest.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const grouped = useMemo(() => groupByDay(events ?? [], now), [events, now]);

  if (file.isLoading) return <div className="thr-empty">Loading…</div>;
  if (file.isError) return <div className="thr-empty">{errorText(file.error, "The file could not be reached.")}</div>;
  if (profileId === null) return <div className="thr-empty">Nothing on this file yet.</div>;

  const unread = timeline.data?.unread_count ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <span className="sub">
        {team.data
          ? teamSummary(team.data)
          : team.isError
            ? errorText(team.error, "The team could not be read.")
            : "Loading the team…"}
      </span>

      <div className="row">
        {unread > 0 ? (
          <span className="cellchip c-acc">{unread} new</span>
        ) : (
          <span className="sub">{timeline.data ? "All caught up" : ""}</span>
        )}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="btn sm"
          disabled={unread === 0 || seen.isPending}
          onClick={() => seen.mutate()}
        >
          {seen.isPending ? "Marking…" : "Mark all read"}
        </button>
      </div>
      {seen.isError && <span className="sub">{errorText(seen.error, "That did not save.")}</span>}

      <div className="thr">
        {timeline.isLoading && <div className="thr-empty">Loading…</div>}
        {timeline.isError && (
          <div className="thr-empty">{errorText(timeline.error, "The timeline could not be read.")}</div>
        )}
        {timeline.isSuccess && grouped.length === 0 && (
          <div className="thr-empty">No updates on this file yet.</div>
        )}

        {grouped.map(([day, rows]) => (
          <div key={day} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="thr-day">{day}</div>
            {rows.map((event) => (
              <EventRow key={event.id} event={event} now={now} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function EventRow({ event, now }: { event: FileEvent; now: number }) {
  const Icon = ICONS[event.kind] ?? Activity;
  const stamp = new Date(event.created_at);
  return (
    <div className="msg">
      <div className="msg-h" style={{ alignItems: "center" }}>
        <Icon size={14} strokeWidth={2} aria-hidden style={{ color: "var(--muted)", flex: "0 0 auto" }} />
        <span className="msg-who">{event.title}</span>
        {event.visibility === "client" && <span className="cellchip c-warn">Client sees this</span>}
        {event.visibility === "desk" && <span className="cellchip c-mut">Desk</span>}
      </div>
      <span className="sub" style={{ paddingLeft: 22 }}>
        {event.actor_label ? `${event.actor_label} · ` : ""}
        <time dateTime={event.created_at} title={stamp.toLocaleString()}>
          {relativeTime(event.created_at, now)}
        </time>
      </span>
      {event.body && (
        <div className="msg-b" style={{ marginLeft: 22 }}>
          {event.body}
        </div>
      )}
    </div>
  );
}
