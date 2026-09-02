"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { api, apiBase } from "@/lib/api";

type StreamStatus = "connecting" | "connected" | "disconnected";

type CommunicationEvent = {
  id?: string;
  type?: string;
  dealer_id?: string | null;
  thread_id?: string | null;
  message_id?: string | null;
  channel?: string | null;
};

type SyncState = { revision: string | null };

const MESSAGE_QUERY_ROOTS = new Set([
  "inbox-thread",
  "file-inbox-threads",
  "file-inbox-messages",
  "appointment-sms",
]);

export function useCommunicationEvents(enabled: boolean): StreamStatus {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StreamStatus>("disconnected");
  const revision = useRef<string | null>(null);
  const hiddenAt = useRef<number | null>(null);

  const invalidateOverview = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["inbox-contacts"] });
    void queryClient.invalidateQueries({ queryKey: ["field-notifications"] });
    void queryClient.invalidateQueries({ queryKey: ["unread-summary"] });
  }, [queryClient]);

  const invalidateMessages = useCallback((event?: CommunicationEvent) => {
    invalidateOverview();
    void queryClient.invalidateQueries({
      predicate: (query) => {
        const root = String(query.queryKey[0] ?? "");
        if (MESSAGE_QUERY_ROOTS.has(root)) return true;
        if (root !== "messages" || !event?.dealer_id) return false;
        return query.queryKey[1] === event.dealer_id;
      },
    });
  }, [invalidateOverview, queryClient]);

  const handleEvent = useCallback((event: CommunicationEvent) => {
    const eventType = event.type ?? "sync.required";
    if (eventType === "notification.created") {
      invalidateOverview();
      return;
    }
    invalidateMessages(event);
  }, [invalidateMessages, invalidateOverview]);

  useEffect(() => {
    if (!enabled) {
      setStatus("disconnected");
      return;
    }

    const controller = new AbortController();
    let reconnectTimer: number | null = null;
    let reconnectDelay = 1000;

    const connect = async () => {
      if (controller.signal.aborted) return;
      setStatus("connecting");
      try {
        const token = await getToken();
        if (!token) throw new Error("Authentication is not ready.");
        const response = await fetch(`${apiBase}/communications/events`, {
          headers: {
            Accept: "text/event-stream",
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error(`Event stream failed (${response.status}).`);

        setStatus("connected");
        reconnectDelay = 1000;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
          let boundary = buffer.indexOf("\n\n");
          while (boundary >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const data = frame
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n");
            if (data) {
              try {
                handleEvent(JSON.parse(data) as CommunicationEvent);
              } catch {
                // A malformed event is recoverable; the next heartbeat keeps the stream alive.
              }
            }
            boundary = buffer.indexOf("\n\n");
          }
        }
        if (!controller.signal.aborted) throw new Error("Event stream closed.");
      } catch {
        if (controller.signal.aborted) return;
        setStatus("disconnected");
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null;
          void connect();
        }, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
      }
    };

    void connect();
    return () => {
      controller.abort();
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
    };
  }, [enabled, getToken, handleEvent]);

  useEffect(() => {
    if (!enabled || status !== "disconnected") return;
    let cancelled = false;

    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const state = await api<SyncState>("/communications/sync-state", {
          authToken: (await getToken()) ?? undefined,
        });
        if (cancelled) return;
        if (revision.current !== null && revision.current !== state.revision) invalidateMessages();
        revision.current = state.revision;
      } catch {
        // The stream reconnect loop owns recovery; this is only its low-cost safety net.
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, getToken, invalidateMessages, status]);

  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      if (hiddenAt.current && Date.now() - hiddenAt.current > 30_000) invalidateMessages();
      hiddenAt.current = null;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [enabled, invalidateMessages]);

  return status;
}
