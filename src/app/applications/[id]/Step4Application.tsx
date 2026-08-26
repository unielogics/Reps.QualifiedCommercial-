"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileCheck2 } from "lucide-react";
import { api } from "@/lib/api";
import StepActions from "@/components/StepActions";
import {
  type ApplicationProfileData,
  type SubmissionReadiness,
} from "@/lib/applicationReadiness";

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
  const [financialDraft, setFinancialDraft] = useState({
    annual_sales: "",
    annual_cash_flow_available_for_debt: "",
    monthly_debt_payments: "",
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

  const commitFinancial = async (field: keyof typeof financialDraft) => {
    const raw = financialDraft[field].trim();
    try {
      await patchProfile.mutateAsync({ [field]: raw ? Number(raw) : null });
    } catch {
      // The mutation error remains visible below; keep the draft so the rep can retry.
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

      <StepActions
        ready={stepReady}
        message={stepReady
          ? "The evidence package is complete. Continue to Step 5 for desk review, agreements, and execution."
          : `${openItems.length || 1} package condition${openItems.length === 1 ? "" : "s"} remain.`}
        buttonLabel="Continue to Step 5"
        onContinue={() => router.push(`/applications/${dealerId}?step=5`)}
        pending={readiness.isLoading || patchProfile.isPending}
      />
    </>
  );
}
