"use client";

import { useId, useRef } from "react";
import { Building2, CarFront, Landmark } from "lucide-react";
import { LEAD_TYPES, type LeadType } from "@/lib/leadTypes";

const ICONS = {
  dealer: CarFront,
  main_street: Building2,
  real_estate: Landmark,
} as const;

export default function LeadTypePicker({
  value,
  onChange,
  disabled = false,
  label = "What type of business is this?",
  compact = false,
}: {
  value: LeadType | null;
  onChange: (value: LeadType) => void;
  disabled?: boolean;
  label?: string;
  compact?: boolean;
}) {
  const options = useRef<Array<HTMLButtonElement | null>>([]);
  const helpId = useId();
  const moveSelection = (currentIndex: number, direction: -1 | 1) => {
    const nextIndex = (currentIndex + direction + LEAD_TYPES.length) % LEAD_TYPES.length;
    const next = LEAD_TYPES[nextIndex];
    onChange(next.key);
    options.current[nextIndex]?.focus();
  };
  return <fieldset className={`leadTypePicker${compact ? " compact" : ""}`} disabled={disabled} aria-describedby={helpId}>
    <legend>{label} <span aria-hidden="true">*</span></legend>
    <p id={helpId}>Business type controls the email language, approved products, website, attachments, and intake route. The funding need is selected separately.</p>
    <div className="leadTypeCards" role="radiogroup" aria-label={label} aria-required="true">
      {LEAD_TYPES.map((definition, index) => {
        const Icon = ICONS[definition.key];
        const selected = value === definition.key;
        return <button
          key={definition.key}
          type="button"
          role="radio"
          aria-checked={selected}
          tabIndex={selected || (!value && index === 0) ? 0 : -1}
          ref={(node) => { options.current[index] = node; }}
          className={`leadTypeCard tone-${definition.tone}${selected ? " selected" : ""}`}
          onClick={() => onChange(definition.key)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowDown") {
              event.preventDefault();
              moveSelection(index, 1);
            } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
              event.preventDefault();
              moveSelection(index, -1);
            }
          }}
        >
          <span className="leadTypeIcon"><Icon size={21} /></span>
          <span><b>{definition.label}</b><small>{definition.description}</small></span>
          <span className="leadTypeCheck" aria-hidden="true">{selected ? "✓" : ""}</span>
        </button>;
      })}
    </div>
  </fieldset>;
}
