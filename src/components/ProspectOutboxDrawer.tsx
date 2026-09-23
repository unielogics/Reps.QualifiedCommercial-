"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { Clock3, Mail } from "lucide-react";
import { api } from "@/lib/api";
import { displayDate, type ProspectEmailDraft } from "@/lib/prospects";
import Drawer from "./Drawer";

type OutboxPage = { items: ProspectEmailDraft[]; total: number; limit: number; offset: number };
type Filter = "all" | "pending_review" | "editing" | "blocked" | "sent" | "failed" | "cancelled";

function remaining(draft: ProspectEmailDraft, now: number): number | null {
  if (draft.status !== "pending_review" || !draft.send_after) return null;
  return Math.max(0, Math.ceil((new Date(draft.send_after).getTime() - now) / 1000));
}

export default function ProspectOutboxDrawer({ onClose }: { onClose: () => void }) {
  const { getToken } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1_000); return () => window.clearInterval(timer); }, []);
  const query = useQuery({
    queryKey: ["prospect-shared-outbox", filter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100", offset: "0", due: "all" });
      if (filter !== "all") params.append("status", filter);
      return api<OutboxPage>(`/dealer-os/prospect-email-drafts?${params}`, { authToken: (await getToken()) ?? undefined });
    },
    refetchInterval: 5_000,
  });
  return <Drawer title="Dealer email outbox" width={980} onClose={onClose}>
    <div className="panel prospectOutbox">
      <div className="panel-h prospectOutboxFilters"><span><b>Shared delivery queue</b><small>{query.data?.total ?? 0} messages</small></span><select className="field" value={filter} onChange={(event) => setFilter(event.target.value as Filter)}><option value="all">All status</option><option value="pending_review">Pending review</option><option value="editing">Editing</option><option value="blocked">Blocked</option><option value="sent">Sent</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option></select></div>
      <div className="panel-b prospectOutboxRows">
        {query.isLoading && <div className="empty compact">Loading outbox…</div>}
        {query.isError && <div className="note" role="alert">{query.error instanceof Error ? query.error.message : "The outbox could not be loaded."}</div>}
        {(query.data?.items ?? []).map((draft) => { const seconds = remaining(draft, now); return <Link className="prospectOutboxRow" key={draft.id} href={draft.prospect_id ? `/marketing/prospects/${draft.prospect_id}` : "/marketing"} onClick={onClose}><span className="prospectOutboxIcon"><Mail size={17} /></span><span className="prospectOutboxCopy"><b>{draft.subject}</b><small>{draft.to_email || "Dealer recipient"} · {displayDate(draft.sent_at ?? draft.created_at, true)}</small>{draft.error && <em>{draft.error}</em>}</span>{seconds !== null && <span className="prospectOutboxTimer"><Clock3 size={14} />{seconds}s</span>}<span className={`prospectDraftStatus status-${draft.status}`}>{draft.status.replaceAll("_", " ")}</span></Link>; })}
        {!query.isLoading && !query.isError && !(query.data?.items ?? []).length && <div className="empty compact">No email drafts match this status.</div>}
      </div>
    </div>
  </Drawer>;
}
