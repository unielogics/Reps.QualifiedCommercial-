"use client";

import { useMemo, useSyncExternalStore } from "react";

let sharedNow = Date.now();
let sharedTimer: number | null = null;
const countdownListeners = new Set<() => void>();

function subscribeToMinuteTicker(listener: () => void): () => void {
  countdownListeners.add(listener);
  if (sharedTimer === null) {
    sharedNow = Date.now();
    sharedTimer = window.setInterval(() => {
      sharedNow = Date.now();
      countdownListeners.forEach((notify) => notify());
    }, 60_000);
  }
  return () => {
    countdownListeners.delete(listener);
    if (countdownListeners.size === 0 && sharedTimer !== null) {
      window.clearInterval(sharedTimer);
      sharedTimer = null;
    }
  };
}

function currentClientTime(): number {
  return sharedNow;
}

function serverTimePlaceholder(): number {
  return 0;
}

function countdownLabel(target: number, now: number): string {
  const delta = target - now;
  const absolute = Math.abs(delta);
  if (absolute < 60_000) return delta >= 0 ? "Due now" : "Overdue now";
  const minutes = Math.floor(absolute / 60_000);
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const mins = minutes % 60;
  const parts = [days ? `${days}d` : "", hours ? `${hours}h` : "", !days && mins ? `${mins}m` : ""].filter(Boolean).slice(0, 2).join(" ");
  return delta >= 0 ? `Due in ${parts}` : `Overdue ${parts}`;
}

function exactLabel(target: number, timeZone?: string | null): string {
  const date = new Date(target);
  if (!timeZone) return date.toLocaleString();
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export default function FollowUpCountdown({ at, serverNow, state, timeZone }: { at?: string | null; serverNow?: string | null; state?: string | null; timeZone?: string | null }) {
  const target = at ? new Date(at).getTime() : Number.NaN;
  const initialOffset = useMemo(() => {
    const server = serverNow ? new Date(serverNow).getTime() : Number.NaN;
    return Number.isFinite(server) ? server - Date.now() : 0;
  }, [serverNow]);
  const clientNow = useSyncExternalStore(subscribeToMinuteTicker, currentClientTime, serverTimePlaceholder);
  if (!Number.isFinite(target)) return <span className="sub">No follow-up</span>;
  const exact = exactLabel(target, timeZone);
  if (clientNow === 0) {
    return <span className="prospectFollowUpCountdown" title={exact}><b>Follow-up scheduled</b><small>{exact}</small></span>;
  }
  const now = clientNow + initialOffset;
  const tone = state === "overdue" || target < now ? " overdue" : state === "due" ? " due" : "";
  return <span className={`prospectFollowUpCountdown${tone}`} title={exact}><b>{countdownLabel(target, now)}</b><small>{exact}</small></span>;
}
