"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { api } from "@/lib/api";
import { FUNDING_INTENTS, type FundingIntent, type LeadType } from "@/lib/leadTypes";
import type { DealerProspect } from "@/lib/prospects";
import { useMe } from "@/lib/useMe";
import LeadTypePicker from "./LeadTypePicker";
import Modal from "./Modal";

export default function ProspectReclassifyDialog({ prospect, onClose, onUpdated }: { prospect: DealerProspect; onClose: () => void; onUpdated: (prospect: DealerProspect) => void }) {
  const { getToken } = useAuth();
  const me = useMe();
  const [leadType, setLeadType] = useState<LeadType>(prospect.lead_type || "dealer");
  const [fundingIntent, setFundingIntent] = useState<FundingIntent | "">(prospect.funding_intent ?? "");
  const [reason, setReason] = useState("");
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [overrideConverted, setOverrideConverted] = useState(false);
  const converted = Boolean(
    prospect.converted_application_id
    || prospect.converted_intake_id
    || prospect.conversion_target
    || prospect.stage_key === "converted",
  );
  const changed = leadType !== prospect.lead_type || (fundingIntent || null) !== (prospect.funding_intent ?? null);
  const locked = converted && !me.isSuperAdmin;
  const save = useMutation({
    mutationFn: async () => api<DealerProspect>(`/dealer-os/prospects/${prospect.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        expected_version: prospect.version,
        lead_type: leadType,
        funding_intent: fundingIntent || null,
        reclassification_reason: reason.trim(),
        override_converted_reclassification: converted ? overrideConverted : false,
      }),
      authToken: (await getToken()) ?? undefined,
    }),
    onSuccess: onUpdated,
  });

  return <Modal title="Change business classification" width={760} onClose={onClose}>
    <div className="prospectReclassifyDialog">
      <p className="sub">Business type controls future email language, products, website, collateral bundle, and AI Intake destination. It is never inferred from notes or the company name.</p>
      <LeadTypePicker value={leadType} onChange={setLeadType} disabled={locked || save.isPending} compact />
      <label><span className="lbl">Funding need <small>optional and separate from business type</small></span><select className="field" value={fundingIntent} disabled={locked || save.isPending} onChange={(event) => setFundingIntent(event.target.value as FundingIntent | "")}><option value="">Not selected</option>{FUNDING_INTENTS.map((intent) => <option key={intent.key} value={intent.key}>{intent.label}</option>)}</select></label>
      {changed && <div className="prospectEffectSummary danger"><CircleAlert size={18} /><span><b>Unsent emails will be permanently voided</b><small>Drafting, review, editing, queued, and blocked emails prepared under the old type cannot be resumed. Sent and currently sending email snapshots remain unchanged.</small></span></div>}
      {changed && <label className={`consent${confirmVoid ? " on" : ""}`}><input type="checkbox" checked={confirmVoid} onChange={(event) => setConfirmVoid(event.target.checked)} /><span className="ctext"><span className="ctitle">Confirm the type change</span>I understand future outreach and conversion will use the new classification.</span></label>}
      {converted && !me.isSuperAdmin && <div className="note" role="alert">This prospect is already converted. Business type is locked; a Super Admin must make an audited correction.</div>}
      {converted && me.isSuperAdmin && <label className={`consent danger${overrideConverted ? " on" : ""}`}><input type="checkbox" checked={overrideConverted} onChange={(event) => setOverrideConverted(event.target.checked)} /><span className="ctext"><span className="ctitle">Super Admin correction after conversion</span>The destination file is not rewritten. Confirm only when this Marketing classification was recorded incorrectly.</span></label>}
      {changed && <label><span className="lbl">Reason for reclassification</span><textarea className="field" rows={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why the original business type or funding need was incorrect." /></label>}
      {save.isError && <div className="note" role="alert">{save.error instanceof Error ? save.error.message : "The classification could not be updated."}</div>}
      <div className="prospectDialogActions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn pri" disabled={!changed || locked || !confirmVoid || !reason.trim() || (converted && !overrideConverted) || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving and voiding drafts…" : "Confirm classification change"}</button></div>
    </div>
  </Modal>;
}
