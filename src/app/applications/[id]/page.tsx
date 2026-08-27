"use client";

// The application, step by step.
//
// Three columns: the sequence on the left so a rep always knows where the file
// stands, the current step in the middle, and the desk conversation on the
// right so answering the underwriter never means leaving the step.
//
// Production progression remains gated by server readiness. A temporary,
// super-admin-only review switch can expose every screen for workflow QA while
// leaving delivery, signing, decision, and funding validations intact.

import { useCallback, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { useCase } from "@/lib/useCase";
import { api } from "@/lib/api";
import { type SubmissionReadiness } from "@/lib/applicationReadiness";
import { APPLICATION_STEP_REVIEW_MODE } from "@/lib/applicationReviewMode";
import {
  activeUnderwritingReviewPreference,
  type UnderwritingReviewPreference,
} from "@/lib/underwritingReview";
import { removeWorkspaceTab, upsertWorkspaceTab } from "@/lib/applicationWorkspace";
import StepRail from "@/components/StepRail";
import Conversation from "@/components/Conversation";
import Meetings from "@/components/Meetings";
import { useMe } from "@/lib/useMe";
import Step1Intake from "./Step1Intake";
import Step2Verification from "./Step2Verification";
import Step3Profile from "./Step3Profile";
import Step4Application from "./Step4Application";
import Step5Contracts from "./Step5Contracts";

function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1000) return "$" + Math.round(n / 1000) + "k";
  return "$" + Math.round(n).toLocaleString();
}

export default function ApplicationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const { getToken } = useAuth();
  const { id: meId, isSuperAdmin } = useMe();
  const { dealer, decision, verification, unlocked, isLoading, notFound } = useCase(id);
  const reviewMode = APPLICATION_STEP_REVIEW_MODE && isSuperAdmin;

  const raw = Number(search.get("step") || "1");
  const readiness = useQuery({
    queryKey: ["submission-readiness", id],
    enabled: unlocked || reviewMode,
    queryFn: async () => api<SubmissionReadiness>(`/dealer-os/dealers/${id}/submission-readiness`, {
      authToken: (await getToken()) ?? undefined,
    }),
  });
  const reviewPreferences = useQuery({
    queryKey: ["underwriting-review-preferences", id],
    enabled: unlocked || reviewMode,
    queryFn: async () => api<UnderwritingReviewPreference[]>(
      `/dealer-os/dealers/${id}/underwriting-review-preferences`,
      { authToken: (await getToken()) ?? undefined },
    ),
  });
  const contractEnvelopes = useQuery({
    queryKey: ["contract-envelopes", id],
    enabled: unlocked || reviewMode,
    queryFn: async () => api<Array<{ status: string }>>(
      `/dealer-os/dealers/${id}/contract-envelopes`,
      { authToken: (await getToken()) ?? undefined },
    ),
    refetchInterval: 15_000,
  });
  // Clamp rather than trust: a hand-typed ?step=9 should land on the sequence,
  // and ?step=4 on a locked file should land on the step that is actually next.
  const step = Number.isFinite(raw) && raw >= 1 && raw <= 5 ? raw : 1;
  const intakeReady = Boolean(
    dealer?.name
      && dealer?.entity_type
      && dealer?.funding_goal
      && dealer?.funding_purpose
      && dealer?.use_of_proceeds_note?.trim()
      && dealer?.industry_entry_id
      && dealer?.subindustry_entry_id
      && dealer?.activity_entry_id
      && dealer?.naics_code
      && verification.ownership_complete
      && verification.owner_contact_complete
      && verification.required_credit_owner_count > 0
      && verification.pre_screen_complete,
  );
  const packageReady = Boolean(readiness.data?.package_ready);
  const applicationExecuted = Boolean(contractEnvelopes.data?.some(
    (envelope) => envelope.status === "executed",
  ));
  const reviewTimesReady = Boolean(activeUnderwritingReviewPreference(reviewPreferences.data));
  const effective = reviewMode
    ? (step === 5 && !isSuperAdmin ? 4 : step)
    : step >= 2 && !intakeReady
      ? 1
      : step === 5 && !isSuperAdmin
        ? 4
        : step;

  const go = useCallback(
    (n: number) => router.push(`/applications/${id}?step=${n}`, { scroll: false }),
    [router, id],
  );

  useEffect(() => {
    if (!meId || !dealer?.name) return;
    upsertWorkspaceTab(meId, {
      id,
      name: dealer.name,
      href: `/applications/${id}?step=${effective}`,
    });
  }, [dealer?.name, effective, id, meId]);

  if (notFound) {
    return (
      <div className="card">
        <b>Not your file</b>
        <p className="sub mt">
          This application either does not exist or belongs to another rep.{" "}
          <a href="/">Back to the portfolio</a>.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="applicationToolbar">
        <div>
          <b>{dealer?.name || "Application"}</b>
          {dealer?.case_ref && <span className="sub num">{dealer.case_ref}</span>}
        </div>
        <span className="sp" />
        <button type="button" className="iconAction" onClick={() => router.push("/")} title="Minimize" aria-label="Minimize application">
          −
        </button>
        <button
          type="button"
          className="iconAction"
          onClick={() => {
            if (meId) removeWorkspaceTab(meId, id);
            router.push("/");
          }}
          title="Close"
          aria-label="Close application"
        >
          ×
        </button>
      </div>
      <div className="cg">
      <div className="s3">
        <StepRail
          step={effective}
          unlocked={unlocked}
          intakeReady={intakeReady}
          reviewTimesReady={reviewTimesReady}
          packageReady={packageReady}
          applicationExecuted={applicationExecuted}
          canOpenStep5={isSuperAdmin}
          reviewMode={reviewMode}
          gateLabel={reviewMode
            ? "Temporary review mode · progression gates paused"
            : unlocked ? "Unlocked by verification" : "Locked until verification returns"}
          onGo={go}
        />

        {/* Only once the numbers are real. Showing an indicative capacity built
            on a rep's typed revenue is the exact failure the gate exists to
            prevent. */}
        {unlocked && decision && (
          <div className="panel mt">
            <div className="panel-h">
              <span className="lbl">Decision posture</span>
            </div>
            <div className="panel-b">
              <span className="lbl">Indicative capacity</span>
              <div className="big num">
                {decision.best_path ? money(dealer?.funding_goal) : "—"}
              </div>
              {decision.goal_feasible !== null && (
                <span className={`cellchip ${decision.goal_feasible ? "c-ok" : "c-warn"}`}>
                  {decision.goal_feasible ? "Within requested amount" : "Above what the file supports"}
                </span>
              )}
              <div className="kv mt">
                <span>Credit band</span>
                <b className="num">—</b>
              </div>
              <div className="kv">
                <span>Coverage (DSCR)</span>
                <b className="num">—</b>
              </div>
              <div className="kv">
                <span>Avg daily balance</span>
                <b className="num">—</b>
              </div>
              <div className="kv">
                <span>Negative days / 90</span>
                <b className="num">—</b>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="s6" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {reviewMode && (
          <div className="note applicationReviewMode" role="status">
            <b>Temporary workflow review mode</b>
            <span>All screens are open for super-admin review. Required data, delivery, signing, decision, and funding safeguards remain active. Step 5 is still super-admin only.</span>
          </div>
        )}
        {isLoading && <div className="panel"><div className="panel-b sub">Loading the case…</div></div>}
        {!isLoading && effective === 1 && <Step1Intake dealerId={id} />}
        {!isLoading && effective === 2 && <Step2Verification dealerId={id} />}
        {!isLoading && effective === 3 && <Step3Profile dealerId={id} />}
        {!isLoading && effective === 4 && <Step4Application dealerId={id} />}
        {!isLoading && effective === 5 && <Step5Contracts dealerId={id} />}
      </div>

      <div className="s3">
        {/* Deliberately NOT held behind the gate. The design put messages,
            notes and appointments behind verification; chasing an
            authorization is the conversation, so cutting it off would slow the
            very thing the gate measures. */}
        <Conversation dealerId={id} meId={meId} />
        <div className="mt">
          <Meetings dealerId={id} />
        </div>
      </div>
      </div>
    </>
  );
}
