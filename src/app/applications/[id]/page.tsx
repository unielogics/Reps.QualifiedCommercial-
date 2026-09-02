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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, X } from "lucide-react";
import { useCase } from "@/lib/useCase";
import { api } from "@/lib/api";
import { type SubmissionReadiness } from "@/lib/applicationReadiness";
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

function ratio(value: unknown): string {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? `${parsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×` : "—";
}

export default function ApplicationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const { getToken } = useAuth();
  const { id: meId, isSuperAdmin } = useMe();
  const { dealer, decision, verification, workflow, unlocked, isLoading, notFound } = useCase(id);
    const queryClient = useQueryClient();
  // A booking opens the file as a draft; promoting it makes it an active
  // application in place (nothing is copied).
  const promote = useMutation({
    mutationFn: async () => api(`/dealer-os/dealers/${id}/promote-draft`, { method: "POST", authToken: (await getToken()) ?? undefined }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["dealer", id] }); await queryClient.invalidateQueries({ queryKey: ["dealers"] }); },
  });
  const workflowUngated = Boolean(dealer?.workflow_ungated);

  const raw = Number(search.get("step") || "1");
  const readiness = useQuery({
    queryKey: ["submission-readiness", id],
    enabled: unlocked || workflowUngated,
    queryFn: async () => api<SubmissionReadiness>(`/dealer-os/dealers/${id}/submission-readiness`, {
      authToken: (await getToken()) ?? undefined,
    }),
  });
  const reviewPreferences = useQuery({
    queryKey: ["underwriting-review-preferences", id],
    enabled: unlocked || workflowUngated,
    queryFn: async () => api<UnderwritingReviewPreference[]>(
      `/dealer-os/dealers/${id}/underwriting-review-preferences`,
      { authToken: (await getToken()) ?? undefined },
    ),
  });
  const contractEnvelopes = useQuery({
    queryKey: ["contract-envelopes", id],
    enabled: unlocked || workflowUngated,
    queryFn: async () => api<Array<{ status: string }>>(
      `/dealer-os/dealers/${id}/contract-envelopes`,
      { authToken: (await getToken()) ?? undefined },
    ),
    refetchInterval: 15_000,
  });
  // Clamp rather than trust: a hand-typed ?step=9 should land on the sequence,
  // and ?step=4 on a locked file should land on the step that is actually next.
  const step = Number.isFinite(raw) && raw >= 1 && raw <= 5 ? raw : 1;
  const packageReady = Boolean(readiness.data?.package_ready);
  const applicationExecuted = Boolean(contractEnvelopes.data?.some(
    (envelope) => envelope.status === "executed",
  ));
  const reviewTimesReady = Boolean(activeUnderwritingReviewPreference(reviewPreferences.data));
  const availableSteps = [1, 2, 3, 4].filter((number) => (
    number === 1 || workflow[`step_${number}` as "step_1" | "step_2" | "step_3" | "step_4"].available
  ));
  const latestAvailable = availableSteps.at(-1) ?? 1;
  const effective = step === 5
    ? (isSuperAdmin ? 5 : latestAvailable)
    : workflowUngated || workflow[`step_${step}` as "step_1" | "step_2" | "step_3" | "step_4"].available
      ? step
      : Math.min(step, latestAvailable);

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

  useEffect(() => {
    const targetId = decodeURIComponent(window.location.hash.slice(1));
    if (!targetId) return;
    const timer = window.setTimeout(() => {
      const target = document.getElementById(targetId);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.focus({ preventScroll: true });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [effective]);

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
          {dealer?.application_lifecycle === "draft" && <span className="cellchip c-mut" style={{ marginLeft: 8 }}>{dealer.draft_source === "booking" ? "Draft · booked" : "Draft"}</span>}
        </div>
        <span className="sp" />
        {dealer?.application_lifecycle === "draft" && (
          <button type="button" className="btn sm" disabled={promote.isPending} onClick={() => { if (window.confirm("Make this draft an active application? Everything on the file stays as it is.")) promote.mutate(); }} title="Promote this draft to an active application">
            {promote.isPending ? "Promoting..." : "Promote to application"}
          </button>
        )}
        <button type="button" className="iconAction" onClick={() => router.push("/")} title="Minimize" aria-label="Minimize application">
          <Minus size={18} />
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
          <X size={18} />
        </button>
      </div>
      <div className="cg">
      <div className="s3">
        <StepRail
          step={effective}
          workflow={workflow}
          reviewTimesReady={reviewTimesReady}
          packageReady={packageReady}
          applicationExecuted={applicationExecuted}
          canOpenStep5={isSuperAdmin}
          workflowUngated={workflowUngated}
          gateLabel={workflowUngated ? "Ungated by super admin" : "Readiness enforced"}
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
                {money(decision.financial?.indicative_capacity)}
              </div>
              {decision.financial?.capacity_path && <span className="sub">Typical · {decision.financial.capacity_path}</span>}
              {decision.goal_feasible !== null && (
                <span className={`cellchip ${decision.goal_feasible ? "c-ok" : "c-warn"}`}>
                  {decision.goal_feasible ? "Within requested amount" : "Above what the file supports"}
                </span>
              )}
              <div className="kv mt" title={decision.financial?.sources?.credit_quality?.evidence ?? undefined}>
                <span>Credit band</span>
                <b>{decision.financial?.credit_quality_tier ? `${decision.financial.credit_quality_tier} · ${decision.financial.credit_score_band ?? "range unavailable"}` : "—"}</b>
              </div>
              <div className="kv" title={decision.financial?.sources?.dscr?.evidence ?? undefined}>
                <span>Coverage (DSCR)</span>
                <b className="num">{ratio(decision.financial?.dscr)}</b>
              </div>
              <div className="kv" title={decision.financial?.sources?.avg_daily_balance?.evidence ?? undefined}>
                <span>Avg daily balance</span>
                <b className="num">{money(decision.financial?.avg_daily_balance)}</b>
              </div>
              <div className="kv" title={decision.financial?.sources?.negative_balance_days_90?.evidence ?? undefined}>
                <span>Negative days / 90</span>
                <b className="num">{decision.financial?.negative_balance_days_90 ?? "—"}</b>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="s6" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
