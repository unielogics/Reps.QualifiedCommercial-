// MIRROR: keep identical to QCRep/src/production-package/*
import type { ReactNode } from "react";
import { STEPS } from "./schema";
import { IconFlag, IconLock } from "./icons";
import { PBtn, PChip } from "./ui";
import type { AttentionItem, ProductionPackage, StepKey } from "./types";

export function PackageTopBar({ pkg, step, attention, saving, dirty, busy, onStep, onPresentation, onPreview, onSend, right }: {
  pkg: ProductionPackage; step: StepKey; attention: AttentionItem[]; saving: boolean; dirty: boolean; busy: string | null;
  onStep: (s: StepKey) => void; onPresentation: () => void; onPreview: () => void; onSend: () => void; right?: ReactNode;
}) {
  const counts = attention.reduce<Record<string, number>>((acc, a) => { acc[a.step] = (acc[a.step] ?? 0) + 1; return acc; }, {});
  const status = pkg.status;
  const sendLabel = status === "draft" ? "Request signature" : status === "out_for_signature" ? "Signatures" : status === "executed" ? "Executed" : "Voided";
  const stage = status === "executed" ? "Stage one — executed" : status === "out_for_signature" ? "Stage one — out for signature" : status === "void" ? "Voided" : "Stage one — commitment";
  return (
    <div className="pp-top">
      <div className="pp-top-l">
        <div className="pp-eyebrow">{stage}</div>
        <div className="pp-top-name">{pkg.business_name}</div>
        <div className="pp-top-meta">
          {status !== "draft" ? <PChip tone={status === "executed" ? "ok" : status === "void" ? "mut" : "warn"}><IconLock />{status === "executed" ? "Executed" : status === "void" ? "Voided" : "Locked · sent for signature"}</PChip> : null}
          {pkg.mode === "rep" ? <PChip tone="acc">Shared link</PChip> : null}
          <span className="pp-save">{saving ? "Saving…" : dirty ? "Unsaved" : "Saved"}</span>
        </div>
      </div>
      <nav className="pp-steps" aria-label="Steps">
        {STEPS.map((s, i) => (
          <button key={s.key} type="button" className={`pp-stepchip${step === s.key ? " on" : ""}${counts[s.key] ? " flagged" : ""}`} onClick={() => onStep(s.key)} aria-current={step === s.key ? "step" : undefined}>
            <span className="pp-stepn">{i + 1}</span>
            <span className="pp-stepl">{s.label}</span>
            {counts[s.key] ? <span className="pp-flag" title={`${counts[s.key]} open`}><IconFlag />{counts[s.key]}</span> : null}
          </button>
        ))}
      </nav>
      <div className="pp-top-r">
        {right}
        <PBtn onClick={onPresentation} busy={busy === "presentation"} disabled={!pkg.capabilities.can_generate} title={pkg.presentation.stale ? "The last PDF is out of date" : undefined}>
          Presentation PDF{pkg.presentation.stale ? " ·" : ""}
        </PBtn>
        <PBtn onClick={onPreview}>Preview contract</PBtn>
        <PBtn variant="pri" onClick={onSend} disabled={status === "void"} title={status === "draft" && attention.length ? `${attention.length} open item${attention.length === 1 ? "" : "s"}` : undefined}>
          {sendLabel}
        </PBtn>
      </div>
    </div>
  );
}
