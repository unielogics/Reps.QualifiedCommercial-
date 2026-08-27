"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileCheck2 } from "lucide-react";
import { api } from "@/lib/api";
import ApplicationSigningPanel, { type MasterApplicationStatus } from "@/components/ApplicationSigningPanel";
import StepActions from "@/components/StepActions";
import {
  type ApplicationProfileData,
  type SubmissionReadiness,
} from "@/lib/applicationReadiness";
import { useMe } from "@/lib/useMe";

const STATUS: Record<string, { label: string; cls: string }> = {
  complete: { label: "Complete", cls: "c-ok" },
  missing: { label: "Missing", cls: "c-warn" },
  supplemental: { label: "Supplemental only", cls: "c-warn" },
  not_applicable: { label: "Not applicable", cls: "c-mut" },
};

export default function Step4Application({ dealerId }: { dealerId: string }) {
  const { getToken } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const { isSuperAdmin } = useMe();
  const [applicationStatus, setApplicationStatus] = useState<MasterApplicationStatus>("not_generated");
  const [financialDraft, setFinancialDraft] = useState({
    annual_sales: "",
    annual_cash_flow_available_for_debt: "",
    monthly_debt_payments: "",
  });
  const [formDraft, setFormDraft] = useState({
    guaranty_type: "",
    office_space: "",
    business_stage: "existing",
    existing_mca_balance: "",
    existing_sba_balance: "",
    active_ucc_filings: "",
    affiliate_businesses: "",
    send_welcome_email: "yes",
    signer_title: "",
  });

  const profile = useQuery({
    queryKey: ["application-profile", dealerId],
    queryFn: async () => api<ApplicationProfileData | null>(
      `/dealer-os/dealers/${dealerId}/application-profile`,
      { authToken: (await getToken()) ?? undefined },
    ),
  });

  const readiness = useQuery({
    queryKey: ["submission-readiness", dealerId],
    queryFn: async () => api<SubmissionReadiness>(
      `/dealer-os/dealers/${dealerId}/submission-readiness`,
      { authToken: (await getToken()) ?? undefined },
    ),
  });

  const patchProfile = useMutation({
    mutationFn: async (body: Record<string, unknown>) => api<ApplicationProfileData>(
      `/dealer-os/dealers/${dealerId}/application-profile`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
        authToken: (await getToken()) ?? undefined,
      },
    ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["application-profile", dealerId] });
      void qc.invalidateQueries({ queryKey: ["submission-readiness", dealerId] });
      void qc.invalidateQueries({ queryKey: ["decision", dealerId] });
    },
  });

  useEffect(() => {
    if (!profile.data) return;
    setFinancialDraft({
      annual_sales: profile.data.annual_sales?.toString() ?? "",
      annual_cash_flow_available_for_debt:
        profile.data.annual_cash_flow_available_for_debt?.toString() ?? "",
      monthly_debt_payments: profile.data.monthly_debt_payments?.toString() ?? "",
    });
  }, [
    profile.data?.annual_sales,
    profile.data?.annual_cash_flow_available_for_debt,
    profile.data?.monthly_debt_payments,
  ]);

  useEffect(() => {
    if (!profile.data) return;
    setFormDraft({
      guaranty_type: profile.data.guaranty_type ?? "",
      office_space: profile.data.office_space ?? "",
      business_stage: profile.data.business_stage ?? "existing",
      existing_mca_balance: profile.data.existing_mca_balance?.toString() ?? "",
      existing_sba_balance: profile.data.existing_sba_balance?.toString() ?? "",
      active_ucc_filings: profile.data.active_ucc_filings?.toString() ?? "",
      affiliate_businesses: profile.data.affiliate_businesses === true ? "yes" : profile.data.affiliate_businesses === false ? "no" : "",
      send_welcome_email: profile.data.send_welcome_email === false ? "no" : "yes",
      signer_title: profile.data.signer_title ?? "",
    });
  }, [profile.data]);

  const commitFinancial = async (field: keyof typeof financialDraft) => {
    const raw = financialDraft[field].trim();
    try {
      await patchProfile.mutateAsync({ [field]: raw ? Number(raw) : null });
    } catch {
      // The mutation error remains visible below; keep the draft so the rep can retry.
    }
  };

  const commitForm = async (field: keyof typeof formDraft) => {
    const raw = formDraft[field].trim();
    let value: string | number | boolean | null = raw || null;
    if (["existing_mca_balance", "existing_sba_balance", "active_ucc_filings"].includes(field)) {
      value = raw ? Number(raw) : null;
    } else if (field === "affiliate_businesses" || field === "send_welcome_email") {
      value = raw ? raw === "yes" : null;
    }
    try {
      await patchProfile.mutateAsync({ [field]: value });
    } catch {
      // Keep the entered value visible so the rep can correct and retry it.
    }
  };

  const data = readiness.data;
  const packageItems = data?.items.filter(
    (item) => item.requirement !== "Human-reviewed fundable path",
  ) ?? [];
  const openItems = packageItems.filter(
    (item) => item.status === "missing" || item.status === "supplemental",
  );
  const stepReady = Boolean(data?.package_ready);

  return (
    <>
      <div className="panel">
        <div className="panel-h">
          Step 4 · Underwriting package
          <span className="sp" />
          <span className={`cellchip ${data?.package_ready ? "c-ok" : "c-warn"}`}>
            {data?.package_ready ? "Package complete" : "Conditions remain"}
          </span>
        </div>
        <div className="panel-b">
          <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
            <FileCheck2 size={22} aria-hidden />
            <div>
              <b>{data?.route_label || "Funding route is still being evaluated"}</b>
              <p className="sub" style={{ margin: "5px 0 0", lineHeight: 1.55 }}>
                This package is built from the same versioned rules used in Product Finder and
                Step 1.5. A failed rule blocks only that route. It never erases the original
                self-reported answers or another viable path.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          Route-specific evidence
          <span className="sp" />
          <span className="sub">{data?.rules_version || "Loading rules…"}</span>
        </div>
        <div className="panel-b" style={{ padding: 0 }}>
          <div className="tblwrap">
            <table className="tbl" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th>Requirement</th>
                  <th>Status</th>
                  <th>Evidence</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {packageItems.map((item) => {
                  const state = STATUS[item.status] ?? STATUS.missing;
                  return (
                    <tr key={`${item.route}:${item.requirement}`}>
                      <td><b>{item.requirement}</b><span className="sub" style={{ display: "block" }}>{item.route === "all" ? "All routes" : item.route}</span></td>
                      <td><span className={`cellchip ${state.cls}`}>{state.label}</span></td>
                      <td>{item.evidence}</td>
                      <td className="sub">{item.source || "Application record"}</td>
                    </tr>
                  );
                })}
                {!readiness.isLoading && !(data?.items.length) && (
                  <tr><td colSpan={4} className="sub">No readiness evidence is available yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">Cash flow and debt service</div>
        <div className="panel-b">
          <p className="sub" style={{ marginTop: 0, lineHeight: 1.55 }}>
            <b>Monthly debt payments</b> means the total scheduled payments the business must
            make each month on loans, lines of credit, equipment notes, SBA debt, MCAs, and
            property debt paid by the business. Do not enter the balance owed. Enter the monthly
            payment burden so the system can compare available cash flow against debt service.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
            <label>
              <span className="lbl">Annual sales</span>
              <input className={`field required-field${Number(financialDraft.annual_sales) > 0 ? "" : " field-invalid"}`} style={{ width: "100%" }} type="number" min="0" inputMode="decimal" value={financialDraft.annual_sales} onChange={(event) => setFinancialDraft((current) => ({ ...current, annual_sales: event.target.value }))} onBlur={() => void commitFinancial("annual_sales")} />
            </label>
            <label>
              <span className="lbl">Annual cash flow available for debt</span>
              <input className="field" style={{ width: "100%" }} type="number" min="0" inputMode="decimal" value={financialDraft.annual_cash_flow_available_for_debt} onChange={(event) => setFinancialDraft((current) => ({ ...current, annual_cash_flow_available_for_debt: event.target.value }))} onBlur={() => void commitFinancial("annual_cash_flow_available_for_debt")} />
            </label>
            <label>
              <span className="lbl">Monthly debt payments</span>
              <input className="field" style={{ width: "100%" }} type="number" min="0" inputMode="decimal" value={financialDraft.monthly_debt_payments} onChange={(event) => setFinancialDraft((current) => ({ ...current, monthly_debt_payments: event.target.value }))} onBlur={() => void commitFinancial("monthly_debt_payments")} />
            </label>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">Program application source fields</div>
        <div className="panel-b">
          <p className="sub" style={{ marginTop: 0, lineHeight: 1.55 }}>
            These values populate the configured program PDF. Use <b>N/A</b> only when the
            source form allows it. The client sees this exact information before signing.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
            <label><span className="lbl">Guaranty type</span><select className={`field${formDraft.guaranty_type ? "" : " field-invalid"}`} value={formDraft.guaranty_type} onChange={(event) => { setFormDraft((current) => ({ ...current, guaranty_type: event.target.value })); void patchProfile.mutateAsync({ guaranty_type: event.target.value || null }).catch(() => undefined); }}><option value="">Select</option><option value="personal">Personal</option><option value="business">Business only</option><option value="limited">Limited</option></select></label>
            <label><span className="lbl">Office / operating space</span><input className="field" value={formDraft.office_space} placeholder="Owned, leased, home office, or N/A" onChange={(event) => setFormDraft((current) => ({ ...current, office_space: event.target.value }))} onBlur={() => void commitForm("office_space")} /></label>
            <label><span className="lbl">Business stage</span><select className="field" value={formDraft.business_stage} onChange={(event) => { setFormDraft((current) => ({ ...current, business_stage: event.target.value })); void patchProfile.mutateAsync({ business_stage: event.target.value }).catch(() => undefined); }}><option value="startup">Startup</option><option value="existing">Existing business</option><option value="acquisition">Acquisition</option></select></label>
            <label><span className="lbl">Authorized signer title</span><input className={`field${formDraft.signer_title.trim() ? "" : " field-invalid"}`} value={formDraft.signer_title} placeholder="Owner, President, Managing Member" onChange={(event) => setFormDraft((current) => ({ ...current, signer_title: event.target.value }))} onBlur={() => void commitForm("signer_title")} /></label>
            <label><span className="lbl">Outstanding MCA balance</span><input className={`field${formDraft.existing_mca_balance.trim() ? "" : " field-invalid"}`} type="number" min="0" inputMode="decimal" placeholder="Enter 0 when none" value={formDraft.existing_mca_balance} onChange={(event) => setFormDraft((current) => ({ ...current, existing_mca_balance: event.target.value }))} onBlur={() => void commitForm("existing_mca_balance")} /></label>
            <label><span className="lbl">Outstanding SBA balance</span><input className={`field${formDraft.existing_sba_balance.trim() ? "" : " field-invalid"}`} type="number" min="0" inputMode="decimal" placeholder="Enter 0 when none" value={formDraft.existing_sba_balance} onChange={(event) => setFormDraft((current) => ({ ...current, existing_sba_balance: event.target.value }))} onBlur={() => void commitForm("existing_sba_balance")} /></label>
            <label><span className="lbl">Active UCC filings</span><input className="field" type="number" min="0" step="1" inputMode="numeric" value={formDraft.active_ucc_filings} onChange={(event) => setFormDraft((current) => ({ ...current, active_ucc_filings: event.target.value }))} onBlur={() => void commitForm("active_ucc_filings")} /></label>
            <label><span className="lbl">Affiliate businesses</span><select className="field" value={formDraft.affiliate_businesses} onChange={(event) => { setFormDraft((current) => ({ ...current, affiliate_businesses: event.target.value })); void patchProfile.mutateAsync({ affiliate_businesses: event.target.value ? event.target.value === "yes" : null }).catch(() => undefined); }}><option value="">Select</option><option value="no">No</option><option value="yes">Yes</option></select></label>
            <label><span className="lbl">Program welcome email</span><select className="field" value={formDraft.send_welcome_email} onChange={(event) => { setFormDraft((current) => ({ ...current, send_welcome_email: event.target.value })); void patchProfile.mutateAsync({ send_welcome_email: event.target.value === "yes" }).catch(() => undefined); }}><option value="yes">Yes</option><option value="no">No</option></select></label>
          </div>
          {patchProfile.error && <div className="warnline mt">{patchProfile.error instanceof Error ? patchProfile.error.message : "Source fields could not be saved."}</div>}
        </div>
      </div>

      {openItems.length > 0 && (
        <div className="panel panel-invalid">
          <div className="panel-h"><AlertTriangle size={17} /> Conditions before release</div>
          <div className="panel-b">
            <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
              {openItems.map((item) => <li key={`open:${item.requirement}`}><b>{item.requirement}:</b> {item.evidence}</li>)}
            </ul>
          </div>
        </div>
      )}

      <ApplicationSigningPanel
        dealerId={dealerId}
        packageReady={stepReady}
        blockers={openItems.map((item) => item.requirement)}
        routeKey={data?.route_key}
        isSuperAdmin={isSuperAdmin}
        onStatusChange={setApplicationStatus}
      />

      {isSuperAdmin ? (
        <StepActions
          ready={stepReady && applicationStatus === "executed"}
          message={!stepReady
            ? `${openItems.length || 1} package condition${openItems.length === 1 ? "" : "s"} remain.`
            : applicationStatus !== "executed"
              ? "The package is complete. The primary signer must execute the configured program application before final desk review."
              : "The agent workflow and signed application are complete. Continue to the super-admin desk review."
          }
          buttonLabel="Continue to Step 5"
          onContinue={() => router.push(`/applications/${dealerId}?step=5`)}
          pending={readiness.isLoading || patchProfile.isPending}
        />
      ) : (
        <div className={applicationStatus === "executed" ? "note" : "warnline"}>
          <div className="row" style={{ gap: 8 }}>
            {applicationStatus === "executed" && <CheckCircle2 size={18} />}
            <b>{applicationStatus === "executed" ? "Agent workflow complete" : "Signature is the final agent checkpoint"}</b>
          </div>
          <p className="sub" style={{ marginBottom: 0 }}>
            {applicationStatus === "executed"
              ? "The signed program application has been delivered to the client and the file is ready for super-admin review in Step 5."
              : "Generate and send the application above. Step 5 is reserved for the super-admin decision, status, funding amount, and file destination."}
          </p>
        </div>
      )}
    </>
  );
}
