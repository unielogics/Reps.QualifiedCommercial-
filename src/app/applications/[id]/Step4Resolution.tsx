"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import Modal from "@/components/Modal";

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

export default function Step4Resolution({
  dealerId,
  data,
}: {
  dealerId: string;
  data: UnderwritingResolution;
}) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const recommendation = data.recommended;
  const [editMode, setEditMode] = useState(false);
  const [amount, setAmount] = useState(recommendation?.recommended_amount?.toString() ?? "");
  const [programKey, setProgramKey] = useState(recommendation?.recommended_program ?? "");
  const [note, setNote] = useState("");
  const [exceptionRule, setExceptionRule] = useState<string | null>(null);
  const [exceptionNote, setExceptionNote] = useState("");
  const [selectionTarget, setSelectionTarget] = useState<{ key: string; label: string; status: string } | null>(null);
  const [selectionNote, setSelectionNote] = useState("");

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

  const selectProgram = useMutation({
    mutationFn: async ({ key, note }: { key: string; note?: string }) => api(
      `/dealer-os/dealers/${dealerId}/program-selection`,
      {
        method: "PUT",
        body: JSON.stringify({ program_key: key, acknowledged: true, note: note?.trim() || null }),
        authToken: (await getToken()) ?? undefined,
      },
    ),
    onSuccess: () => {
      setSelectionTarget(null);
      setSelectionNote("");
      refresh();
    },
  });
  const clearProgram = useMutation({
    mutationFn: async () => api(`/dealer-os/dealers/${dealerId}/program-selection`, {
      method: "DELETE",
      authToken: (await getToken()) ?? undefined,
    }),
    onSuccess: refresh,
  });

  const beginSelection = (row: { program_key: string; name?: string; status?: string }) => {
    const target = { key: row.program_key, label: row.name || program(row.program_key), status: row.status || "blocked" };
    if (target.status === "blocked") {
      setSelectionTarget(target);
      return;
    }
    selectProgram.mutate({ key: target.key });
  };

  const alreadyRequested = (ruleKey: string) => data.exception_requests.find(
    (item) => item.rule_key === ruleKey && item.status === "pending",
  );

  return (
    <div className="panel">
      <div className="panel-h">
        Current request and recommended structure
        <span className="sp" />
        <span className={`cellchip ${data.direct_program_viable ? "c-ok" : "c-warn"}`}>
          {data.direct_program_viable ? "Direct path available" : "Review path required"}
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

        <div className="programSelectionControl">
          <div>
            <span className="lbl">Effective submission program</span>
            <b>{program(data.program_selection.effective_program_key)}</b>
            <small>
              System result: {program(data.program_selection.system_program_key)} · {data.program_selection.system_program_status || "No direct route"}
            </small>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {data.programs.filter((row) => PROGRAM_LABELS[row.program_key]).map((row) => (
              <button
                key={row.program_key}
                type="button"
                className={`btn${data.program_selection.effective_program_key === row.program_key ? " pri" : ""}`}
                disabled={selectProgram.isPending || data.program_selection.effective_program_key === row.program_key}
                onClick={() => beginSelection(row)}
              >
                {PROGRAM_LABELS[row.program_key]} · {row.status || "blocked"}
              </button>
            ))}
            {data.program_selection.manually_selected && (
              <button type="button" className="btn" disabled={clearProgram.isPending} onClick={() => clearProgram.mutate()}>
                Return to system selection
              </button>
            )}
          </div>
          {data.program_selection.manually_selected && (
            <div className="note">
              <div>
                <b>Staff-selected submission path.</b> The system result remains {data.program_selection.system_program_status || "unresolved"}; its blockers have not been erased.
                {data.program_selection.selected_by_name ? ` Selected by ${data.program_selection.selected_by_name}.` : ""}
                {data.program_selection.note ? ` Note: ${data.program_selection.note}` : ""}
              </div>
            </div>
          )}
          {(selectProgram.error || clearProgram.error) && <div className="warnline">{(selectProgram.error || clearProgram.error) instanceof Error ? (selectProgram.error || clearProgram.error)?.message : "The program selection could not be changed."}</div>}
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

        {data.blockers.length > 0 && (
          <div className="resolutionBlockers">
            <div className="row"><AlertTriangle size={18} /><b>What is blocking or limiting the current structure</b></div>
            {data.blockers.map((blocker) => (
              <article key={`${blocker.program_key}:${blocker.rule_key}`} className={`resolutionBlocker${blocker.hard ? " hard" : ""}`}>
                <div className="row">
                  <span className={`cellchip ${blocker.hard ? "c-bad" : "c-warn"}`}>{KIND_LABELS[blocker.kind] ?? blocker.kind}</span>
                  <b>{blocker.program_name}</b>
                </div>
                <p>{blocker.explanation}</p>
                <dl><div><dt>Source</dt><dd>{blocker.source}</dd></div><div><dt>Corrective action</dt><dd>{blocker.corrective_action}</dd></div></dl>
                {blocker.hard && (
                  <div className="exceptionRequest">
                    {alreadyRequested(blocker.rule_key) ? <span className="cellchip c-warn"><ShieldAlert size={14} /> Exception pending super-admin review</span> : exceptionRule === blocker.rule_key ? <>
                      <textarea className="field" rows={2} value={exceptionNote} onChange={(event) => setExceptionNote(event.target.value)} placeholder="Document why this exception should be reviewed." />
                      <div className="row"><button type="button" className="btn" onClick={() => setExceptionRule(null)}>Cancel</button><button type="button" className="btn pri" disabled={!exceptionNote.trim() || requestException.isPending} onClick={() => requestException.mutate(blocker)}>Submit exception request</button></div>
                    </> : <button type="button" className="btn sm" onClick={() => setExceptionRule(blocker.rule_key)}>Request super-admin exception</button>}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        {data.blockers.length === 0 && <div className="note"><div className="row"><CheckCircle2 size={18} /><b>No current routing blockers</b></div></div>}
      </div>
      {selectionTarget && (
        <Modal title={`Select ${selectionTarget.label} submission path`} onClose={() => !selectProgram.isPending && setSelectionTarget(null)}>
          <div className="resolutionCompare">
            <section className="resolutionSide current"><span className="lbl">System result</span><strong>{program(data.program_selection.system_program_key)}</strong><span>{data.program_selection.system_program_status || "No direct route"}</span></section>
            <ArrowRight className="resolutionArrow" aria-hidden />
            <section className="resolutionSide recommended pending"><span className="lbl">Selected submission path</span><strong>{selectionTarget.label}</strong><span>{selectionTarget.status}</span></section>
          </div>
          <div className="warnline mt">
            This unlocks the selected program package for review and signing. It does not mark the program eligible, remove system blockers, or approve an exception.
          </div>
          <label style={{ display: "block", marginTop: 12 }}><span className="lbl">Staff note <span className="sub">Optional</span></span><textarea className="field" rows={3} value={selectionNote} onChange={(event) => setSelectionNote(event.target.value)} placeholder="Document the client discussion or submission rationale." /></label>
          <div className="row mt" style={{ justifyContent: "flex-end" }}><button type="button" className="btn" disabled={selectProgram.isPending} onClick={() => setSelectionTarget(null)}>Cancel</button><button type="button" className="btn pri" disabled={selectProgram.isPending} onClick={() => selectProgram.mutate({ key: selectionTarget.key, note: selectionNote })}>{selectProgram.isPending ? "Applying…" : "Acknowledge and select"}</button></div>
        </Modal>
      )}
    </div>
  );
}
