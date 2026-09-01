"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, Copy, FileSignature, Lock, RefreshCw, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import AgreementReviewWorkspace from "./AgreementReviewWorkspace";
import Drawer from "./Drawer";

export type MasterApplicationStatus = "not_generated" | "draft" | "ready" | "out_for_signature" | "executed" | "void";

type ProgramKey = "term_loan_3_5_year" | "term_loan_10_year";

export type EnvelopeDocument = {
  id: string; contract_document_id: string; template_key: string; program_key: string | null; title: string;
  sort_order: number; required: boolean; status: string; missing_data: string[];
  filled_sha256: string | null; executed_sha256: string | null;
  reviewed_at: string | null; acknowledged_at: string | null;
  preview_url: string | null; download_url: string | null;
};
export type ContractEnvelope = {
  id: string; dealer_id: string; package_key: string; package_version: number;
  program_key: ProgramKey; program_keys: ProgramKey[]; title: string; status: MasterApplicationStatus;
  signer_name: string | null; signer_title: string | null; sent_at: string | null;
  completed_at: string | null; bundle_sha256: string | null; bundle_download_url: string | null;
  delivery_history: Array<{ at?: string; ok?: boolean; detail?: string }>;
  funding_profile: {
    original_requested_amount?: number | null;
    working_funding_goal?: number | null;
    program_key?: string;
    program_keys?: string[];
    system_status?: string | null;
    annual_sales?: number | null;
    annual_cash_flow_available_for_debt?: number | null;
    monthly_debt_payments?: number | null;
    dscr?: number | null;
    avg_daily_balance?: number | null;
    negative_balance_days_90?: number | null;
    returned_items?: number | null;
    average_monthly_deposits?: number | null;
    annualized_deposits?: number | null;
    financial_sources?: Record<string, { status?: string; source?: string; label?: string; evidence?: string | null }>;
    verified_bank_months?: string[];
    bank_evidence_target?: number;
    credit?: Array<{ owner?: string; status?: string; quality?: string }>;
    debt_count?: number;
    unresolved_conditions?: string[];
  };
  documents: EnvelopeDocument[];
};
type SendResult = { url: string; passcode: string | null; delivered: boolean; emailed: boolean; detail: string | null };
export type RoomAccessResult = { url: string; passcode: string | null };
type DecisionProgram = {
  program_key?: string;
  key?: string;
  name?: string;
  label?: string;
  status?: string;
  needs?: string[];
  blocked_by?: string[];
};
type Decision = { programs?: DecisionProgram[] };

const PROGRAMS: Array<{ key: ProgramKey; label: string; description: string }> = [
  { key: "term_loan_3_5_year", label: "EZ Term", description: "Business term application" },
  { key: "term_loan_10_year", label: "MicroCap", description: "Working-capital application" },
];

function isProgramKey(value: string | null | undefined): value is ProgramKey {
  return PROGRAMS.some((program) => program.key === value);
}

function statusLabel(status: MasterApplicationStatus): string {
  if (status === "executed") return "Executed";
  if (status === "out_for_signature") return "Awaiting client signature";
  if (status === "ready") return "Ready to send";
  if (status === "draft") return "Source fields missing";
  if (status === "void") return "Voided";
  return "Not generated";
}

function routeStatusLabel(status: string): string {
  if (status === "recommended") return "Recommended";
  if (status === "potential") return "Available";
  return "Gated";
}

function money(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? "Unavailable"
    : Number(value).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function ratio(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? "Unavailable"
    : `${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
}

function count(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? "Unavailable"
    : Number(value).toLocaleString();
}

function selectedEnvelopePrograms(envelope: ContractEnvelope | undefined): ProgramKey[] {
  if (!envelope) return [];
  const selected = (envelope.program_keys ?? []).filter(isProgramKey);
  return selected.length ? selected : [envelope.program_key];
}

export default function ApplicationSigningPanel({ dealerId, packageReady, blockers = [], routeKey, onStatusChange }: {
  dealerId: string; packageReady: boolean; blockers?: string[]; routeKey?: string | null;
  onStatusChange?: (status: MasterApplicationStatus) => void;
}) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [selectedPrograms, setSelectedPrograms] = useState<ProgramKey[]>([]);
  const [selectionInitialized, setSelectionInitialized] = useState(false);
  const [confirmedOverrides, setConfirmedOverrides] = useState<Partial<Record<ProgramKey, string>>>({});
  const [overrideTarget, setOverrideTarget] = useState<ProgramKey | null>(null);
  const [holdKey, setHoldKey] = useState<ProgramKey | null>(null);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewEnvelope, setReviewEnvelope] = useState<ContractEnvelope | null>(null);
  const [reviewRefreshing, setReviewRefreshing] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const authenticated = async <T,>(path: string, init?: RequestInit) => api<T>(path, { ...init, authToken: (await getToken()) ?? undefined });
  const envelopes = useQuery({
    queryKey: ["contract-envelopes", dealerId],
    queryFn: () => authenticated<ContractEnvelope[]>(`/dealer-os/dealers/${dealerId}/contract-envelopes`),
    refetchInterval: reviewOpen ? false : 15_000,
  });
  const decision = useQuery({ queryKey: ["decision", dealerId], queryFn: () => authenticated<Decision>(`/dealer-os/dealers/${dealerId}/decision`) });
  const roomAccess = useQuery({
    queryKey: ["client-room-access", dealerId],
    queryFn: () => authenticated<RoomAccessResult>(`/dealer-os/dealers/${dealerId}/room/access-code`),
    enabled: reviewOpen,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });
  const envelope = envelopes.data?.find((item) => item.status !== "void") ?? envelopes.data?.[0];
  const status = envelope?.status ?? "not_generated";
  const immutable = Boolean(envelope && ["out_for_signature", "executed"].includes(status));
  const envelopePrograms = useMemo(() => selectedEnvelopePrograms(envelope), [envelope]);
  const decisionByKey = useMemo(() => new Map((decision.data?.programs ?? []).map((item) => [item.program_key || item.key || "", item])), [decision.data?.programs]);
  const programStatus = (key: ProgramKey) => decisionByKey.get(key)?.status ?? "blocked";
  const programViable = (key: ProgramKey) => ["recommended", "potential"].includes(programStatus(key));
  const programConditions = (key: ProgramKey) => {
    const item = decisionByKey.get(key);
    return Array.from(new Set([...(item?.blocked_by ?? []), ...(item?.needs ?? [])]));
  };

  useEffect(() => {
    setSelectionInitialized(false);
    setSelectedPrograms([]);
    setConfirmedOverrides({});
    setReviewOpen(false);
    setReviewEnvelope(null);
    setSendResult(null);
  }, [dealerId]);
  useEffect(() => {
    if (selectionInitialized) return;
    if (envelope && envelope.status !== "void") {
      setSelectedPrograms(envelopePrograms);
      setSelectionInitialized(true);
      return;
    }
    if (!decision.data) return;
    const viable = PROGRAMS.filter((program) => programViable(program.key)).map((program) => program.key);
    const initial = isProgramKey(routeKey) && viable.includes(routeKey) ? routeKey : viable[0];
    setSelectedPrograms(initial ? [initial] : []);
    setSelectionInitialized(true);
  }, [decision.data, envelope, envelopePrograms, routeKey, selectionInitialized]);
  useEffect(() => onStatusChange?.(status), [onStatusChange, status]);
  useEffect(() => () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
  }, []);

  const generate = useMutation({
    mutationFn: () => authenticated<ContractEnvelope>(`/dealer-os/dealers/${dealerId}/contract-envelopes/generate`, {
      method: "POST",
      body: JSON.stringify({
        program_keys: selectedPrograms,
        overrides: selectedPrograms
          .filter((key) => !programViable(key) && confirmedOverrides[key])
          .map((key) => ({ program_key: key, acknowledged: true, note: confirmedOverrides[key] })),
      }),
    }),
    onSuccess: (result) => {
      setSelectedPrograms(selectedEnvelopePrograms(result));
      setSendResult(null);
      qc.setQueryData<ContractEnvelope[]>(["contract-envelopes", dealerId], (current) => [
        result,
        ...(current ?? []).filter((item) => item.id !== result.id),
      ]);
      setReviewEnvelope(result);
      setReviewOpen(true);
      void qc.invalidateQueries({ queryKey: ["contract-envelopes", dealerId] });
      void qc.invalidateQueries({ queryKey: ["application-profile", dealerId] });
      void qc.invalidateQueries({ queryKey: ["submission-readiness", dealerId] });
      void qc.invalidateQueries({ queryKey: ["underwriting-resolution", dealerId] });
      void qc.invalidateQueries({ queryKey: ["decision", dealerId] });
    },
  });
  const send = useMutation({
    mutationFn: () => {
      const deliveryEnvelope = reviewEnvelope ?? envelope;
      if (!deliveryEnvelope) throw new Error("Generate the package first.");
      return authenticated<SendResult>(`/dealer-os/dealers/${dealerId}/contract-envelopes/${deliveryEnvelope.id}/send`, { method: "POST", body: JSON.stringify({ channel: "email" }) });
    },
    onSuccess: (result) => {
      setSendResult(result);
      setReviewEnvelope((current) => current ? { ...current, status: "out_for_signature" } : current);
      void qc.invalidateQueries({ queryKey: ["contract-envelopes", dealerId] });
    },
  });
  const createRoomPin = useMutation({
    mutationFn: () => authenticated<RoomAccessResult>(`/dealer-os/dealers/${dealerId}/room/access-code`, { method: "POST" }),
    onSuccess: (result) => {
      qc.setQueryData(["client-room-access", dealerId], result);
      setSendResult((current) => current ? { ...current, url: result.url, passcode: result.passcode } : current);
    },
  });
  const refreshReview = async () => {
    if (!reviewEnvelope) return;
    setReviewRefreshing(true);
    try {
      const result = await envelopes.refetch();
      const latest = result.data?.find((item) => item.id === reviewEnvelope.id);
      if (latest) setReviewEnvelope(latest);
    } finally {
      setReviewRefreshing(false);
    }
  };
  const openReview = () => {
    if (!envelope) return;
    setReviewEnvelope(envelope);
    setReviewOpen(true);
  };
  const closeReview = () => {
    setReviewOpen(false);
    setReviewEnvelope(null);
    qc.removeQueries({ queryKey: ["client-room-access", dealerId] });
    void envelopes.refetch();
  };
  const copy = async (key: string, value: string | null | undefined) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied((current) => current === key ? null : current), 1800);
  };
  const stopHold = () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setHoldKey(null);
  };
  const startHold = (key: ProgramKey) => {
    if (immutable || programViable(key) || selectedPrograms.includes(key)) return;
    stopHold();
    setHoldKey(key);
    holdTimer.current = window.setTimeout(() => {
      setHoldKey(null);
      holdTimer.current = null;
      setOverrideTarget(key);
    }, 3000);
  };
  const toggleProgram = (key: ProgramKey) => {
    if (immutable) return;
    generate.reset();
    if (selectedPrograms.includes(key)) {
      setSelectedPrograms((current) => current.filter((item) => item !== key));
      setConfirmedOverrides((current) => ({ ...current, [key]: undefined }));
      return;
    }
    if (programViable(key)) setSelectedPrograms((current) => [...current, key]);
  };
  const confirmOverride = () => {
    if (!overrideTarget) return;
    const note = "Staff confirmed this blocked package selection after a three-second hold in Step 4; system blockers remain unchanged.";
    setConfirmedOverrides((current) => ({ ...current, [overrideTarget]: note }));
    setSelectedPrograms((current) => current.includes(overrideTarget) ? current : [...current, overrideTarget]);
    setOverrideTarget(null);
    generate.reset();
  };

  const missingOverride = selectedPrograms.some((key) => (
    !programViable(key)
    && !confirmedOverrides[key]
    && !envelopePrograms.includes(key)
  ));
  const selectionChanged = selectedPrograms.length !== envelopePrograms.length
    || selectedPrograms.some((key) => !envelopePrograms.includes(key));
  const missing = envelope?.documents.flatMap((document) => document.missing_data) ?? [];
  const error = generate.error ?? send.error;
  const targetProgram = overrideTarget ? PROGRAMS.find((program) => program.key === overrideTarget) : null;
  const targetConditions = overrideTarget ? programConditions(overrideTarget) : [];

  return <div id="program-application-package" className={`panel guided-target${status === "draft" ? " panel-invalid" : ""}`} tabIndex={-1}>
    <div className="panel-h"><FileSignature size={17} /> Program application package<span className="sp" /><span className={`cellchip ${status === "executed" ? "c-ok" : status === "out_for_signature" || status === "draft" ? "c-warn" : "c-acc"}`}>{statusLabel(status)}</span></div>
    <div className="panel-b">
      <p className="sub" style={{ marginTop: 0, lineHeight: 1.55 }}>Select one or both program forms, review the populated PDFs with the client, then send the package to the client&apos;s secure device for signature.</p>
      <div className="contractProgramCards" aria-label="Program package selection">
        {PROGRAMS.map((program) => {
          const selected = selectedPrograms.includes(program.key);
          const viable = programViable(program.key);
          const routeStatus = programStatus(program.key);
          const conditions = programConditions(program.key);
          const overridden = selected && !viable && Boolean(confirmedOverrides[program.key] || envelopePrograms.includes(program.key));
          return <button
            key={program.key}
            type="button"
            className={`contractProgramCard${selected ? " selected" : ""}${viable ? "" : " gated"}${holdKey === program.key ? " holding" : ""}`}
            aria-pressed={selected}
            disabled={immutable}
            onClick={() => toggleProgram(program.key)}
            onPointerDown={() => startHold(program.key)}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onPointerCancel={stopHold}
            onKeyDown={(event) => {
              if (!viable && !selected && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                setOverrideTarget(program.key);
              }
            }}
          >
            <span className="contractProgramCheck" aria-hidden>{selected ? <Check size={19} /> : viable ? <FileSignature size={18} /> : <Lock size={17} />}</span>
            <span className="contractProgramCopy"><b>{program.label}</b><small>{program.description}</small></span>
            <span className={`cellchip ${viable ? "c-ok" : overridden ? "c-warn" : "c-bad"}`}>{overridden ? "Override selected" : routeStatusLabel(routeStatus)}</span>
            <span className="contractProgramGuidance">{selected ? "Selected for this envelope" : viable ? "Click to select" : "Hold 3 seconds to override"}</span>
            {!viable && conditions.length > 0 && <span className="contractProgramCondition">{conditions[0]}{conditions.length > 1 ? ` +${conditions.length - 1} more` : ""}</span>}
            <span className="contractProgramHoldProgress" aria-hidden />
          </button>;
        })}
      </div>
      <div className="contractPackageActions">
        <span className="sub">{selectedPrograms.length ? `${selectedPrograms.length} program${selectedPrograms.length === 1 ? "" : "s"} selected` : "Select at least one program"}</span>
        {(!envelope || ["draft", "ready"].includes(status)) && <button type="button" className="btn pri" disabled={generate.isPending || selectedPrograms.length === 0 || missingOverride} onClick={() => generate.mutate()}>{envelope ? <RefreshCw size={16} /> : <FileSignature size={16} />}{generate.isPending ? "Building package..." : envelope ? selectionChanged ? "Update package" : "Refresh from application" : selectedPrograms.length > 1 ? "Generate combined package" : "Generate package"}</button>}
      </div>
      {immutable && <div className="note mt">{status === "executed" ? "This executed package is immutable." : "This package has been sent. It must be voided before its program selection can change."}</div>}
      {missingOverride && <div className="warnline mt">A selected gated program still needs its override confirmation.</div>}
      {!packageReady && status !== "executed" && <div className="warnline mt">You may build and review a populated draft now. Live delivery remains controlled by required source fields and an accepted bank-evidence standard or exception.{blockers.length ? ` Open: ${blockers.slice(0, 3).join("; ")}.` : ""}</div>}
      {envelope?.funding_profile && Object.keys(envelope.funding_profile).length > 0 && (
        <div className="packageFundingProfile mt">
          <div className="row"><b>Funding profile included in this package</b><span className="sp" /><span className={`cellchip ${envelope.funding_profile.system_status === "blocked" ? "c-warn" : "c-ok"}`}>{envelope.funding_profile.system_status || "System route"}</span></div>
          <div className="packageFundingGrid">
            <div><span>Original request</span><b>{money(envelope.funding_profile.original_requested_amount)}</b></div>
            <div><span>Working goal</span><b>{money(envelope.funding_profile.working_funding_goal)}</b></div>
            <div><span>Annual sales</span><b>{money(envelope.funding_profile.annual_sales)}</b></div>
            <div><span>Available cash flow</span><b>{money(envelope.funding_profile.annual_cash_flow_available_for_debt)}</b></div>
            <div><span>Monthly debt service</span><b>{money(envelope.funding_profile.monthly_debt_payments)}</b></div>
            <div><span>DSCR</span><b>{ratio(envelope.funding_profile.dscr)}</b></div>
            <div><span>Average daily balance</span><b>{money(envelope.funding_profile.avg_daily_balance)}</b></div>
            <div><span>Average monthly deposits</span><b>{money(envelope.funding_profile.average_monthly_deposits)}</b></div>
            <div><span>Annualized deposits</span><b>{money(envelope.funding_profile.annualized_deposits)}</b></div>
            <div><span>Negative days / 90</span><b>{count(envelope.funding_profile.negative_balance_days_90)}</b></div>
            <div><span>Returned items</span><b>{count(envelope.funding_profile.returned_items)}</b></div>
            <div><span>Verified bank coverage</span><b>{envelope.funding_profile.verified_bank_months?.length ?? 0} of {envelope.funding_profile.bank_evidence_target ?? 6} accepted months</b></div>
          </div>
          {(envelope.funding_profile.credit ?? []).map((credit, index) => <div className="packageCreditRow" key={`${credit.owner}:${index}`}><span>{credit.owner || "Required owner"}</span><b>{credit.quality || credit.status || "Verification pending"}</b></div>)}
          {(envelope.funding_profile.unresolved_conditions ?? []).length > 0 && <span className="sub">Conditions retained: {envelope.funding_profile.unresolved_conditions?.slice(0, 4).join("; ")}</span>}
        </div>
      )}
      {missing.length > 0 && <div className="warnline mt"><b>{missing.length} source field{missing.length === 1 ? " is" : "s are"} missing.</b> {missing.slice(0, 5).join("; ")}. Open the package to use the Edit source links.</div>}
      {envelope && <div className="row mt" style={{ gap: 8, flexWrap: "wrap" }}><button type="button" className="btn pri" onClick={openReview}><FileSignature size={16} /> {status === "executed" ? "View executed package" : "Review package"}</button>{envelope.bundle_download_url && <a className="btn" href={envelope.bundle_download_url} download>Download executed package</a>}</div>}
      {sendResult && <div className="note mt"><div className="row" style={{ gap: 8, flexWrap: "wrap" }}><b>{sendResult.emailed ? "Signature invitation emailed." : "Secure room created; email delivery needs attention."}</b><span className="sp" /><button type="button" className="btn sm" onClick={() => void copy("room", sendResult.url)}><Copy size={14} /> {copied === "room" ? "Link copied" : "Copy secure link"}</button>{sendResult.passcode && <button type="button" className="btn sm num" onClick={() => void copy("pin", sendResult.passcode)}><Copy size={14} /> {copied === "pin" ? "PIN copied" : `PIN ${sendResult.passcode}`}</button>}</div></div>}
      {status === "executed" && <div className="note mt"><div className="row" style={{ gap: 8 }}><CheckCircle2 size={18} /><b>Package executed</b></div><div className="sub mt">Every configured document has its own visible signature, certificate, and hash.</div></div>}
      {error && <div className="warnline mt">{error instanceof Error ? error.message : "The package action did not complete."}</div>}
    </div>
    {reviewOpen && reviewEnvelope && <AgreementReviewWorkspace envelope={reviewEnvelope} roomAccess={roomAccess.data ?? null} roomAccessPending={roomAccess.isPending} roomAccessError={roomAccess.isError ? (roomAccess.error instanceof Error ? roomAccess.error.message : "The current PIN could not be loaded.") : null} createPinPending={createRoomPin.isPending} createPinError={createRoomPin.isError ? (createRoomPin.error instanceof Error ? createRoomPin.error.message : "A new PIN could not be created.") : null} sendResult={sendResult} sendPending={send.isPending} refreshPending={reviewRefreshing} copied={copied} onSend={() => send.mutate()} onCreatePin={async () => { await createRoomPin.mutateAsync(); }} onRefresh={() => void refreshReview()} onCopy={(key, value) => void copy(key, value)} onClose={closeReview} />}
    {overrideTarget && targetProgram && <Drawer title={`Override ${targetProgram.label} package gate?`} width={580} dismissOnBackdrop={false} onClose={() => setOverrideTarget(null)}>
      <div className="contractOverrideConfirm">
        <div className="contractOverrideIcon"><ShieldAlert size={25} /></div>
        <div><b>The system result remains gated.</b><span>This selects {targetProgram.label} for document preparation and client signature only. It does not mark the program eligible or remove underwriting conditions.</span></div>
        <div className="contractOverrideCompare"><section><span className="lbl">Current system result</span><b>Gated</b></section><section><span className="lbl">Selected submission path</span><b>{targetProgram.label}</b></section></div>
        {targetConditions.length > 0 && <ul>{targetConditions.map((condition) => <li key={condition}>{condition}</li>)}</ul>}
        <div className="contractOverrideActions"><button type="button" className="btn" onClick={() => setOverrideTarget(null)}>No, keep gated</button><button type="button" className="btn pri" onClick={confirmOverride}>Yes, override</button></div>
      </div>
    </Drawer>}
  </div>;
}
