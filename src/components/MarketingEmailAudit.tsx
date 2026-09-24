"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Download, ExternalLink, FileText, MailCheck, Search } from "lucide-react";
import { api, apiBlob } from "@/lib/api";
import { displayDate, type ProspectAccessList, type ProspectEmailAttachment, type ProspectEmailDraft } from "@/lib/prospects";
import { useMe } from "@/lib/useMe";
import Modal from "./Modal";
import ProspectEmailVoidAction from "./ProspectEmailVoidAction";

type DraftPage = { items: ProspectEmailDraft[]; total: number; limit: number; offset: number };
type DeliveryPresentation = {
  label: string;
  tone: "neutral" | "accent" | "success" | "warning" | "danger";
};

function normalize(value?: string | null): string {
  return String(value ?? "").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}

export function marketingDeliveryPresentation(draft: ProspectEmailDraft): DeliveryPresentation {
  const delivery = normalize(draft.delivery_status);
  if (delivery === "delivered") return { label: "Delivered", tone: "success" };
  if (delivery === "bounce" || delivery === "bounced") return { label: "Bounced", tone: "danger" };
  if (delivery === "complaint" || delivery === "complained") return { label: "Complaint", tone: "danger" };
  if (delivery === "failed" || delivery === "rejected") return { label: "Failed", tone: "danger" };
  if (delivery === "blocked" || draft.status === "blocked") return { label: "Blocked", tone: "danger" };
  if (delivery === "unavailable") return { label: "Delivery record unavailable", tone: "warning" };
  if (draft.status === "cancelled") return { label: "Cancelled", tone: "neutral" };
  if (draft.status === "pending_review") return { label: "Reviewing", tone: "warning" };
  if (draft.status === "editing" || draft.status === "drafting") return { label: "Editing", tone: "accent" };
  if (["accepted", "sent", "provider_accepted"].includes(delivery)) return { label: "Provider accepted—awaiting confirmation", tone: "warning" };
  if (draft.status === "queued" || draft.status === "sending" || delivery === "sending" || delivery === "queued") return { label: "Sending", tone: "accent" };
  if (draft.status === "failed") return { label: "Failed", tone: "danger" };
  if (draft.status === "sent") return { label: "Delivery record unavailable", tone: "warning" };
  return { label: "Editing", tone: "neutral" };
}

function filename(asset: ProspectEmailAttachment): string {
  return asset.file_name || asset.name || "marketing-attachment.pdf";
}

export default function MarketingEmailAudit() {
  const { getToken } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const me = useMe();
  const qc = useQueryClient();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [draftStatus, setDraftStatus] = useState("");
  const [deliveryStatus, setDeliveryStatus] = useState("");
  const [source, setSource] = useState<"" | "ai" | "manual">("");
  const [ownerId, setOwnerId] = useState("");
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(params.get("draft_id"));
  const [attachmentBusy, setAttachmentBusy] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const limit = 40;
  const locationQuery = params.toString();

  useEffect(() => {
    const current = new URLSearchParams(locationQuery);
    const nextSearch = current.get("q") ?? "";
    setSearch(nextSearch);
    setQuery(nextSearch.trim());
    setSelectedId(current.get("draft_id"));
    setOffset(0);
  }, [locationQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(search.trim()); setOffset(0); }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const queryString = useMemo(() => {
    const next = new URLSearchParams({ limit: String(limit), offset: String(offset), due: "all" });
    if (query) next.set("q", query);
    if (draftStatus) next.set("draft_status", draftStatus);
    if (deliveryStatus) next.set("delivery_status", deliveryStatus);
    if (source) next.set("source", source);
    if (ownerId) next.set("owner_user_id", ownerId);
    return next.toString();
  }, [deliveryStatus, draftStatus, offset, ownerId, query, source]);

  const list = useQuery({
    queryKey: ["marketing-email-audit", queryString],
    queryFn: async () => api<DraftPage>(`/dealer-os/prospect-email-drafts?${queryString}`, { authToken: (await getToken()) ?? undefined }),
    refetchInterval: 10_000,
  });
  const owners = useQuery({
    queryKey: ["prospect-access-audit-owners"],
    queryFn: async () => api<ProspectAccessList>("/dealer-os/admin/prospect-access", { authToken: (await getToken()) ?? undefined }),
    enabled: me.isTeam,
    staleTime: 60_000,
  });
  const detail = useQuery({
    queryKey: ["marketing-email-audit-detail", selectedId],
    queryFn: async () => api<ProspectEmailDraft>(`/dealer-os/prospect-email-drafts/${selectedId}`, { authToken: (await getToken()) ?? undefined }),
    enabled: Boolean(selectedId),
    refetchInterval: (queryState) => {
      const draft = queryState.state.data;
      return draft && (
        draft.status === "pending_review"
        || (draft.status === "sending" && normalize(draft.delivery_status) !== "unavailable")
        || (draft.status === "sent" && normalize(draft.delivery_status) === "provider_accepted")
      ) ? 3_000 : false;
    },
  });

  useEffect(() => {
    const rows = list.data?.items ?? [];
    if (!selectedId && rows.length) setSelectedId(rows[0].id);
    else if (selectedId && rows.length && !rows.some((row) => row.id === selectedId) && !new URLSearchParams(locationQuery).get("draft_id")) setSelectedId(rows[0].id);
  }, [list.data?.items, locationQuery, selectedId]);

  const selectDraft = (id: string) => {
    setSelectedId(id);
    const next = new URLSearchParams(params.toString());
    next.set("view", "marketing");
    next.set("draft_id", id);
    if (query) next.set("q", query); else next.delete("q");
    router.replace(`/inbox?${next.toString()}`, { scroll: false });
  };

  const openAttachment = async (draftId: string, asset: ProspectEmailAttachment, disposition: "inline" | "attachment") => {
    const key = `${asset.id}:${disposition}`;
    setAttachmentBusy(key);
    setAttachmentError(null);
    try {
      const blob = await apiBlob(`/dealer-os/prospect-email-drafts/${draftId}/attachments/${asset.id}?disposition=${disposition}`, { authToken: (await getToken()) ?? undefined });
      const url = URL.createObjectURL(blob);
      if (disposition === "inline") {
        setPreview((current) => {
          if (current) URL.revokeObjectURL(current.url);
          return { url, name: filename(asset) };
        });
      } else {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename(asset);
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      }
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "The attachment snapshot could not be opened.");
    } finally {
      setAttachmentBusy(null);
    }
  };

  const rows = list.data?.items ?? [];
  const selected = detail.data;
  const selectedState = selected ? marketingDeliveryPresentation(selected) : null;
  const page = Math.floor(offset / limit);
  const pageCount = Math.max(1, Math.ceil((list.data?.total ?? 0) / limit));

  return <><div className="marketingEmailAudit">
    <div className={`prospectToolbar marketingEmailFilters${me.isTeam ? " withOwner" : ""}`}>
      <label className="marketingEmailSearch"><Search size={17} /><input className="field" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search dealer, contact, recipient, subject, or agent" /></label>
      <select className="field" aria-label="Draft state" value={draftStatus} onChange={(event) => { setDraftStatus(event.target.value); setOffset(0); }}><option value="">All draft states</option><option value="pending_review">Reviewing</option><option value="editing">Editing</option><option value="sending">Sending</option><option value="sent">Sent</option><option value="blocked">Blocked</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option></select>
      <select className="field" aria-label="Delivery state" value={deliveryStatus} onChange={(event) => { setDeliveryStatus(event.target.value); setOffset(0); }}><option value="">All delivery states</option><option value="provider_accepted">Provider accepted—awaiting confirmation</option><option value="delivered">Delivered</option><option value="bounced">Bounced</option><option value="complaint">Complaint</option><option value="failed">Failed</option><option value="blocked">Blocked</option><option value="cancelled">Cancelled</option><option value="unavailable">Delivery record unavailable</option></select>
      <select className="field" aria-label="Drafting source" value={source} onChange={(event) => { setSource(event.target.value as "" | "ai" | "manual"); setOffset(0); }}><option value="">AI and manual</option><option value="ai">AI-assisted</option><option value="manual">Manual</option></select>
      {me.isTeam && <select className="field" aria-label="Owner" value={ownerId} onChange={(event) => { setOwnerId(event.target.value); setOffset(0); }}><option value="">All owners</option>{(owners.data?.items ?? []).map((owner) => <option key={owner.user_id} value={owner.user_id}>{owner.name}{owner.effective_enabled ? "" : " · package disabled"}</option>)}</select>}
    </div>

    <div className="marketingEmailWorkspace">
      <section className="panel marketingEmailList" aria-label="Marketing email history">
        <div className="panel-h"><span><b>Marketing emails</b><small>{list.data?.total ?? 0} accessible records</small></span></div>
        <div className="marketingEmailRows">
          {list.isLoading && <div className="empty compact">Loading Marketing email history…</div>}
          {list.isError && <div className="note" role="alert">{list.error instanceof Error ? list.error.message : "Marketing email history could not be loaded."}</div>}
          {rows.map((draft) => { const state = marketingDeliveryPresentation(draft); return <button type="button" key={draft.id} className={`marketingEmailRow${selectedId === draft.id ? " selected" : ""}`} onClick={() => selectDraft(draft.id)}><span className="marketingEmailRowTop"><b>{draft.dealer_name || draft.prospect_name || "Dealer prospect"}</b><time>{displayDate(draft.sent_at ?? draft.created_at, true)}</time></span><strong>{draft.subject || "Untitled email"}</strong><small>{draft.contact_name || draft.to_email || "Recipient unavailable"} · {draft.owner_name || "Unassigned"}</small><span className="marketingEmailRowMeta"><span className={`marketingDeliveryState tone-${state.tone}`}>{state.label}</span><span className="cellchip c-mut">{draft.compose_mode === "manual" ? "Manual" : "AI-assisted"}</span></span></button>; })}
          {!list.isLoading && !list.isError && !rows.length && <div className="empty compact">No Marketing emails match these filters.</div>}
        </div>
        <div className="paginationRow"><span className="sub">{list.data?.total ? `${offset + 1}-${Math.min(offset + limit, list.data.total)} of ${list.data.total}` : "0 emails"}</span><div className="row"><button type="button" className="btn sm" disabled={page === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>Previous</button><span className="sub num">{page + 1} / {pageCount}</span><button type="button" className="btn sm" disabled={page + 1 >= pageCount} onClick={() => setOffset(offset + limit)}>Next</button></div></div>
      </section>

      <section className="panel marketingEmailDetail" aria-label="Selected Marketing email">
        {!selectedId && <div className="empty">Choose an email to inspect its exact audited copy and delivery record.</div>}
        {selectedId && detail.isLoading && <div className="empty">Loading exact email record…</div>}
        {detail.isError && <div className="note" role="alert">{detail.error instanceof Error ? detail.error.message : "This email record is unavailable."}</div>}
        {selected && <>
          <div className="panel-h marketingEmailDetailHead"><span><small>Exact audited message</small><b>{selected.subject}</b></span>{selectedState && <span className={`marketingDeliveryState tone-${selectedState.tone}`}><MailCheck size={14} /> {selectedState.label}</span>}</div>
          <div className="panel-b marketingEmailDetailBody">
            <div className="marketingEmailIdentityGrid">
              <div><span>Dealer</span><b>{selected.dealer_name || selected.prospect_name || "Unavailable"}</b>{selected.prospect_archived_at && <small>Archived prospect</small>}</div>
              <div><span>Contact / recipient</span><b>{selected.contact_name || "Unavailable"}</b><small>{selected.to_email || "Recipient unavailable"}</small></div>
              <div><span>Current owner</span><b>{selected.owner_name || "Unassigned"}</b></div>
              <div><span>Triggered by</span><b>{selected.triggering_agent_name || "System"}</b><small>{selected.triggering_agent_email || ""}</small></div>
              <div><span>Sender</span><b>{selected.sender_from_name || selected.sender_display_name || "Qualified Commercial Dealer Desk"}</b><small>{selected.from_email || selected.envelope_from_email || "Unavailable"}</small></div>
              <div><span>Reply-To</span><b>{selected.reply_to || selected.reply_contact_email || "Unavailable"}</b></div>
              <div><span>CC recipients</span><b>{(selected.cc_emails ?? []).length ? (selected.cc_emails ?? []).join(", ") : "None"}</b></div>
            </div>
            {selected.prospect_id && <Link className="btn sm marketingProspectLink" href={`/marketing/prospects/${selected.prospect_id}`}>Open Marketing prospect <ExternalLink size={14} /></Link>}
            {["pending_review", "editing"].includes(selected.status) && <ProspectEmailVoidAction source="marketing_audit" showCountdown draft={selected} onDraftChange={(updated) => { qc.setQueryData(["marketing-email-audit-detail", selected.id], updated); void qc.invalidateQueries({ queryKey: ["marketing-email-audit"] }); }} />}
            {selected.status === "sending" && <div className="note" role="alert"><b>Delivery already started and cannot be recalled.</b><span style={{ display: "block", marginTop: 4 }}>The provider handoff has begun; the delivery record is refreshing.</span></div>}
            {selected.status === "cancelled" && <div className="prospectVoidedNotice" role="status"><Ban size={18} /><span><b>Voided before send</b><small>This email will not be delivered.</small></span></div>}
            <div className="marketingEmailCopy"><span className="lbl">Subject</span><div>{selected.subject}</div><span className="lbl">Exact plain-text body sent or queued</span><pre>{selected.body}</pre></div>
            <div className="marketingEmailAttachments"><div><b>Attachment snapshots</b><small>These exact versions remain available even if the Marketing collateral is later retired.</small></div>{(selected.attachments ?? []).map((asset) => <div className="marketingEmailAttachment" key={asset.id}><FileText size={17} /><span><b>{filename(asset)}</b><small>Version {asset.version}{asset.size_bytes ? ` · ${(asset.size_bytes / 1024 / 1024).toFixed(2)} MB` : ""}</small></span><button type="button" className="btn sm" disabled={attachmentBusy === `${asset.id}:inline`} onClick={() => void openAttachment(selected.id, asset, "inline")}>Preview</button><button type="button" className="btn sm" aria-label={`Download ${filename(asset)}`} disabled={attachmentBusy === `${asset.id}:attachment`} onClick={() => void openAttachment(selected.id, asset, "attachment")}><Download size={14} /> Download</button></div>)}{!(selected.attachments ?? []).length && <span className="sub">No PDF snapshots were attached.</span>}{attachmentError && <div className="note" role="alert">{attachmentError}</div>}</div>
            <div className="marketingEmailAuditGrid">
              <div><span>Draft created</span><b>{displayDate(selected.created_at, true)}</b></div><div><span>Provider accepted</span><b>{displayDate(selected.sent_at, true)}</b></div><div><span>Confirmed delivered</span><b>{displayDate(selected.delivered_at, true)}</b></div><div><span>Opened (secondary)</span><b>{displayDate(selected.opened_at, true)}</b></div><div><span>Failed</span><b>{displayDate(selected.failed_at, true)}</b></div><div><span>Drafting source</span><b>{selected.compose_mode === "manual" ? "Manual" : "AI-assisted"}</b></div>
            </div>
            <div className="marketingProviderRecord"><span><b>Provider record</b><small>{selected.provider || "Provider unavailable"} · {selected.provider_status || "Status unavailable"} · {selected.provider_message_id || "Message ID unavailable"}</small></span>{selected.provider_detail && <p>{selected.provider_detail}</p>}</div>
          </div>
        </>}
      </section>
    </div>
  </div>{preview && <Modal title={preview.name} width={1040} onClose={() => { URL.revokeObjectURL(preview.url); setPreview(null); }}><iframe className="marketingAttachmentPreview" title={`Preview ${preview.name}`} src={preview.url} /></Modal>}</>;
}
