"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { api } from "@/lib/api";

export type EligibilityOwner = {
  id: string;
  full_name: string;
  ownership_pct: number | null;
  credit_required: boolean;
};

type OwnerAnswers = {
  citizen_or_lpr?: boolean;
  credit_660_or_higher?: boolean;
  bankruptcy_timing?: "none" | "within_3_years" | "4_to_7_years" | "more_than_7_years";
  foreclosure_within_3_years?: boolean;
  felony_timing?: "none" | "within_10_years" | "more_than_10_years";
};

export type PreScreen = {
  rules_version: string;
  file_answers: { refinance_debt?: boolean };
  owner_answers: Record<string, OwnerAnswers>;
  required_owner_ids: string[];
  completed_owner_ids: string[];
  incomplete_owner_ids: string[];
  complete: boolean;
  blockers: string[];
  routing_result: {
    verification: string;
    headline: string;
    next_action: string;
    client_requested_amount: number;
    programs: Array<{ program_key: string; name: string; eligible: boolean; blocked_by: string[] }>;
  } | null;
};

function ownerComplete(answer: OwnerAnswers | undefined): boolean {
  return Boolean(
    typeof answer?.citizen_or_lpr === "boolean"
      && typeof answer?.credit_660_or_higher === "boolean"
      && answer?.bankruptcy_timing
      && typeof answer?.foreclosure_within_3_years === "boolean"
      && answer?.felony_timing,
  );
}

function YesNo({ value, onChange }: { value: boolean | undefined; onChange: (value: boolean) => void }) {
  return (
    <div className="eligibilityYesNo" role="group">
      <button type="button" className={value === true ? "selected" : ""} onClick={() => onChange(true)}>Yes</button>
      <button type="button" className={value === false ? "selected" : ""} onClick={() => onChange(false)}>No</button>
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
  const [ownerIndex, setOwnerIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, OwnerAnswers>>({});
  const [refinanceDebt, setRefinanceDebt] = useState<boolean | undefined>();
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
    setRefinanceDebt(query.data.file_answers?.refinance_debt);
    const preferred = initialOwnerId
      ? requiredOwners.findIndex((owner) => owner.id === initialOwnerId)
      : requiredOwners.findIndex((owner) => !query.data?.completed_owner_ids.includes(owner.id));
    setOwnerIndex(preferred >= 0 ? preferred : 0);
    setShowSummary(Boolean(query.data.complete && continueAfterComplete));
    setError("");
  }, [continueAfterComplete, initialOwnerId, open, query.data, requiredOwners]);

  const save = useMutation({
    mutationFn: async ({ ownerId, ownerAnswer }: { ownerId?: string; ownerAnswer?: OwnerAnswers }) =>
      api<PreScreen>(`/dealer-os/dealers/${dealerId}/pre-screen`, {
        method: "PATCH",
        authToken: (await getToken()) ?? undefined,
        body: JSON.stringify({
          refinance_debt: refinanceDebt,
          owner_id: ownerId,
          owner_answers: ownerAnswer,
        }),
      }),
    onSuccess: (data) => {
      qc.setQueryData(["application-pre-screen", dealerId], data);
      void qc.invalidateQueries({ queryKey: ["decision", dealerId] });
    },
  });

  if (!open) return null;
  const owner = requiredOwners[ownerIndex];
  const answer = owner ? (answers[owner.id] ?? {}) : undefined;
  const canSaveOwner = Boolean(owner && ownerComplete(answer) && typeof refinanceDebt === "boolean");

  const update = <K extends keyof OwnerAnswers>(key: K, value: OwnerAnswers[K]) => {
    if (!owner) return;
    setAnswers((state) => ({ ...state, [owner.id]: { ...(state[owner.id] ?? {}), [key]: value } }));
    setError("");
  };

  const next = async () => {
    if (!owner || !canSaveOwner) {
      setError("Answer every highlighted eligibility question before continuing.");
      return;
    }
    const saved = await save.mutateAsync({ ownerId: owner.id, ownerAnswer: answer });
    if (ownerIndex < requiredOwners.length - 1) {
      setOwnerIndex((index) => index + 1);
      return;
    }
    if (saved.complete) setShowSummary(true);
    else setError(saved.blockers.join(" "));
  };

  const latest = (qc.getQueryData<PreScreen>(["application-pre-screen", dealerId]) ?? query.data);

  return (
    <div className="modalOverlay eligibilityOverlay" role="presentation">
      <section className="modalDialog eligibilityDialog" role="dialog" aria-modal="true" aria-labelledby="eligibility-title">
        <header className="modalHead">
          <div>
            <span className="eyebrow">Step 1 eligibility checkpoint</span>
            <b id="eligibility-title">Self-reported program screen</b>
          </div>
          <span className="sp" />
          <button type="button" className="modalClose" onClick={onClose} aria-label="Close eligibility checkpoint"><X size={18} /></button>
        </header>
        <div className="modalBody eligibilityBody">
          {!showSummary ? (
            <>
              <div className="eligibilityProgress">
                {requiredOwners.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    className={index === ownerIndex ? "active" : ownerComplete(answers[item.id]) ? "complete" : ""}
                    onClick={() => setOwnerIndex(index)}
                    title={item.full_name}
                  >
                    {ownerComplete(answers[item.id]) ? <Check size={14} /> : index + 1}
                  </button>
                ))}
              </div>

              {owner && (
                <div className="eligibilityOwnerHead">
                  <div>
                    <span className="eyebrow">Owner {ownerIndex + 1} of {requiredOwners.length}</span>
                    <h3>{owner.full_name}</h3>
                  </div>
                  <span className="cellchip c-warn">{Number(owner.ownership_pct ?? 0).toFixed(2)}% owner</span>
                </div>
              )}

              <div className="eligibilityQuestions">
                <div className={typeof refinanceDebt === "boolean" ? "eligibilityQuestion complete" : "eligibilityQuestion invalid"}>
                  <div><b>Will any portion of the funds refinance debt?</b><span>Yes routes the preliminary fit to EZ Term because MicroCap is working-capital only.</span></div>
                  <YesNo value={refinanceDebt} onChange={setRefinanceDebt} />
                </div>
                <div className={typeof answer?.citizen_or_lpr === "boolean" ? "eligibilityQuestion complete" : "eligibilityQuestion invalid"}>
                  <div><b>U.S. citizen or legal permanent resident?</b><span>Required for the two direct programs in this preliminary screen.</span></div>
                  <YesNo value={answer?.citizen_or_lpr} onChange={(value) => update("citizen_or_lpr", value)} />
                </div>
                <div className={typeof answer?.credit_660_or_higher === "boolean" ? "eligibilityQuestion complete" : "eligibilityQuestion invalid"}>
                  <div><b>Self-reported credit at least 660?</b><span>This is unverified and will be recalculated after the owner completes iSoftPull.</span></div>
                  <YesNo value={answer?.credit_660_or_higher} onChange={(value) => update("credit_660_or_higher", value)} />
                </div>
                <label className={answer?.bankruptcy_timing ? "eligibilityQuestion complete" : "eligibilityQuestion invalid"}>
                  <div><b>Bankruptcy timing</b><span>Select the most recent filing for this guarantor.</span></div>
                  <select className="field" value={answer?.bankruptcy_timing ?? ""} onChange={(event) => update("bankruptcy_timing", event.target.value as OwnerAnswers["bankruptcy_timing"])}>
                    <option value="">Select</option><option value="none">None</option><option value="within_3_years">Within 3 years</option><option value="4_to_7_years">4-7 years ago</option><option value="more_than_7_years">More than 7 years ago</option>
                  </select>
                </label>
                <div className={typeof answer?.foreclosure_within_3_years === "boolean" ? "eligibilityQuestion complete" : "eligibilityQuestion invalid"}>
                  <div><b>Foreclosure within the past 3 years?</b><span>This affects MicroCap preliminary fit.</span></div>
                  <YesNo value={answer?.foreclosure_within_3_years} onChange={(value) => update("foreclosure_within_3_years", value)} />
                </div>
                <label className={answer?.felony_timing ? "eligibilityQuestion complete" : "eligibilityQuestion invalid"}>
                  <div><b>Felony conviction timing</b><span>Select the most recent conviction, if any.</span></div>
                  <select className="field" value={answer?.felony_timing ?? ""} onChange={(event) => update("felony_timing", event.target.value as OwnerAnswers["felony_timing"])}>
                    <option value="">Select</option><option value="none">None</option><option value="within_10_years">Within 10 years</option><option value="more_than_10_years">More than 10 years ago</option>
                  </select>
                </label>
              </div>
              {error && <div className="validationBanner" role="alert">{error}</div>}
            </>
          ) : (
            <div className="eligibilityResult">
              <span className="eyebrow">Preliminary routing result</span>
              <h2>{latest?.routing_result?.headline ?? "Eligibility recorded"}</h2>
              <p>Self-reported and unverified. Credit and bank evidence will recalculate fit without replacing this snapshot.</p>
              <div className="eligibilityPrograms">
                {(latest?.routing_result?.programs ?? []).map((program) => (
                  <article key={program.program_key} className={program.eligible ? "eligible" : "blocked"}>
                    <div><b>{program.name}</b><span className={`cellchip ${program.eligible ? "c-ok" : "c-bad"}`}>{program.eligible ? "Preliminary fit" : "Blocked"}</span></div>
                    {!program.eligible && program.blocked_by.map((reason) => <p key={reason}>{reason}</p>)}
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
        <footer className="eligibilityFooter">
          {!showSummary ? (
            <>
              <button type="button" className="btn" disabled={ownerIndex === 0} onClick={() => setOwnerIndex((index) => Math.max(0, index - 1))}><ChevronLeft size={16} /> Previous owner</button>
              <span className="sp" />
              <button type="button" className="btn pri" disabled={save.isPending} onClick={() => void next()}>{save.isPending ? "Saving..." : ownerIndex === requiredOwners.length - 1 ? "Review result" : "Save and next owner"} <ChevronRight size={16} /></button>
            </>
          ) : (
            <>
              <button type="button" className="btn" onClick={() => { setShowSummary(false); setOwnerIndex(0); }}>Review answers</button>
              <span className="sp" />
              {continueAfterComplete ? <button type="button" className="btn pri" onClick={onContinue}>Continue to Step 2 <ChevronRight size={16} /></button> : <button type="button" className="btn pri" onClick={onClose}>Done</button>}
            </>
          )}
        </footer>
      </section>
    </div>
  );
}

