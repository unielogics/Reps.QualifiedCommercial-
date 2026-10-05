"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, Paperclip } from "lucide-react";
import { api, apiBlob } from "@/lib/api";
import type { ProspectCollateralOptionList, ProspectDraftPurpose } from "@/lib/prospects";
import { leadTypeDefinition, type LeadType } from "@/lib/leadTypes";

export type ProspectCollateralSelection = {
  includeAll: boolean;
  selectedIds: string[];
  sendWithoutPdfs: boolean;
  bundleId?: string | null;
  bundleVersion?: number | null;
};

function fileSize(value?: number | null): string {
  if (!value || value < 1) return "Size unavailable";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export default function ProspectCollateralSelector({
  value,
  leadType = "dealer",
  purpose = "information",
  disabled = false,
  onChange,
  onReadyChange,
}: {
  value: ProspectCollateralSelection;
  leadType?: LeadType | null;
  purpose?: ProspectDraftPurpose;
  disabled?: boolean;
  onChange: (next: ProspectCollateralSelection) => void;
  onReadyChange?: (ready: boolean) => void;
}) {
  const { getToken } = useAuth();
  const typeDefinition = leadTypeDefinition(leadType);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const collateral = useQuery({
    queryKey: ["marketing-collateral", "active", leadType, purpose],
    queryFn: async () => {
      const params = new URLSearchParams({ lead_type: leadType!, purpose });
      return api<ProspectCollateralOptionList>(`/dealer-os/prospect-outreach/collateral-options?${params}`, { authToken: (await getToken()) ?? undefined });
    },
    enabled: Boolean(leadType),
  });
  const active = useMemo(
    () => (collateral.data?.items ?? [])
      .slice()
      .sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name)),
    [collateral.data?.items],
  );
  const activeIdFingerprint = active.map((asset) => asset.id).join("|");
  const defaultIds = useMemo(
    () => active.filter((asset) => asset.inclusion_mode === "default" || (asset.inclusion_mode == null && asset.included_by_default !== false)).map((asset) => asset.id),
    [active],
  );
  const selectedFingerprint = value.selectedIds.join("|");
  const activeIds = useMemo(() => new Set(active.map((asset) => asset.id)), [active]);
  const validSelectedIds = value.selectedIds.filter((id) => activeIds.has(id));
  const selectionReady = Boolean(leadType) && !collateral.isLoading && !collateral.isError && (
    value.includeAll ? Boolean(collateral.data?.bundle_id && defaultIds.length) : validSelectedIds.length > 0 || value.sendWithoutPdfs
  );

  useEffect(() => {
    onReadyChange?.(selectionReady);
  }, [onReadyChange, selectionReady]);

  useEffect(() => {
    if (!collateral.data) return;
    const bundleId = collateral.data.bundle_id ?? null;
    const bundleVersion = collateral.data.bundle_version ?? null;
    if (!collateral.data.bundle_id && value.includeAll) {
      onChange({ includeAll: false, selectedIds: [], sendWithoutPdfs: false, bundleId, bundleVersion });
      return;
    }
    const allowed = new Set(active.map((asset) => asset.id));
    const nextIds = value.selectedIds.filter((id) => allowed.has(id));
    if (
      nextIds.length !== value.selectedIds.length
      || value.bundleId !== bundleId
      || value.bundleVersion !== bundleVersion
    ) {
      onChange({ ...value, selectedIds: nextIds, sendWithoutPdfs: nextIds.length ? false : value.sendWithoutPdfs, bundleId, bundleVersion });
    }
    // The fingerprints make this run only when the server inventory or selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdFingerprint, collateral.data, selectedFingerprint]);

  const preview = useMutation({
    mutationFn: async ({ path, target }: { path: string; target: Window }) => {
      const blob = await apiBlob(path.replace(/^\/api\/v1/, ""), { authToken: (await getToken()) ?? undefined });
      const objectUrl = URL.createObjectURL(blob);
      target.location.href = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    },
    onSettled: () => setPreviewingId(null),
  });

  const openPreview = (id: string, previewUrl?: string | null) => {
    const target = window.open("about:blank", "_blank");
    if (!target) return;
    target.opener = null;
    setPreviewingId(id);
    preview.mutate({ path: previewUrl || `/dealer-os/prospect-outreach/collateral-options/${id}/document`, target });
  };
  const bundlePin = { bundleId: collateral.data?.bundle_id ?? null, bundleVersion: collateral.data?.bundle_version ?? null };
  const setAttachAll = (includeAll: boolean) => onChange({ includeAll, selectedIds: includeAll ? [] : defaultIds, sendWithoutPdfs: false, ...bundlePin });
  const toggleAsset = (id: string, checked: boolean) => {
    const selectedIds = checked
      ? [...new Set([...value.selectedIds, id])]
      : value.selectedIds.filter((assetId) => assetId !== id);
    onChange({ includeAll: false, selectedIds, sendWithoutPdfs: false, ...bundlePin });
  };

  return <fieldset className="prospectCollateralPicker" disabled={disabled}>
    <legend>PDF attachments</legend>
    <label className="prospectCheckCard">
      <input type="checkbox" checked={value.includeAll} onChange={(event) => setAttachAll(event.target.checked)} />
      <span><b>Use the curated {typeDefinition.shortLabel} PDF bundle</b><small>{!leadType ? "Choose a business type first." : collateral.isLoading ? "Loading the published bundle…" : collateral.data?.bundle_id ? `${defaultIds.length} default PDF${defaultIds.length === 1 ? "" : "s"} from published bundle v${collateral.data.bundle_version ?? 1}. Turn this off to customize.` : "There is no published bundle for this email purpose."}</small></span>
    </label>

    {(!value.includeAll || (!collateral.isLoading && !collateral.data?.bundle_id)) && <div className="prospectCollateralChoices">
      <div className="prospectCollateralChoiceHeader">
        <span><b>Choose the PDFs for this email</b><small>{validSelectedIds.length} of {active.length} selected</small></span>
        <span><button type="button" className="btn sm" disabled={!active.length || validSelectedIds.length === active.length} onClick={() => onChange({ includeAll: false, selectedIds: active.map((asset) => asset.id), sendWithoutPdfs: false, ...bundlePin })}>Select all</button><button type="button" className="btn sm" disabled={!validSelectedIds.length} onClick={() => onChange({ includeAll: false, selectedIds: [], sendWithoutPdfs: false, ...bundlePin })}>Clear</button></span>
      </div>
      {collateral.isLoading && <div className="empty compact">Loading approved {typeDefinition.shortLabel} PDFs…</div>}
      {collateral.isError && <div className="note" role="alert">{collateral.error instanceof Error ? collateral.error.message : "The approved PDF library could not be loaded."}</div>}
      {!collateral.isLoading && !collateral.isError && active.length > 0 && <div className="prospectCollateralChoiceRows">
        {active.map((asset) => <div className={`prospectCollateralChoiceRow${value.selectedIds.includes(asset.id) ? " selected" : ""}`} key={asset.id}>
          <label><input type="checkbox" checked={value.selectedIds.includes(asset.id)} onChange={(event) => toggleAsset(asset.id, event.target.checked)} /><FileText size={17} /><span><b>{asset.name}</b><small>{asset.file_name} · Version {asset.version} · {fileSize(asset.size_bytes)} · {asset.inclusion_mode === "optional" ? "Optional" : "Default"}</small></span></label>
          <button type="button" className="btn sm" disabled={preview.isPending} onClick={() => openPreview(asset.id, asset.preview_url)} aria-label={`Preview ${asset.file_name}`}><ExternalLink size={14} />{previewingId === asset.id ? "Opening…" : "Preview"}</button>
        </div>)}
      </div>}
      {!collateral.isLoading && !collateral.isError && !active.length && <div className="empty compact">No published {typeDefinition.shortLabel} bundle is available for this email. An administrator can configure it, or you can deliberately send without PDFs.</div>}
      <label className={`prospectNoCollateralChoice${value.sendWithoutPdfs ? " selected" : ""}`}><input type="checkbox" checked={value.sendWithoutPdfs} onChange={(event) => onChange({ includeAll: false, selectedIds: [], sendWithoutPdfs: event.target.checked, ...bundlePin })} /><Paperclip size={17} /><span><b>Send without PDFs</b><small>This is an explicit no-attachment choice for this email.</small></span></label>
      {!selectionReady && !collateral.isLoading && !collateral.isError && <div className="prospectAttachmentRequired" role="status">Use the published defaults, select at least one eligible PDF, or explicitly choose “Send without PDFs.”</div>}
      {preview.isError && <div className="note" role="alert">{preview.error instanceof Error ? preview.error.message : "The PDF preview could not be opened."}</div>}
    </div>}
  </fieldset>;
}
