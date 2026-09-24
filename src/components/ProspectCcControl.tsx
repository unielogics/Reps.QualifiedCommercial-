"use client";

import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";

const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export default function ProspectCcControl({
  value,
  onChange,
  primaryEmail,
  disabled = false,
  onValidityChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  primaryEmail?: string | null;
  disabled?: boolean;
  onValidityChange?: (valid: boolean) => void;
}) {
  const errorId = useId();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pendingEmail = normalizeEmail(input);
  const pendingIsValid = !pendingEmail || (
    SIMPLE_EMAIL.test(pendingEmail)
    && pendingEmail !== normalizeEmail(primaryEmail ?? "")
    && !value.map(normalizeEmail).includes(pendingEmail)
    && value.length < 10
  );

  useEffect(() => {
    onValidityChange?.(!error && pendingIsValid);
  }, [error, onValidityChange, pendingIsValid]);

  const commit = (raw: string) => {
    const candidates = raw.split(/[,;\n]+/).map(normalizeEmail).filter(Boolean);
    if (!candidates.length) {
      setInput("");
      setError(null);
      return;
    }
    const invalid = candidates.find((email) => !SIMPLE_EMAIL.test(email));
    if (invalid) {
      setError(`Enter a valid email address: ${invalid}`);
      return;
    }
    const primary = normalizeEmail(primaryEmail ?? "");
    if (primary && candidates.includes(primary)) {
      setError("The primary recipient cannot also be copied.");
      return;
    }
    const next = Array.from(new Set([...value.map(normalizeEmail), ...candidates]));
    if (next.length > 10) {
      setError("You can copy up to 10 people on one email.");
      return;
    }
    onChange(next);
    setInput("");
    setError(null);
  };

  const remove = (email: string) => {
    onChange(value.filter((item) => normalizeEmail(item) !== normalizeEmail(email)));
    setError(null);
  };

  return <div className="prospectCcControl">
    <span className="lbl">CC recipients <small>optional</small></span>
    <div className={`prospectCcInput${error ? " invalid" : ""}`}>
      {value.map((email) => <span className="prospectCcChip" key={email}>{email}<button type="button" aria-label={`Remove ${email}`} disabled={disabled} onClick={() => remove(email)}><X size={13} /></button></span>)}
      <input
        type="email"
        inputMode="email"
        autoCapitalize="none"
        autoComplete="off"
        disabled={disabled || value.length >= 10}
        value={input}
        onChange={(event) => { setInput(event.target.value); if (error) setError(null); }}
        onBlur={() => { if (input.trim()) commit(input); }}
        onKeyDown={(event) => {
          if (["Enter", ",", ";"].includes(event.key)) {
            event.preventDefault();
            if (input.trim()) commit(input);
          } else if (event.key === "Backspace" && !input && value.length) {
            remove(value[value.length - 1]);
          }
        }}
        onPaste={(event) => {
          const pasted = event.clipboardData.getData("text");
          if (!/[,;\n]/.test(pasted)) return;
          event.preventDefault();
          commit(`${input}${input ? "," : ""}${pasted}`);
        }}
        placeholder={value.length ? "Add another email" : "name@example.com"}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
      />
    </div>
    <small className="prospectFieldHelp">Separate multiple addresses with commas. Exact recipients are checked again before delivery.</small>
    {error && <small id={errorId} className="prospectCcError" role="alert">{error}</small>}
  </div>;
}
