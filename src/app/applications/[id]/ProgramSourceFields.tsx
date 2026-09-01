"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WandSparkles } from "lucide-react";
import { api } from "@/lib/api";
import type { ApplicationProfileData } from "@/lib/applicationReadiness";
import type { UnderwritingResolution } from "./Step4Resolution";

type SourceField =
  | "guaranty_type"
  | "business_stage"
  | "signer_title"
  | "existing_mca_balance"
  | "existing_sba_balance"
  | "active_ucc_filings"
  | "affiliate_businesses"
  | "send_welcome_email";

type Draft = Record<SourceField, string>;
type ExtractedSourceField = "existing_mca_balance" | "existing_sba_balance" | "active_ucc_filings";

const EMPTY: Draft = {
  guaranty_type: "",
  business_stage: "",
  signer_title: "",
  existing_mca_balance: "",
  existing_sba_balance: "",
  active_ucc_filings: "",
  affiliate_businesses: "",
  send_welcome_email: "",
};

export function programSourceFieldsComplete(profile: ApplicationProfileData | null | undefined): boolean {
  return Boolean(
    profile?.guaranty_type?.trim()
      && profile.business_stage?.trim()
      && profile.signer_title?.trim()
      && profile.existing_mca_balance !== null
      && profile.existing_mca_balance !== undefined
      && profile.existing_sba_balance !== null
      && profile.existing_sba_balance !== undefined
      && profile.active_ucc_filings !== null
      && profile.active_ucc_filings !== undefined
      && profile.affiliate_businesses !== null
      && profile.affiliate_businesses !== undefined
      && profile.send_welcome_email !== null
      && profile.send_welcome_email !== undefined,
  );
}

function draftFromProfile(profile: ApplicationProfileData | null | undefined): Draft {
  if (!profile) return EMPTY;
  return {
    guaranty_type: profile.guaranty_type ?? "",
    business_stage: profile.business_stage ?? "",
    signer_title: profile.signer_title ?? "",
    existing_mca_balance: profile.existing_mca_balance?.toString() ?? "",
    existing_sba_balance: profile.existing_sba_balance?.toString() ?? "",
    active_ucc_filings: profile.active_ucc_filings?.toString() ?? "",
    affiliate_businesses: profile.affiliate_businesses === true ? "yes" : profile.affiliate_businesses === false ? "no" : "",
    send_welcome_email: profile.send_welcome_email === true ? "yes" : profile.send_welcome_email === false ? "no" : "",
  };
}

export default function ProgramSourceFields({ dealerId }: { dealerId: string }) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const touched = useRef(new Set<SourceField>());
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const profile = useQuery({
    queryKey: ["application-profile", dealerId],
    queryFn: async () => api<ApplicationProfileData | null>(`/dealer-os/dealers/${dealerId}/application-profile`, {
      authToken: (await getToken()) ?? undefined,
    }),
  });
  const resolution = useQuery({
    queryKey: ["underwriting-resolution", dealerId],
    queryFn: async () => api<UnderwritingResolution>(`/dealer-os/dealers/${dealerId}/underwriting-resolution`, {
      authToken: (await getToken()) ?? undefined,
    }),
  });

  useEffect(() => {
    const saved = draftFromProfile(profile.data);
    setDraft((current) => {
      const next = { ...current };
      for (const key of Object.keys(saved) as SourceField[]) {
        if (touched.current.has(key)) continue;
        next[key] = saved[key];
      }
      for (const key of ["existing_mca_balance", "existing_sba_balance", "active_ucc_filings"] as ExtractedSourceField[]) {
        if (touched.current.has(key) || saved[key] !== "") continue;
        const suggestion = resolution.data?.financial_suggestions[key]?.value;
        if (suggestion !== null && suggestion !== undefined && Number.isFinite(Number(suggestion))) {
          next[key] = String(suggestion);
        }
      }
      return next;
    });
  }, [profile.data, resolution.data?.financial_suggestions]);

  const patch = useMutation({
    mutationFn: async (body: Record<string, unknown>) => api<ApplicationProfileData>(
      `/dealer-os/dealers/${dealerId}/application-profile`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
        authToken: (await getToken()) ?? undefined,
      },
    ),
    onSuccess: (saved) => {
      qc.setQueryData(["application-profile", dealerId], saved);
      void qc.invalidateQueries({ queryKey: ["decision", dealerId] });
      void qc.invalidateQueries({ queryKey: ["submission-readiness", dealerId] });
      void qc.invalidateQueries({ queryKey: ["underwriting-resolution", dealerId] });
    },
  });

  const update = (field: SourceField, value: string) => {
    touched.current.add(field);
    setDraft((current) => ({ ...current, [field]: value }));
  };
  const commit = (field: SourceField, explicit?: string) => {
    const raw = (explicit ?? draft[field]).trim();
    let value: string | number | boolean | null = raw || null;
    if (["existing_mca_balance", "existing_sba_balance", "active_ucc_filings"].includes(field)) {
      value = raw === "" ? null : Number(raw);
    }
    if (["affiliate_businesses", "send_welcome_email"].includes(field)) {
      value = raw === "" ? null : raw === "yes";
    }
    patch.mutate({ [field]: value, confirm_fields: [field] });
  };
  const select = (field: SourceField, value: string) => {
    update(field, value);
    commit(field, value);
  };
  const extractedMeta = (field: ExtractedSourceField) => {
    const confirmed = Boolean(profile.data?.field_confirmations?.[field]);
    const suggestion = resolution.data?.financial_suggestions[field];
    const label = confirmed
      ? "Agent confirmed"
      : profile.data?.[field] !== null && profile.data?.[field] !== undefined
        ? "Agent entered"
        : suggestion?.label || suggestion?.source || "Unavailable";
    return { confirmed, suggestion, label };
  };
  const complete = programSourceFieldsComplete(profile.data);
  const mcaMeta = extractedMeta("existing_mca_balance");
  const sbaMeta = extractedMeta("existing_sba_balance");
  const uccMeta = extractedMeta("active_ucc_filings");

  return (
    <div id="program-source-fields" className={`panel guided-target${complete ? "" : " panel-invalid"}`} tabIndex={-1}>
      <div className="panel-h">
        Program application source fields
        <span className="sp" />
        <span className={`cellchip ${complete ? "c-ok" : "c-warn"}`}>{complete ? "Complete" : "Required"}</span>
      </div>
      <div className="panel-b">
        <p className="sub" style={{ marginTop: 0 }}>
          These Step 1 values populate the selected program PDF. Enter an explicit zero, No, or N/A when applicable.
        </p>
        <div className="step4SourceGrid">
          <label><span className="lbl">Guaranty type</span><select className={`field${draft.guaranty_type ? "" : " field-invalid"}`} value={draft.guaranty_type} onChange={(event) => select("guaranty_type", event.target.value)}><option value="">Select</option><option value="personal">Personal</option><option value="business">Business only</option><option value="limited">Limited</option><option value="none">None</option></select></label>
          <label><span className="lbl">Business stage</span><select className={`field${draft.business_stage ? "" : " field-invalid"}`} value={draft.business_stage} onChange={(event) => select("business_stage", event.target.value)}><option value="">Select</option><option value="startup">Startup</option><option value="existing">Existing business</option><option value="acquisition">Acquisition</option></select></label>
          <label><span className="lbl">Authorized signer title</span><input className={`field${draft.signer_title.trim() ? "" : " field-invalid"}`} value={draft.signer_title} placeholder="President, Managing Member, CEO" onChange={(event) => update("signer_title", event.target.value)} onBlur={() => commit("signer_title")} /></label>
          <label>
            <span className="lbl">Outstanding MCA balance</span>
            <input className={`field${draft.existing_mca_balance.trim() ? "" : " field-invalid"}`} type="number" min="0" inputMode="decimal" placeholder="Enter 0 when none" value={draft.existing_mca_balance} onChange={(event) => update("existing_mca_balance", event.target.value)} />
            <span className="financialProvenance"><span className={`cellchip ${mcaMeta.confirmed ? "c-ok" : mcaMeta.suggestion ? "c-warn" : "c-mut"}`}>{mcaMeta.label}</span>{!mcaMeta.confirmed && draft.existing_mca_balance.trim() && <button type="button" className="btn sm" disabled={patch.isPending} onClick={() => commit("existing_mca_balance")}><WandSparkles size={14} /> {mcaMeta.suggestion ? "Confirm estimate" : "Confirm value"}</button>}</span>
            {mcaMeta.suggestion?.evidence && <small className="sub">{mcaMeta.suggestion.evidence}</small>}
          </label>
          <label>
            <span className="lbl">Outstanding SBA balance</span>
            <input className={`field${draft.existing_sba_balance.trim() ? "" : " field-invalid"}`} type="number" min="0" inputMode="decimal" placeholder="Enter 0 when none" value={draft.existing_sba_balance} onChange={(event) => update("existing_sba_balance", event.target.value)} />
            <span className="financialProvenance"><span className={`cellchip ${sbaMeta.confirmed ? "c-ok" : sbaMeta.suggestion ? "c-warn" : "c-mut"}`}>{sbaMeta.label}</span>{!sbaMeta.confirmed && draft.existing_sba_balance.trim() && <button type="button" className="btn sm" disabled={patch.isPending} onClick={() => commit("existing_sba_balance")}><WandSparkles size={14} /> {sbaMeta.suggestion ? "Confirm estimate" : "Confirm value"}</button>}</span>
            {sbaMeta.suggestion?.evidence && <small className="sub">{sbaMeta.suggestion.evidence}</small>}
          </label>
          <label>
            <span className="lbl">Active UCC filings</span>
            <input className={`field${draft.active_ucc_filings.trim() ? "" : " field-invalid"}`} type="number" min="0" step="1" inputMode="numeric" placeholder="Enter 0 when none" value={draft.active_ucc_filings} onChange={(event) => update("active_ucc_filings", event.target.value)} />
            <span className="financialProvenance"><span className={`cellchip ${uccMeta.confirmed ? "c-ok" : uccMeta.suggestion ? "c-warn" : "c-mut"}`}>{uccMeta.label}</span>{!uccMeta.confirmed && draft.active_ucc_filings.trim() && <button type="button" className="btn sm" disabled={patch.isPending} onClick={() => commit("active_ucc_filings")}><WandSparkles size={14} /> {uccMeta.suggestion ? "Confirm estimate" : "Confirm value"}</button>}</span>
            {uccMeta.suggestion?.evidence && <small className="sub">{uccMeta.suggestion.evidence}</small>}
          </label>
          <label><span className="lbl">Affiliate businesses</span><select className={`field${draft.affiliate_businesses ? "" : " field-invalid"}`} value={draft.affiliate_businesses} onChange={(event) => select("affiliate_businesses", event.target.value)}><option value="">Select</option><option value="no">No</option><option value="yes">Yes</option></select></label>
          <label><span className="lbl">Program welcome email</span><select className={`field${draft.send_welcome_email ? "" : " field-invalid"}`} value={draft.send_welcome_email} onChange={(event) => select("send_welcome_email", event.target.value)}><option value="">Select</option><option value="yes">Yes</option><option value="no">No</option></select></label>
        </div>
        {patch.isPending && <span className="sub" style={{ display: "block", marginTop: 10 }}>Saving source field…</span>}
        {patch.error && <div className="warnline mt">{patch.error instanceof Error ? patch.error.message : "The program source field could not be saved."}</div>}
      </div>
    </div>
  );
}
