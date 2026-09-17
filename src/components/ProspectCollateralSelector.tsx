"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, Paperclip } from "lucide-react";
import { api, apiBlob } from "@/lib/api";
import type { ProspectCollateralOptionList } from "@/lib/prospects";

export type ProspectCollateralSelection = {
  includeAll: boolean;
  selectedIds: string[];
  sendWithoutPdfs: boolean;
};

function fileSize(value?: number | null): string {
  if (!value || value < 1) return "Size unavailable";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export default function ProspectCollateralSelector({
  value,
  disabled = false,
  onChange,
  onReadyChange,
}: {
  value: ProspectCollateralSelection;
  disabled?: boolean;
  onChange: (next: ProspectCollateralSelection) => void;
  onReadyChange?: (ready: boolean) => void;
}) {
  const { getToken } = useAuth();
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const collateral = useQuery({
    queryKey: ["marketing-collateral", "active", "dealer-outreach"],
    queryFn: async () => api<ProspectCollateralOptionList>("/dealer-os/prospect-outreach/collateral-options", { authToken: (await getToken()) ?? undefined }),
  });
  const active = useMemo(
    () => (collateral.data?.items ?? [])
      .slice()
      .sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name)),
    [collateral.data?.items],
  );
  const activeIdFingerprint = active.map((asset) => asset.id).join("|");
  const selectedFingerprint = value.selectedIds.join("|");
  const activeIds = useMemo(() => new Set(active.map((asset) => asset.id)), [active]);
  const validSelectedIds = value.selectedIds.filter((id) => activeIds.has(id));
  const selectionReady = !collateral.isLoading && !collateral.isError && (
    value.includeAll ? active.length > 0 : validSelectedIds.length > 0 || value.sendWithoutPdfs
  );

  useEffect(() => {
    onReadyChange?.(selectionReady);
  }, [onReadyChange, selectionReady]);

  useEffect(() => {
    if (!collateral.data) return;
    const allowed = new Set(active.map((asset) => asset.id));
    const nextIds = value.selectedIds.filter((id) => allowed.has(id));
    if (nextIds.length !== value.selectedIds.length) {
      onChange({ ...value, selectedIds: nextIds, sendWithoutPdfs: nextIds.length ? false : value.sendWithoutPdfs });
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
  const setAttachAll = (includeAll: boolean) => onChange({ includeAll, selectedIds: [], sendWithoutPdfs: false });
  const toggleAsset = (id: string, checked: boolean) => {
    const selectedIds = checked
      ? [...new Set([...value.selectedIds, id])]
      : value.selectedIds.filter((assetId) => assetId !== id);
    onChange({ includeAll: false, selectedIds, sendWithoutPdfs: false });
  };

  return <fieldset className="prospectCollateralPicker" disabled={disabled}>
    <legend>PDF attachments</legend>
    <label className="prospectCheckCard">
      <input type="checkbox" checked={value.includeAll} onChange={(event) => setAttachAll(event.target.checked)} />
      <span><b>Attach every active Dealer Outreach PDF</b><small>{collateral.isLoading ? "Loading the approved library…" : active.length ? `Includes all ${active.length} currently approved PDF${active.length === 1 ? "" : "s"}.` : "There are currently no active approved PDFs."}</small></span>
    </label>

    {(!value.includeAll || (!collateral.isLoading && !active.length)) && <div className="prospectCollateralChoices">
      <div className="prospectCollateralChoiceHeader">
        <span><b>Choose the PDFs for this email</b><small>{validSelectedIds.length} of {active.length} selected</small></span>
        <span><button type="button" className="btn sm" disabled={!active.length || validSelectedIds.length === active.length} onClick={() => onChange({ includeAll: false, selectedIds: active.map((asset) => asset.id), sendWithoutPdfs: false })}>Select all</button><button type="button" className="btn sm" disabled={!validSelectedIds.length} onClick={() => onChange({ includeAll: false, selectedIds: [], sendWithoutPdfs: false })}>Clear</button></span>
      </div>
      {collateral.isLoading && <div className="empty compact">Loading approved Dealer Outreach PDFs…</div>}
      {collateral.isError && <div className="note" role="alert">{collateral.error instanceof Error ? collateral.error.message : "The approved PDF library could not be loaded."}</div>}
      {!collateral.isLoading && !collateral.isError && active.length > 0 && <div className="prospectCollateralChoiceRows">
        {active.map((asset) => <div className={`prospectCollateralChoiceRow${value.selectedIds.includes(asset.id) ? " selected" : ""}`} key={asset.id}>
          <label><input type="checkbox" checked={value.selectedIds.includes(asset.id)} onChange={(event) => toggleAsset(asset.id, event.target.checked)} /><FileText size={17} /><span><b>{asset.name}</b><small>{asset.file_name} · Version {asset.version} · {fileSize(asset.size_bytes)}</small></span></label>
          <button type="button" className="btn sm" disabled={preview.isPending} onClick={() => openPreview(asset.id, asset.preview_url)} aria-label={`Preview ${asset.file_name}`}><ExternalLink size={14} />{previewingId === asset.id ? "Opening…" : "Preview"}</button>
        </div>)}
      </div>}
      {!collateral.isLoading && !collateral.isError && !active.length && <div className="empty compact">No approved active Dealer Outreach PDFs are available. Activate collateral in Dealer collateral, or deliberately choose to send without PDFs.</div>}
      <label className={`prospectNoCollateralChoice${value.sendWithoutPdfs ? " selected" : ""}`}><input type="checkbox" checked={value.sendWithoutPdfs} onChange={(event) => onChange({ includeAll: false, selectedIds: [], sendWithoutPdfs: event.target.checked })} /><Paperclip size={17} /><span><b>Send without PDFs</b><small>This is an explicit no-attachment choice for this email.</small></span></label>
      {!selectionReady && !collateral.isLoading && !collateral.isError && <div className="prospectAttachmentRequired" role="status">Select at least one PDF, turn on “Attach every active PDF,” or explicitly choose “Send without PDFs.”</div>}
      {preview.isError && <div className="note" role="alert">{preview.error instanceof Error ? preview.error.message : "The PDF preview could not be opened."}</div>}
    </div>}
  </fieldset>;
}
