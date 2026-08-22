"use client";

// The application, step by step.
//
// Three columns: the sequence on the left so a rep always knows where the file
// stands, the current step in the middle, and the desk conversation on the
// right so answering the underwriter never means leaving the step.
//
// Steps 3 to 5 are drawn but not reachable until both authorizations return.
// The lock is cosmetic here and real on the server: `useCase` reads
// `verification.unlocked` off the decision endpoint, and the endpoints behind
// steps 3 to 5 refuse regardless of what this component renders.

import { useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCase } from "@/lib/useCase";
import StepRail, { GATED_FROM } from "@/components/StepRail";
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
  const { id: meId } = useMe();
  const { dealer, decision, verification, unlocked, isLoading, notFound } = useCase(id);

  const raw = Number(search.get("step") || "1");
  // Clamp rather than trust: a hand-typed ?step=9 should land on the sequence,
  // and ?step=4 on a locked file should land on the step that is actually next.
  const step = Number.isFinite(raw) && raw >= 1 && raw <= 5 ? raw : 1;
  const effective = step >= GATED_FROM && !unlocked ? 2 : step;

  const go = useCallback(
    (n: number) => router.push(`/applications/${id}?step=${n}`, { scroll: false }),
    [router, id],
  );

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
    <div className="cg">
      <div className="s3">
        <StepRail
          step={effective}
          unlocked={unlocked}
          gateLabel={unlocked ? "Unlocked by verification" : "Locked until verification returns"}
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
  );
}
