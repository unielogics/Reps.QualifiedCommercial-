"use client";

import { type ReactNode, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, Pencil, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";

export type Recommendation = {
  id: string;
  current_amount: number | null;
  current_program: string | null;
  recommended_amount: number | null;
  recommended_program: string | null;
  supported_min: number | null;
  supported_max: number | null;
  reasons: Array<{ kind?: string; message?: string; matched_rule?: string }>;
  status: string;
  response_amount: number | null;
  response_program: string | null;
  response_note: string | null;
};

export type ResolutionBlocker = {
  program_key: string;
  program_name: string;
  rule_key: string;
  kind: string;
  source: string;
  explanation: string;
  corrective_action: string;
  hard: boolean;
  correction_step?: number;
  correction_anchor?: string;
  correction_label?: string;
};

export type UnderwritingResolution = {
  rules_version: string;
  original_amount: number | null;
  working_amount: number | null;
  original_program: string | null;
  working_program: string | null;
  recommended: Recommendation | null;
  programs: Array<{ program_key: string; name?: string; status?: string }>;
  blockers: ResolutionBlocker[];
  applicable_business_questions: import("./Step4BusinessQuestions").BusinessQuestionGroup[];
  business_questions_complete: boolean;
  business_question_blockers: string[];
  financial_suggestions: Record<string, { value?: number; source?: string; provenance?: string; evidence?: string }>;
  exception_requests: Array<{ id: string; rule_key: string; status: string }>;
  direct_program_viable: boolean;
  signing_mode: "program_package" | "qc_summary_booking";
  program_selection: {
    system_program_key: string | null;
    system_program_status: string | null;
    effective_program_key: string | null;
    effective_program_status: string | null;
    manually_selected: boolean;
    selected_by_name: string | null;
    selected_at: string | null;
    note: string | null;
    rules_version: string | null;
  };
};

const PROGRAM_LABELS: Record<string, string> = {
  term_loan_3_5_year: "3–5 Year Business Term Loan",
  term_loan_10_year: "10-Year Working Capital",
};

const KIND_LABELS: Record<string, string> = {
  missing_evidence: "Missing evidence",
  conflicting_information: "Conflicting information",
  unsupported_amount: "Unsupported amount",
  alternative_program: "Alternative program",
  hard_restriction: "Hard restriction",
};

function money(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? "Not selected"
    : Number(value).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function program(value: string | null | undefined): string {
  return value ? PROGRAM_LABELS[value] ?? value.replaceAll("_", " ") : "Not selected";
}

function correctionHref(dealerId: string, blocker: ResolutionBlocker): string {
  const step = blocker.correction_step && blocker.correction_step >= 1 && blocker.correction_step <= 3
    ? blocker.correction_step
    : 1;
  const anchor = blocker.correction_anchor ? `#${blocker.correction_anchor}` : "";
  return `/applications/${dealerId}?step=${step}${anchor}`;
}

export default function Step4Resolution({
  dealerId,
  data,
  packageWorkspace,
}: {
  dealerId: string;
  data: UnderwritingResolution;
  packageWorkspace: ReactNode;
}) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const recommendation = data.recommended;
  const [editMode, setEditMode] = useState(false);
  const [amount, setAmount] = useState(recommendation?.recommended_amount?.toString() ?? "");
  const [programKey, setProgramKey] = useState(recommendation?.recommended_program ?? "");
  const [note, setNote] = useState("");
  const [blockersOpen, setBlockersOpen] = useState(false);
  const [exceptionRule, setExceptionRule] = useState<string | null>(null);
  const [exceptionNote, setExceptionNote] = useState("");

  useEffect(() => {
    setAmount(recommendation?.recommended_amount?.toString() ?? "");
    setProgramKey(recommendation?.recommended_program ?? "");
  }, [recommendation?.id, recommendation?.recommended_amount, recommendation?.recommended_program]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["underwriting-resolution", dealerId] });
    void qc.invalidateQueries({ queryKey: ["submission-readiness", dealerId] });
    void qc.invalidateQueries({ queryKey: ["decision", dealerId] });
    void qc.invalidateQueries({ queryKey: ["dealer", dealerId] });
    void qc.invalidateQueries({ queryKey: ["contract-envelopes", dealerId] });
  };

  const respond = useMutation({
    mutationFn: async (action: "apply" | "edit" | "keep_for_review") => {
      if (!recommendation) throw new Error("No current recommendation is available.");
      return api(`/dealer-os/dealers/${dealerId}/application-recommendations/${recommendation.id}/respond`, {
        method: "POST",
        body: JSON.stringify({
          action,
          amount: action === "edit" ? Number(amount) : undefined,
          program_key: action === "edit" ? programKey : undefined,
          note: note.trim() || undefined,
        }),
        authToken: (await getToken()) ?? undefined,
      });
    },
    onSuccess: () => { setEditMode(false); refresh(); },
  });

  const requestException = useMutation({
    mutationFn: async (blocker: ResolutionBlocker) => api(`/dealer-os/dealers/${dealerId}/program-exceptions`, {
      method: "POST",
      body: JSON.stringify({
        program_key: blocker.program_key,
        rule_key: blocker.rule_key,
        kind: blocker.kind,
        source: blocker.source,
        current_value: { explanation: blocker.explanation },
        recommended_action: blocker.corrective_action,
        note: exceptionNote.trim(),
      }),
      authToken: (await getToken()) ?? undefined,
    }),
    onSuccess: () => { setExceptionRule(null); setExceptionNote(""); refresh(); },
  });

  const alreadyRequested = (ruleKey: string) => data.exception_requests.find(
    (item) => item.rule_key === ruleKey && item.status === "pending",
  );
  const hardCount = data.blockers.filter((blocker) => blocker.hard).length;

  return (
    <>
      <div className="panel">
        <div className="panel-h">
          Current request and recommended structure
          <span className="sp" />
          <span className={`cellchip ${data.direct_program_viable ? "c-ok" : "c-warn"}`}>
            {data.direct_program_viable ? "Direct path available" : "Staff review available"}
          </span>
        </div>
        <div className="panel-b step4Resolution">
          <div className="resolutionCompare">
            <section className="resolutionSide current">
              <span className="lbl">Original client request</span>
              <strong>{money(data.original_amount)}</strong>
              <span>{program(data.original_program)}</span>
              <small>Permanent historical record. This value is never overwritten.</small>
            </section>
            <ArrowRight className="resolutionArrow" aria-hidden />
            <section className={`resolutionSide recommended${recommendation?.status === "pending" ? " pending" : ""}`}>
              <span className="lbl">Working / recommended structure</span>
              <strong>{money(recommendation?.recommended_amount ?? data.working_amount)}</strong>
              <span>{program(recommendation?.recommended_program ?? data.working_program)}</span>
              {recommendation && recommendation.supported_min !== null && recommendation.supported_max !== null && <small>Supported range {money(recommendation.supported_min)}–{money(recommendation.supported_max)}</small>}
            </section>
          </div>

          {recommendation?.status === "pending" && (
            <div className="recommendationDecision">
              <div>
                <b>Rep acknowledgment required</b>
                <ul>{recommendation.reasons.map((reason, index) => <li key={`${reason.kind}:${index}`}>{reason.message ?? "A supported structure was drafted from current rules."}</li>)}</ul>
              </div>
              {editMode && (
                <div className="recommendationEdit">
                  <label><span className="lbl">Edited working amount</span><input className="field" type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
                  <label><span className="lbl">Edited program</span><select className="field" value={programKey} onChange={(event) => setProgramKey(event.target.value)}><option value="">Select</option>{Object.entries(PROGRAM_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                </div>
              )}
              <label><span className="lbl">Rep note (optional)</span><textarea className="field" rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Explain the client discussion or why the original should remain for review." /></label>
              <div className="recommendationActions">
                <button type="button" className="btn pri" disabled={respond.isPending} onClick={() => respond.mutate(editMode ? "edit" : "apply")}>{editMode ? "Apply edited structure" : "Acknowledge and apply"}</button>
                <button type="button" className="btn" onClick={() => setEditMode((current) => !current)}>{editMode ? "Use system draft" : "Edit recommendation"}</button>
                <button type="button" className="btn" disabled={respond.isPending} onClick={() => respond.mutate("keep_for_review")}>Keep original for super-admin review</button>
              </div>
              {respond.error && <div className="warnline">{respond.error instanceof Error ? respond.error.message : "The response could not be saved."}</div>}
            </div>
          )}
        </div>
      </div>

      {packageWorkspace}

      {data.blockers.length > 0 ? (
        <div className={`panel resolutionConditions${hardCount ? " panel-invalid" : ""}`}>
          <button
            type="button"
            className="panel-h resolutionConditionsToggle"
            aria-expanded={blockersOpen}
            onClick={() => setBlockersOpen((current) => !current)}
          >
            <AlertTriangle size={18} />
            <span className="resolutionConditionsCopy">
              <b>Conditions and corrections</b>
              <small>Open a source field or review a documented package override.</small>
            </span>
            <span className="sp" />
            <span className={`cellchip ${hardCount ? "c-bad" : "c-warn"}`}>{data.blockers.length} open</span>
            <ChevronDown className={blockersOpen ? "open" : undefined} size={19} aria-hidden />
          </button>
          {blockersOpen && (
            <div className="panel-b resolutionBlockers">
              {data.blockers.map((blocker) => (
                <article key={`${blocker.program_key}:${blocker.rule_key}`} className={`resolutionBlocker${blocker.hard ? " hard" : ""}`}>
                  <div className="resolutionBlockerHeading">
                    <span className={`cellchip ${blocker.hard ? "c-bad" : "c-warn"}`}>{KIND_LABELS[blocker.kind] ?? blocker.kind}</span>
                    <b>{blocker.program_name}</b>
                  </div>
                  <p>{blocker.explanation}</p>
                  <div className="resolutionBlockerSource"><span className="lbl">Current source</span><span>{blocker.source || "Application and verified evidence"}</span></div>
                  <div className="resolutionBlockerActions">
                    <a className="btn sm" href={correctionHref(dealerId, blocker)}><Pencil size={15} /> {blocker.correction_label || "Review source"}</a>
                    <a
                      className="btn sm"
                      href="#program-application-package"
                      onClick={() => window.requestAnimationFrame(() => document.getElementById("program-application-package")?.focus({ preventScroll: true }))}
                    >
                      <ShieldAlert size={15} /> Review package override
                    </a>
                  </div>
                  {blocker.hard && (
                    <div className="exceptionRequest">
                      {alreadyRequested(blocker.rule_key) ? <span className="cellchip c-warn"><ShieldAlert size={14} /> Exception pending super-admin review</span> : exceptionRule === blocker.rule_key ? <>
                        <textarea className="field" rows={2} value={exceptionNote} onChange={(event) => setExceptionNote(event.target.value)} placeholder="Document why this exception should be reviewed." />
                        <div className="row"><button type="button" className="btn" onClick={() => setExceptionRule(null)}>Cancel</button><button type="button" className="btn pri" disabled={!exceptionNote.trim() || requestException.isPending} onClick={() => requestException.mutate(blocker)}>Submit exception request</button></div>
                      </> : <button type="button" className="btn sm" onClick={() => setExceptionRule(blocker.rule_key)}>Request super-admin exception</button>}
                    </div>
                  )}
                  {requestException.error && exceptionRule === blocker.rule_key && <div className="warnline">{requestException.error instanceof Error ? requestException.error.message : "The exception request could not be saved."}</div>}
                </article>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="note"><div className="row"><CheckCircle2 size={18} /><b>No current routing conditions</b></div></div>
      )}
    </>
  );
}
