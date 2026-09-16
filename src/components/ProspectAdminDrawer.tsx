"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, CheckCircle2, CircleAlert, CircleX, FileText, FlaskConical, GripVertical, Info, LockKeyhole, Mail, Plus, Search, ShieldCheck, Sparkles, Upload, Users } from "lucide-react";
import { api, apiBlob, apiUpload } from "@/lib/api";
import { prospectGenerationReasonLabel } from "@/lib/prospects";
import type {
  ProspectAccessList,
  ProspectAccessUser,
  ProspectDraftPurpose,
  ProspectEmailAction,
  ProspectOutcome,
  ProspectOutcomeActionConfig,
  ProspectOutreachPolicy,
  ProspectStage,
  ProspectTestEmailRequest,
  ProspectTestEmailResponse,
} from "@/lib/prospects";
import Drawer from "./Drawer";

type AdminTab = "access" | "stages" | "outcomes" | "email_ai" | "collateral";
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

const OUTCOME_EMAIL_RECIPES: Array<{ value: ProspectEmailAction; label: string; detail: string }> = [
  { value: "dealer_information_pack", label: "Dealer information pack", detail: "A complete capabilities introduction with the approved dealer website and collateral." },
  { value: "missed_call", label: "Missed call", detail: "A brief follow-up after an unsuccessful call attempt." },
  { value: "callback_confirmation", label: "Callback confirmation", detail: "Confirms the agreed callback and keeps the next step clear." },
  { value: "booking_link", label: "Booking link", detail: "Invites the dealer to book through the approved scheduling page." },
];

const TEST_EMAIL_RECIPES: Array<{ value: ProspectDraftPurpose; label: string; detail: string }> = [
  { value: "dealer_information", label: "Dealer information pack", detail: "Full capabilities overview" },
  { value: "missed_call", label: "Missed call", detail: "Short call follow-up" },
  { value: "callback_confirmation", label: "Callback confirmation", detail: "Callback details and next step" },
  { value: "booking", label: "Booking link", detail: "Approved scheduling invitation" },
  { value: "general", label: "General outreach", detail: "Grounded dealer introduction" },
];

function configFingerprint(config: ProspectOutcomeActionConfig): string {
  return JSON.stringify(Object.entries(config).filter(([, value]) => value !== undefined).sort(([left], [right]) => left.localeCompare(right)));
}

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
  const outreachPolicy = useQuery({ queryKey: ["prospect-outreach-policy"], queryFn: async () => api<ProspectOutreachPolicy>("/dealer-os/prospect-outreach/policy", { authToken: (await getToken()) ?? undefined }), enabled: tab === "outcomes" });
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
  const error = createDefinition.error || updateDefinition.error || reorderDefinition.error || upload.error || updateCollateral.error || reorderCollateral.error || previewCollateral.error || access.error || outreachPolicy.error || updateAccess.error;

  return <Drawer title="Configure dealer pipeline" width={1050} onClose={onClose} variant="workspace">
    <div className="panel prospectAdmin">
      <div className="prospectAdminTabs" role="tablist" aria-label="Pipeline configuration"><button type="button" role="tab" aria-selected={tab === "access"} className={tab === "access" ? "on" : ""} onClick={() => setTab("access")}>Team access</button><button type="button" role="tab" aria-selected={tab === "stages"} className={tab === "stages" ? "on" : ""} onClick={() => { setTab("stages"); setNewLabel(""); }}>Stages</button><button type="button" role="tab" aria-selected={tab === "outcomes"} className={tab === "outcomes" ? "on" : ""} onClick={() => { setTab("outcomes"); setNewLabel(""); }}>Call outcomes</button><button type="button" role="tab" aria-selected={tab === "email_ai"} className={tab === "email_ai" ? "on" : ""} onClick={() => setTab("email_ai")}>Email AI & tests</button><button type="button" role="tab" aria-selected={tab === "collateral"} className={tab === "collateral" ? "on" : ""} onClick={() => setTab("collateral")}>Dealer collateral</button></div>
      <div className="panel-b">
        {tab === "access" && <ProspectAccessEditor data={access.data} loading={access.isLoading} updatingUserId={updateAccess.isPending ? updateAccess.variables?.user.user_id : undefined} onToggle={(user, enabled) => updateAccess.mutate({ user, enabled })} />}
        {tab === "stages" && <DefinitionEditor kind="stage" items={stageQuery.data ?? initialStages} newLabel={newLabel} setNewLabel={setNewLabel} busy={createDefinition.isPending || updateDefinition.isPending || reorderDefinition.isPending} onCreate={() => createDefinition.mutate({ kind: "stage", label: newLabel })} onUpdate={(definitionId, data) => updateDefinition.mutate({ kind: "stage", id: definitionId, data })} onReorder={(ids) => reorderDefinition.mutate({ kind: "stage", ids })} />}
        {tab === "outcomes" && <><DefinitionEditor kind="outcome" items={outcomeQuery.data ?? initialOutcomes} newLabel={newLabel} setNewLabel={setNewLabel} busy={createDefinition.isPending || updateDefinition.isPending || reorderDefinition.isPending} onCreate={() => createDefinition.mutate({ kind: "outcome", label: newLabel })} onUpdate={(definitionId, data) => updateDefinition.mutate({ kind: "outcome", id: definitionId, data })} onReorder={(ids) => reorderDefinition.mutate({ kind: "outcome", ids })} /><OutcomeAutomationEditor outcomes={outcomeQuery.data ?? initialOutcomes} stages={stageQuery.data ?? initialStages} reviewSeconds={outreachPolicy.data?.review_seconds} busy={updateDefinition.isPending} onSave={(id, actionConfig) => updateDefinition.mutate({ kind: "outcome", id, data: { action_config: actionConfig } })} /></>}
        {tab === "email_ai" && <EmailAIControls />}
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

function EmailAIControls() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const qc = useQueryClient();
  const signedInEmail = user?.primaryEmailAddress?.emailAddress;
  const [guidance, setGuidance] = useState("");
  const [blockedPhrases, setBlockedPhrases] = useState("");
  const [testForm, setTestForm] = useState<ProspectTestEmailRequest>({
    idempotency_key: crypto.randomUUID(),
    purpose: "dealer_information",
    sample_contact_name: "Alex Morgan",
    sample_dealer_name: "Example Motors",
    verified_conversation_context: "",
    ai_instructions: "",
    include_collateral: true,
  });
  const [testResult, setTestResult] = useState<ProspectTestEmailResponse | null>(null);
  const [submittedTest, setSubmittedTest] = useState<ProspectTestEmailRequest | null>(null);

  const policy = useQuery({
    queryKey: ["prospect-outreach-policy"],
    queryFn: async () => api<ProspectOutreachPolicy>("/dealer-os/prospect-outreach/policy", { authToken: (await getToken()) ?? undefined }),
  });

  useEffect(() => {
    if (!policy.data) return;
    setGuidance(policy.data.drafting_guidance);
    setBlockedPhrases(policy.data.additional_blocked_phrases.join("\n"));
  }, [policy.data]);

  const normalizedBlockedPhrases = blockedPhrases.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  const blockedPhraseError = normalizedBlockedPhrases.length > 50
    ? "Use no more than 50 blocked phrases."
    : normalizedBlockedPhrases.find((value) => value.length > 160)
      ? "Each blocked phrase must be 160 characters or fewer."
      : "";
  const policyDirty = Boolean(policy.data) && (
    guidance.trim() !== policy.data?.drafting_guidance
    || JSON.stringify(normalizedBlockedPhrases) !== JSON.stringify(policy.data?.additional_blocked_phrases ?? [])
  );

  const savePolicy = useMutation({
    mutationFn: async () => api<ProspectOutreachPolicy>("/dealer-os/prospect-outreach/policy", {
      method: "PATCH",
      body: JSON.stringify({ drafting_guidance: guidance.trim(), additional_blocked_phrases: normalizedBlockedPhrases }),
      authToken: (await getToken()) ?? undefined,
    }),
    onSuccess: (next) => {
      qc.setQueryData(["prospect-outreach-policy"], next);
      setGuidance(next.drafting_guidance);
      setBlockedPhrases(next.additional_blocked_phrases.join("\n"));
    },
  });

  const sendTest = useMutation({
    mutationFn: async (request: ProspectTestEmailRequest) => api<ProspectTestEmailResponse>("/dealer-os/prospect-outreach/test-email", {
      method: "POST",
      body: JSON.stringify(request),
      authToken: (await getToken()) ?? undefined,
    }),
    onMutate: (request) => {
      setSubmittedTest(request);
      setTestResult(null);
    },
    onSuccess: (result) => {
      setTestResult(result);
      // Keep the same key for an uncertain provider outcome so checking again
      // can never create a duplicate. Completed attempts get a fresh key.
      if (result.delivery_state !== "uncertain") {
        setTestForm((current) => ({ ...current, idempotency_key: crypto.randomUUID() }));
      }
    },
  });

  const startSeparateTest = () => {
    sendTest.reset();
    setTestForm((current) => ({ ...current, idempotency_key: crypto.randomUUID() }));
    setSubmittedTest(null);
    setTestResult(null);
  };

  const submitTest = () => {
    const retryingUnresolvedAttempt = (testResult?.delivery_state === "uncertain" || sendTest.isError) && submittedTest;
    sendTest.mutate(retryingUnresolvedAttempt || {
      ...testForm,
      verified_conversation_context: testForm.verified_conversation_context?.trim().replace(/\s+/g, " ") || null,
      ai_instructions: testForm.ai_instructions?.trim() || null,
    });
  };

  const resetPolicy = () => {
    setGuidance(policy.data?.drafting_guidance ?? "");
    setBlockedPhrases((policy.data?.additional_blocked_phrases ?? []).join("\n"));
  };
  const selectedRecipe = TEST_EMAIL_RECIPES.find((recipe) => recipe.value === testForm.purpose);
  const error = policy.error || savePolicy.error || sendTest.error;
  const uncertainAttempt = testResult?.delivery_state === "uncertain";
  const unresolvedTestAttempt = Boolean(sendTest.isError && submittedTest);
  const retryingExistingTest = uncertainAttempt || unresolvedTestAttempt;
  const testFieldsLocked = sendTest.isPending || retryingExistingTest;
  const submittedInstructions = submittedTest?.ai_instructions?.trim() ?? "";
  const submittedVerifiedContext = submittedTest?.verified_conversation_context?.trim() ?? "";
  const instructionsNotApplied = Boolean(submittedInstructions) && Boolean(testResult) && (
    testResult?.draft_source === "fallback"
    || testResult?.instruction_disposition === "not_applied_fallback"
  );
  const instructionsSubmittedToAI = Boolean(submittedInstructions)
    && testResult?.draft_source === "ai"
    && testResult?.instruction_disposition === "submitted_to_ai";
  const instructionDispositionUnknown = Boolean(submittedInstructions)
    && testResult?.draft_source === "ai"
    && testResult?.instruction_disposition === "unknown";
  const generationReason = prospectGenerationReasonLabel(testResult?.generation_reason);

  return <div className="prospectEmailAIAdmin">
    <section className="prospectAIIntro">
      <span><Bot size={23} /></span>
      <div><h3>Email AI controls</h3><p className="sub">The email choices under Call outcomes are <b>draft recipes</b>: they tell AI which approved message to prepare. They are not fixed, finished emails. Every draft remains grounded in QC&apos;s approved products, links, footer, and collateral.</p></div>
    </section>

    <section className="prospectAISettingsCard" aria-busy={policy.isLoading || savePolicy.isPending}>
      <header><div><span className="prospectSectionEyebrow"><Sparkles size={14} /> Firm drafting policy</span><h3>Teach the drafting system what to avoid</h3><p className="sub">This is enforceable policy applied to every generation, edit, and final send—not model fine-tuning. Guidance shapes tone; blocked phrases are a hard stop.</p></div>{policy.data?.updated_at && <small>Last saved {new Date(policy.data.updated_at).toLocaleString()}</small>}</header>
      {policy.isLoading ? <div className="empty compact">Loading AI email policy…</div> : <div className="prospectAIFormGrid">
        <label><span className="lbl">Drafting guidance</span><textarea className="field" rows={7} maxLength={3000} value={guidance} onChange={(event) => setGuidance(event.target.value)} placeholder="Example: Be concise and consultative. Never use pressure tactics. Refer to the recipient as a dealership owner, not a borrower." /><small>Soft instructions for voice, structure, and phrases to avoid. Do not place private client information here.</small></label>
        <label><span className="lbl">Additional blocked phrases · {normalizedBlockedPhrases.length}/50</span><textarea className="field" rows={7} value={blockedPhrases} onChange={(event) => setBlockedPhrases(event.target.value)} placeholder={"guaranteed approval\nbest rate in the market\npre-approved"} aria-invalid={Boolean(blockedPhraseError)} /><small className={blockedPhraseError ? "dangerText" : ""}>{blockedPhraseError || "One exact phrase per line. Matching copy is rejected even after a person edits a draft."}</small></label>
      </div>}
      <div className="prospectLockedRules"><div><ShieldCheck size={18} /><span><b>Permanent QC safeguards</b><small>Admins can add stricter rules, but these cannot be removed.</small></span></div><ul>{(policy.data?.locked_rules ?? []).map((rule) => <li key={rule}><LockKeyhole size={13} />{rule}</li>)}</ul></div>
      <div className="prospectDialogActions"><button type="button" className="btn" disabled={!policyDirty || savePolicy.isPending} onClick={resetPolicy}>Discard changes</button><button type="button" className="btn pri" disabled={!policyDirty || Boolean(blockedPhraseError) || savePolicy.isPending || policy.isLoading} onClick={() => savePolicy.mutate()}>{savePolicy.isPending ? "Saving policy…" : "Save AI email policy"}</button></div>
    </section>

    <section className="prospectAITestCard">
      <header><div><span className="prospectSectionEyebrow"><FlaskConical size={14} /> Safe test delivery</span><h3>Send yourself a real test email</h3><p className="sub">Runs the same AI rules, approved catalog, footer, and optional active PDFs used by live outreach.</p></div><span className="prospectTestRecipient"><Mail size={15} /><span><small>Only sends to your login email</small><b>{policy.data?.test_recipient_email ?? signedInEmail ?? "Signed-in administrator"}</b></span></span></header>
      <div className="prospectAITestNotice"><Info size={16} /><span><b>This does not touch a prospect.</b> No stage, outcome, call attempt, follow-up, reply thread, or {policy.data?.review_seconds ? `${policy.data.review_seconds}-second` : "outreach"} countdown is created.</span></div>
      {policyDirty && <div className="prospectAITestNotice"><CircleAlert size={16} /><span><b>Your AI policy has unsaved changes.</b> Save or discard them before starting a new test so the email uses exactly what this screen shows.</span></div>}
      <div className="prospectAITestGrid">
        <label><span className="lbl">AI draft recipe</span><select className="field" value={testForm.purpose} disabled={testFieldsLocked} onChange={(event) => setTestForm((current) => ({ ...current, purpose: event.target.value as ProspectDraftPurpose }))}>{TEST_EMAIL_RECIPES.map((recipe) => <option key={recipe.value} value={recipe.value}>{recipe.label}</option>)}</select><small>{selectedRecipe?.detail}</small></label>
        <label><span className="lbl">Sample contact name</span><input className="field" maxLength={160} value={testForm.sample_contact_name} disabled={testFieldsLocked} onChange={(event) => setTestForm((current) => ({ ...current, sample_contact_name: event.target.value }))} /></label>
        <label><span className="lbl">Sample dealer name</span><input className="field" maxLength={180} value={testForm.sample_dealer_name} disabled={testFieldsLocked} onChange={(event) => setTestForm((current) => ({ ...current, sample_dealer_name: event.target.value }))} /></label>
        <label className="prospectAITestInstructions"><span className="lbl">Verified conversation context · this test only</span><textarea className="field" rows={3} maxLength={500} value={testForm.verified_conversation_context ?? ""} disabled={testFieldsLocked} onChange={(event) => setTestForm((current) => ({ ...current, verified_conversation_context: event.target.value }))} placeholder="We spoke earlier today at 10:00 AM." /><small>Enter one short fact the agent can verify. It is inserted exactly into both AI and fallback drafts, then checked by QC&apos;s safeguards.</small></label>
        <label className="prospectAITestInstructions"><span className="lbl">AI tone and format instructions · this test only</span><textarea className="field" rows={4} maxLength={1500} value={testForm.ai_instructions ?? ""} disabled={testFieldsLocked} onChange={(event) => setTestForm((current) => ({ ...current, ai_instructions: event.target.value }))} placeholder="Keep the email concise, warm, and use bullets instead of long paragraphs." /><small>These instructions guide AI wording only. They cannot select programs, change approved claims, or override blocked phrases. Programs come from QC&apos;s centrally managed dealer scope.</small></label>
      </div>
      <label className="prospectCheckCard"><input type="checkbox" checked={testForm.include_collateral} disabled={testFieldsLocked} onChange={(event) => setTestForm((current) => ({ ...current, include_collateral: event.target.checked }))} /><span><b>Attach every active Dealer Outreach PDF</b><small>Uses the approved bundle exactly as a live information email would.</small></span></label>
      {testResult && <div className="prospectTestResultStack">
        <div className={`prospectGenerationStatus ${testResult.draft_source === "ai" ? "ai" : "fallback"}`} role="status">{testResult.draft_source === "ai" ? <Sparkles size={20} /> : <ShieldCheck size={20} />}<span><b>{testResult.draft_source === "ai" ? "AI draft used" : "Deterministic safe fallback — AI was not used"}</b><small>{testResult.draft_source === "ai" ? "AI prepared the personalized wording under QC's saved guidance and safeguards. Program names and claims remained centrally controlled." : "The delivered copy came from QC's fixed approved template. Verified conversation context remains deterministic; AI tone and format guidance does not change fallback copy."}</small>{generationReason && <small><b>Reason:</b> {generationReason}</small>}{submittedVerifiedContext && <small className="prospectVerifiedContext"><b>Verified context was included deterministically:</b> {submittedVerifiedContext}</small>}{instructionsSubmittedToAI && <small className="prospectInstructionApplied">Your tone and format instructions were submitted to AI. Exact wording may vary; QC&apos;s central rules still control the result.</small>}{instructionsNotApplied && <small className="prospectInstructionWarning"><CircleAlert size={14} /><span><b>Tone instructions were not applied.</b> The verified conversation context was still included deterministically.</span></small>}{instructionDispositionUnknown && <small className="prospectInstructionWarning"><CircleAlert size={14} /><span><b>AI instruction handling is unknown for this replayed result.</b> Verified conversation context remains deterministic; run a separate test before relying on the requested tone or format.</span></small>}</span></div>
        <div className={testResult.delivery_state === "sent" ? "prospectTestSuccess" : testResult.delivery_state === "uncertain" ? "prospectTestUncertain" : "prospectTestFailure"} role="status">{testResult.delivery_state === "sent" ? <CheckCircle2 size={19} /> : testResult.delivery_state === "uncertain" ? <CircleAlert size={19} /> : <CircleX size={19} />}<span><b>{testResult.delivery_state === "sent" ? `Provider accepted the test for ${testResult.to_email}` : testResult.delivery_state === "uncertain" ? `Delivery to ${testResult.to_email} is uncertain` : `The test to ${testResult.to_email} was not accepted`}</b><small>{testResult.subject} · {testResult.attachment_names.length} attachment{testResult.attachment_names.length === 1 ? "" : "s"}</small>{testResult.detail && <small>{testResult.detail}</small>}</span></div>
      </div>}
      {unresolvedTestAttempt && <div className="prospectTestUncertain" role="alert"><CircleAlert size={19} /><span><b>The request did not return a resolved delivery result.</b><small>{sendTest.error instanceof Error ? sendTest.error.message : "The network or API request did not complete."} The original fields and idempotency key are frozen. Retry the exact same test safely, or start a separate test to edit anything.</small></span></div>}
      <div className="prospectDialogActions">{retryingExistingTest && <button type="button" className="btn" disabled={sendTest.isPending} onClick={startSeparateTest}>{uncertainAttempt ? "I checked — start a separate test" : "Start a separate test and edit"}</button>}<button type="button" className="btn pri" disabled={sendTest.isPending || !testForm.sample_contact_name.trim() || !testForm.sample_dealer_name.trim() || (policyDirty && !retryingExistingTest)} onClick={submitTest}><Mail size={16} />{sendTest.isPending ? "Working…" : unresolvedTestAttempt ? "Retry the same test safely" : uncertainAttempt ? "Check delivery status" : "Send test to my login email"}</button></div>
    </section>
    {error && !unresolvedTestAttempt && <div className="note" role="alert">{error instanceof Error ? error.message : "The email AI settings could not be completed."}</div>}
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

function OutcomeAutomationEditor({ outcomes, stages, reviewSeconds, busy, onSave }: { outcomes: ProspectOutcome[]; stages: ProspectStage[]; reviewSeconds?: number; busy: boolean; onSave: (id: string, actionConfig: ProspectOutcomeActionConfig) => void }) {
  const active = outcomes.filter((item) => item.is_active !== false);
  const activeStages = stages.filter((stage) => stage.is_active !== false);
  const [selectedKey, setSelectedKey] = useState(active[0]?.key ?? "");
  const selected = active.find((item) => item.key === selectedKey) ?? active[0];
  const storedConfig = selected?.action_config ?? {};
  const storedFingerprint = configFingerprint(storedConfig);
  const [draft, setDraft] = useState<ProspectOutcomeActionConfig>(storedConfig);

  useEffect(() => {
    setDraft({ ...storedConfig });
  }, [selectedKey, storedFingerprint]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (key: string) => {
    const next = active.find((item) => item.key === key);
    setSelectedKey(key);
    setDraft({ ...(next?.action_config ?? {}) });
  };
  const patchDraft = (patch: Partial<ProspectOutcomeActionConfig>, remove: Array<keyof ProspectOutcomeActionConfig> = []) => setDraft((current) => {
    const next = { ...current, ...patch };
    remove.forEach((key) => delete next[key]);
    return next;
  });
  const stageEffect = draft.stage_strategy === "advance_follow_up" ? "advance_follow_up" : draft.target_stage_key ? `stage:${draft.target_stage_key}` : "none";
  const followUpEffect = draft.clear_follow_up ? "clear" : draft.requires_follow_up ? "required" : draft.follow_up_delay_hours ? "automatic" : "none";
  const selectedRecipe = OUTCOME_EMAIL_RECIPES.find((recipe) => recipe.value === draft.email_action);
  const dirty = configFingerprint(draft) !== storedFingerprint;

  const changeStageEffect = (value: string) => {
    const next = { ...draft };
    if (draft.target_stage_key === "booked") delete next.requires_appointment;
    delete next.stage_strategy;
    delete next.target_stage_key;
    if (value === "advance_follow_up") {
      next.stage_strategy = "advance_follow_up";
      delete next.requires_appointment;
      delete next.set_do_not_contact;
      delete next.suppress_email;
      delete next.clear_follow_up;
    } else if (value.startsWith("stage:")) {
      const target = value.slice(6);
      next.target_stage_key = target;
      if (target === "booked") next.requires_appointment = true;
      else delete next.requires_appointment;
      if (target === "not_interested") {
        next.set_do_not_contact = true;
        next.clear_follow_up = true;
        delete next.email_action;
        delete next.workflow_action;
        delete next.requires_follow_up;
        delete next.follow_up_delay_hours;
      } else {
        delete next.set_do_not_contact;
      }
    }
    setDraft(next);
  };
  const changeEmailAction = (value: string) => {
    if (!value) return patchDraft({}, ["email_action"]);
    patchDraft({ email_action: value as ProspectEmailAction }, ["set_do_not_contact", "suppress_email"]);
  };
  const changeFollowUpEffect = (value: string) => {
    if (value === "required") return patchDraft({ requires_follow_up: true }, ["follow_up_delay_hours", "clear_follow_up"]);
    if (value === "automatic") return patchDraft({ follow_up_delay_hours: draft.follow_up_delay_hours || 24 }, ["requires_follow_up", "clear_follow_up"]);
    if (value === "clear") return patchDraft({ clear_follow_up: true }, ["requires_follow_up", "follow_up_delay_hours"]);
    patchDraft({}, ["requires_follow_up", "follow_up_delay_hours", "clear_follow_up"]);
  };
  const changeDoNotContact = (checked: boolean) => {
    if (!checked) return patchDraft({}, ["set_do_not_contact"]);
    const remove: Array<keyof ProspectOutcomeActionConfig> = ["email_action", "workflow_action", "requires_follow_up", "follow_up_delay_hours", "stage_strategy", "requires_appointment"];
    if (draft.target_stage_key !== "not_interested") remove.push("target_stage_key");
    patchDraft({ set_do_not_contact: true, clear_follow_up: true }, remove);
  };
  const changeSuppressEmail = (checked: boolean) => {
    if (!checked) return patchDraft({}, ["suppress_email"]);
    const remove: Array<keyof ProspectOutcomeActionConfig> = ["email_action", "workflow_action", "requires_follow_up", "follow_up_delay_hours", "stage_strategy", "requires_appointment"];
    if (draft.target_stage_key !== "not_interested") remove.push("target_stage_key");
    patchDraft({ suppress_email: true, set_do_not_contact: true, clear_follow_up: true }, remove);
  };

  const effectSummary = useMemo(() => {
    const effects: string[] = [];
    if (draft.stage_strategy === "advance_follow_up") effects.push("Advance New → Emailed → Follow-up 1 → Follow-up 2 (and remain at Follow-up 2 after that).");
    else if (draft.target_stage_key) effects.push(`Move the prospect to ${activeStages.find((stage) => stage.key === draft.target_stage_key)?.label ?? draft.target_stage_key}.`);
    else effects.push("Keep the prospect in the current stage.");
    if (selectedRecipe) effects.push(`Create the “${selectedRecipe.label}” AI draft. It enters the ${reviewSeconds ? `${reviewSeconds}-second` : "configured"} review window and sends automatically if the agent does not approve, edit, or cancel it first.`);
    else effects.push("Do not create an email.");
    if (draft.workflow_action === "book_appointment") effects.push("Open the booking workflow for the agent.");
    if (draft.requires_appointment) effects.push("Require a linked appointment before the outcome can finish.");
    if (draft.requires_follow_up) effects.push("Require the agent to choose a callback date and time.");
    else if (draft.follow_up_delay_hours) effects.push(`Schedule the next follow-up ${draft.follow_up_delay_hours} hour${draft.follow_up_delay_hours === 1 ? "" : "s"} later.`);
    else if (draft.clear_follow_up) effects.push("Clear any scheduled follow-up.");
    if (draft.increment_call_attempt) effects.push("Add one call attempt.");
    if (draft.set_do_not_contact) effects.push("Mark the prospect do-not-contact.");
    if (draft.suppress_email) effects.push("Add the address to email suppression.");
    return effects;
  }, [activeStages, draft, reviewSeconds, selectedRecipe]);

  if (!selected) return null;
  return <section className="prospectOutcomeAutomation">
    <header><div><span className="prospectSectionEyebrow"><Bot size={14} /> Outcome builder</span><h3>What should happen after this call?</h3><p className="sub">Configure one clear set of effects. Conflicting choices are removed automatically.</p></div><label><span className="lbl">Editing outcome</span><select className="field" value={selected.key} onChange={(event) => choose(event.target.value)}>{active.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label></header>

    <div className="prospectAutomationSections">
      <section><header><span>1</span><div><b>Pipeline position</b><small>Choose either a fixed destination or the follow-up sequence.</small></div></header><label><span className="lbl">Stage after outcome</span><select className="field" value={stageEffect} onChange={(event) => changeStageEffect(event.target.value)}><option value="none">Stay in current stage</option><option value="advance_follow_up">Advance through follow-up sequence</option><optgroup label="Move to a specific stage">{activeStages.filter((stage) => stage.key !== "converted").map((stage) => <option key={stage.key} value={`stage:${stage.key}`}>{stage.label}</option>)}</optgroup></select><small>Converted is intentionally excluded; conversion must complete through Create AI Intake.</small></label></section>

      <section><header><span>2</span><div><b>Dealer email</b><small>These options are AI draft recipes, not finished templates.</small></div></header><label><span className="lbl">AI draft after outcome</span><select className="field" value={draft.email_action ?? ""} onChange={(event) => changeEmailAction(event.target.value)} disabled={draft.set_do_not_contact || draft.suppress_email}><option value="">No email</option>{OUTCOME_EMAIL_RECIPES.map((recipe) => <option key={recipe.value} value={recipe.value}>{recipe.label}</option>)}</select><small>{selectedRecipe ? `${selectedRecipe.detail} The server starts the ${reviewSeconds ? `${reviewSeconds}-second` : "configured"} review window after drafting.` : draft.set_do_not_contact || draft.suppress_email ? "Email is unavailable while do-not-contact or suppression is enabled." : "This outcome will not draft or send an email."}</small></label></section>

      <section><header><span>3</span><div><b>Next action</b><small>Control booking, appointment, and follow-up requirements.</small></div></header><div className="prospectAutomationStack"><label><span className="lbl">Agent workflow</span><select className="field" value={draft.workflow_action ?? ""} onChange={(event) => event.target.value ? patchDraft({ workflow_action: "book_appointment" }, ["set_do_not_contact", "suppress_email"]) : patchDraft({}, ["workflow_action"])} disabled={draft.set_do_not_contact || draft.suppress_email}><option value="">No workflow</option><option value="book_appointment">Open booking workflow</option></select></label><label><span className="lbl">Follow-up handling</span><select className="field" value={followUpEffect} onChange={(event) => changeFollowUpEffect(event.target.value)} disabled={draft.set_do_not_contact || draft.suppress_email}><option value="none">Leave follow-up unchanged</option><option value="required">Require callback date and time</option><option value="automatic">Schedule automatically</option><option value="clear">Clear scheduled follow-up</option></select></label>{followUpEffect === "automatic" && <label><span className="lbl">Delay in hours</span><input className="field" type="number" min={1} max={8760} step={1} value={draft.follow_up_delay_hours ?? 24} onChange={(event) => patchDraft({ follow_up_delay_hours: Math.min(8760, Math.max(1, Number(event.target.value) || 1)) })} /></label>}</div></section>

      <section><header><span>4</span><div><b>Call and contact controls</b><small>Safety choices override incompatible outreach actions.</small></div></header><div className="prospectAutomationChecks"><label><input type="checkbox" checked={draft.increment_call_attempt === true} onChange={(event) => event.target.checked ? patchDraft({ increment_call_attempt: true }) : patchDraft({}, ["increment_call_attempt"])} /> Count this call attempt</label><label><input type="checkbox" checked={draft.requires_appointment === true} disabled={draft.target_stage_key === "booked"} onChange={(event) => event.target.checked ? patchDraft({ requires_appointment: true }) : patchDraft({}, ["requires_appointment"])} /> Require linked appointment</label><label><input type="checkbox" checked={draft.set_do_not_contact === true} disabled={draft.target_stage_key === "not_interested"} onChange={(event) => changeDoNotContact(event.target.checked)} /> Mark do-not-contact</label><label><input type="checkbox" checked={draft.suppress_email === true} onChange={(event) => changeSuppressEmail(event.target.checked)} /> Suppress this email address</label></div></section>
    </div>

    <div className="prospectEffectSummary"><span><CheckCircle2 size={19} /></span><div><b>Result when “{selected.label}” is applied</b><ul>{effectSummary.map((effect) => <li key={effect}>{effect}</li>)}</ul></div></div>
    <div className="prospectDialogActions"><button type="button" className="btn" disabled={!dirty || busy} onClick={() => setDraft({ ...storedConfig })}>Discard changes</button><button type="button" className="btn pri" disabled={busy || !selected.id || !dirty} onClick={() => selected.id && onSave(selected.id, draft)}>{busy ? "Saving outcome…" : "Save outcome automation"}</button></div>
  </section>;
}
