// The file behind a dealer, who is on it, and what happened on it.
//
// Every file (an application profile on the backend) has a team and a
// timeline, read over the same bearer API as everything else here. This
// module holds the shapes and the small pure helpers the Updates tab renders
// from, so the component stays about layout. Nothing in here writes.

import { api, ApiError } from "./api";

export type FileEventKind =
  | "document.requested"
  | "document.received"
  | "message.sent"
  | "status.changed"
  | "team.changed"
  | "note.added"
  | "review.completed"
  | "offer.sent"
  | "offer.answered";

export type FileEventVisibility = "client" | "team" | "desk";

export type FileEvent = {
  schema: string;
  id: string;
  profile_id: string;
  // Typed loosely on purpose: a new kind on the server is still a row here.
  kind: FileEventKind | string;
  visibility: FileEventVisibility | string;
  title: string;
  body: string | null;
  actor_label: string | null;
  target_type: string | null;
  target_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

export type Timeline = {
  tier: FileEventVisibility | string;
  unread_count: number;
  events: FileEvent[];
};

export type TeamMember = { user_id: string; name: string; email: string; role: string };

export type FileTeam = {
  // A client login gets only { name }, so everything but the name is optional.
  agent: (Partial<TeamMember> & { name: string; derived_from?: string }) | null;
  underwriters: TeamMember[];
  company: { id: string; name: string; kind: string; derived: boolean } | null;
  can_edit?: boolean;
};

/**
 * The file record behind a dealer, or null when nobody has opened it as a
 * file yet. Read-only: the backend never creates one from this call.
 */
export async function findFileId(dealerId: string, authToken: string | undefined): Promise<string | null> {
  try {
    const found = await api<{ id: string }>(
      `/application-profiles/find?source_kind=dealer&source_id=${encodeURIComponent(dealerId)}`,
      { authToken },
    );
    return found.id;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** "Agent: Ana Lopez · Underwriters: Jane Doe, Bob Ray" */
export function teamSummary(team: FileTeam): string {
  const agent = team.agent?.name?.trim() || "unassigned";
  const underwriters = team.underwriters.map((u) => u.name?.trim()).filter(Boolean);
  return `Agent: ${agent} · Underwriters: ${underwriters.length ? underwriters.join(", ") : "none"}`;
}

/**
 * The newest team.changed row, as a version stamp for the team line: when a
 * new one lands in the timeline the team on the file has moved.
 */
export function latestTeamChange(events: FileEvent[]): string | null {
  let best: FileEvent | null = null;
  for (const e of events) {
    if (e.kind === "team.changed" && (best === null || e.created_at > best.created_at)) best = e;
  }
  return best?.id ?? null;
}

/** "just now", "12m ago", "3h ago", "2d ago", then a short date. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  if (diff < 45_000) return "just now";
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(diff / 3_600_000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(diff / 86_400_000);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function dayLabel(iso: string, now: number = Date.now()): string {
  const d = new Date(iso);
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(now - 86_400_000);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Group by calendar day in the order given, so a feed reads as days, not one wall. */
export function groupByDay(events: FileEvent[], now: number = Date.now()): Array<[string, FileEvent[]]> {
  const out: Array<[string, FileEvent[]]> = [];
  for (const e of events) {
    const label = dayLabel(e.created_at, now);
    const last = out[out.length - 1];
    if (last && last[0] === label) last[1].push(e);
    else out.push([label, [e]]);
  }
  return out;
}
