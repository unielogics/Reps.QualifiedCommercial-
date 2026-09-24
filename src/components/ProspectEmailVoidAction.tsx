"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, Clock3 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { ProspectEmailDraft } from "@/lib/prospects";

function secondsUntil(value?: string | null): number {
  if (!value) return 0;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 1000));
}

export default function ProspectEmailVoidAction({
  draft,
  onDraftChange,
  showCountdown = false,
  compact = false,
  source = "composer",
}: {
  draft: ProspectEmailDraft;
  onDraftChange: (draft: ProspectEmailDraft) => void;
  showCountdown?: boolean;
  compact?: boolean;
  source?: "composer" | "prospect_banner" | "marketing_audit";
}) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [remaining, setRemaining] = useState(() => secondsUntil(draft.send_after));
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setRemaining(secondsUntil(draft.send_after));
    if (draft.status !== "pending_review" || !draft.send_after) return;
    const timer = window.setInterval(() => setRemaining(secondsUntil(draft.send_after)), 500);
    return () => window.clearInterval(timer);
  }, [draft.send_after, draft.status]);

  const voidSend = useMutation({
    mutationFn: async () => api<ProspectEmailDraft>(`/dealer-os/prospect-email-drafts/${draft.id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ expected_version: draft.version ?? 1, source }),
      authToken: (await getToken()) ?? undefined,
    }),
    onSuccess: (updated) => {
      setMessage(null);
      onDraftChange(updated);
      void qc.invalidateQueries({ queryKey: ["prospect-email-drafts"] });
      void qc.invalidateQueries({ queryKey: ["marketing-email-audit"] });
      void qc.invalidateQueries({ queryKey: ["prospect-timeline"] });
    },
    onError: async (error) => {
      const conflict = error instanceof ApiError && error.status === 409;
      setMessage(conflict ? "Delivery already started and cannot be recalled." : error instanceof Error ? error.message : "This email could not be voided.");
      try {
        const authoritative = await api<ProspectEmailDraft>(`/dealer-os/prospect-email-drafts/${draft.id}`, { authToken: (await getToken()) ?? undefined });
        onDraftChange(authoritative);
      } catch {
        // Preserve the actionable mutation error when an authoritative refresh also fails.
      }
    },
  });

  if (!["pending_review", "editing"].includes(draft.status)) return null;

  return <div className={`prospectEmailVoidAction${compact ? " compact" : ""}`}>
    {showCountdown && <span className="prospectEmailVoidTimer"><Clock3 size={16} /><span><b>{draft.status === "pending_review" ? remaining > 0 ? `Auto-sends in ${remaining}s` : "Delivery handoff is starting" : "Editing — automatic send stopped"}</b><small>Voiding is permanent for this draft.</small></span></span>}
    <button type="button" className="btn danger prospectVoidEmailButton" disabled={voidSend.isPending} onClick={() => voidSend.mutate()}><Ban size={16} />{voidSend.isPending ? "Voiding…" : "Do not send this email"}</button>
    {message && <div className="prospectVoidMessage" role="alert">{message}</div>}
  </div>;
}
