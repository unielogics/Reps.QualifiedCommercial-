"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CheckCircle2, Download, FileCheck2, WandSparkles } from "lucide-react";
import { api } from "@/lib/api";
import ApplicationSigningPanel, { type MasterApplicationStatus } from "@/components/ApplicationSigningPanel";
import BookingDrawer from "@/components/BookingDrawer";
import { type ApplicationProfileData, type SubmissionReadiness } from "@/lib/applicationReadiness";
import Step4BusinessQuestions, { type BusinessQuestionGroup } from "./Step4BusinessQuestions";
import Step4DebtSchedule from "./Step4DebtSchedule";
import Step4Resolution, { type UnderwritingResolution } from "./Step4Resolution";

type PreScreen = {
  file_answers: Record<string, unknown>;
  applicable_business_questions: BusinessQuestionGroup[];
  business_questions_complete: boolean;
  business_question_blockers: string[];
};

type SummaryResult = {
  status: string;
  missing_data: string[];
  overlay_problems: string[];
  sha256: string;
  download_url: string | null;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  complete: { label: "Complete", cls: "c-ok" },
  missing: { label: "Missing", cls: "c-warn" },
  supplemental: { label: "Supplemental only", cls: "c-warn" },
  not_applicable: { label: "Not applicable", cls: "c-mut" },
};

const FINANCIAL_FIELDS = [
  { key: "annual_sales", label: "Annual sales" },
  { key: "annual_cash_flow_available_for_debt", label: "Annual cash flow available for debt" },
  { key: "monthly_debt_payments", label: "Monthly debt payments" },
] as const;
type FinancialField = (typeof FINANCIAL_FIELDS)[number]["key"];

function sourceLabel(profile: ApplicationProfileData | null | undefined, field: FinancialField): string {
  if (profile?.field_confirmations?.[field]) return "Agent confirmed";
  const provenance = profile?.field_provenance?.[field];
  return provenance?.label || provenance?.source || (profile?.[field] !== null && profile?.[field] !== undefined ? "Agent entered" : "Unavailable");
}

export default function Step4Application({ dealerId }: { dealerId: string }) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [applicationStatus, setApplicationStatus] = useState<MasterApplicationStatus>("not_generated");
  const [bookingOpen, setBookingOpen] = useState(false);
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [financialDraft, setFinancialDraft] = useState<Record<FinancialField, string>>({ annual_sales: "", annual_cash_flow_available_for_debt: "", monthly_debt_payments: "" });
  const [formDraft, setFormDraft] = useState({ guaranty_type: "", office_space: "", business_stage: "existing", existing_mca_balance: "", existing_sba_balance: "", active_ucc_filings: "", affiliate_businesses: "", send_welcome_email: "yes", signer_title: "" });

  const profile = useQuery({
    queryKey: ["application-profile", dealerId],
    queryFn: async () => api<ApplicationProfileData | null>(`/dealer-os/dealers/${dealerId}/application-profile`, { authToken: (await getToken()) ?? undefined }),
  });
  const readiness = useQuery({
    queryKey: ["submission-readiness", dealerId],
    queryFn: async () => api<SubmissionReadiness>(`/dealer-os/dealers/${dealerId}/submission-readiness`, { authToken: (await getToken()) ?? undefined }),
  });
  const preScreen = useQuery({
    queryKey: ["application-pre-screen", dealerId],
    queryFn: async () => api<PreScreen>(`/dealer-os/dealers/${dealerId}/pre-screen`, { authToken: (await getToken()) ?? undefined }),
  });
  const resolution = useQuery({
    queryKey: ["underwriting-resolution", dealerId],
    queryFn: async () => api<UnderwritingResolution>(`/dealer-os/dealers/${dealerId}/underwriting-resolution`, { authToken: (await getToken()) ?? undefined }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["application-profile", dealerId] });
    void qc.invalidateQueries({ queryKey: ["submission-readiness", dealerId] });
    void qc.invalidateQueries({ queryKey: ["underwriting-resolution", dealerId] });
    void qc.invalidateQueries({ queryKey: ["decision", dealerId] });
  };
  const patchProfile = useMutation({
    mutationFn: async (body: Record<string, unknown>) => api<ApplicationProfileData>(`/dealer-os/dealers/${dealerId}/application-profile`, { method: "PATCH", body: JSON.stringify(body), authToken: (await getToken()) ?? undefined }),
    onSuccess: invalidate,
  });
  const generateSummary = useMutation({
    mutationFn: async () => api<SummaryResult>(`/dealer-os/dealers/${dealerId}/underwriting-summary`, { method: "POST", authToken: (await getToken()) ?? undefined }),
    onSuccess: setSummary,
  });

  useEffect(() => {
    if (!profile.data) return;
    setFinancialDraft({ annual_sales: profile.data.annual_sales?.toString() ?? "", annual_cash_flow_available_for_debt: profile.data.annual_cash_flow_available_for_debt?.toString() ?? "", monthly_debt_payments: profile.data.monthly_debt_payments?.toString() ?? "" });
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

  const commitFinancial = (field: FinancialField, override?: number) => {
    const raw = financialDraft[field].trim();
    const value = override ?? (raw ? Number(raw) : null);
    if (typeof value === "number" && !Number.isFinite(value)) return;
    patchProfile.mutate({ [field]: value, confirm_fields: [field] });
  };
  const applySuggestion = (field: FinancialField) => {
    const suggestion = resolution.data?.financial_suggestions[field]?.value;
    if (suggestion === undefined || !Number.isFinite(Number(suggestion))) return;
    setFinancialDraft((current) => ({ ...current, [field]: String(suggestion) }));
    commitFinancial(field, Number(suggestion));
  };
  const commitForm = (field: keyof typeof formDraft) => {
    const raw = formDraft[field].trim();
    let value: string | number | boolean | null = raw || null;
    if (["existing_mca_balance", "existing_sba_balance", "active_ucc_filings"].includes(field)) value = raw ? Number(raw) : null;
    if (field === "affiliate_businesses" || field === "send_welcome_email") value = raw ? raw === "yes" : null;
    patchProfile.mutate({ [field]: value, confirm_fields: [field] });
  };

  if (profile.isLoading || readiness.isLoading || preScreen.isLoading || resolution.isLoading) return <div className="panel"><div className="panel-b sub">Loading the underwriting workspace…</div></div>;
  const route = resolution.data;
  const data = readiness.data;
  if (!route || !data) return <div className="warnline">The underwriting workspace could not be loaded. Refresh the file and try again.</div>;
  const packageItems = data.items.filter((item) => item.requirement !== "Human-reviewed fundable path");
  const openItems = packageItems.filter((item) => item.status === "missing" || item.status === "supplemental");

  return (
    <>
      <div className="panel">
        <div className="panel-h">Step 4 · Business underwriting and completion<span className="sp" /><span className={`cellchip ${route.direct_program_viable ? "c-ok" : "c-warn"}`}>{route.direct_program_viable ? "Program package path" : "Review and booking path"}</span></div>
        <div className="panel-b"><div className="row" style={{ alignItems: "flex-start", gap: 14 }}><FileCheck2 size={22} /><div><b>{data.route_label || "Funding route is being resolved"}</b><p className="sub" style={{ margin: "5px 0 0", lineHeight: 1.55 }}>Step 4 remains open while files upload and extract. Complete the business questions, confirm financial facts, resolve the working structure, and finish with either client signing or a required underwriting review booking.</p></div></div></div>
      </div>

      <Step4Resolution dealerId={dealerId} data={route} />

      <div className="panel">
        <div className="panel-h">Business underwriting questions<span className="sp" /><span className={`cellchip ${preScreen.data?.business_questions_complete ? "c-ok" : "c-warn"}`}>{preScreen.data?.business_questions_complete ? "Complete" : `${preScreen.data?.business_question_blockers.length ?? 0} unanswered`}</span></div>
        <div className="panel-b"><p className="sub" style={{ marginTop: 0 }}>These are business-level questions only. Personal eligibility remains in Step 1.5. Questions that cannot affect the canonical NAICS and current candidate paths are hidden.</p><Step4BusinessQuestions dealerId={dealerId} groups={preScreen.data?.applicable_business_questions ?? route.applicable_business_questions} initialAnswers={preScreen.data?.file_answers ?? {}} /></div>
      </div>

      <div className="panel">
        <div className="panel-h">Cash flow and financial confirmation</div>
        <div className="panel-b">
          <p className="sub" style={{ marginTop: 0, lineHeight: 1.55 }}><b>Monthly debt payments</b> is the total scheduled amount the business pays each month across loans, lines, equipment notes, SBA debt, MCAs, and business-paid property debt. Enter the payment burden, not the balance owed.</p>
          <div className="financialConfirmGrid">
            {FINANCIAL_FIELDS.map(({ key, label }) => {
              const suggestion = route.financial_suggestions[key];
              const status = sourceLabel(profile.data, key);
              return <label key={key} className="financialConfirmField"><span className="lbl">{label}</span><input className={`field${key === "annual_sales" && Number(financialDraft[key]) <= 0 ? " field-invalid" : ""}`} type="number" min="0" inputMode="decimal" value={financialDraft[key]} onChange={(event) => setFinancialDraft((current) => ({ ...current, [key]: event.target.value }))} onBlur={() => commitFinancial(key)} /><div className="financialProvenance"><span className={`cellchip ${status === "Agent confirmed" ? "c-ok" : status === "Unavailable" ? "c-mut" : "c-warn"}`}>{status}</span>{suggestion && <button type="button" className="btn sm" onClick={() => applySuggestion(key)}><WandSparkles size={14} /> Use {Number(suggestion.value).toLocaleString()}</button>}</div>{suggestion?.evidence && <small className="sub">{suggestion.evidence}</small>}</label>;
            })}
          </div>
          {patchProfile.error && <div className="warnline mt">{patchProfile.error instanceof Error ? patchProfile.error.message : "The financial field could not be saved."}</div>}
        </div>
      </div>

      <Step4DebtSchedule dealerId={dealerId} />

      <div className="panel">
        <div className="panel-h">Program application source fields</div>
        <div className="panel-b">
          <p className="sub" style={{ marginTop: 0 }}>These values populate the configured program PDF. The client reviews this exact information before signing.</p>
          <div className="step4SourceGrid">
            <label><span className="lbl">Guaranty type</span><select className={`field${formDraft.guaranty_type ? "" : " field-invalid"}`} value={formDraft.guaranty_type} onChange={(event) => { setFormDraft((current) => ({ ...current, guaranty_type: event.target.value })); patchProfile.mutate({ guaranty_type: event.target.value || null, confirm_fields: ["guaranty_type"] }); }}><option value="">Select</option><option value="personal">Personal</option><option value="business">Business only</option><option value="limited">Limited</option><option value="none">None</option></select></label>
            <label><span className="lbl">Office / operating space</span><input className="field" value={formDraft.office_space} placeholder="Owned, leased, home office, or N/A" onChange={(event) => setFormDraft((current) => ({ ...current, office_space: event.target.value }))} onBlur={() => commitForm("office_space")} /></label>
            <label><span className="lbl">Business stage</span><select className="field" value={formDraft.business_stage} onChange={(event) => { setFormDraft((current) => ({ ...current, business_stage: event.target.value })); patchProfile.mutate({ business_stage: event.target.value, confirm_fields: ["business_stage"] }); }}><option value="startup">Startup</option><option value="existing">Existing business</option><option value="acquisition">Acquisition</option></select></label>
            <label><span className="lbl">Authorized signer title</span><input className={`field${formDraft.signer_title.trim() ? "" : " field-invalid"}`} value={formDraft.signer_title} onChange={(event) => setFormDraft((current) => ({ ...current, signer_title: event.target.value }))} onBlur={() => commitForm("signer_title")} /></label>
            <label><span className="lbl">Outstanding MCA balance</span><input className={`field${formDraft.existing_mca_balance.trim() ? "" : " field-invalid"}`} type="number" min="0" inputMode="decimal" placeholder="Enter 0 when none" value={formDraft.existing_mca_balance} onChange={(event) => setFormDraft((current) => ({ ...current, existing_mca_balance: event.target.value }))} onBlur={() => commitForm("existing_mca_balance")} /></label>
            <label><span className="lbl">Outstanding SBA balance</span><input className={`field${formDraft.existing_sba_balance.trim() ? "" : " field-invalid"}`} type="number" min="0" inputMode="decimal" placeholder="Enter 0 when none" value={formDraft.existing_sba_balance} onChange={(event) => setFormDraft((current) => ({ ...current, existing_sba_balance: event.target.value }))} onBlur={() => commitForm("existing_sba_balance")} /></label>
            <label><span className="lbl">Active UCC filings</span><input className="field" type="number" min="0" step="1" inputMode="numeric" value={formDraft.active_ucc_filings} onChange={(event) => setFormDraft((current) => ({ ...current, active_ucc_filings: event.target.value }))} onBlur={() => commitForm("active_ucc_filings")} /></label>
            <label><span className="lbl">Affiliate businesses</span><select className="field" value={formDraft.affiliate_businesses} onChange={(event) => { setFormDraft((current) => ({ ...current, affiliate_businesses: event.target.value })); patchProfile.mutate({ affiliate_businesses: event.target.value ? event.target.value === "yes" : null, confirm_fields: ["affiliate_businesses"] }); }}><option value="">Select</option><option value="no">No</option><option value="yes">Yes</option></select></label>
            <label><span className="lbl">Program welcome email</span><select className="field" value={formDraft.send_welcome_email} onChange={(event) => { setFormDraft((current) => ({ ...current, send_welcome_email: event.target.value })); patchProfile.mutate({ send_welcome_email: event.target.value === "yes", confirm_fields: ["send_welcome_email"] }); }}><option value="yes">Yes</option><option value="no">No</option></select></label>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">Route-specific evidence<span className="sp" /><span className="sub">{data.rules_version}</span></div>
        <div className="panel-b" style={{ padding: 0 }}><div className="tblwrap"><table className="tbl" style={{ minWidth: 720 }}><thead><tr><th>Requirement</th><th>Status</th><th>Evidence</th><th>Source</th></tr></thead><tbody>{packageItems.map((item) => { const state = STATUS[item.status] ?? STATUS.missing; return <tr key={`${item.route}:${item.requirement}`}><td><b>{item.requirement}</b><span className="sub" style={{ display: "block" }}>{item.route === "all" ? "All routes" : item.route}</span></td><td><span className={`cellchip ${state.cls}`}>{state.label}</span></td><td>{item.evidence}</td><td className="sub">{item.source || "Application record"}</td></tr>; })}</tbody></table></div></div>
      </div>

      {openItems.length > 0 && <div className="panel panel-invalid"><div className="panel-h"><AlertTriangle size={17} /> Conditions before direct package release</div><div className="panel-b"><ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }}>{openItems.map((item) => <li key={`open:${item.requirement}`}><b>{item.requirement}:</b> {item.evidence}</li>)}</ul></div></div>}

      {route.signing_mode === "program_package" ? <ApplicationSigningPanel dealerId={dealerId} packageReady={data.package_ready} blockers={openItems.map((item) => item.requirement)} routeKey={data.route_key} onStatusChange={setApplicationStatus} /> : (
        <div className="panel blockedCompletionPanel"><div className="panel-h">Collected application summary and required review</div><div className="panel-b"><p className="sub" style={{ marginTop: 0 }}>No direct program is currently viable. Preserve the collected file by generating an unsigned QC application and evidence summary, then book an underwriting review. Signing will unlock later if corrected facts or new evidence establish a viable path.</p><div className="blockedCompletionActions"><button type="button" className="btn" disabled={generateSummary.isPending} onClick={() => generateSummary.mutate()}><FileCheck2 size={16} /> {generateSummary.isPending ? "Generating…" : "Generate QC summary"}</button><button type="button" className="btn pri" onClick={() => setBookingOpen(true)}><CalendarClock size={16} /> Book required review</button>{summary?.download_url && <a className="btn" href={summary.download_url}><Download size={16} /> Download summary</a>}</div>{generateSummary.error && <div className="warnline mt">{generateSummary.error instanceof Error ? generateSummary.error.message : "The summary could not be generated."}</div>}{summary?.missing_data.length ? <div className="warnline mt">Generated with unresolved fields: {summary.missing_data.join(", ")}</div> : summary && <div className="note mt"><CheckCircle2 size={18} /> Summary generated and retained with the file.</div>}</div></div>
      )}

      <div className={applicationStatus === "executed" ? "note" : "warnline"}><div className="row" style={{ gap: 8 }}>{applicationStatus === "executed" && <CheckCircle2 size={18} />}<b>{applicationStatus === "executed" ? "Agent workflow complete" : route.signing_mode === "program_package" ? "Client signature is the final agent checkpoint" : "Booking and summary complete the blocked-file agent path"}</b></div><p className="sub" style={{ marginBottom: 0 }}>{applicationStatus === "executed" ? "The signed application is ready for super-admin disposition in Step 5." : "Step 5 contains all super-admin exception approvals, final decisions, status, migration, bucket, and funding controls."}</p></div>

      {bookingOpen && <BookingDrawer initialDealerId={dealerId} initialKind="underwriting_review" onClose={() => setBookingOpen(false)} />}
    </>
  );
}
