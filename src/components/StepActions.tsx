"use client";

export default function StepActions({
  ready,
  message,
  buttonLabel,
  onContinue,
  pending = false,
}: {
  ready: boolean;
  message: string;
  buttonLabel: string;
  onContinue: () => void;
  pending?: boolean;
}) {
  return (
    <div className={`step-actions${ready ? "" : " invalid"}`}>
      <span className="step-message">{message}</span>
      <button
        type="button"
        className="btn pri"
        disabled={!ready || pending}
        onClick={onContinue}
      >
        {pending ? "Saving…" : buttonLabel}
      </button>
    </div>
  );
}
