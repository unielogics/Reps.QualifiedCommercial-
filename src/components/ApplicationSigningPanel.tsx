"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, FileSignature, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import AgreementReviewWorkspace from "./AgreementReviewWorkspace";

export type MasterApplicationStatus = "not_generated" | "draft" | "ready" | "out_for_signature" | "executed" | "void";

export type EnvelopeDocument = {
  id: string; contract_document_id: string; template_key: string; title: string;
  sort_order: number; required: boolean; status: string; missing_data: string[];
  filled_sha256: string | null; executed_sha256: string | null;
  reviewed_at: string | null; acknowledged_at: string | null;
  preview_url: string | null; download_url: string | null;
};
export type ContractEnvelope = {
  id: string; dealer_id: string; package_key: string; package_version: number;
  program_key: string; title: string; status: MasterApplicationStatus;
  signer_name: string | null; signer_title: string | null; sent_at: string | null;
  completed_at: string | null; bundle_sha256: string | null; bundle_download_url: string | null;
  delivery_history: Array<{ at?: string; ok?: boolean; detail?: string }>;
  funding_profile: {
    original_requested_amount?: number | null;
    working_funding_goal?: number | null;
    program_key?: string;
    system_status?: string | null;
    annual_sales?: number | null;
    annual_cash_flow_available_for_debt?: number | null;
    monthly_debt_payments?: number | null;
    dscr?: number | null;
    verified_bank_months?: string[];
    bank_evidence_target?: number;
    credit?: Array<{ owner?: string; status?: string; quality?: string }>;
    debt_count?: number;
    unresolved_conditions?: string[];
  };
  documents: EnvelopeDocument[];
};
type SendResult = { url: string; passcode: string | null; delivered: boolean; emailed: boolean; detail: string | null };
type DecisionProgram = { program_key?: string; key?: string; name?: string; status?: string };
type Decision = { programs?: DecisionProgram[] };
const PROGRAMS = [
  { key: "term_loan_3_5_year", label: "EZ Term" },
  { key: "term_loan_10_year", label: "MicroCap" },
] as const;

function statusLabel(status: MasterApplicationStatus): string {
  if (status === "executed") return "Executed";
  if (status === "out_for_signature") return "Awaiting client signature";
  if (status === "ready") return "Ready to send";
  if (status === "draft") return "Source fields missing";
  if (status === "void") return "Voided";
  return "Not generated";
}

function money(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? "Unavailable"
    : Number(value).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function ApplicationSigningPanel({ dealerId, packageReady, blockers = [], routeKey, onStatusChange }: {
  dealerId: string; packageReady: boolean; blockers?: string[]; routeKey?: string | null;
  onStatusChange?: (status: MasterApplicationStatus) => void;
}) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [programKey, setProgramKey] = useState(routeKey || PROGRAMS[0].key);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const authenticated = async <T,>(path: string, init?: RequestInit) => api<T>(path, { ...init, authToken: (await getToken()) ?? undefined });
  const envelopes = useQuery({
    queryKey: ["contract-envelopes", dealerId],
    queryFn: () => authenticated<ContractEnvelope[]>(`/dealer-os/dealers/${dealerId}/contract-envelopes`),
    refetchInterval: 15_000,
  });
  const decision = useQuery({ queryKey: ["decision", dealerId], queryFn: () => authenticated<Decision>(`/dealer-os/dealers/${dealerId}/decision`) });
  const envelope = envelopes.data?.find((item) => item.status !== "void") ?? envelopes.data?.[0];
  const status = envelope?.status ?? "not_generated";
  const decisionByKey = useMemo(() => new Map((decision.data?.programs ?? []).map((item) => [item.program_key || item.key || "", item])), [decision.data?.programs]);
  const selectedViable = routeKey === programKey || ["recommended", "potential"].includes(decisionByKey.get(programKey)?.status ?? "blocked");
  useEffect(() => {
    if (envelope && envelope.status !== "void") setProgramKey(envelope.program_key);
    else if (routeKey) setProgramKey(routeKey);
  }, [envelope?.id, envelope?.program_key, envelope?.status, routeKey]);
  useEffect(() => onStatusChange?.(status), [onStatusChange, status]);

  const generate = useMutation({
    mutationFn: () => authenticated<ContractEnvelope>(`/dealer-os/dealers/${dealerId}/contract-envelopes/generate`, {
      method: "POST",
      body: JSON.stringify({ program_key: programKey, override_reason: null }),
    }),
    onSuccess: () => {
      setSendResult(null); setReviewOpen(true);
      void qc.invalidateQueries({ queryKey: ["contract-envelopes", dealerId] });
      void qc.invalidateQueries({ queryKey: ["application-profile", dealerId] });
    },
  });
  const send = useMutation({
    mutationFn: () => {
      if (!envelope) throw new Error("Generate the package first.");
      return authenticated<SendResult>(`/dealer-os/dealers/${dealerId}/contract-envelopes/${envelope.id}/send`, { method: "POST", body: JSON.stringify({ channel: "email" }) });
    },
    onSuccess: (result) => { setSendResult(result); void qc.invalidateQueries({ queryKey: ["contract-envelopes", dealerId] }); },
  });
  const copy = async (key: string, value: string | null | undefined) => {
    if (!value) return; await navigator.clipboard.writeText(value); setCopied(key);
    window.setTimeout(() => setCopied((current) => current === key ? null : current), 1800);
  };
  const missing = envelope?.documents.flatMap((document) => document.missing_data) ?? [];
  const error = generate.error ?? send.error;

  return <div className={`panel${status === "draft" ? " panel-invalid" : ""}`}>
    <div className="panel-h"><FileSignature size={17} /> Program application package<span className="sp" /><span className={`cellchip ${status === "executed" ? "c-ok" : status === "out_for_signature" || status === "draft" ? "c-warn" : "c-acc"}`}>{statusLabel(status)}</span></div>
    <div className="panel-b">
      <p className="sub" style={{ marginTop: 0, lineHeight: 1.55 }}>Select the viable program, populate its configured PDF package, and review the exact documents with the client. The client signs from their own secure device. One adopted signature applies only to documents they review and acknowledge.</p>
      <div className="contractProgramBar">
        <label className="grow"><span className="lbl">Program</span><select className="field" value={envelope && status !== "void" ? envelope.program_key : programKey} disabled={Boolean(envelope && ["out_for_signature", "executed"].includes(status))} onChange={(event) => setProgramKey(event.target.value)}>
          {PROGRAMS.map((program) => {
            const viable = routeKey === program.key || ["recommended", "potential"].includes(decisionByKey.get(program.key)?.status ?? "blocked");
            return <option key={program.key} value={program.key} disabled={!viable}>{program.label}{viable ? " · viable" : " · blocked"}</option>;
          })}
        </select></label>
        {(!envelope || ["draft", "ready"].includes(status)) && <button type="button" className="btn pri" disabled={!packageReady || generate.isPending || !selectedViable} onClick={() => generate.mutate()}>{envelope ? <RefreshCw size={16} /> : <FileSignature size={16} />}{generate.isPending ? "Building package..." : envelope ? "Refresh from application" : "Generate package"}</button>}
      </div>
      {!selectedViable && !envelope && <div className="warnline mt">This route is blocked by the current screening result. A super admin can document an exception in Step 5, then return the file here for client review and signing.</div>}
      {!packageReady && status !== "executed" && <div className="warnline mt">Complete the route evidence before building the signing package.{blockers.length ? ` Open: ${blockers.slice(0, 3).join("; ")}.` : ""}</div>}
      {envelope?.funding_profile && Object.keys(envelope.funding_profile).length > 0 && (
        <div className="packageFundingProfile mt">
          <div className="row"><b>Funding profile included in this package</b><span className="sp" /><span className={`cellchip ${envelope.funding_profile.system_status === "blocked" ? "c-warn" : "c-ok"}`}>{envelope.funding_profile.system_status || "System route"}</span></div>
          <div className="packageFundingGrid">
            <div><span>Original request</span><b>{money(envelope.funding_profile.original_requested_amount)}</b></div>
            <div><span>Working goal</span><b>{money(envelope.funding_profile.working_funding_goal)}</b></div>
            <div><span>Annual sales</span><b>{money(envelope.funding_profile.annual_sales)}</b></div>
            <div><span>Available cash flow</span><b>{money(envelope.funding_profile.annual_cash_flow_available_for_debt)}</b></div>
            <div><span>Monthly debt service</span><b>{money(envelope.funding_profile.monthly_debt_payments)}</b></div>
            <div><span>Verified bank coverage</span><b>{envelope.funding_profile.verified_bank_months?.length ?? 0} of {envelope.funding_profile.bank_evidence_target ?? 6} accepted months</b></div>
          </div>
          {(envelope.funding_profile.credit ?? []).map((credit, index) => <div className="packageCreditRow" key={`${credit.owner}:${index}`}><span>{credit.owner || "Required owner"}</span><b>{credit.quality || credit.status || "Verification pending"}</b></div>)}
          {(envelope.funding_profile.unresolved_conditions ?? []).length > 0 && <span className="sub">Conditions retained: {envelope.funding_profile.unresolved_conditions?.slice(0, 4).join("; ")}</span>}
        </div>
      )}
      {missing.length > 0 && <div className="warnline mt"><b>{missing.length} source field{missing.length === 1 ? " is" : "s are"} missing.</b> {missing.slice(0, 5).join("; ")}. Open the package to use the Edit source links.</div>}
      {envelope && <div className="row mt" style={{ gap: 8, flexWrap: "wrap" }}><button type="button" className="btn pri" onClick={() => setReviewOpen(true)}><FileSignature size={16} /> {status === "executed" ? "View executed package" : "Review package"}</button>{envelope.bundle_download_url && <a className="btn" href={envelope.bundle_download_url} download>Download executed package</a>}</div>}
      {sendResult && <div className="note mt"><div className="row" style={{ gap: 8, flexWrap: "wrap" }}><b>{sendResult.emailed ? "Signature invitation emailed." : "Secure room created; email delivery needs attention."}</b><span className="sp" /><button type="button" className="btn sm" onClick={() => void copy("room", sendResult.url)}><Copy size={14} /> {copied === "room" ? "Link copied" : "Copy secure link"}</button>{sendResult.passcode && <button type="button" className="btn sm num" onClick={() => void copy("pin", sendResult.passcode)}><Copy size={14} /> {copied === "pin" ? "PIN copied" : `PIN ${sendResult.passcode}`}</button>}</div></div>}
      {status === "executed" && <div className="note mt"><div className="row" style={{ gap: 8 }}><CheckCircle2 size={18} /><b>Package executed</b></div><div className="sub mt">Every configured document has its own visible signature, certificate, and hash.</div></div>}
      {error && <div className="warnline mt">{error instanceof Error ? error.message : "The package action did not complete."}</div>}
    </div>
    {reviewOpen && envelope && <AgreementReviewWorkspace envelope={envelope} sendResult={sendResult} sendPending={send.isPending} copied={copied} onSend={() => send.mutate()} onCopy={(key, value) => void copy(key, value)} onClose={() => setReviewOpen(false)} />}
  </div>;
}
