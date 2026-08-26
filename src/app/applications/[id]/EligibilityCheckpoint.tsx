"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, ShieldCheck, X } from "lucide-react";
import { api } from "@/lib/api";

export type EligibilityOwner = {
  id: string;
  full_name: string;
  ownership_pct: number | null;
  credit_required: boolean;
};

type OwnerAnswers = {
  residency_status?: "citizen" | "legal_permanent_resident" | "other";
  credit_660_or_higher?: boolean;
  bankruptcy_timing?: "none" | "within_3_years" | "4_to_7_years" | "more_than_7_years";
  foreclosure_within_3_years?: boolean;
  felony_timing?: "none" | "within_10_years" | "more_than_10_years";
  misdemeanor_within_5_years?: boolean;
  misdemeanor_involving_minor?: boolean;
  arrest_within_6_months?: boolean;
  financial_related_crime?: boolean;
  active_legal_charges?: boolean;
  ofac_match?: boolean;
};

type FileAnswers = {
  refinance_debt?: boolean;
  open_tax_liens?: boolean;
  tax_liability_over_10000?: boolean;
  tax_payment_plan_current?: boolean;
  open_judgments?: boolean;
  open_civil_actions_as_defendant?: boolean;
  civil_action_financial_institution_within_10_years?: boolean;
  judgment_over_2000_within_12_months?: boolean;
  judgment_over_50000_within_7_years?: boolean;
  aggregate_liens_judgments_over_25000_within_7_years?: boolean;
  term_obligations_released_or_on_plan?: boolean;
  speculative_real_estate_flipping?: boolean;
  gambling_or_bail_bonds?: boolean;
  lending_investment_crypto_mlm?: boolean;
  nonprofit_or_government?: boolean;
  marijuana_or_firearms?: boolean;
  prurient_business?: boolean;
  auto_or_title_asset_sales?: boolean;
};

type ProgramResult = {
  program_key: string;
  name: string;
  status: "recommended" | "potential" | "blocked";
  eligible: boolean;
  borrower_safe_reasons: string[];
  unresolved: string[];
  matched_rules: Array<{ rule_id: string; matched_value: string; explanation: string }>;
};

export type PreScreen = {
  rules_version: string;
  file_answers: FileAnswers;
  owner_answers: Record<string, OwnerAnswers>;
  required_owner_ids: string[];
  completed_owner_ids: string[];
  incomplete_owner_ids: string[];
  complete: boolean;
  blockers: string[];
  routing_result: { programs?: ProgramResult[]; evaluated_programs?: ProgramResult[]; headline?: string; verification?: string } | null;
  self_report_routing_result?: Record<string, unknown> | null;
  verified_routing_result?: Record<string, unknown> | null;
  routing_history?: Array<Record<string, unknown>>;
};

type FileQuestion = {
  key: keyof FileAnswers;
  title: string;
  help: string;
  showWhen?: (answers: FileAnswers) => boolean;
};

const FILE_QUESTION_GROUPS: Array<{ title: string; questions: FileQuestion[] }> = [
  {
    title: "Use of funds",
    questions: [
      { key: "refinance_debt", title: "Will any portion of the proceeds refinance debt?", help: "A yes answer removes working-capital-only paths but does not stop the application." },
    ],
  },
  {
    title: "Tax, judgments, and civil actions",
    questions: [
      { key: "open_tax_liens", title: "Does the business or any required owner have an open tax lien?", help: "An open lien is different from an ordinary tax balance being paid as agreed." },
      { key: "tax_liability_over_10000", title: "Is any outstanding tax liability above $10,000?", help: "The system will ask whether it is on a current payment plan." },
      { key: "tax_payment_plan_current", title: "Is that tax liability on a current payment plan and being paid as agreed?", help: "Required only when an outstanding tax liability exceeds $10,000.", showWhen: (answers) => answers.tax_liability_over_10000 === true },
      { key: "open_judgments", title: "Is there an open judgment against the business or a required owner?", help: "Disclose the obligation even if a payment arrangement is being discussed." },
      { key: "open_civil_actions_as_defendant", title: "Is the business or a required owner currently a defendant in a civil action?", help: "This is separate from criminal charges." },
      { key: "civil_action_financial_institution_within_10_years", title: "Within 10 years, has a financial institution brought a civil action against the business or a required owner?", help: "Used only for the applicable direct path." },
      { key: "judgment_over_2000_within_12_months", title: "Was a judgment above $2,000 filed within the past 12 months?", help: "This is an exact 3-5 year term threshold." },
      { key: "judgment_over_50000_within_7_years", title: "Was a judgment of $50,000 or more filed within the past 7 years?", help: "If yes, confirm whether it was released or placed on a current plan." },
      { key: "aggregate_liens_judgments_over_25000_within_7_years", title: "Did aggregate tax liens and judgments reach $25,000 or more within the past 7 years?", help: "If yes, confirm whether they were released or placed on a current plan." },
      { key: "term_obligations_released_or_on_plan", title: "Are those disclosed liens or judgments released or on a current payment plan?", help: "Required only when either 7-year threshold is met.", showWhen: (answers) => answers.judgment_over_50000_within_7_years === true || answers.aggregate_liens_judgments_over_25000_within_7_years === true },
    ],
  },
  {
    title: "Restricted business activity",
    questions: [
      { key: "speculative_real_estate_flipping", title: "Is the primary business speculative real-estate flipping?", help: "Real-estate ownership alone is not this activity." },
      { key: "gambling_or_bail_bonds", title: "Does the business operate gambling or bail-bond services?", help: "Answer for the operating business seeking financing." },
      { key: "lending_investment_crypto_mlm", title: "Is the business a lender, investment, crypto, or multi-level-marketing operation?", help: "This is a business-model question, not a question about holding investments personally." },
      { key: "nonprofit_or_government", title: "Is the applicant a nonprofit or government entity?", help: "Select no for ordinary for-profit entities." },
      { key: "marijuana_or_firearms", title: "Is the business marijuana- or firearm-related?", help: "Include the primary sale or production of these products." },
      { key: "prurient_business", title: "Is the business adult-oriented or prurient in nature?", help: "This is used only for program eligibility." },
      { key: "auto_or_title_asset_sales", title: "Does the business sell auto/title assets as its primary activity?", help: "The exact NAICS classification is evaluated separately as well." },
    ],
  },
];

function ownerComplete(answer: OwnerAnswers | undefined): boolean {
  return Boolean(
    answer?.residency_status
      && typeof answer.credit_660_or_higher === "boolean"
      && answer.bankruptcy_timing
      && typeof answer.foreclosure_within_3_years === "boolean"
      && answer.felony_timing
      && typeof answer.misdemeanor_within_5_years === "boolean"
      && typeof answer.misdemeanor_involving_minor === "boolean"
      && typeof answer.arrest_within_6_months === "boolean"
      && typeof answer.financial_related_crime === "boolean"
      && typeof answer.active_legal_charges === "boolean"
      && typeof answer.ofac_match === "boolean",
  );
}

function fileComplete(answer: FileAnswers): boolean {
  return FILE_QUESTION_GROUPS.every(({ questions }) => questions.every(
    ({ key, showWhen }) => Boolean(showWhen && !showWhen(answer)) || typeof answer[key] === "boolean",
  ));
}

function YesNo({
  value,
  label,
  onChange,
}: {
  value: boolean | undefined;
  label?: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="eligibilityYesNo" role="group" aria-label={label}>
      <button type="button" aria-pressed={value === true} className={value === true ? "selected" : ""} onClick={() => onChange(true)}>Yes</button>
      <button type="button" aria-pressed={value === false} className={value === false ? "selected" : ""} onClick={() => onChange(false)}>No</button>
    </div>
  );
}

export default function EligibilityCheckpoint({
  dealerId,
  owners,
  open,
  initialOwnerId,
  continueAfterComplete,
  onClose,
  onContinue,
}: {
  dealerId: string;
  owners: EligibilityOwner[];
  open: boolean;
  initialOwnerId?: string | null;
  continueAfterComplete: boolean;
  onClose: () => void;
  onContinue: () => void;
}) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const requiredOwners = useMemo(() => owners.filter((owner) => owner.credit_required), [owners]);
  const [stage, setStage] = useState(0);
  const [answers, setAnswers] = useState<Record<string, OwnerAnswers>>({});
  const [fileAnswers, setFileAnswers] = useState<FileAnswers>({});
  const [residencyEligible, setResidencyEligible] = useState<Record<string, boolean | undefined>>({});
  const [bankruptcyHistory, setBankruptcyHistory] = useState<Record<string, boolean | undefined>>({});
  const [felonyHistory, setFelonyHistory] = useState<Record<string, boolean | undefined>>({});
  const [showSummary, setShowSummary] = useState(false);
  const [error, setError] = useState("");

  const query = useQuery({
    queryKey: ["application-pre-screen", dealerId],
    enabled: open,
    queryFn: async () => api<PreScreen>(`/dealer-os/dealers/${dealerId}/pre-screen`, {
      authToken: (await getToken()) ?? undefined,
    }),
  });

  useEffect(() => {
    if (!open || !query.data) return;
    setAnswers(query.data.owner_answers ?? {});
    setFileAnswers(query.data.file_answers ?? {});
    setResidencyEligible(Object.fromEntries(Object.entries(query.data.owner_answers ?? {}).map(
      ([ownerId, ownerAnswer]) => [
        ownerId,
        ownerAnswer.residency_status ? ownerAnswer.residency_status !== "other" : undefined,
      ],
    )));
    setBankruptcyHistory(Object.fromEntries(Object.entries(query.data.owner_answers ?? {}).map(
      ([ownerId, ownerAnswer]) => [
        ownerId,
        ownerAnswer.bankruptcy_timing ? ownerAnswer.bankruptcy_timing !== "none" : undefined,
      ],
    )));
    setFelonyHistory(Object.fromEntries(Object.entries(query.data.owner_answers ?? {}).map(
      ([ownerId, ownerAnswer]) => [
        ownerId,
        ownerAnswer.felony_timing ? ownerAnswer.felony_timing !== "none" : undefined,
      ],
    )));
    const preferred = initialOwnerId
      ? requiredOwners.findIndex((owner) => owner.id === initialOwnerId)
      : requiredOwners.findIndex((owner) => !query.data?.completed_owner_ids.includes(owner.id));
    setStage(preferred >= 0 ? preferred : requiredOwners.length);
    setShowSummary(Boolean(query.data.complete && continueAfterComplete));
    setError("");
  }, [continueAfterComplete, initialOwnerId, open, query.data, requiredOwners]);

  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) => api<PreScreen>(
      `/dealer-os/dealers/${dealerId}/pre-screen`,
      {
        method: "PATCH",
        authToken: (await getToken()) ?? undefined,
        body: JSON.stringify(body),
      },
    ),
    onSuccess: (data) => {
      qc.setQueryData(["application-pre-screen", dealerId], data);
      void qc.invalidateQueries({ queryKey: ["decision", dealerId] });
    },
  });

  if (!open) return null;
  const owner = stage < requiredOwners.length ? requiredOwners[stage] : null;
  const answer = owner ? (answers[owner.id] ?? {}) : undefined;
  const onBusiness = stage === requiredOwners.length;
  const updateOwner = (ownerId: string, patch: Partial<OwnerAnswers>) => {
    setAnswers((state) => ({
      ...state,
      [ownerId]: { ...(state[ownerId] ?? {}), ...patch },
    }));
  };

  const next = async () => {
    setError("");
    try {
      if (owner) {
        if (!ownerComplete(answer)) {
          setError("Answer every highlighted owner question before continuing.");
          return;
        }
        await save.mutateAsync({ owner_id: owner.id, owner_answers: answer });
        setStage((current) => current + 1);
        return;
      }
      if (!fileComplete(fileAnswers)) {
        setError("Answer every business-model question before reviewing the result.");
        return;
      }
      await save.mutateAsync({ file_answers: fileAnswers });
      setShowSummary(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The eligibility answers could not be saved.");
    }
  };

  const latest = qc.getQueryData<PreScreen>(["application-pre-screen", dealerId]) ?? query.data;
  const programs = latest?.routing_result?.programs ?? latest?.routing_result?.evaluated_programs ?? [];

  return (
    <div className="modalOverlay eligibilityOverlay" role="presentation">
      <section className="modalDialog eligibilityDialog" role="dialog" aria-modal="true" aria-labelledby="eligibility-title">
        <header className="modalHead">
          <div>
            <span className="eyebrow">Unnumbered checkpoint between Steps 1 and 2</span>
            <h2 id="eligibility-title">Preliminary eligibility</h2>
            <p>Self-reported and unverified. A blocked route does not stop verification or another possible funding path.</p>
          </div>
          <button type="button" className="iconAction" onClick={onClose} aria-label="Close eligibility checkpoint"><X size={18} /></button>
        </header>

        <div className="eligibilityBody">
          {!showSummary ? (
            <>
              <div className="eligibilityProgress" aria-label="Eligibility progress">
                {requiredOwners.map((item, index) => (
                  <button key={item.id} type="button" className={index === stage ? "active" : ownerComplete(answers[item.id]) ? "complete" : ""} onClick={() => setStage(index)} title={item.full_name}>
                    {ownerComplete(answers[item.id]) ? <Check size={14} /> : index + 1}
                  </button>
                ))}
                <button type="button" className={onBusiness ? "active" : fileComplete(fileAnswers) ? "complete" : ""} onClick={() => setStage(requiredOwners.length)} title="Business eligibility">
                  {fileComplete(fileAnswers) ? <Check size={14} /> : "B"}
                </button>
              </div>

              {owner && (
                <>
                  <div className="eligibilityOwnerHead">
                    <div><span className="eyebrow">Required owner {stage + 1} of {requiredOwners.length}</span><h3>{owner.full_name}</h3></div>
                    <span className="cellchip c-warn">{Number(owner.ownership_pct ?? 0).toFixed(2)}% owner</span>
                  </div>
                  <div className={typeof residencyEligible[owner.id] === "boolean" ? "eligibilityQuestion complete" : "eligibilityQuestion invalid"}>
                    <div><b>Is this owner a U.S. citizen or legal permanent resident?</b><span>Select Yes or No. If Yes, identify the exact status below.</span></div>
                    <YesNo
                      label="U.S. citizen or legal permanent resident"
                      value={residencyEligible[owner.id]}
                      onChange={(value) => {
                        setResidencyEligible((state) => ({ ...state, [owner.id]: value }));
                        if (!value) updateOwner(owner.id, { residency_status: "other" });
                        else if (answer?.residency_status === "other") updateOwner(owner.id, { residency_status: undefined });
                      }}
                    />
                  </div>
                  {residencyEligible[owner.id] === true && (
                    <label className={answer?.residency_status && answer.residency_status !== "other" ? "eligibilityQuestion complete eligibilityFollowup" : "eligibilityQuestion invalid eligibilityFollowup"}>
                      <div><b>Which status applies?</b><span>The routing engine preserves this distinction.</span></div>
                      <select className="field" value={answer?.residency_status === "other" ? "" : answer?.residency_status ?? ""} onChange={(event) => updateOwner(owner.id, { residency_status: event.target.value as OwnerAnswers["residency_status"] })}>
                        <option value="">Select status</option><option value="citizen">U.S. citizen</option><option value="legal_permanent_resident">Legal permanent resident</option>
                      </select>
                    </label>
                  )}
                  {([
                    ["credit_660_or_higher", "Is the owner's estimated credit at least 660?", "iSoftPull will verify a tier later; do not enter a raw score."],
                    ["foreclosure_within_3_years", "Foreclosure within the past 3 years?", "A disclosed event may block only one route."],
                    ["misdemeanor_within_5_years", "Misdemeanor within the past 5 years?", "Used for the 10-year route."],
                    ["misdemeanor_involving_minor", "Any misdemeanor involving a minor?", "Used for the 10-year route regardless of when it occurred."],
                    ["arrest_within_6_months", "Any arrest within the past 6 months?", "A recent arrest is evaluated separately from a conviction."],
                    ["financial_related_crime", "Any financial-related crime?", "Used for the 3-5 year term route."],
                    ["active_legal_charges", "Any active legal charges?", "Pending matters are screened separately from convictions."],
                    ["ofac_match", "Any known sanctions or OFAC match?", "A yes answer requires another review path."],
                  ] as const).map(([key, title, help]) => (
                    <div key={key} className={typeof answer?.[key] === "boolean" ? "eligibilityQuestion complete" : "eligibilityQuestion invalid"}>
                      <div><b>{title}</b><span>{help}</span></div>
                      <YesNo label={title} value={answer?.[key]} onChange={(value) => updateOwner(owner.id, { [key]: value })} />
                    </div>
                  ))}
                  <div className={typeof bankruptcyHistory[owner.id] === "boolean" ? "eligibilityQuestion complete" : "eligibilityQuestion invalid"}>
                    <div><b>Has this owner ever filed for bankruptcy?</b><span>Select Yes or No. Timing is requested only when needed.</span></div>
                    <YesNo
                      label="Bankruptcy history"
                      value={bankruptcyHistory[owner.id]}
                      onChange={(value) => {
                        setBankruptcyHistory((state) => ({ ...state, [owner.id]: value }));
                        updateOwner(owner.id, { bankruptcy_timing: value ? undefined : "none" });
                      }}
                    />
                  </div>
                  {bankruptcyHistory[owner.id] === true && (
                    <label className={answer?.bankruptcy_timing && answer.bankruptcy_timing !== "none" ? "eligibilityQuestion complete eligibilityFollowup" : "eligibilityQuestion invalid eligibilityFollowup"}>
                      <div><b>When was the most recent bankruptcy?</b><span>The timing can affect each program differently.</span></div>
                      <select className="field" value={answer?.bankruptcy_timing === "none" ? "" : answer?.bankruptcy_timing ?? ""} onChange={(event) => updateOwner(owner.id, { bankruptcy_timing: event.target.value as OwnerAnswers["bankruptcy_timing"] })}>
                        <option value="">Select timing</option><option value="within_3_years">Within 3 years</option><option value="4_to_7_years">4-7 years ago</option><option value="more_than_7_years">More than 7 years ago</option>
                      </select>
                    </label>
                  )}
                  <div className={typeof felonyHistory[owner.id] === "boolean" ? "eligibilityQuestion complete" : "eligibilityQuestion invalid"}>
                    <div><b>Does this owner have a felony conviction?</b><span>Select Yes or No. Timing is requested only when needed.</span></div>
                    <YesNo
                      label="Felony history"
                      value={felonyHistory[owner.id]}
                      onChange={(value) => {
                        setFelonyHistory((state) => ({ ...state, [owner.id]: value }));
                        updateOwner(owner.id, { felony_timing: value ? undefined : "none" });
                      }}
                    />
                  </div>
                  {felonyHistory[owner.id] === true && (
                    <label className={answer?.felony_timing && answer.felony_timing !== "none" ? "eligibilityQuestion complete eligibilityFollowup" : "eligibilityQuestion invalid eligibilityFollowup"}>
                      <div><b>When was the most recent felony conviction?</b><span>The timing can affect each program differently.</span></div>
                      <select className="field" value={answer?.felony_timing === "none" ? "" : answer?.felony_timing ?? ""} onChange={(event) => updateOwner(owner.id, { felony_timing: event.target.value as OwnerAnswers["felony_timing"] })}>
                        <option value="">Select timing</option><option value="within_10_years">Within 10 years</option><option value="more_than_10_years">More than 10 years ago</option>
                      </select>
                    </label>
                  )}
                </>
              )}

              {onBusiness && (
                <>
                  <div className="eligibilityOwnerHead"><div><span className="eyebrow">File-level questions</span><h3>Business model and use of funds</h3></div><ShieldCheck size={22} /></div>
                  {FILE_QUESTION_GROUPS.map((group) => (
                    <section className="eligibilityQuestionGroup" key={group.title}>
                      <h4>{group.title}</h4>
                      {group.questions.filter(({ showWhen }) => !showWhen || showWhen(fileAnswers)).map(({ key, title, help }) => (
                        <div key={key} className={typeof fileAnswers[key] === "boolean" ? "eligibilityQuestion complete" : "eligibilityQuestion invalid"}>
                          <div><b>{title}</b><span>{help}</span></div>
                          <YesNo label={title} value={fileAnswers[key]} onChange={(value) => setFileAnswers((state) => ({ ...state, [key]: value }))} />
                        </div>
                      ))}
                    </section>
                  ))}
                </>
              )}
              {error && <div className="warnline">{error}</div>}
            </>
          ) : (
            <div className="eligibilitySummary">
              <span className="eyebrow">Versioned preliminary result</span>
              <h3>{latest?.routing_result?.headline || "Screen complete"}</h3>
              <p className="sub">The rules below are lender-neutral. Exact NAICS matches and borrower-safe reasons are retained in the audit snapshot.</p>
              <div className="eligibilityPrograms">
                {programs.map((program) => (
                  <article key={program.program_key}>
                    <div><b>{program.name}</b><span className={`cellchip ${program.status === "recommended" ? "c-ok" : program.status === "blocked" ? "c-bad" : "c-warn"}`}>{program.status}</span></div>
                    {program.borrower_safe_reasons.map((reason) => <p key={reason}>• {reason}</p>)}
                    {program.unresolved.map((reason) => <p key={reason}>• {reason}</p>)}
                    {program.matched_rules.length > 0 && <small className="sub">{program.matched_rules.map((rule) => rule.rule_id).join(" · ")}</small>}
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="eligibilityFooter">
          {!showSummary ? (
            <>
              <button type="button" className="btn" disabled={stage === 0} onClick={() => setStage((current) => Math.max(0, current - 1))}><ChevronLeft size={16} /> Previous</button>
              <span className="sp" />
              <button type="button" className="btn pri" disabled={save.isPending} onClick={() => void next()}>{save.isPending ? "Saving…" : onBusiness ? "Review result" : "Save and continue"} <ChevronRight size={16} /></button>
            </>
          ) : (
            <>
              <button type="button" className="btn" onClick={() => { setShowSummary(false); setStage(0); }}>Review answers</button>
              <span className="sp" />
              {continueAfterComplete ? <button type="button" className="btn pri" onClick={onContinue}>Continue to Step 2 <ChevronRight size={16} /></button> : <button type="button" className="btn pri" onClick={onClose}>Done</button>}
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
