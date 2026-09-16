"use client";

import { useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, GripVertical, Plus, Search, Upload, Users } from "lucide-react";
import { api, apiBlob, apiUpload } from "@/lib/api";
import type { ProspectAccessList, ProspectAccessUser, ProspectOutcome, ProspectStage } from "@/lib/prospects";
import Drawer from "./Drawer";

type AdminTab = "access" | "stages" | "outcomes" | "collateral";
type CollateralAsset = {
  id: string;
  name: string;
  file_name: string;
  version: number;
  sort_order: number;
  status: "pending_approval" | "active" | "retired";
  size_bytes?: number | null;
  sha256?: string | null;
  validation_status?: string | null;
  uploaded_by_user_id?: string | null;
  approved_by_user_id?: string | null;
  retired_by_user_id?: string | null;
  created_at: string;
};
type CollateralList = { items: CollateralAsset[] };
type CollateralHistoryItem = {
  id: string;
  asset_id: string;
  actor_user_id?: string | null;
  event_type: string;
  details?: Record<string, unknown> | null;
  created_at: string;
};
type CollateralHistoryList = { items: CollateralHistoryItem[] };

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export default function ProspectAdminDrawer({
  onClose,
  stages: initialStages,
  outcomes: initialOutcomes,
  onChanged,
}: {
  onClose: () => void;
  stages: ProspectStage[];
  outcomes: ProspectOutcome[];
  onChanged: () => void;
}) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<AdminTab>("access");
  const [newLabel, setNewLabel] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [draggedCollateralId, setDraggedCollateralId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const stageQuery = useQuery({ queryKey: ["prospect-stage-admin"], queryFn: async () => api<ProspectStage[]>("/dealer-os/prospect-stages?include_inactive=true", { authToken: (await getToken()) ?? undefined }), initialData: initialStages, enabled: tab === "stages" || tab === "outcomes" });
  const outcomeQuery = useQuery({ queryKey: ["prospect-outcome-admin"], queryFn: async () => api<ProspectOutcome[]>("/dealer-os/prospect-outcomes?include_inactive=true", { authToken: (await getToken()) ?? undefined }), initialData: initialOutcomes, enabled: tab === "outcomes" });
  const access = useQuery({ queryKey: ["prospect-access-admin"], queryFn: async () => api<ProspectAccessList>("/dealer-os/admin/prospect-access", { authToken: (await getToken()) ?? undefined }), enabled: tab === "access" });
  const collateral = useQuery({ queryKey: ["marketing-collateral"], queryFn: async () => api<CollateralList>("/dealer-os/marketing-collateral?include_retired=true", { authToken: (await getToken()) ?? undefined }), enabled: tab === "collateral" });
  const invalidate = () => { void qc.invalidateQueries({ queryKey: ["prospect-stage-admin"] }); void qc.invalidateQueries({ queryKey: ["prospect-outcome-admin"] }); void qc.invalidateQueries({ queryKey: ["marketing-collateral"] }); onChanged(); };

  const createDefinition = useMutation({
    mutationFn: async ({ kind, label }: { kind: "stage" | "outcome"; label: string }) => api(kind === "stage" ? "/dealer-os/prospect-stages" : "/dealer-os/prospect-outcomes", { method: "POST", body: JSON.stringify({ key: slug(label), label: label.trim() }), authToken: (await getToken()) ?? undefined }),
    onSuccess: () => { setNewLabel(""); invalidate(); },
  });
  const updateDefinition = useMutation({
    mutationFn: async ({ kind, id, data }: { kind: "stage" | "outcome"; id: string; data: Record<string, unknown> }) => api(`${kind === "stage" ? "/dealer-os/prospect-stages" : "/dealer-os/prospect-outcomes"}/${id}`, { method: "PATCH", body: JSON.stringify(data), authToken: (await getToken()) ?? undefined }),
    onSuccess: invalidate,
  });
  const reorderDefinition = useMutation({
    mutationFn: async ({ kind, ids }: { kind: "stage" | "outcome"; ids: string[] }) => api(`${kind === "stage" ? "/dealer-os/prospect-stages" : "/dealer-os/prospect-outcomes"}/reorder`, { method: "POST", body: JSON.stringify({ ordered_ids: ids }), authToken: (await getToken()) ?? undefined }),
    onSuccess: invalidate,
  });
  const upload = useMutation({
    mutationFn: async () => {
      if (!uploadFile) throw new Error("Choose a PDF first.");
      const form = new FormData(); form.append("file", uploadFile); form.append("name", uploadTitle.trim() || uploadFile.name.replace(/\.pdf$/i, "")); form.append("sort_order", "0");
      return apiUpload<CollateralAsset>("/dealer-os/marketing-collateral", form, { authToken: (await getToken()) ?? undefined });
    },
    onSuccess: () => { setUploadFile(null); setUploadTitle(""); if (fileInput.current) fileInput.current.value = ""; invalidate(); },
  });
  const updateCollateral = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approve" | "retire" | "restore" }) => api(`/dealer-os/marketing-collateral/${id}/${action}`, { method: "POST", body: JSON.stringify({}), authToken: (await getToken()) ?? undefined }),
    onSuccess: invalidate,
  });
  const reorderCollateral = useMutation({
    mutationFn: async ({ expectedIds, orderedIds }: { expectedIds: string[]; orderedIds: string[] }) => api<CollateralList>("/dealer-os/marketing-collateral/reorder", {
      method: "POST",
      body: JSON.stringify({ expected_ids: expectedIds, ordered_ids: orderedIds }),
      authToken: (await getToken()) ?? undefined,
    }),
    onSuccess: invalidate,
  });
  const updateAccess = useMutation({
    mutationFn: async ({ user, enabled }: { user: ProspectAccessUser; enabled: boolean }) => api<ProspectAccessUser>(`/dealer-os/admin/prospect-access/${user.user_id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled, reason: enabled ? "Enabled from Field Desk pipeline configuration" : "Disabled from Field Desk pipeline configuration" }),
      authToken: (await getToken()) ?? undefined,
    }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["prospect-access-admin"] });
      await qc.invalidateQueries({ queryKey: ["me"] });
      onChanged();
    },
  });
  const previewCollateral = useMutation({
    mutationFn: async ({ id, target }: { id: string; target: Window }) => {
      const blob = await apiBlob(`/dealer-os/marketing-collateral/${id}/document?disposition=inline`, { authToken: (await getToken()) ?? undefined });
      const objectUrl = URL.createObjectURL(blob);
      target.location.href = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    },
  });
  const openCollateralPreview = (id: string) => {
    const target = window.open("about:blank", "_blank");
    if (!target) return;
    target.opener = null;
    previewCollateral.mutate({ id, target });
  };
  const reorderCollateralAt = (targetId: string) => {
    if (!draggedCollateralId || draggedCollateralId === targetId) return setDraggedCollateralId(null);
    const active = (collateral.data?.items ?? []).filter((asset) => asset.status !== "retired").slice().sort((a, b) => a.sort_order - b.sort_order);
    const expectedIds = active.map((asset) => asset.id);
    const orderedIds = [...expectedIds];
    const from = orderedIds.indexOf(draggedCollateralId);
    const to = orderedIds.indexOf(targetId);
    setDraggedCollateralId(null);
    if (from < 0 || to < 0) return;
    orderedIds.splice(from, 1);
    orderedIds.splice(to, 0, draggedCollateralId);
    reorderCollateral.mutate({ expectedIds, orderedIds });
  };
  const error = createDefinition.error || updateDefinition.error || reorderDefinition.error || upload.error || updateCollateral.error || reorderCollateral.error || previewCollateral.error || access.error || updateAccess.error;

  return <Drawer title="Configure dealer pipeline" width={1050} onClose={onClose} variant="workspace">
    <div className="panel prospectAdmin">
      <div className="prospectAdminTabs" role="tablist" aria-label="Pipeline configuration"><button type="button" role="tab" aria-selected={tab === "access"} className={tab === "access" ? "on" : ""} onClick={() => setTab("access")}>Team access</button><button type="button" role="tab" aria-selected={tab === "stages"} className={tab === "stages" ? "on" : ""} onClick={() => { setTab("stages"); setNewLabel(""); }}>Stages</button><button type="button" role="tab" aria-selected={tab === "outcomes"} className={tab === "outcomes" ? "on" : ""} onClick={() => { setTab("outcomes"); setNewLabel(""); }}>Call outcomes</button><button type="button" role="tab" aria-selected={tab === "collateral"} className={tab === "collateral" ? "on" : ""} onClick={() => setTab("collateral")}>Dealer collateral</button></div>
      <div className="panel-b">
        {tab === "access" && <ProspectAccessEditor data={access.data} loading={access.isLoading} updatingUserId={updateAccess.isPending ? updateAccess.variables?.user.user_id : undefined} onToggle={(user, enabled) => updateAccess.mutate({ user, enabled })} />}
        {tab === "stages" && <DefinitionEditor kind="stage" items={stageQuery.data ?? initialStages} newLabel={newLabel} setNewLabel={setNewLabel} busy={createDefinition.isPending || updateDefinition.isPending || reorderDefinition.isPending} onCreate={() => createDefinition.mutate({ kind: "stage", label: newLabel })} onUpdate={(definitionId, data) => updateDefinition.mutate({ kind: "stage", id: definitionId, data })} onReorder={(ids) => reorderDefinition.mutate({ kind: "stage", ids })} />}
        {tab === "outcomes" && <><DefinitionEditor kind="outcome" items={outcomeQuery.data ?? initialOutcomes} newLabel={newLabel} setNewLabel={setNewLabel} busy={createDefinition.isPending || updateDefinition.isPending || reorderDefinition.isPending} onCreate={() => createDefinition.mutate({ kind: "outcome", label: newLabel })} onUpdate={(definitionId, data) => updateDefinition.mutate({ kind: "outcome", id: definitionId, data })} onReorder={(ids) => reorderDefinition.mutate({ kind: "outcome", ids })} /><OutcomeAutomationEditor outcomes={outcomeQuery.data ?? initialOutcomes} stages={stageQuery.data ?? initialStages} busy={updateDefinition.isPending} onSave={(id, actionConfig) => updateDefinition.mutate({ kind: "outcome", id, data: { action_config: actionConfig } })} /></>}
        {tab === "collateral" && <div className="prospectCollateralAdmin">
          <div className="prospectUploadBar"><label><span className="lbl">Display title</span><input className="field" value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} placeholder="Dealer capabilities guide" /></label><label className="prospectFilePicker"><span className="lbl">PDF file</span><input ref={fileInput} type="file" accept="application/pdf,.pdf" onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} /><span className="btn"><Upload size={16} />{uploadFile?.name ?? "Choose PDF"}</span></label><button type="button" className="btn pri" disabled={!uploadFile || upload.isPending} onClick={() => upload.mutate()}>{upload.isPending ? "Validating…" : "Upload for approval"}</button></div>
          <p className="sub">Every active PDF in this library is attached to dealer outreach. Password-protected, invalid, or malware-flagged PDFs are rejected during upload.</p>
          <div className="prospectCollateralRows">
            {collateral.isLoading && <div className="empty compact">Loading collateral…</div>}
            {(collateral.data?.items ?? []).slice().sort((a, b) => a.status === "retired" === (b.status === "retired") ? a.sort_order - b.sort_order : a.status === "retired" ? 1 : -1).map((asset) => (
              <div
                className={`prospectCollateralRow${asset.status === "retired" ? " retired" : ""}${draggedCollateralId === asset.id ? " dragging" : ""}`}
                key={asset.id}
                onDragOver={(event) => { if (asset.status !== "retired") event.preventDefault(); }}
                onDrop={() => reorderCollateralAt(asset.id)}
              >
                <button
                  type="button"
                  className="prospectDragHandle"
                  draggable={asset.status !== "retired"}
                  disabled={asset.status === "retired" || reorderCollateral.isPending}
                  aria-label={`Drag to reorder ${asset.name}`}
                  title="Drag to reorder active collateral"
                  onDragStart={(event) => { setDraggedCollateralId(asset.id); event.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={() => setDraggedCollateralId(null)}
                ><GripVertical size={18} /></button>
                <FileText size={19} />
                <span><b>{asset.name}</b><small>{asset.file_name} · v{asset.version}{asset.size_bytes ? ` · ${(asset.size_bytes / 1024 / 1024).toFixed(1)} MB` : ""} · {asset.status.replaceAll("_", " ")}</small><small>{asset.validation_status?.replaceAll("_", " ") ?? "validation unavailable"} · SHA-256 {asset.sha256 ?? "unavailable"} · uploaded by {asset.uploaded_by_user_id ?? "system"}{asset.approved_by_user_id ? ` · approved by ${asset.approved_by_user_id}` : ""}</small></span>
                <button type="button" className="btn sm" disabled={previewCollateral.isPending} onClick={() => openCollateralPreview(asset.id)}>Preview</button>
                <button type="button" className="btn sm" disabled={updateCollateral.isPending} onClick={() => updateCollateral.mutate({ id: asset.id, action: asset.status === "pending_approval" ? "approve" : asset.status === "active" ? "retire" : "restore" })}>{asset.status === "pending_approval" ? "Approve" : asset.status === "active" ? "Retire" : "Restore"}</button>
                <CollateralHistory assetId={asset.id} />
              </div>
            ))}
            {!collateral.isLoading && !(collateral.data?.items ?? []).length && <div className="empty compact">No dealer collateral has been uploaded.</div>}
          </div>
        </div>}
        {error && <div className="note mt" role="alert">{error instanceof Error ? error.message : "The configuration could not be saved."}</div>}
      </div>
    </div>
  </Drawer>;
}

function accessStatus(user: ProspectAccessUser, globalEnabled: boolean): { label: string; tone: string } {
  if (user.effective_enabled) return { label: "Live", tone: "c-ok" };
  if (user.enabled && !user.eligible) return { label: "Assigned · not eligible", tone: "c-warn" };
  if (user.enabled && !globalEnabled) return { label: "Ready · master off", tone: "c-warn" };
  return { label: "Off", tone: "c-mut" };
}

function accessEligibility(user: ProspectAccessUser): string {
  if (user.eligible) return "Eligible Field Desk user";
  if (user.account_status !== "active") return `Account is ${user.account_status.replaceAll("_", " ")}`;
  if (!user.field_desk_access) return "Field Desk access is required";
  return "This role is not eligible for the dealer pipeline";
}

function ProspectAccessEditor({ data, loading, updatingUserId, onToggle }: { data?: ProspectAccessList; loading: boolean; updatingUserId?: string; onToggle: (user: ProspectAccessUser, enabled: boolean) => void }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "live" | "off">("all");
  const normalizedSearch = search.trim().toLowerCase();
  const rows = useMemo(() => (data?.items ?? []).filter((user) => {
    if (filter === "live" && !user.effective_enabled) return false;
    if (filter === "off" && user.effective_enabled) return false;
    return !normalizedSearch || `${user.name} ${user.email} ${user.role}`.toLowerCase().includes(normalizedSearch);
  }), [data?.items, filter, normalizedSearch]);
  const liveCount = (data?.items ?? []).filter((user) => user.effective_enabled).length;

  return <div className="prospectAccessAdmin">
    <div className="prospectAccessIntro"><span><Users size={21} /></span><div><h3>Dealer pipeline access</h3><p className="sub">Enable the outreach pipeline only for the agents participating in the rollout. Removing access hides the pipeline and blocks its APIs without changing their existing contacts.</p></div><div><b>{liveCount}</b><small>live user{liveCount === 1 ? "" : "s"}</small></div></div>
    {data && !data.global_enabled && <div className="prospectAccessMasterWarning" role="status"><b>Global pipeline switch is off</b><span>You can prepare individual assignments now. They become live only after the production master switch is enabled.</span></div>}
    <div className="prospectAccessToolbar"><label><Search size={16} /><input className="field" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, or role" /></label><select className="field" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">All team members</option><option value="live">Live access</option><option value="off">Access off</option></select></div>
    <div className="prospectAccessRows" aria-busy={loading || Boolean(updatingUserId)}>
      {loading && <div className="empty compact">Loading team access…</div>}
      {!loading && rows.map((user) => { const status = accessStatus(user, data?.global_enabled ?? false); const busy = updatingUserId === user.user_id; return <div className={`prospectAccessRow${!user.eligible ? " ineligible" : ""}`} key={user.user_id}><span className="prospectAccessAvatar">{user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?"}</span><span className="prospectAccessIdentity"><b>{user.name || "Unnamed user"}</b><small>{user.email}</small></span><span className="prospectAccessRole"><b>{user.role.replaceAll("_", " ")}</b><small>{accessEligibility(user)}</small></span><span className={`cellchip ${status.tone}`}>{status.label}</span><button type="button" role="switch" aria-checked={user.enabled} aria-label={`${user.enabled ? "Disable" : "Enable"} dealer pipeline for ${user.name || user.email}`} className={`prospectAccessSwitch${user.enabled ? " on" : ""}`} disabled={Boolean(updatingUserId) || (!user.eligible && !user.enabled)} onClick={() => onToggle(user, !user.enabled)}><span /><em>{busy ? "Saving" : user.enabled ? "Assigned" : "Off"}</em></button></div>; })}
      {!loading && !rows.length && <div className="empty compact">No team members match this view.</div>}
    </div>
  </div>;
}

function CollateralHistory({ assetId }: { assetId: string }) {
  const { getToken } = useAuth();
  const [open, setOpen] = useState(false);
  const history = useQuery({
    queryKey: ["marketing-collateral-history", assetId],
    queryFn: async () => api<CollateralHistoryList>(`/dealer-os/marketing-collateral/${assetId}/history`, { authToken: (await getToken()) ?? undefined }),
    enabled: open,
  });
  return <details className="prospectCollateralHistory" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Audit history</summary>
    {history.isLoading && <small>Loading history…</small>}
    {history.isError && <small className="dangerText">{history.error instanceof Error ? history.error.message : "History unavailable."}</small>}
    {(history.data?.items ?? []).map((entry) => <div key={entry.id}><span><b>{entry.event_type.replaceAll("_", " ")}</b><time>{new Date(entry.created_at).toLocaleString()}</time></span><small>Actor {entry.actor_user_id ?? "system"}</small>{entry.details && Object.keys(entry.details).length > 0 && <small>{Object.entries(entry.details).map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`).join(" · ")}</small>}</div>)}
    {!history.isLoading && !history.isError && !(history.data?.items ?? []).length && <small>No recorded changes.</small>}
  </details>;
}

function DefinitionEditor({ kind, items, newLabel, setNewLabel, busy, onCreate, onUpdate, onReorder }: { kind: "stage" | "outcome"; items: Array<ProspectStage | ProspectOutcome>; newLabel: string; setNewLabel: (value: string) => void; busy: boolean; onCreate: () => void; onUpdate: (id: string, data: Record<string, unknown>) => void; onReorder: (ids: string[]) => void }) {
  const active = items.filter((item) => item.is_active !== false).slice().sort((a, b) => a.position - b.position);
  const ordered = [...active, ...items.filter((item) => item.is_active === false).sort((a, b) => a.position - b.position)];
  const [dragged, setDragged] = useState<string | null>(null);
  const drop = (target: string) => {
    if (!dragged || dragged === target) return setDragged(null);
    const keys = active.map((item) => item.key); const from = keys.indexOf(dragged); const to = keys.indexOf(target); if (from < 0 || to < 0) return setDragged(null); keys.splice(from, 1); keys.splice(to, 0, dragged); setDragged(null); onReorder(keys.map((key) => active.find((item) => item.key === key)?.id).filter((id): id is string => Boolean(id)));
  };
  return <div className="prospectDefinitionEditor"><div className="prospectConfigIntro"><div><h3>{kind === "stage" ? "Pipeline stages" : "Call outcomes"}</h3><p className="sub">Labels can change; stable system keys remain fixed. Drag the handle to reorder.</p></div><form onSubmit={(event) => { event.preventDefault(); if (newLabel.trim()) onCreate(); }}><input className="field" value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder={`New ${kind} label`} /><button type="submit" className="btn pri" disabled={!newLabel.trim() || busy}><Plus size={16} /> Add</button></form></div><div className="prospectDefinitionRows">{ordered.map((item) => <div key={item.key} className={`prospectDefinitionRow${item.is_active === false ? " retired" : ""}`} onDragOver={(event) => { if (item.is_active !== false) event.preventDefault(); }} onDrop={() => drop(item.key)}><button type="button" className="prospectDragHandle" draggable={item.is_active !== false} onDragStart={(event) => { setDragged(item.key); event.dataTransfer.effectAllowed = "move"; }} disabled={item.is_active === false} aria-label={`Drag to reorder ${item.label}`} title="Drag to reorder"><GripVertical size={18} /></button><span><b>{item.label}</b><small>{item.key}</small></span><input className="field" aria-label={`Rename ${item.label}`} defaultValue={item.label} onBlur={(event) => { const label = event.target.value.trim(); if (label && label !== item.label && item.id) onUpdate(item.id, { label }); }} /><button type="button" className="btn sm" disabled={busy || !item.id} onClick={() => item.id && onUpdate(item.id, { is_active: item.is_active === false })}>{item.is_active === false ? "Restore" : "Retire"}</button></div>)}</div></div>;
}

function OutcomeAutomationEditor({ outcomes, stages, busy, onSave }: { outcomes: ProspectOutcome[]; stages: ProspectStage[]; busy: boolean; onSave: (id: string, actionConfig: Record<string, unknown>) => void }) {
  const active = outcomes.filter((item) => item.is_active !== false);
  const [selectedKey, setSelectedKey] = useState(active[0]?.key ?? "");
  const selected = active.find((item) => item.key === selectedKey) ?? active[0];
  const config = selected?.action_config ?? {};
  const [draft, setDraft] = useState<Record<string, unknown>>(config);
  const choose = (key: string) => { const next = active.find((item) => item.key === key); setSelectedKey(key); setDraft(next?.action_config ?? {}); };
  const set = (key: string, value: unknown) => setDraft((current) => { const next = { ...current }; if (value === "" || value === false || value == null) delete next[key]; else next[key] = value; return next; });
  if (!selected) return null;
  return <section className="prospectOutcomeAutomation"><header><div><h3>Outcome automation</h3><p className="sub">Choose the explicit stage, email draft, consent, and follow-up effects for an outcome.</p></div><select className="field" value={selected.key} onChange={(event) => choose(event.target.value)}>{active.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></header><div className="prospectAutomationGrid"><label><span className="lbl">Move to stage</span><select className="field" value={String(draft.target_stage_key ?? "")} onChange={(event) => set("target_stage_key", event.target.value)}><option value="">No automatic move</option>{stages.filter((stage) => stage.is_active !== false).map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}</select></label><label><span className="lbl">Email draft</span><select className="field" value={String(draft.email_action ?? "")} onChange={(event) => set("email_action", event.target.value)}><option value="">No email</option><option value="dealer_information_pack">Dealer information pack</option><option value="missed_call">Missed call</option><option value="callback_confirmation">Callback confirmation</option><option value="booking_link">Booking link</option></select></label><label><span className="lbl">Workflow</span><select className="field" value={String(draft.workflow_action ?? "")} onChange={(event) => set("workflow_action", event.target.value)}><option value="">No workflow</option><option value="book_appointment">Book appointment</option></select></label><label><span className="lbl">Automatic follow-up delay</span><input className="field" type="number" min={1} max={8760} step={1} placeholder="Hours (optional)" value={String(draft.follow_up_delay_hours ?? "")} onChange={(event) => set("follow_up_delay_hours", event.target.value ? Math.min(8760, Math.max(1, Number(event.target.value))) : "")} /><small className="prospectFieldHelp">Schedules the next attempt without asking the agent for a callback time.</small></label></div><div className="prospectAutomationChecks"><label><input type="checkbox" checked={draft.requires_follow_up === true} onChange={(event) => set("requires_follow_up", event.target.checked)} /> Require callback time from agent</label><label><input type="checkbox" checked={draft.requires_appointment === true} onChange={(event) => set("requires_appointment", event.target.checked)} /> Require appointment</label><label><input type="checkbox" checked={draft.increment_call_attempt === true} onChange={(event) => set("increment_call_attempt", event.target.checked)} /> Count call attempt</label><label><input type="checkbox" checked={draft.set_do_not_contact === true} onChange={(event) => set("set_do_not_contact", event.target.checked)} /> Mark do-not-contact</label><label><input type="checkbox" checked={draft.clear_follow_up === true} onChange={(event) => set("clear_follow_up", event.target.checked)} /> Clear follow-up</label><label><input type="checkbox" checked={draft.suppress_email === true} onChange={(event) => set("suppress_email", event.target.checked)} /> Suppress email</label></div><div className="prospectDialogActions"><button type="button" className="btn pri" disabled={busy || !selected.id} onClick={() => selected.id && onSave(selected.id, draft)}>{busy ? "Saving…" : "Save outcome automation"}</button></div></section>;
}
