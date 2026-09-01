"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WandSparkles } from "lucide-react";
import { api } from "@/lib/api";
import type { ApplicationProfileData } from "@/lib/applicationReadiness";
import type { UnderwritingResolution } from "./Step4Resolution";

const FINANCIAL_FIELDS = [
  { key: "annual_sales", label: "Annual sales" },
  { key: "annual_cash_flow_available_for_debt", label: "Annual cash flow available for debt" },
  { key: "monthly_debt_payments", label: "Monthly debt payments" },
] as const;
type FinancialField = (typeof FINANCIAL_FIELDS)[number]["key"];

function sourceLabel(
  profile: ApplicationProfileData | null | undefined,
  field: FinancialField,
  suggestion?: { label?: string; source?: string },
): string {
  if (profile?.field_confirmations?.[field]) return "Agent confirmed";
  const provenance = profile?.field_provenance?.[field];
  return provenance?.label
    || provenance?.source
    || (profile?.[field] !== null && profile?.[field] !== undefined ? "Agent entered" : null)
    || suggestion?.label
    || suggestion?.source
    || "Unavailable";
}

export default function FinancialConfirmation({ dealerId }: { dealerId: string }) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const touched = useRef(new Set<FinancialField>());
  const [draft, setDraft] = useState<Record<FinancialField, string>>({
    annual_sales: "",
    annual_cash_flow_available_for_debt: "",
    monthly_debt_payments: "",
  });
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
    setDraft((current) => {
      const next = { ...current };
      for (const { key } of FINANCIAL_FIELDS) {
        if (touched.current.has(key)) continue;
        const saved = profile.data?.[key];
        const suggested = resolution.data?.financial_suggestions[key]?.value;
        next[key] = saved !== null && saved !== undefined
          ? String(saved)
          : suggested !== null && suggested !== undefined && Number.isFinite(Number(suggested))
            ? String(suggested)
            : "";
      }
      return next;
    });
  }, [profile.data, resolution.data?.financial_suggestions]);

  const patch = useMutation({
    mutationFn: async (body: Record<string, unknown>) => api<ApplicationProfileData>(
      `/dealer-os/dealers/${dealerId}/application-profile`,
      { method: "PATCH", body: JSON.stringify(body), authToken: (await getToken()) ?? undefined },
    ),
    onSuccess: (saved) => {
      qc.setQueryData(["application-profile", dealerId], saved);
      void qc.invalidateQueries({ queryKey: ["decision", dealerId] });
      void qc.invalidateQueries({ queryKey: ["underwriting-resolution", dealerId] });
      void qc.invalidateQueries({ queryKey: ["submission-readiness", dealerId] });
    },
  });

  const confirm = (field: FinancialField) => {
    const raw = draft[field].trim();
    const value = raw === "" ? null : Number(raw);
    if (typeof value === "number" && !Number.isFinite(value)) return;
    patch.mutate({ [field]: value, confirm_fields: [field] });
  };

  return (
    <div id="financial-confirmation" className="panel guided-target" tabIndex={-1}>
      <div className="panel-h">Cash flow and financial confirmation</div>
      <div className="panel-b">
        <p className="sub" style={{ marginTop: 0, lineHeight: 1.55 }}>
          Confirm extracted suggestions before routing. Monthly debt payments means the total scheduled business payment burden, not the outstanding balance.
        </p>
        <div className="financialConfirmGrid">
          {FINANCIAL_FIELDS.map(({ key, label }) => {
            const suggestion = resolution.data?.financial_suggestions[key];
            const status = sourceLabel(profile.data, key, suggestion);
            const confirmed = Boolean(profile.data?.field_confirmations?.[key]);
            const invalid = key === "annual_sales" ? Number(draft[key]) <= 0 : draft[key].trim() === "";
            return (
              <label key={key} className="financialConfirmField">
                <span className="lbl">{label}</span>
                <input className={`field${invalid ? " field-invalid" : ""}`} type="number" min="0" inputMode="decimal" value={draft[key]} onChange={(event) => { touched.current.add(key); setDraft((current) => ({ ...current, [key]: event.target.value })); }} />
                <div className="financialProvenance">
                  <span className={`cellchip ${status === "Agent confirmed" ? "c-ok" : status === "Unavailable" ? "c-mut" : "c-warn"}`}>{status}</span>
                  {!confirmed && !invalid && <button type="button" className="btn sm" disabled={patch.isPending} onClick={() => confirm(key)}><WandSparkles size={14} /> {suggestion ? "Confirm estimate" : "Confirm value"}</button>}
                </div>
                {suggestion?.evidence && <small className="sub">{suggestion.evidence}</small>}
              </label>
            );
          })}
        </div>
        {patch.error && <div className="warnline mt">{patch.error instanceof Error ? patch.error.message : "The financial field could not be saved."}</div>}
      </div>
    </div>
  );
}
