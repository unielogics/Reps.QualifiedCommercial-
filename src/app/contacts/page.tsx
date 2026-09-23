"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Columns3, GripVertical, List, Mail, Plus, Settings2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import {
  displayDate,
  initials,
  type DealerProspect,
  type ProspectOutcome,
  type ProspectPage,
  type ProspectEmailDraft,
  type ProspectStage,
} from "@/lib/prospects";
import BookingDrawer from "@/components/BookingDrawer";
import ProspectAdminDrawer from "@/components/ProspectAdminDrawer";
import ProspectMoveDialog from "@/components/ProspectMoveDialog";
import ProspectQuickAddModal from "@/components/ProspectQuickAddModal";
import { useMe } from "@/lib/useMe";
import ProspectEmailComposer from "@/components/ProspectEmailComposer";
import FollowUpCountdown from "@/components/FollowUpCountdown";
import { marketingDetailHref } from "@/components/MarketingCloseLink";

type Contact = { id: string; name: string; company: string | null; email: string | null; phone: string | null; source: string; updated_at: string };
type ContactPage = { items: Contact[]; total: number; limit: number; offset: number };
type Section = "pipeline" | "contacts";
type PipelineView = "board" | "table";
type MoveTarget = { prospect: DealerProspect; stage: ProspectStage };
type ProspectOwner = { id: string; name: string; email: string; role: string; phone?: string | null; title?: string | null };
type SortKey = "dealer_name" | "stage" | "outcome" | "owner" | "next_follow_up" | "last_activity";

function sourceLabel(source: string) { return source.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase()); }
function stageTone(key: string): string {
  if (key === "converted" || key === "booked") return "success";
  if (key === "not_interested") return "danger";
  if (key.startsWith("follow_up")) return "warning";
  if (key === "emailed") return "accent";
  return "neutral";
}

export default function MarketingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const { isTeam, dealerProspectPipelineEnabled } = useMe();
  const pipelineKnownDisabled = dealerProspectPipelineEnabled === false;
  const [section, setSection] = useState<Section>(() => searchParams.get("section") === "contacts" ? "contacts" : "pipeline");
  const [pipelineView, setPipelineView] = useState<PipelineView>(() => searchParams.get("view") === "table" ? "table" : "board");
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [page, setPage] = useState(() => Math.max(0, Number(searchParams.get("page")) || 0));
  const [stageFilter, setStageFilter] = useState(() => searchParams.get("stage") ?? "");
  const [outcomeFilter, setOutcomeFilter] = useState(() => searchParams.get("outcome") ?? "");
  const [ownerFilter, setOwnerFilter] = useState(() => searchParams.get("owner") ?? "");
  const [sortBy, setSortBy] = useState<SortKey>(() => (searchParams.get("sort") as SortKey | null) ?? "last_activity");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(() => searchParams.get("dir") === "asc" ? "asc" : "desc");
  const [quickAddSeed, setQuickAddSeed] = useState<{ contact_id?: string | null; name?: string | null; dealer_name?: string | null; email?: string | null; phone?: string | null } | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [moveConflict, setMoveConflict] = useState<string | null>(null);
  const [bookingProspect, setBookingProspect] = useState<DealerProspect | null>(null);
  const [emailDraft, setEmailDraft] = useState<{ prospect: DealerProspect; draft: ProspectEmailDraft } | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const pendingRestore = useRef<{ scrollY: number; boardScrollLeft: number } | null>(null);
  const previousSearch = useRef(search);

  const returnTo = useMemo(() => {
    const params = new URLSearchParams();
    if (section !== "pipeline") params.set("section", section);
    if (pipelineView !== "board") params.set("view", pipelineView);
    if (search.trim()) params.set("q", search.trim());
    if (page) params.set("page", String(page));
    if (stageFilter) params.set("stage", stageFilter);
    if (outcomeFilter) params.set("outcome", outcomeFilter);
    if (ownerFilter) params.set("owner", ownerFilter);
    if (sortBy !== "last_activity") params.set("sort", sortBy);
    if (sortDir !== "desc") params.set("dir", sortDir);
    const encoded = params.toString();
    return encoded ? `/marketing?${encoded}` : "/marketing";
  }, [outcomeFilter, ownerFilter, page, pipelineView, search, section, sortBy, sortDir, stageFilter]);

  const rememberContext = () => {
    try {
      sessionStorage.setItem(`marketing-context:${returnTo}`, JSON.stringify({
        scrollY: window.scrollY,
        boardScrollLeft: boardRef.current?.scrollLeft ?? 0,
      }));
    } catch { /* History restoration is an enhancement when storage is unavailable. */ }
  };

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`marketing-context:${returnTo}`);
      if (raw) pendingRestore.current = JSON.parse(raw) as { scrollY: number; boardScrollLeft: number };
    } catch { pendingRestore.current = null; }
    // returnTo is intentionally captured once. A restored URL is the context
    // we came back to; live filter changes create the next context instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // `search` is hydrated from returnTo. Resetting the page during that first
    // render would discard the exact table page the employee just returned to.
    // Only an actual edit after hydration starts a new search at page one.
    if (previousSearch.current === search) return;
    previousSearch.current = search;
    const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(0); }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const pipelineParams = useMemo(() => {
    const params = new URLSearchParams({ q: query, limit: pipelineView === "board" ? "250" : "50", offset: pipelineView === "board" ? "0" : String(page * 50) });
    if (stageFilter) params.set("stage_key", stageFilter);
    if (outcomeFilter) params.set("outcome_key", outcomeFilter);
    if (ownerFilter) params.set("owner_user_id", ownerFilter);
    if (pipelineView === "table") { params.set("sort_by", sortBy); params.set("sort_dir", sortDir); }
    return params.toString();
  }, [outcomeFilter, ownerFilter, page, pipelineView, query, sortBy, sortDir, stageFilter]);
  const prospects = useQuery({
    queryKey: ["dealer-prospects", pipelineParams],
    queryFn: async () => api<ProspectPage>(`/dealer-os/prospects?${pipelineParams}`, { authToken: (await getToken()) ?? undefined }),
    enabled: section === "pipeline" && !pipelineKnownDisabled,
  });
  const pipelineUnavailable = pipelineKnownDisabled || (prospects.error instanceof ApiError && prospects.error.status === 404);
  useEffect(() => {
    if (pipelineUnavailable && section === "pipeline") { setSection("contacts"); setPage(0); }
  }, [pipelineUnavailable, section]);
  const contacts = useQuery({
    queryKey: ["crm-contacts", query, page],
    queryFn: async () => api<ContactPage>(`/dealer-os/contacts?q=${encodeURIComponent(query)}&limit=25&offset=${page * 25}`, { authToken: (await getToken()) ?? undefined }),
    enabled: section === "contacts",
  });
  const team = useQuery({ queryKey: ["prospect-assignees"], queryFn: async () => api<ProspectOwner[]>("/dealer-os/prospect-owners", { authToken: (await getToken()) ?? undefined }), enabled: isTeam && !pipelineUnavailable });
  const stages = useMemo(() => {
    const received = prospects.data?.stages?.filter((stage) => stage.is_active !== false) ?? [];
    return received.slice().sort((a, b) => a.position - b.position);
  }, [prospects.data?.stages]);
  const outcomes: ProspectOutcome[] = useMemo(() => {
    const received = prospects.data?.outcomes?.filter((outcome) => outcome.is_active !== false) ?? [];
    return received.slice().sort((a, b) => a.position - b.position);
  }, [prospects.data?.outcomes]);
  const catalogUnavailable = section === "pipeline" && prospects.isSuccess && (!stages.length || !outcomes.length);
  const pipelineReady = section === "pipeline" && !prospects.isLoading && !prospects.isError && !catalogUnavailable;
  const rows = prospects.data?.items ?? [];
  const contactRows = contacts.data?.items ?? [];
  const total = section === "pipeline" ? prospects.data?.total ?? 0 : contacts.data?.total ?? 0;
  const pageSize = section === "pipeline" ? 50 : 25;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (!pendingRestore.current || prospects.isLoading || contacts.isLoading) return;
    const saved = pendingRestore.current;
    pendingRestore.current = null;
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: saved.scrollY, behavior: "auto" });
      if (boardRef.current) boardRef.current.scrollLeft = saved.boardScrollLeft;
    });
  }, [contacts.isLoading, prospects.isLoading, pipelineView, section]);

  const chooseMove = (prospect: DealerProspect, stageKey: string) => {
    setMoveConflict(null);
    const stage = stages.find((item) => item.key === stageKey);
    if (!stage || stage.key === prospect.stage_key) return;
    setMoveTarget({ prospect, stage });
  };
  const onDrop = (stage: ProspectStage) => {
    const prospect = rows.find((item) => item.id === draggedId);
    setDraggedId(null); setDragOverStage(null);
    if (prospect) chooseMove(prospect, stage.key);
  };
  const refreshPipeline = () => void qc.invalidateQueries({ queryKey: ["dealer-prospects"] });
  const changeSort = (next: SortKey) => { if (sortBy === next) setSortDir((current) => current === "asc" ? "desc" : "asc"); else { setSortBy(next); setSortDir("asc"); } setPage(0); };
  const assignOwner = useMutation({
    mutationFn: async ({ prospect, ownerId }: { prospect: DealerProspect; ownerId: string }) => api<DealerProspect>(`/dealer-os/prospects/${prospect.id}`, { method: "PATCH", body: JSON.stringify({ expected_version: prospect.version, owner_user_id: ownerId }), authToken: (await getToken()) ?? undefined }),
    onSuccess: refreshPipeline,
  });
  return <div className="contactsPage prospectPipelinePage">
    <header className="hd portfolioHeading prospectPipelineHeading">
      <div><span className="eyebrow">Dealer relationships</span><h2>Marketing</h2><p className="lede">Manage dealer prospects, audited outreach, and explicit conversion into a funding file.</p></div>
      <div className="prospectHeaderActions">
        {pipelineUnavailable && isTeam && <button type="button" className="btn" onClick={() => setAdminOpen(true)}><Settings2 size={16} /> Set up Marketing pipeline</button>}
        {section === "pipeline" && isTeam && <button type="button" className="btn" onClick={() => setAdminOpen(true)}><Settings2 size={16} /> Configure</button>}
        {section === "pipeline" && <Link className="btn" href="/inbox?view=marketing"><Mail size={16} /> Email activity</Link>}
        {section === "pipeline" && <button type="button" className="btn pri" disabled={!pipelineReady} onClick={() => setQuickAddSeed({})}><Plus size={17} /> Add prospect</button>}
        {section === "contacts" && <Link href="/products" className="btn pri">Start Product Finder</Link>}
      </div>
    </header>
    <div className="prospectTopTabs" role="tablist" aria-label="Marketing workspace">
      {!pipelineUnavailable && <button type="button" role="tab" aria-selected={section === "pipeline"} className={section === "pipeline" ? "on" : ""} onClick={() => { setSection("pipeline"); setPage(0); }}>Pipeline</button>}
      <button type="button" role="tab" aria-selected={section === "contacts"} className={section === "contacts" ? "on" : ""} onClick={() => { setSection("contacts"); setPage(0); }}>All contacts</button>
    </div>
    <div className={`prospectToolbar${section === "pipeline" && isTeam ? " withOwner" : ""}`}>
      <input className="field prospectSearch" type="search" placeholder={section === "pipeline" ? "Search contact, dealer, email, phone, or owner" : "Search person, company, email, or phone"} value={search} onChange={(event) => setSearch(event.target.value)} />
      {section === "pipeline" && <>
        <select className="field" value={stageFilter} onChange={(event) => { setStageFilter(event.target.value); setPage(0); }}><option value="">All stages</option>{stages.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}</select>
        <select className="field" value={outcomeFilter} onChange={(event) => { setOutcomeFilter(event.target.value); setPage(0); }}><option value="">All call outcomes</option>{outcomes.map((outcome) => <option key={outcome.key} value={outcome.key}>{outcome.label}</option>)}</select>
        {isTeam && <select className="field" value={ownerFilter} onChange={(event) => { setOwnerFilter(event.target.value); setPage(0); }}><option value="">All owners</option>{(team.data ?? []).map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select>}
        <div className="seg prospectViewToggle" role="tablist" aria-label="Pipeline layout"><button type="button" role="tab" aria-label="Board view" title="Board view" aria-selected={pipelineView === "board"} className={pipelineView === "board" ? "on" : ""} onClick={() => { setPipelineView("board"); setPage(0); }}><Columns3 size={16} /> Board</button><button type="button" role="tab" aria-label="Table view" title="Table view" aria-selected={pipelineView === "table"} className={pipelineView === "table" ? "on" : ""} onClick={() => { setPipelineView("table"); setPage(0); }}><List size={16} /> Table</button></div>
      </>}
      <span className="sub prospectTotal">{total} {section === "pipeline" ? "prospects" : "contacts"}</span>
    </div>
    {section === "pipeline" && prospects.isLoading && <div className="panel mt"><div className="empty">Loading Marketing pipeline…</div></div>}
    {section === "pipeline" && prospects.isError && <div className="note mt" role="alert"><b>The authoritative Marketing pipeline could not be loaded.</b><span style={{ display: "block", marginTop: 4 }}>{prospects.error instanceof Error ? prospects.error.message : "Stage and outcome controls are unavailable."}</span><button type="button" className="btn mt" disabled={prospects.isFetching} onClick={() => void prospects.refetch()}>{prospects.isFetching ? "Retrying…" : "Retry pipeline"}</button></div>}
    {catalogUnavailable && <div className="note mt" role="alert"><b>Marketing stage or outcome configuration is missing.</b><span style={{ display: "block", marginTop: 4 }}>Prospects cannot be created or moved until an administrator restores the authoritative workflow catalog.</span><div className="row mt">{isTeam && <button type="button" className="btn" onClick={() => setAdminOpen(true)}>Open configuration</button>}<button type="button" className="btn" disabled={prospects.isFetching} onClick={() => void prospects.refetch()}>{prospects.isFetching ? "Retrying…" : "Retry"}</button></div></div>}
    {section === "pipeline" && assignOwner.isError && <div className="note mt" role="alert">{assignOwner.error instanceof Error ? assignOwner.error.message : "The prospect could not be reassigned."}</div>}
    {section === "pipeline" && moveConflict && <div className="note mt" role="alert">{moveConflict}</div>}
    {section === "pipeline" && pipelineView === "board" && total > rows.length && <div className="note mt" role="status">Showing the first {rows.length} of {total} matching prospects on the board. Use Table view to page through every result.</div>}
    {pipelineReady && pipelineView === "board" && <div ref={boardRef} className="prospectBoard" aria-label="Dealer prospect pipeline">
      {stages.map((stage) => {
        const stageRows = rows.filter((prospect) => prospect.stage_key === stage.key);
        return <section key={stage.key} data-stage-key={stage.key} className={`prospectColumn${dragOverStage === stage.key ? " dragOver" : ""}`} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverStage(stage.key); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOverStage(null); }} onDrop={(event) => { event.preventDefault(); onDrop(stage); }}>
          <header><span className={`prospectStageDot tone-${stageTone(stage.key)}`} /><b>{stage.label}</b><span>{stageRows.length}</span></header>
          <div className="prospectColumnBody">
            {stageRows.map((prospect) => <article key={prospect.id} className={`prospectCard${draggedId === prospect.id ? " dragging" : ""}`}>
              <div className="prospectCardTop"><Link href={marketingDetailHref(`/marketing/prospects/${prospect.id}`, returnTo)} onClick={rememberContext} className="prospectCardMain"><span className="contactAvatar compact">{initials(prospect.name)}</span><span><b>{prospect.dealer_name}</b><strong>{prospect.name}</strong><small>{prospect.email}</small></span></Link><ProspectDragHandle prospect={prospect} stages={stages} onStart={() => setDraggedId(prospect.id)} onHover={setDragOverStage} onDrop={(stageKey) => { setDraggedId(null); setDragOverStage(null); chooseMove(prospect, stageKey); }} onCancel={() => { setDraggedId(null); setDragOverStage(null); }} /></div>
              <div className="prospectCardMeta"><span>{prospect.owner_name || "Unassigned"}</span><span>{prospect.call_attempt_count} call{prospect.call_attempt_count === 1 ? "" : "s"}</span></div>
              {prospect.next_follow_up_at && <div className="prospectFollowUp"><FollowUpCountdown at={prospect.next_follow_up_at} serverNow={prospects.data?.server_now} state={prospect.follow_up_state} timeZone={prospects.data?.follow_up_timezone} /></div>}
              {prospect.last_outcome_label && <span className="cellchip c-mut">{prospect.last_outcome_label}</span>}
              <label className="prospectMoveSelect"><span>Move</span><select className="field" aria-label={`Move ${prospect.name} to another stage`} value="" onChange={(event) => chooseMove(prospect, event.target.value)} onPointerDown={(event) => event.stopPropagation()}><option value="">Choose stage…</option>{stages.filter((item) => item.key !== prospect.stage_key).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
            </article>)}
            {!stageRows.length && <div className="prospectColumnEmpty">Drop a prospect here</div>}
          </div>
        </section>;
      })}
    </div>}
    {pipelineReady && pipelineView === "table" && <div className="panel mt prospectTablePanel"><div className="tblwrap"><table className="tbl portfolioTable prospectTable"><thead><tr><SortableHeader label="Dealer / Contact" sortKey="dealer_name" active={sortBy} direction={sortDir} onSort={changeSort} /><th>Contact details</th><SortableHeader label="Stage" sortKey="stage" active={sortBy} direction={sortDir} onSort={changeSort} /><SortableHeader label="Last outcome" sortKey="outcome" active={sortBy} direction={sortDir} onSort={changeSort} /><SortableHeader label="Owner" sortKey="owner" active={sortBy} direction={sortDir} onSort={changeSort} /><SortableHeader label="Next follow-up" sortKey="next_follow_up" active={sortBy} direction={sortDir} onSort={changeSort} /><SortableHeader label="Activity" sortKey="last_activity" active={sortBy} direction={sortDir} onSort={changeSort} /><th>Move</th></tr></thead><tbody>
      {rows.map((prospect) => { const href = marketingDetailHref(`/marketing/prospects/${prospect.id}`, returnTo); const open = () => { rememberContext(); router.push(href); }; return <tr key={prospect.id} role="link" tabIndex={0} aria-label={`Open ${prospect.dealer_name}`} onClick={open} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } }}><td><span className="contactTableIdentity"><span className="contactAvatar compact">{initials(prospect.name)}</span><span><b>{prospect.dealer_name}</b><small>{prospect.name}</small></span></span></td><td><span className="prospectContactCell"><span>{prospect.email}</span><small>{prospect.phone}</small></span></td><td><span className={`prospectStageBadge tone-${stageTone(prospect.stage_key)}`}>{prospect.stage_label ?? stages.find((item) => item.key === prospect.stage_key)?.label ?? prospect.stage_key}</span></td><td>{prospect.last_outcome_label || <span className="sub">No call logged</span>}</td><td onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>{isTeam ? <select className="field prospectOwnerSelect" aria-label={`Assign ${prospect.name}`} value={prospect.owner_user_id ?? ""} disabled={assignOwner.isPending} onChange={(event) => event.target.value && assignOwner.mutate({ prospect, ownerId: event.target.value })}><option value="" disabled>Unassigned</option>{(team.data ?? []).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select> : prospect.owner_name || <span className="sub">Unassigned</span>}</td><td><FollowUpCountdown at={prospect.next_follow_up_at} serverNow={prospects.data?.server_now} state={prospect.follow_up_state} timeZone={prospects.data?.follow_up_timezone} /></td><td>{displayDate(prospect.last_activity_at ?? prospect.updated_at, true)}</td><td onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}><select className="field prospectTableMove" aria-label={`Move ${prospect.name}`} value="" onChange={(event) => chooseMove(prospect, event.target.value)}><option value="">Move…</option>{stages.filter((item) => item.key !== prospect.stage_key).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></td></tr>; })}
      {!rows.length && <tr><td colSpan={8}><div className="empty">No prospects match these filters.</div></td></tr>}
    </tbody></table></div><Pagination page={page} pageCount={pageCount} total={total} pageSize={pageSize} onPage={setPage} /></div>}
    {section === "contacts" && <div className="panel mt"><div className="tblwrap"><table className="tbl portfolioTable contactTable"><thead><tr><th>Contact</th><th>Company</th><th>Email</th><th>Mobile</th><th>Source</th><th>Updated</th><th>Pipeline</th></tr></thead><tbody>
      {contactRows.map((contact) => { const href = marketingDetailHref(`/marketing/${contact.id}`, returnTo); const open = () => { rememberContext(); router.push(href); }; return <tr key={contact.id} role="link" tabIndex={0} aria-label={`Open ${contact.name}`} onClick={open} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } }}><td><span className="contactTableIdentity"><span className="contactAvatar compact">{initials(contact.name)}</span><b>{contact.name}</b></span></td><td>{contact.company || <span className="sub">Independent contact</span>}</td><td className="sub">{contact.email || "-"}</td><td className="sub num">{contact.phone || "-"}</td><td><span className="cellchip c-mut">{sourceLabel(contact.source)}</span></td><td className="sub num">{displayDate(contact.updated_at)}</td><td onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>{pipelineUnavailable ? <span className="sub">Not enabled</span> : <button type="button" className="btn sm" onClick={() => setQuickAddSeed({ contact_id: contact.id, name: contact.name, dealer_name: contact.company, email: contact.email, phone: contact.phone })}>Add to pipeline</button>}</td></tr>; })}
      {contacts.isLoading && <tr><td colSpan={7}><div className="empty">Loading contacts…</div></td></tr>}{!contacts.isLoading && !contactRows.length && <tr><td colSpan={7}><div className="empty">No contacts match this search.</div></td></tr>}
    </tbody></table></div><Pagination page={page} pageCount={pageCount} total={total} pageSize={pageSize} onPage={setPage} noun="contacts" /></div>}
    {quickAddSeed && <ProspectQuickAddModal initialValues={quickAddSeed} onClose={() => setQuickAddSeed(null)} onProspectSaved={refreshPipeline} onCreated={(created) => { rememberContext(); setQuickAddSeed(null); refreshPipeline(); router.push(marketingDetailHref(`/marketing/prospects/${created.id}`, returnTo)); }} onOpenExisting={(prospectId) => { rememberContext(); setQuickAddSeed(null); router.push(marketingDetailHref(`/marketing/prospects/${prospectId}`, returnTo)); }} onOpenContact={(contactId) => { rememberContext(); setQuickAddSeed(null); router.push(marketingDetailHref(`/marketing/${contactId}`, returnTo)); }} />}
    {moveTarget && <ProspectMoveDialog prospect={moveTarget.prospect} stages={stages} destination={moveTarget.stage} onClose={() => setMoveTarget(null)} onConflict={setMoveConflict} onBook={() => { setBookingProspect(moveTarget.prospect); setMoveTarget(null); }} onEmailDraft={(moved, draft) => setEmailDraft({ prospect: moved, draft })} onMoved={() => { setMoveTarget(null); refreshPipeline(); }} />}
    {bookingProspect && <BookingDrawer prospect={bookingProspect} onClose={() => { setBookingProspect(null); refreshPipeline(); }} onBooked={() => refreshPipeline()} initialCompany={bookingProspect.dealer_name} initialName={bookingProspect.name} initialEmail={bookingProspect.email} initialPhone={bookingProspect.phone} initialKind="program_intro" />}
    {emailDraft && <ProspectEmailComposer prospect={emailDraft.prospect} initialDraft={emailDraft.draft} onClose={() => setEmailDraft(null)} />}
    {adminOpen && <ProspectAdminDrawer onClose={() => setAdminOpen(false)} stages={stages} outcomes={outcomes} onChanged={refreshPipeline} />}
  </div>;
}

function ProspectDragHandle({ prospect, stages, onStart, onHover, onDrop, onCancel }: {
  prospect: DealerProspect;
  stages: ProspectStage[];
  onStart: () => void;
  onHover: (stageKey: string | null) => void;
  onDrop: (stageKey: string) => void;
  onCancel: () => void;
}) {
  const timer = useRef<number | null>(null);
  const active = useRef(false);
  const pointerId = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const hoverStage = useRef<string | null>(null);
  const autoScrollFrame = useRef<number | null>(null);
  const autoScrollBoard = useRef<HTMLElement | null>(null);
  const lastPointer = useRef({ x: 0, y: 0 });
  const [keyboardStage, setKeyboardStage] = useState<string | null>(null);

  const stopAutoScroll = () => {
    if (autoScrollFrame.current !== null) window.cancelAnimationFrame(autoScrollFrame.current);
    autoScrollFrame.current = null;
    autoScrollBoard.current = null;
  };
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    stopAutoScroll();
  };
  const stageAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-stage-key]")?.dataset.stageKey ?? null);
  const runAutoScroll = () => {
    autoScrollFrame.current = null;
    const board = autoScrollBoard.current;
    if (!active.current || !board) return;
    const rect = board.getBoundingClientRect();
    const edge = 72;
    const { x, y } = lastPointer.current;
    let delta = 0;
    if (x < rect.left + edge) delta = -Math.min(22, Math.max(4, Math.ceil((rect.left + edge - x) / 4)));
    else if (x > rect.right - edge) delta = Math.min(22, Math.max(4, Math.ceil((x - (rect.right - edge)) / 4)));
    if (!delta) return;
    board.scrollLeft += delta;
    const key = stageAt(x, y);
    if (key !== hoverStage.current) {
      hoverStage.current = key;
      onHover(key);
    }
    autoScrollFrame.current = window.requestAnimationFrame(runAutoScroll);
  };
  const scheduleAutoScroll = (board: HTMLElement | null, x: number, y: number) => {
    lastPointer.current = { x, y };
    autoScrollBoard.current = board;
    if (autoScrollFrame.current === null) autoScrollFrame.current = window.requestAnimationFrame(runAutoScroll);
  };

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (autoScrollFrame.current !== null) window.cancelAnimationFrame(autoScrollFrame.current);
  }, []);

  const finishTouch = (event: ReactPointerEvent<HTMLButtonElement>) => {
    clear();
    if (pointerId.current !== null && event.currentTarget.hasPointerCapture(pointerId.current)) event.currentTarget.releasePointerCapture(pointerId.current);
    pointerId.current = null;
    if (active.current && hoverStage.current && hoverStage.current !== prospect.stage_key) onDrop(hoverStage.current);
    else onCancel();
    active.current = false;
    hoverStage.current = null;
  };
  const finishKeyboard = (stageKey: string | null) => {
    if (stageKey && stageKey !== prospect.stage_key) onDrop(stageKey);
    else onCancel();
    active.current = false;
    hoverStage.current = null;
    setKeyboardStage(null);
  };

  return <button
    type="button"
    className="prospectCardDragHandle"
    aria-label={keyboardStage ? `Moving ${prospect.name}; selected stage ${stages.find((stage) => stage.key === keyboardStage)?.label ?? keyboardStage}` : `Move ${prospect.name} to another stage`}
    title="Hold and drag, or press Space and use arrow keys"
    draggable
    onDragStart={(event) => { active.current = true; onStart(); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", prospect.id); }}
    onDragEnd={() => { active.current = false; onCancel(); }}
    onPointerDown={(event) => {
      if (event.pointerType === "mouse") return;
      origin.current = { x: event.clientX, y: event.clientY };
      pointerId.current = event.pointerId;
      hoverStage.current = prospect.stage_key;
      event.currentTarget.setPointerCapture(event.pointerId);
      timer.current = window.setTimeout(() => { active.current = true; onStart(); navigator.vibrate?.(20); }, 280);
    }}
    onPointerMove={(event) => {
      if (event.pointerType === "mouse") return;
      if (!active.current) {
        if (Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 10) { clear(); onCancel(); }
        return;
      }
      event.preventDefault();
      const key = stageAt(event.clientX, event.clientY);
      hoverStage.current = key;
      onHover(key);
      scheduleAutoScroll(event.currentTarget.closest<HTMLElement>(".prospectBoard"), event.clientX, event.clientY);
    }}
    onPointerUp={finishTouch}
    onPointerCancel={(event) => { clear(); active.current = false; hoverStage.current = null; if (pointerId.current !== null && event.currentTarget.hasPointerCapture(pointerId.current)) event.currentTarget.releasePointerCapture(pointerId.current); pointerId.current = null; onCancel(); }}
    onKeyDown={(event) => {
      if (event.key === "Escape" && active.current) {
        event.preventDefault();
        finishKeyboard(null);
        return;
      }
      if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && active.current) {
        event.preventDefault();
        const currentKey = hoverStage.current ?? prospect.stage_key;
        const currentIndex = Math.max(0, stages.findIndex((stage) => stage.key === currentKey));
        const delta = event.key === "ArrowRight" ? 1 : -1;
        const next = stages[Math.max(0, Math.min(stages.length - 1, currentIndex + delta))];
        if (next) {
          hoverStage.current = next.key;
          setKeyboardStage(next.key);
          onHover(next.key);
        }
        return;
      }
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        if (!active.current) {
          active.current = true;
          hoverStage.current = prospect.stage_key;
          setKeyboardStage(prospect.stage_key);
          onStart();
          onHover(prospect.stage_key);
        } else {
          finishKeyboard(hoverStage.current);
        }
      }
    }}
  ><GripVertical size={18} /></button>;
}

function Pagination({ page, pageCount, total, pageSize, onPage, noun = "prospects" }: { page: number; pageCount: number; total: number; pageSize: number; onPage: (page: number) => void; noun?: string }) {
  return <div className="paginationRow"><span className="sub">{total ? `${page * pageSize + 1}-${Math.min((page + 1) * pageSize, total)} of ${total}` : `0 ${noun}`}</span><div className="row"><button type="button" className="btn sm" disabled={page === 0} onClick={() => onPage(Math.max(0, page - 1))}>Previous</button><span className="sub num">{page + 1} / {pageCount}</span><button type="button" className="btn sm" disabled={page + 1 >= pageCount} onClick={() => onPage(page + 1)}>Next</button></div></div>;
}

function SortableHeader({ label, sortKey, active, direction, onSort }: { label: string; sortKey: SortKey; active: SortKey; direction: "asc" | "desc"; onSort: (key: SortKey) => void }) {
  return <th aria-sort={active === sortKey ? direction === "asc" ? "ascending" : "descending" : "none"}><button type="button" className={`prospectSortButton${active === sortKey ? " active" : ""}`} onClick={() => onSort(sortKey)}>{label}<span aria-hidden>{active === sortKey ? direction === "asc" ? "↑" : "↓" : "↕"}</span></button></th>;
}
