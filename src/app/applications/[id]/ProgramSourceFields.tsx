"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ApplicationProfileData } from "@/lib/applicationReadiness";

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
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const profile = useQuery({
    queryKey: ["application-profile", dealerId],
    queryFn: async () => api<ApplicationProfileData | null>(`/dealer-os/dealers/${dealerId}/application-profile`, {
      authToken: (await getToken()) ?? undefined,
    }),
  });

  useEffect(() => setDraft(draftFromProfile(profile.data)), [profile.data]);

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

  const update = (field: SourceField, value: string) => setDraft((current) => ({ ...current, [field]: value }));
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
  const complete = programSourceFieldsComplete(profile.data);

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
          <label><span className="lbl">Outstanding MCA balance</span><input className={`field${draft.existing_mca_balance.trim() ? "" : " field-invalid"}`} type="number" min="0" inputMode="decimal" placeholder="Enter 0 when none" value={draft.existing_mca_balance} onChange={(event) => update("existing_mca_balance", event.target.value)} onBlur={() => commit("existing_mca_balance")} /></label>
          <label><span className="lbl">Outstanding SBA balance</span><input className={`field${draft.existing_sba_balance.trim() ? "" : " field-invalid"}`} type="number" min="0" inputMode="decimal" placeholder="Enter 0 when none" value={draft.existing_sba_balance} onChange={(event) => update("existing_sba_balance", event.target.value)} onBlur={() => commit("existing_sba_balance")} /></label>
          <label><span className="lbl">Active UCC filings</span><input className={`field${draft.active_ucc_filings.trim() ? "" : " field-invalid"}`} type="number" min="0" step="1" inputMode="numeric" placeholder="Enter 0 when none" value={draft.active_ucc_filings} onChange={(event) => update("active_ucc_filings", event.target.value)} onBlur={() => commit("active_ucc_filings")} /></label>
          <label><span className="lbl">Affiliate businesses</span><select className={`field${draft.affiliate_businesses ? "" : " field-invalid"}`} value={draft.affiliate_businesses} onChange={(event) => select("affiliate_businesses", event.target.value)}><option value="">Select</option><option value="no">No</option><option value="yes">Yes</option></select></label>
          <label><span className="lbl">Program welcome email</span><select className={`field${draft.send_welcome_email ? "" : " field-invalid"}`} value={draft.send_welcome_email} onChange={(event) => select("send_welcome_email", event.target.value)}><option value="">Select</option><option value="yes">Yes</option><option value="no">No</option></select></label>
        </div>
        {patch.isPending && <span className="sub" style={{ display: "block", marginTop: 10 }}>Saving source field…</span>}
        {patch.error && <div className="warnline mt">{patch.error instanceof Error ? patch.error.message : "The program source field could not be saved."}</div>}
      </div>
    </div>
  );
}
