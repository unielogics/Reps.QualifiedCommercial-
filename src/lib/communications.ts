// Shapes returned by the shared /communications endpoints. The rep app reads
// the same inbox the funding desk does — the backend scopes a FIELD_REP to the
// contacts they own, so there is no rep-specific API to keep in step.

export type UnifiedCommunicationThread = {
  id: string;
  title: string;
  participant_name: string | null;
  participant_email: string | null;
  participant_phone: string | null;
  participant_type: string;
  source_kind: string;
  source_id: string;
  source_ref: string | null;
  source_label: string | null;
  channel: string;
  transport: string;
  unread_count: number;
  message_count: number;
  latest_snippet: string | null;
  latest_at: string;
  href: string;
  can_reply: boolean;
};

export type UnifiedCommunicationMessage = {
  id: string;
  thread_id: string;
  body: string;
  sender_name: string | null;
  sender_type: string;
  direction: "inbound" | "outbound" | "system";
  channel: string;
  transport: string;
  created_at: string;
  seen: boolean;
  delivery_status: string | null;
};

export type UnifiedCommunicationThreadDetail = {
  thread: UnifiedCommunicationThread;
  messages: UnifiedCommunicationMessage[];
};

export type UnifiedContactGroup = {
  key: string;
  name: string;
  email: string | null;
  phone: string | null;
  channels: string[];
  sources: string[];
  unread_total: number;
  message_total: number;
  latest_thread_id: string;
  latest_snippet: string | null;
  latest_channel: string;
  latest_at: string;
  threads: UnifiedCommunicationThread[];
};

export type UnifiedContactPage = {
  items: UnifiedContactGroup[];
  total: number;
  unread_total: number;
};

export type ComposeRecipient = {
  kind: "client" | "intake" | "dealer" | "rep_contact";
  id: string;
  name: string;
  label: string | null;
  email: string | null;
  phone: string | null;
};

export type UnifiedComposeResult = {
  ok: boolean;
  results: { channel: string; ok: boolean; detail: string }[];
  thread_id: string | null;
};

/** A new calendar day between two messages earns a divider, as in iMessage. */
export function dayBreak(previousIso: string | null, currentIso: string): boolean {
  if (!previousIso) return true;
  return new Date(previousIso).toDateString() !== new Date(currentIso).toDateString();
}

export function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
