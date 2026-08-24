"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMe } from "@/lib/useMe";
import ApplicationWizardDrawer from "@/components/ApplicationWizardDrawer";

type OwnerSummary = { id: string; name: string; email: string | null; ownership_pct: number | null };
type Row = {
  id: string; case_ref: string | null; name: string; address: string | null;
  city: string | null; state: string | null; status: string; funding_goal: number | null;
  bank_linked: boolean; credit_returned: boolean; verified: boolean;
  audit_client_since: string | null; created_at: string; updated_at: string;
  archived_at: string | null; owners: OwnerSummary[];
  application_lifecycle: "active" | "draft";
  client_requested_amount: number | null;
};
type Page = { items: Row[]; total: number; limit: number; offset: number };
type UnreadSummary = { total: number; per_file: Record<string, number> };
type IntegrationStatus = {
  isoftpull: { configured: boolean; environment: string; endpoint: string | null; detail: string };
  plaid: { configured: boolean; environment: string; endpoint: string | null; detail: string };
};

function money(value: number | null) {
  return value === null ? "—" : `$${Math.round(value).toLocaleString()}`;
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    ? Boolean(target.closest("button,input,select,textarea,label,a,[role='button']"))
    : false;
}

function stageChip(row: Row) {
  if (row.audit_client_since) return <span className="cellchip c-acc">Audit client</span>;
  if (row.status === "complete") return <span className="cellchip c-acc">Contract</span>;
  if (row.verified) return <span className="cellchip c-ok">Verified</span>;
  if (row.bank_linked || row.credit_returned) return <span className="cellchip c-warn">Verification</span>;
  return <span className="cellchip c-mut">Intake</span>;
}

export default function Portfolio() {
  const router = useRouter();
  const routeSearch = useSearchParams();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { isRep, isTeam, isSuperAdmin } = useMe();
  const [creating, setCreating] = useState(false);
  const [creatingMinimized, setCreatingMinimized] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [queryText, setQueryText] = useState("");
  const [stage, setStage] = useState("all");
  const [bank, setBank] = useState("all");
  const [credit, setCredit] = useState("all");
  const [archive, setArchive] = useState("active");
  const [lifecycle, setLifecycle] = useState<"active" | "draft">("active");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [archiveTarget, setArchiveTarget] = useState<Row | null>(null);
  const [deleteText, setDeleteText] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => { setQueryText(searchText.trim()); setPage(0); }, 250);
    return () => window.clearTimeout(timer);
  }, [searchText]);
  useEffect(() => {
    if (routeSearch.get("new") === "1") { setCreating(true); setCreatingMinimized(false); }
  }, [routeSearch]);
  useEffect(() => setPage(0), [archive, bank, credit, lifecycle, sortDir, stage]);

  const queryString = useMemo(() => new URLSearchParams({
    q: queryText, stage, bank, credit, archive: isSuperAdmin ? archive : "active",
    lifecycle, sort_by: "updated_at", sort_dir: sortDir, limit: "10", offset: String(page * 10),
  }).toString(), [archive, bank, credit, isSuperAdmin, lifecycle, page, queryText, sortDir, stage]);

  const portfolio = useQuery({
    queryKey: ["portfolio", queryString], enabled: isRep || isTeam,
    queryFn: async () => api<Page>(`/dealer-os/portfolio?${queryString}`, { authToken: (await getToken()) ?? undefined }),
  });
  const unread = useQuery({
    queryKey: ["unread-summary"], enabled: isRep || isTeam, staleTime: 30_000,
    queryFn: async () => api<UnreadSummary>("/dealer-os/unread-summary", { authToken: (await getToken()) ?? undefined }),
  });
  const integrations = useQuery({
    queryKey: ["dealer-integrations-status"], enabled: isSuperAdmin,
    queryFn: async () => api<IntegrationStatus>("/dealer-os/integrations/status", { authToken: (await getToken()) ?? undefined }),
  });
  const archiveMutation = useMutation({
    mutationFn: async ({ id, restore }: { id: string; restore: boolean }) => api(`/dealer-os/dealers/${id}/${restore ? "restore" : "archive"}`, {
      method: "POST", authToken: (await getToken()) ?? undefined,
    }),
    onSuccess: async () => {
      setArchiveTarget(null); setDeleteText("");
      await queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    },
  });

  const rows = portfolio.data?.items ?? [];
  const total = portfolio.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 10));

  return (
    <>
      <div className="hd portfolioHeading">
        <div><h2>{isRep ? "Portfolio" : "All applications"}</h2><p className="lede">Search, verify, and manage every active funding file.</p></div>
        <button type="button" className="btn pri" onClick={() => { setCreating(true); setCreatingMinimized(false); }}>Open new application</button>
      </div>

      <div className="portfolioControls mt">
        <div className="seg productMode" role="tablist" aria-label="Application lifecycle">
          <button type="button" className={lifecycle === "active" ? "on" : ""} onClick={() => setLifecycle("active")}>Applications</button>
          <button type="button" className={lifecycle === "draft" ? "on" : ""} onClick={() => setLifecycle("draft")}>Drafts</button>
        </div>
        <input className="field portfolioSearch" type="search" placeholder="Search business, owner, email, or address" value={searchText} onChange={(event) => setSearchText(event.target.value)} />
        <select className="field" aria-label="Stage" value={stage} onChange={(event) => setStage(event.target.value)}>
          <option value="all">All stages</option><option value="awaiting">Awaiting verification</option><option value="verified">Verified</option><option value="contract">In contract</option>
        </select>
        <select className="field" aria-label="Bank status" value={bank} onChange={(event) => setBank(event.target.value)}>
          <option value="all">All bank statuses</option><option value="linked">Bank linked</option><option value="awaiting">Bank awaiting</option>
        </select>
        <select className="field" aria-label="Credit status" value={credit} onChange={(event) => setCredit(event.target.value)}>
          <option value="all">All credit statuses</option><option value="returned">Credit returned</option><option value="awaiting">Credit awaiting</option>
        </select>
        {isSuperAdmin && <select className="field" aria-label="Archive status" value={archive} onChange={(event) => setArchive(event.target.value)}>
          <option value="active">Active files</option><option value="archived">Archived files</option><option value="all">All files</option>
        </select>}
        <button type="button" className="btn" onClick={() => setSortDir((value) => value === "desc" ? "asc" : "desc")}>Updated {sortDir === "desc" ? "newest ↓" : "oldest ↑"}</button>
      </div>

      {isSuperAdmin && integrations.data && <div className="integrationStrip mt">
        <div><span className={`providerDot ${integrations.data.isoftpull.configured ? "ready" : "blocked"}`} /><b>iSoftPull</b><span>{integrations.data.isoftpull.detail}</span></div>
        <div><span className={`providerDot ${integrations.data.plaid.configured && integrations.data.plaid.environment === "production" ? "ready" : "blocked"}`} /><b>Plaid · {integrations.data.plaid.environment}</b><span>{integrations.data.plaid.detail}</span></div>
      </div>}

      <div className="panel mt">
        <div className="tblwrap">
          <table className="tbl portfolioTable">
            <thead><tr><th>Applicant</th><th>Owners</th><th>Where</th><th>Stage</th><th>Bank</th><th>Credit</th><th className="r">Requested</th><th>Updated</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {rows.map((row) => {
                const href = `/applications/${row.id}`;
                const unreadCount = unread.data?.per_file?.[row.id] ?? 0;
                return <tr key={row.id} role="link" tabIndex={0} aria-label={`Open ${row.name}`}
                  onClick={(event) => { if (!isInteractiveTarget(event.target)) router.push(href); }}
                  onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && !isInteractiveTarget(event.target)) { event.preventDefault(); router.push(href); } }}>
                  <td><b>{row.name}</b><span className="sub num" style={{ display: "block" }}>{row.case_ref || "No case reference"}</span></td>
                  <td className="ownerSummary">{row.owners.length ? row.owners.slice(0, 2).map((owner) => owner.name).join(", ") : "—"}{row.owners.length > 2 && <span className="sub"> +{row.owners.length - 2}</span>}</td>
                  <td className="sub">{[row.city, row.state].filter(Boolean).join(", ") || row.address || "—"}</td>
                  <td>{row.application_lifecycle === "draft" ? <span className="cellchip c-mut">Draft</span> : stageChip(row)}{unreadCount > 0 && <span className="cellchip c-acc">{unreadCount} new</span>}</td>
                  <td><span className={`cellchip ${row.bank_linked ? "c-ok" : "c-warn"}`}>{row.bank_linked ? "Linked" : "Awaiting"}</span></td>
                  <td><span className={`cellchip ${row.credit_returned ? "c-ok" : "c-warn"}`}>{row.credit_returned ? "Returned" : "Awaiting"}</span></td>
                  <td className="r num">{money(row.funding_goal)}</td><td className="sub num">{new Date(row.updated_at).toLocaleDateString()}</td>
                  <td className="r">{row.archived_at
                    ? <button type="button" className="iconAction restore" title="Restore file" aria-label={`Restore ${row.name}`} onClick={() => archiveMutation.mutate({ id: row.id, restore: true })}>↺</button>
                    : <button type="button" className="iconAction danger" title="Archive file" aria-label={`Archive ${row.name}`} onClick={() => { setArchiveTarget(row); setDeleteText(""); }}>×</button>}
                  </td>
                </tr>;
              })}
              {!portfolio.isLoading && rows.length === 0 && <tr><td colSpan={9}><div className="empty">No files match the current search and filters.</div></td></tr>}
              {portfolio.isLoading && <tr><td colSpan={9}><div className="empty">Loading applications…</div></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="paginationRow"><span className="sub">{total ? `${page * 10 + 1}–${Math.min((page + 1) * 10, total)} of ${total}` : "0 files"}</span><div className="row">
          <button type="button" className="btn sm" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button><span className="sub num">{page + 1} / {pageCount}</span><button type="button" className="btn sm" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</button>
        </div></div>
      </div>

      {creating && <ApplicationWizardDrawer onClose={() => { setCreating(false); setCreatingMinimized(false); }} onMinimize={() => setCreatingMinimized(true)} minimized={creatingMinimized} />}
      {creating && creatingMinimized && <div className="draftDockTab"><button type="button" onClick={() => setCreatingMinimized(false)}>New application</button><button type="button" aria-label="Close new application" onClick={() => { setCreating(false); setCreatingMinimized(false); }}>×</button></div>}

      {archiveTarget && <div className="modalOverlay" role="presentation" onClick={() => setArchiveTarget(null)}><section className="archiveDialog" role="dialog" aria-modal="true" aria-labelledby="archive-title" onClick={(event) => event.stopPropagation()}>
        <div className="modalHead"><b id="archive-title">Archive {archiveTarget.name}</b><span className="sp" /><button type="button" className="modalClose" aria-label="Close" onClick={() => setArchiveTarget(null)}>×</button></div>
        <div className="modalBody"><p>This hides the file from the rep portfolio. All documents, bank data, credit history, messages, and audit records remain available to super admins.</p><label className="lbl mt">Type delete to confirm</label><input className="field" autoFocus value={deleteText} onChange={(event) => setDeleteText(event.target.value)} />
          {archiveMutation.isError && <div className="note mt">The file could not be archived. Try again.</div>}<div className="row mt" style={{ justifyContent: "flex-end" }}><button type="button" className="btn" onClick={() => setArchiveTarget(null)}>Cancel</button><button type="button" className="btn danger" disabled={deleteText !== "delete" || archiveMutation.isPending} onClick={() => archiveMutation.mutate({ id: archiveTarget.id, restore: false })}>{archiveMutation.isPending ? "Archiving…" : "Archive file"}</button></div>
        </div></section></div>}
    </>
  );
}
