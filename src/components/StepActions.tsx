"use client";

import { ChevronRight } from "lucide-react";

export type GuidedIssue = {
  label: string;
  onSelect: () => void;
};

export default function StepActions({
  ready,
  message,
  buttonLabel,
  onContinue,
  pending = false,
  actionEnabled = false,
  issues = [],
}: {
  ready: boolean;
  message: string;
  buttonLabel: string;
  onContinue: () => void;
  pending?: boolean;
  actionEnabled?: boolean;
  issues?: GuidedIssue[];
}) {
  return (
    <div className={`step-actions${ready ? "" : " invalid"}`}>
      <div className="step-action-copy">
        <span className="step-message">{message}</span>
        {!ready && issues.length > 0 && (
          <div className="guided-issues" aria-label="Items to complete">
            {issues.map((issue) => (
              <button type="button" key={issue.label} onClick={issue.onSelect}>
                <span>{issue.label}</span>
                <ChevronRight size={16} aria-hidden />
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        className="btn pri"
        disabled={(!ready && !actionEnabled) || pending}
        onClick={onContinue}
      >
        {pending ? "Saving…" : buttonLabel}
      </button>
    </div>
  );
}
