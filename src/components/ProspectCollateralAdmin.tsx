"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, FileText, Upload } from "lucide-react";
import { api, apiBlob, apiUpload } from "@/lib/api";
import { LEAD_TYPES, leadTypeDefinition, type LeadType } from "@/lib/leadTypes";
import type { MarketingCollateralAsset, MarketingCollateralBundle, MarketingCollateralBundleList, MarketingCollateralList, ProspectDraftPurpose } from "@/lib/prospects";

const PURPOSES: Array<{ key: ProspectDraftPurpose; label: string }> = [
  { key: "information", label: "Information pack" },
  { key: "missed_call", label: "Missed call" },
  { key: "callback_confirmation", label: "Callback confirmation" },
  { key: "client_will_call_back", label: "Client will call back" },
  { key: "booking", label: "Booking invitation" },
  { key: "general", label: "General outreach" },
];

type BundleItemInput = { asset_id: string; inclusion_mode: "default" | "optional" };

export default function ProspectCollateralAdmin() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [leadType, setLeadType] = useState<LeadType>("dealer");
  const [purpose, setPurpose] = useState<ProspectDraftPurpose>("information");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [bundleName, setBundleName] = useState("");
  const [items, setItems] = useState<BundleItemInput[]>([]);
  const [hydratedBundle, setHydratedBundle] = useState("");
  const definition = leadTypeDefinition(leadType);

  const collateral = useQuery({
    queryKey: ["marketing-collateral", "admin", leadType],
    queryFn: async () => api<MarketingCollateralList>(`/dealer-os/marketing-collateral?include_retired=true&lead_type=${leadType}`, { authToken: (await getToken()) ?? undefined }),
  });
  const bundles = useQuery({
    queryKey: ["marketing-collateral-bundles", leadType, purpose],
    queryFn: async () => api<MarketingCollateralBundleList>(`/dealer-os/marketing-collateral-bundles?lead_type=${leadType}&purpose=${purpose}&include_retired=true`, { authToken: (await getToken()) ?? undefined }),
  });
  const draftBundle = bundles.data?.items.find((bundle) => bundle.status === "draft");
  const publishedBundle = bundles.data?.items.find((bundle) => bundle.status === "published");
  const editingBundle = draftBundle ?? publishedBundle;
  const bundleFingerprint = editingBundle ? `${editingBundle.id}:${editingBundle.revision}:${editingBundle.status}` : `${leadType}:${purpose}:empty`;

  useEffect(() => {
    if (hydratedBundle === bundleFingerprint) return;
    setBundleName(editingBundle?.name ?? `${definition.label} · ${PURPOSES.find((item) => item.key === purpose)?.label ?? "Outreach"}`);
    setItems((editingBundle?.items ?? []).map((item) => ({ asset_id: item.asset_id, inclusion_mode: item.inclusion_mode })));
    setHydratedBundle(bundleFingerprint);
  }, [bundleFingerprint, definition.label, editingBundle, hydratedBundle, purpose]);

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["marketing-collateral"] }),
      qc.invalidateQueries({ queryKey: ["marketing-collateral-bundles"] }),
    ]);
  };
  const upload = useMutation({
    mutationFn: async () => {
      if (!uploadFile) throw new Error("Choose a PDF first.");
      const form = new FormData();
      form.append("file", uploadFile);
      form.append("name", uploadTitle.trim() || uploadFile.name.replace(/\.pdf$/i, ""));
      form.append("lead_type", leadType);
      form.append("purposes", JSON.stringify([purpose]));
      form.append("included_by_default", "false");
      form.append("sort_order", "0");
      return apiUpload<MarketingCollateralAsset>("/dealer-os/marketing-collateral", form, { authToken: (await getToken()) ?? undefined });
    },
    onSuccess: async () => { setUploadFile(null); setUploadTitle(""); if (fileInput.current) fileInput.current.value = ""; await refresh(); },
  });
  const assetAction = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approve" | "retire" | "restore" }) => api(`/dealer-os/marketing-collateral/${id}/${action}`, { method: "POST", body: JSON.stringify({}), authToken: (await getToken()) ?? undefined }),
    onSuccess: refresh,
  });
  const createBundle = useMutation({
    mutationFn: async (initialItems: BundleItemInput[]) => api<MarketingCollateralBundle>("/dealer-os/marketing-collateral-bundles", {
      method: "POST",
      body: JSON.stringify({ lead_type: leadType, purpose, name: bundleName.trim(), items: initialItems }),
      authToken: (await getToken()) ?? undefined,
    }),
    onSuccess: refresh,
  });
  const saveBundle = useMutation({
    mutationFn: async () => {
      if (!draftBundle) throw new Error("Create an editable bundle version first.");
      return api<MarketingCollateralBundle>(`/dealer-os/marketing-collateral-bundles/${draftBundle.id}`, {
        method: "PATCH",
        body: JSON.stringify({ expected_revision: draftBundle.revision, name: bundleName.trim(), items }),
        authToken: (await getToken()) ?? undefined,
      });
    },
    onSuccess: refresh,
  });
  const publishBundle = useMutation({
    mutationFn: async () => {
      if (!draftBundle) throw new Error("Save a draft bundle first.");
      if (invalidSelectedAssets.length) throw new Error("Remove retired PDFs or approve pending PDFs before publishing this bundle.");
      return api<MarketingCollateralBundle>(`/dealer-os/marketing-collateral-bundles/${draftBundle.id}/publish`, { method: "POST", body: JSON.stringify({ expected_revision: draftBundle.revision }), authToken: (await getToken()) ?? undefined });
    },
    onSuccess: refresh,
  });
  const preview = useMutation({
    mutationFn: async ({ id, target }: { id: string; target: Window }) => {
      const blob = await apiBlob(`/dealer-os/marketing-collateral/${id}/document?disposition=inline`, { authToken: (await getToken()) ?? undefined });
      const url = URL.createObjectURL(blob); target.location.href = url; window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
  });

  const libraryAssets = useMemo(() => (collateral.data?.items ?? []).filter((asset) => asset.lead_type === leadType), [collateral.data?.items, leadType]);
  const activeAssets = useMemo(
    () => libraryAssets.filter((asset) => asset.status !== "retired"),
    [libraryAssets],
  );
  const bundleAssets = useMemo(
    () => libraryAssets.filter((asset) => asset.status !== "retired" || items.some((item) => item.asset_id === asset.id)),
    [items, libraryAssets],
  );
  const orderedAssets = useMemo(() => {
    const positions = new Map(items.map((item, index) => [item.asset_id, index]));
    return bundleAssets.slice().sort((left, right) => (positions.get(left.id) ?? 10000) - (positions.get(right.id) ?? 10000) || left.name.localeCompare(right.name));
  }, [bundleAssets, items]);
  const currentMode = (assetId: string) => items.find((item) => item.asset_id === assetId)?.inclusion_mode ?? "off";
  const setMode = (assetId: string, mode: "default" | "optional" | "off") => setItems((current) => {
    const filtered = current.filter((item) => item.asset_id !== assetId);
    return mode === "off" ? filtered : [...filtered, { asset_id: assetId, inclusion_mode: mode }];
  });
  const moveItem = (assetId: string, direction: -1 | 1) => setItems((current) => {
    const next = [...current]; const from = next.findIndex((item) => item.asset_id === assetId); const to = from + direction;
    if (from < 0 || to < 0 || to >= next.length) return current;
    [next[from], next[to]] = [next[to], next[from]]; return next;
  });
  const dirty = Boolean(draftBundle && (bundleName !== draftBundle.name || JSON.stringify(items) !== JSON.stringify(draftBundle.items.map((item) => ({ asset_id: item.asset_id, inclusion_mode: item.inclusion_mode })))));
  const invalidSelectedAssets = items.filter((item) => libraryAssets.find((asset) => asset.id === item.asset_id)?.status !== "active");
  const confirmContextChange = () => !dirty || window.confirm("Discard unsaved bundle edits and switch context?");
  const changeLeadType = (next: LeadType) => { if (next !== leadType && confirmContextChange()) { setLeadType(next); setHydratedBundle(""); } };
  const changePurpose = (next: ProspectDraftPurpose) => { if (next !== purpose && confirmContextChange()) { setPurpose(next); setHydratedBundle(""); } };
  const error = collateral.error || bundles.error || upload.error || assetAction.error || createBundle.error || saveBundle.error || publishBundle.error || preview.error;

  return <div className="prospectCollateralAdmin prospectBundleAdmin">
    <header className="prospectBundleIntro"><div><h3>Curated outreach bundles</h3><p className="sub">Each business type and email purpose has its own published, versioned PDF package. Publishing never changes existing drafts or sent emails.</p></div>{publishedBundle && <span className="cellchip c-ok">Published v{publishedBundle.version}</span>}</header>
    <div className="prospectIndustryTabs" role="radiogroup" aria-label="Collateral business type">{LEAD_TYPES.map((item) => <button key={item.key} type="button" role="radio" aria-checked={leadType === item.key} className={leadType === item.key ? "on" : ""} onClick={() => changeLeadType(item.key)}><b>{item.label}</b><small>{item.key}</small></button>)}</div>
    <label><span className="lbl">Email purpose</span><select className="field" value={purpose} onChange={(event) => changePurpose(event.target.value as ProspectDraftPurpose)}>{PURPOSES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
    <section className="prospectBundleSection"><div><b>1. Approved PDF library</b><small>Upload once; the same approved PDF version may be referenced by multiple bundles.</small></div><div className="prospectUploadBar"><label><span className="lbl">Display title</span><input className="field" value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} placeholder={`${definition.shortLabel} capabilities guide`} /></label><label className="prospectFilePicker"><span className="lbl">PDF file</span><input ref={fileInput} type="file" accept="application/pdf,.pdf" onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} /><span className="btn"><Upload size={16} />{uploadFile?.name ?? "Choose PDF"}</span></label><button type="button" className="btn pri" disabled={!uploadFile || upload.isPending} onClick={() => upload.mutate()}>{upload.isPending ? "Validating…" : `Upload for ${definition.shortLabel}`}</button></div></section>
    <section className="prospectBundleSection"><div><b>2. Build the {definition.shortLabel} bundle</b><small>Default PDFs begin selected. Optional PDFs remain available to the agent.</small></div>{!draftBundle && <div className="prospectBundleCreate"><label><span className="lbl">Bundle name</span><input className="field" value={bundleName} onChange={(event) => setBundleName(event.target.value)} /></label><button type="button" className="btn pri" disabled={!bundleName.trim() || createBundle.isPending} onClick={() => createBundle.mutate(publishedBundle ? publishedBundle.items.map((item) => ({ asset_id: item.asset_id, inclusion_mode: item.inclusion_mode })) : [])}>{publishedBundle ? "Create next bundle version" : "Create bundle draft"}</button></div>}{draftBundle && <label><span className="lbl">Bundle name</span><input className="field" value={bundleName} onChange={(event) => setBundleName(event.target.value)} /></label>}
      <div className="prospectCollateralRows">{orderedAssets.map((asset) => { const mode = currentMode(asset.id); const index = items.findIndex((item) => item.asset_id === asset.id); const unavailable = asset.status !== "active"; const action = asset.status === "pending_approval" ? "approve" : asset.status === "retired" ? "restore" : "retire"; return <div className={`prospectCollateralRow${mode !== "off" ? " selected" : ""}${unavailable && mode !== "off" ? " invalid" : ""}`} key={asset.id}><FileText size={19} /><span><b>{asset.name}</b><small>{asset.file_name} · v{asset.version} · {asset.status.replaceAll("_", " ")}{unavailable && mode !== "off" ? " · cannot publish while selected" : ""}</small></span><select className="field" value={mode} disabled={!draftBundle} onChange={(event) => setMode(asset.id, event.target.value as typeof mode)}><option value="off">Not in bundle</option><option value="default">Selected by default</option><option value="optional">Optional selection</option></select><span className="prospectBundleOrder"><button type="button" className="iconBtn" aria-label={`Move ${asset.name} up`} disabled={!draftBundle || index <= 0} onClick={() => moveItem(asset.id, -1)}><ArrowUp size={15} /></button><button type="button" className="iconBtn" aria-label={`Move ${asset.name} down`} disabled={!draftBundle || index < 0 || index >= items.length - 1} onClick={() => moveItem(asset.id, 1)}><ArrowDown size={15} /></button></span><button type="button" className="btn sm" onClick={() => { const target = window.open("about:blank", "_blank"); if (target) { target.opener = null; preview.mutate({ id: asset.id, target }); } }}>Preview</button><button type="button" className="btn sm" disabled={assetAction.isPending} onClick={() => assetAction.mutate({ id: asset.id, action })}>{action === "approve" ? "Approve" : action === "restore" ? "Restore for approval" : "Retire"}</button></div>; })}{collateral.isLoading && <div className="empty compact">Loading PDFs…</div>}{!collateral.isLoading && !activeAssets.length && <div className="empty compact">No {definition.shortLabel} PDFs have been uploaded.</div>}</div>
      {invalidSelectedAssets.length > 0 && <div className="note" role="alert">Remove the unavailable PDF{invalidSelectedAssets.length === 1 ? "" : "s"} from this draft bundle, or restore and approve them, before publishing.</div>}
      {draftBundle && <div className="prospectDialogActions"><button type="button" className="btn" disabled={!dirty || saveBundle.isPending} onClick={() => { setBundleName(draftBundle.name); setItems(draftBundle.items.map((item) => ({ asset_id: item.asset_id, inclusion_mode: item.inclusion_mode }))); }}>Discard bundle edits</button><button type="button" className="btn" disabled={!dirty || saveBundle.isPending} onClick={() => saveBundle.mutate()}>{saveBundle.isPending ? "Saving…" : "Save bundle draft"}</button><button type="button" className="btn pri" disabled={dirty || invalidSelectedAssets.length > 0 || !items.some((item) => item.inclusion_mode === "default") || publishBundle.isPending} onClick={() => publishBundle.mutate()}>{publishBundle.isPending ? "Validating…" : "Publish bundle atomically"}</button></div>}
    </section>
    <section className="prospectBundleSection"><div><b>Retired PDF versions</b><small>Historical email snapshots remain available; retired assets cannot enter a new bundle.</small></div>{(collateral.data?.items ?? []).filter((asset) => asset.status === "retired" && asset.lead_type === leadType).map((asset) => <div className="prospectCollateralRow retired" key={asset.id}><FileText size={18} /><span><b>{asset.name}</b><small>{asset.file_name} · v{asset.version}</small></span><button type="button" className="btn sm" onClick={() => assetAction.mutate({ id: asset.id, action: "restore" })}>Restore for approval</button></div>)}</section>
    {error && <div className="note" role="alert">{error instanceof Error ? error.message : "Collateral configuration could not be completed."}</div>}
  </div>;
}
