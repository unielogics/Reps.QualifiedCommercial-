// MIRROR: keep identical to QCRep/src/production-package/*
import type { ReactNode } from "react";
import { stepsFor } from "./schema";
import { IconFlag, IconLock } from "./icons";
import { PBtn, PChip } from "./ui";
import type { AttentionItem, ProductionPackage, StepKey } from "./types";

/** "Stage one — commitment" / "Final — out for signature" … */
export function stageEyebrow(pkg: ProductionPackage): string {
  const head = pkg.stage === 2 ? "Final" : "Stage one";
  const tail = pkg.status === "executed" ? "executed" : pkg.status === "out_for_signature" ? "out for signature" : pkg.status === "void" ? "voided"
    : pkg.stage === 2 ? "activation draft" : "commitment";
  return `${head} — ${tail}`;
}

export function PackageTopBar({ pkg, step, attention, saving, dirty, busy, onStep, onPresentation, onPreview, onSend, right }: {
  pkg: ProductionPackage; step: StepKey; attention: AttentionItem[]; saving: boolean; dirty: boolean; busy: string | null;
  onStep: (s: StepKey) => void; onPresentation: () => void; onPreview: () => void; onSend: () => void; right?: ReactNode;
}) {
  const steps = stepsFor(pkg.stage);
  const counts = attention.reduce<Record<string, number>>((acc, a) => { acc[a.step] = (acc[a.step] ?? 0) + 1; return acc; }, {});
  const status = pkg.status;
  const two = pkg.stage === 2;
  const sendLabel = status === "draft" ? (two ? "Send the final" : "Request signature") : status === "out_for_signature" ? "Signatures" : status === "executed" ? "Executed" : "Voided";
  return (
    <div className="pp-top">
      <div className="pp-top-l">
        <div className="pp-eyebrow">{stageEyebrow(pkg)}</div>
        <div className="pp-top-name">{pkg.business_name}</div>
        <div className="pp-top-meta">
          {status !== "draft" ? <PChip tone={status === "executed" ? "ok" : status === "void" ? "mut" : "warn"}><IconLock />{status === "executed" ? "Executed" : status === "void" ? "Voided" : pkg.execution_pending ? "Signed · bundle pending" : "Locked · sent for signature"}</PChip> : null}
          {two ? <PChip tone="gold" title={pkg.original ? `Drafted from the executed commitment (R${pkg.original.revision_no})` : undefined}>Program Activation and Production Agreement</PChip> : null}
          {pkg.access_via === "share_link" ? <PChip tone="acc">Shared link</PChip> : null}
          {pkg.mode === "partner" ? <PChip tone="acc">Your lead</PChip> : null}
          {!two && pkg.final_package_id ? <PChip tone={pkg.final_status === "executed" ? "ok" : "acc"}>Final · {pkg.final_status === "out_for_signature" ? "out for signature" : pkg.final_status ?? "drafted"}</PChip> : null}
          <span className="pp-save">{saving ? "Saving…" : dirty ? "Unsaved" : "Saved"}</span>
        </div>
      </div>
      <nav className="pp-steps" aria-label="Steps">
        {steps.map((s, i) => (
          <button key={s.key} type="button" className={`pp-stepchip${step === s.key ? " on" : ""}${counts[s.key] ? " flagged" : ""}`} onClick={() => onStep(s.key)} aria-current={step === s.key ? "step" : undefined}>
            <span className="pp-stepn">{i + 1}</span>
            <span className="pp-stepl">{s.label}</span>
            {counts[s.key] ? <span className="pp-flag" title={`${counts[s.key]} open`}><IconFlag />{counts[s.key]}</span> : null}
          </button>
        ))}
      </nav>
      <div className="pp-top-r">
        {right}
        {!two ? (
          <PBtn onClick={onPresentation} busy={busy === "presentation"} disabled={!pkg.capabilities.can_generate} title={pkg.presentation.stale ? "The last PDF is out of date" : undefined}>
            Presentation PDF{pkg.presentation.stale ? " ·" : ""}
          </PBtn>
        ) : null}
        <PBtn onClick={onPreview}>{two ? "Original vs final" : "Preview contract"}</PBtn>
        <PBtn variant="pri" onClick={onSend} disabled={status === "void"} title={status === "draft" && attention.length ? `${attention.length} open item${attention.length === 1 ? "" : "s"}` : undefined}>
          {sendLabel}
        </PBtn>
      </div>
    </div>
  );
}
