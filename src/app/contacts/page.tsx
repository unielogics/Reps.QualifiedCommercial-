"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Columns3, List, Mail, Plus, Settings2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import {
  DEFAULT_PROSPECT_OUTCOMES,
  DEFAULT_PROSPECT_STAGES,
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
import type { RepAppointment } from "@/lib/appointments";
import ProspectOutboxDrawer from "@/components/ProspectOutboxDrawer";

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

export default function ContactsPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const { isTeam, dealerProspectPipelineEnabled } = useMe();
  const pipelineKnownDisabled = dealerProspectPipelineEnabled === false;
  const [section, setSection] = useState<Section>("pipeline");
  const [pipelineView, setPipelineView] = useState<PipelineView>("board");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [stageFilter, setStageFilter] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("last_activity");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [quickAddSeed, setQuickAddSeed] = useState<{ contact_id?: string | null; name?: string | null; dealer_name?: string | null; email?: string | null; phone?: string | null } | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [outboxOpen, setOutboxOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [moveConflict, setMoveConflict] = useState<string | null>(null);
  const [bookingProspect, setBookingProspect] = useState<DealerProspect | null>(null);
  const [emailDraft, setEmailDraft] = useState<{ prospect: DealerProspect; draft: ProspectEmailDraft } | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  useEffect(() => {
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
    return (received.length ? received : DEFAULT_PROSPECT_STAGES).slice().sort((a, b) => a.position - b.position);
  }, [prospects.data?.stages]);
  const outcomes: ProspectOutcome[] = useMemo(() => {
    const received = prospects.data?.outcomes?.filter((outcome) => outcome.is_active !== false) ?? [];
    return (received.length ? received : DEFAULT_PROSPECT_OUTCOMES).slice().sort((a, b) => a.position - b.position);
  }, [prospects.data?.outcomes]);
  const rows = prospects.data?.items ?? [];
  const contactRows = contacts.data?.items ?? [];
  const total = section === "pipeline" ? prospects.data?.total ?? 0 : contacts.data?.total ?? 0;
  const pageSize = section === "pipeline" ? 50 : 25;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

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
  const completeBookedMove = useMutation({
    mutationFn: async ({ prospect, appointment }: { prospect: DealerProspect; appointment: RepAppointment }) => api<DealerProspect>(`/dealer-os/prospects/${prospect.id}/move-stage`, { method: "POST", body: JSON.stringify({ stage_key: "booked", expected_version: prospect.version, appointment_id: appointment.id, action: "book_appointment" }), authToken: (await getToken()) ?? undefined }),
    onSuccess: refreshPipeline,
    onError: refreshPipeline,
  });

  return <div className="contactsPage prospectPipelinePage">
    <header className="hd portfolioHeading prospectPipelineHeading">
      <div><span className="eyebrow">Dealer relationships</span><h2>Contacts</h2><p className="lede">Move dealer prospects from the first call through booking and AI Intake.</p></div>
      <div className="prospectHeaderActions">
        {pipelineUnavailable && isTeam && <button type="button" className="btn" onClick={() => setAdminOpen(true)}><Settings2 size={16} /> Set up dealer pipeline</button>}
        {section === "pipeline" && isTeam && <button type="button" className="btn" onClick={() => setAdminOpen(true)}><Settings2 size={16} /> Configure</button>}
        {section === "pipeline" && <button type="button" className="btn" onClick={() => setOutboxOpen(true)}><Mail size={16} /> Email outbox</button>}
        {section === "pipeline" && <button type="button" className="btn pri" onClick={() => setQuickAddSeed({})}><Plus size={17} /> Add prospect</button>}
        {section === "contacts" && <Link href="/products" className="btn pri">Start Product Finder</Link>}
      </div>
    </header>
    <div className="prospectTopTabs" role="tablist" aria-label="Contact workspace">
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
    {section === "pipeline" && prospects.isLoading && <div className="panel mt"><div className="empty">Loading dealer pipeline…</div></div>}
    {section === "pipeline" && prospects.isError && <div className="note mt" role="alert">{prospects.error instanceof Error ? prospects.error.message : "The dealer pipeline could not be loaded."}</div>}
    {section === "pipeline" && assignOwner.isError && <div className="note mt" role="alert">{assignOwner.error instanceof Error ? assignOwner.error.message : "The prospect could not be reassigned."}</div>}
    {section === "pipeline" && completeBookedMove.isError && <div className="note mt" role="alert">The appointment was booked, but the prospect could not move to Booked. {completeBookedMove.error instanceof Error ? completeBookedMove.error.message : "Refresh and link the appointment from the prospect."}</div>}
    {section === "pipeline" && moveConflict && <div className="note mt" role="alert">{moveConflict}</div>}
    {section === "pipeline" && pipelineView === "board" && total > rows.length && <div className="note mt" role="status">Showing the first {rows.length} of {total} matching prospects on the board. Use Table view to page through every result.</div>}
    {section === "pipeline" && !prospects.isLoading && pipelineView === "board" && <div className="prospectBoard" aria-label="Dealer prospect pipeline">
      {stages.map((stage) => {
        const stageRows = rows.filter((prospect) => prospect.stage_key === stage.key);
        return <section key={stage.key} className={`prospectColumn${dragOverStage === stage.key ? " dragOver" : ""}`} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverStage(stage.key); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOverStage(null); }} onDrop={(event) => { event.preventDefault(); onDrop(stage); }}>
          <header><span className={`prospectStageDot tone-${stageTone(stage.key)}`} /><b>{stage.label}</b><span>{stageRows.length}</span></header>
          <div className="prospectColumnBody">
            {stageRows.map((prospect) => <article key={prospect.id} className={`prospectCard${draggedId === prospect.id ? " dragging" : ""}`} draggable onDragStart={(event) => { setDraggedId(prospect.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", prospect.id); }} onDragEnd={() => { setDraggedId(null); setDragOverStage(null); }}>
              <Link href={`/contacts/prospects/${prospect.id}`} className="prospectCardMain"><span className="contactAvatar compact">{initials(prospect.name)}</span><span><b>{prospect.dealer_name}</b><strong>{prospect.name}</strong><small>{prospect.email}</small></span></Link>
              <div className="prospectCardMeta"><span>{prospect.owner_name || "Unassigned"}</span><span>{prospect.call_attempt_count} call{prospect.call_attempt_count === 1 ? "" : "s"}</span></div>
              {prospect.next_follow_up_at && <div className="prospectFollowUp">Follow up {displayDate(prospect.next_follow_up_at, true)}</div>}
              {prospect.last_outcome_label && <span className="cellchip c-mut">{prospect.last_outcome_label}</span>}
              <label className="prospectMoveSelect"><span>Move</span><select className="field" aria-label={`Move ${prospect.name} to another stage`} value="" onChange={(event) => chooseMove(prospect, event.target.value)} onPointerDown={(event) => event.stopPropagation()}><option value="">Choose stage…</option>{stages.filter((item) => item.key !== prospect.stage_key).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
            </article>)}
            {!stageRows.length && <div className="prospectColumnEmpty">Drop a prospect here</div>}
          </div>
        </section>;
      })}
    </div>}
    {section === "pipeline" && !prospects.isLoading && pipelineView === "table" && <div className="panel mt prospectTablePanel"><div className="tblwrap"><table className="tbl portfolioTable prospectTable"><thead><tr><SortableHeader label="Dealer / Contact" sortKey="dealer_name" active={sortBy} direction={sortDir} onSort={changeSort} /><th>Contact details</th><SortableHeader label="Stage" sortKey="stage" active={sortBy} direction={sortDir} onSort={changeSort} /><SortableHeader label="Last outcome" sortKey="outcome" active={sortBy} direction={sortDir} onSort={changeSort} /><SortableHeader label="Owner" sortKey="owner" active={sortBy} direction={sortDir} onSort={changeSort} /><SortableHeader label="Next follow-up" sortKey="next_follow_up" active={sortBy} direction={sortDir} onSort={changeSort} /><SortableHeader label="Activity" sortKey="last_activity" active={sortBy} direction={sortDir} onSort={changeSort} /><th>Move</th></tr></thead><tbody>
      {rows.map((prospect) => <tr key={prospect.id} role="link" tabIndex={0} aria-label={`Open ${prospect.dealer_name}`} onClick={() => router.push(`/contacts/prospects/${prospect.id}`)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); router.push(`/contacts/prospects/${prospect.id}`); } }}><td><span className="contactTableIdentity"><span className="contactAvatar compact">{initials(prospect.name)}</span><span><b>{prospect.dealer_name}</b><small>{prospect.name}</small></span></span></td><td><span className="prospectContactCell"><span>{prospect.email}</span><small>{prospect.phone}</small></span></td><td><span className={`prospectStageBadge tone-${stageTone(prospect.stage_key)}`}>{prospect.stage_label ?? stages.find((item) => item.key === prospect.stage_key)?.label ?? prospect.stage_key}</span></td><td>{prospect.last_outcome_label || <span className="sub">No call logged</span>}</td><td onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>{isTeam ? <select className="field prospectOwnerSelect" aria-label={`Assign ${prospect.name}`} value={prospect.owner_user_id ?? ""} disabled={assignOwner.isPending} onChange={(event) => event.target.value && assignOwner.mutate({ prospect, ownerId: event.target.value })}><option value="" disabled>Unassigned</option>{(team.data ?? []).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select> : prospect.owner_name || <span className="sub">Unassigned</span>}</td><td>{displayDate(prospect.next_follow_up_at, true)}</td><td>{displayDate(prospect.last_activity_at ?? prospect.updated_at, true)}</td><td onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}><select className="field prospectTableMove" aria-label={`Move ${prospect.name}`} value="" onChange={(event) => chooseMove(prospect, event.target.value)}><option value="">Move…</option>{stages.filter((item) => item.key !== prospect.stage_key).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></td></tr>)}
      {!rows.length && <tr><td colSpan={8}><div className="empty">No prospects match these filters.</div></td></tr>}
    </tbody></table></div><Pagination page={page} pageCount={pageCount} total={total} pageSize={pageSize} onPage={setPage} /></div>}
    {section === "contacts" && <div className="panel mt"><div className="tblwrap"><table className="tbl portfolioTable contactTable"><thead><tr><th>Contact</th><th>Company</th><th>Email</th><th>Mobile</th><th>Source</th><th>Updated</th><th>Pipeline</th></tr></thead><tbody>
      {contactRows.map((contact) => <tr key={contact.id} role="link" tabIndex={0} aria-label={`Open ${contact.name}`} onClick={() => router.push(`/contacts/${contact.id}`)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); router.push(`/contacts/${contact.id}`); } }}><td><span className="contactTableIdentity"><span className="contactAvatar compact">{initials(contact.name)}</span><b>{contact.name}</b></span></td><td>{contact.company || <span className="sub">Independent contact</span>}</td><td className="sub">{contact.email || "-"}</td><td className="sub num">{contact.phone || "-"}</td><td><span className="cellchip c-mut">{sourceLabel(contact.source)}</span></td><td className="sub num">{displayDate(contact.updated_at)}</td><td onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>{pipelineUnavailable ? <span className="sub">Not enabled</span> : <button type="button" className="btn sm" onClick={() => setQuickAddSeed({ contact_id: contact.id, name: contact.name, dealer_name: contact.company, email: contact.email, phone: contact.phone })}>Add to pipeline</button>}</td></tr>)}
      {contacts.isLoading && <tr><td colSpan={7}><div className="empty">Loading contacts…</div></td></tr>}{!contacts.isLoading && !contactRows.length && <tr><td colSpan={7}><div className="empty">No contacts match this search.</div></td></tr>}
    </tbody></table></div><Pagination page={page} pageCount={pageCount} total={total} pageSize={pageSize} onPage={setPage} noun="contacts" /></div>}
    {quickAddSeed && <ProspectQuickAddModal initialValues={quickAddSeed} onClose={() => setQuickAddSeed(null)} onProspectSaved={refreshPipeline} onCreated={(created) => { setQuickAddSeed(null); refreshPipeline(); router.push(`/contacts/prospects/${created.id}`); }} onOpenExisting={(prospectId) => { setQuickAddSeed(null); router.push(`/contacts/prospects/${prospectId}`); }} />}
    {moveTarget && <ProspectMoveDialog prospect={moveTarget.prospect} stages={stages} destination={moveTarget.stage} onClose={() => setMoveTarget(null)} onConflict={setMoveConflict} onBook={() => { setBookingProspect(moveTarget.prospect); setMoveTarget(null); }} onEmailDraft={(moved, draft) => setEmailDraft({ prospect: moved, draft })} onMoved={() => { setMoveTarget(null); refreshPipeline(); }} />}
    {bookingProspect && <BookingDrawer onClose={() => setBookingProspect(null)} onBooked={(appointment) => completeBookedMove.mutate({ prospect: bookingProspect, appointment })} initialName={bookingProspect.name} initialEmail={bookingProspect.email} initialPhone={bookingProspect.phone} initialKind="program_intro" />}
    {emailDraft && <ProspectEmailComposer prospect={emailDraft.prospect} initialDraft={emailDraft.draft} onClose={() => setEmailDraft(null)} />}
    {adminOpen && <ProspectAdminDrawer onClose={() => setAdminOpen(false)} stages={stages} outcomes={outcomes} onChanged={refreshPipeline} />}
    {outboxOpen && <ProspectOutboxDrawer onClose={() => setOutboxOpen(false)} />}
  </div>;
}

function Pagination({ page, pageCount, total, pageSize, onPage, noun = "prospects" }: { page: number; pageCount: number; total: number; pageSize: number; onPage: (page: number) => void; noun?: string }) {
  return <div className="paginationRow"><span className="sub">{total ? `${page * pageSize + 1}-${Math.min((page + 1) * pageSize, total)} of ${total}` : `0 ${noun}`}</span><div className="row"><button type="button" className="btn sm" disabled={page === 0} onClick={() => onPage(Math.max(0, page - 1))}>Previous</button><span className="sub num">{page + 1} / {pageCount}</span><button type="button" className="btn sm" disabled={page + 1 >= pageCount} onClick={() => onPage(page + 1)}>Next</button></div></div>;
}

function SortableHeader({ label, sortKey, active, direction, onSort }: { label: string; sortKey: SortKey; active: SortKey; direction: "asc" | "desc"; onSort: (key: SortKey) => void }) {
  return <th aria-sort={active === sortKey ? direction === "asc" ? "ascending" : "descending" : "none"}><button type="button" className={`prospectSortButton${active === sortKey ? " active" : ""}`} onClick={() => onSort(sortKey)}>{label}<span aria-hidden>{active === sortKey ? direction === "asc" ? "↑" : "↓" : "↕"}</span></button></th>;
}
