// MIRROR: keep identical to QCRep/src/production-package/*
// Self-contained primitives on the shared design tokens (no app imports).
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { FIELD_BY_KEY, REQUIRED_HINT, fieldRequiredNow, isBlank, type FieldDef } from "./schema";
import { US_STATES } from "./options";
import type { Arrangement, Computed, PackageMode, ProductKey, ProductionPackage, Provenance, ThresholdKey } from "./types";
import type { Provisional } from "./compute";
import { IconCheck } from "./icons";

export type Tone = "ok" | "warn" | "bad" | "acc" | "mut" | "gold";

export type StepCtx = {
  pkg: ProductionPackage;
  draft: Arrangement;
  computed: Computed;
  prov: Provisional;
  provenance: Provenance;
  saving: boolean;
  readOnly: boolean;
  mode: PackageMode;
  focusKey: string | null;
  set: (key: string, value: unknown) => void;
  setProduct: (key: ProductKey, field: string, value: unknown) => void;
  setThreshold: (key: ThresholdKey, value: unknown) => void;
  confirm: (key: string) => void;
  go: (step: import("./types").StepKey) => void;
  notify: (message: string, tone?: Tone) => void;
  teamOptions: Array<{ id: string; name: string; email: string }>;
};

export function PPanel({ title, sub, right, tone, children, className }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <section className={`pp-panel${tone ? ` t-${tone}` : ""}${className ? ` ${className}` : ""}`}>
      <header className="pp-panel-h">
        <div><h3 className="pp-sect">{title}</h3>{sub ? <p className="pp-sub">{sub}</p> : null}</div>
        {right ? <div className="pp-panel-right">{right}</div> : null}
      </header>
      <div className="pp-panel-b">{children}</div>
    </section>
  );
}

export function PChip({ tone = "mut", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return <span className={`pp-chip c-${tone}`} title={title}>{children}</span>;
}

export function PBtn({ variant = "ghost", size = "md", onClick, disabled, children, type = "button", title, busy }: {
  variant?: "pri" | "ghost" | "danger" | "link"; size?: "sm" | "md"; onClick?: () => void; disabled?: boolean;
  children: ReactNode; type?: "button" | "submit"; title?: string; busy?: boolean;
}) {
  return (
    <button type={type} className={`pp-btn v-${variant} s-${size}${busy ? " busy" : ""}`} onClick={onClick} disabled={disabled || busy} title={title}>
      {children}
    </button>
  );
}

export function Callout({ tone = "acc", children }: { tone?: Tone; children: ReactNode }) {
  return <div className={`pp-callout t-${tone}`}>{children}</div>;
}

export function KV({ label, value, tone, big }: { label: ReactNode; value: ReactNode; tone?: Tone; big?: boolean }) {
  return (
    <div className={`pp-kv${big ? " big" : ""}`}>
      <span className="pp-lbl">{label}</span>
      <span className={`pp-val${tone ? ` c-${tone}` : ""}`}>{value}</span>
    </div>
  );
}

export function Derived({ label, value, note, tone, provisional }: { label: ReactNode; value: ReactNode; note?: ReactNode; tone?: Tone; provisional?: boolean }) {
  return (
    <div className={`pp-drv${provisional ? " provisional" : ""}${tone ? ` t-${tone}` : ""}`} title={provisional ? "Recalculating…" : undefined}>
      <span className="pp-lbl">{label}</span>
      <span className="pp-drv-v">{value}</span>
      {note ? <span className="pp-drv-n">{note}</span> : null}
    </div>
  );
}

export function Picks<K extends string>({ options, value, onChange, disabled }: { options: Array<[K, string]>; value: K; onChange: (k: K) => void; disabled?: boolean }) {
  return (
    <div className="pp-picks" role="group">
      {options.map(([k, label]) => (
        <button key={k} type="button" className={`pp-btn s-sm ${value === k ? "v-pri" : "v-ghost"}`} onClick={() => onChange(k)} disabled={disabled} aria-pressed={value === k}>{label}</button>
      ))}
    </div>
  );
}

export function MultiSelectChips({ options, value, onChange, disabled, allowOther }: { options: readonly string[]; value: string[]; onChange: (next: string[]) => void; disabled?: boolean; allowOther?: boolean }) {
  const [other, setOther] = useState("");
  const extras = value.filter((v) => !options.includes(v));
  const toggle = (opt: string) => {
    if (disabled) return;
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  };
  return (
    <div className="pp-chips">
      {options.map((opt) => (
        <button key={opt} type="button" className={`pp-chipbtn${value.includes(opt) ? " on" : ""}`} aria-pressed={value.includes(opt)} onClick={() => toggle(opt)} disabled={disabled}>
          {value.includes(opt) ? <IconCheck /> : null}{opt}
        </button>
      ))}
      {extras.map((opt) => (
        <button key={opt} type="button" className="pp-chipbtn on" onClick={() => toggle(opt)} disabled={disabled} title="Remove"><IconCheck />{opt}</button>
      ))}
      {allowOther && !disabled ? (
        <span className="pp-chip-other">
          <input className="pp-input" placeholder="Other…" value={other} onChange={(e) => setOther(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && other.trim()) { e.preventDefault(); onChange([...value, other.trim()]); setOther(""); } }} />
        </span>
      ) : null}
    </div>
  );
}

export function ComboSelect({ value, onChange, options, placeholder, disabled, id }: { value: string; onChange: (v: string) => void; options: Array<[string, string]>; placeholder?: string; disabled?: boolean; id?: string }) {
  const listId = useId();
  return (
    <>
      <input id={id} className="pp-input" list={listId} value={value} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} autoComplete="off" />
      <datalist id={listId}>{options.map(([k, label]) => <option key={k} value={k}>{label}</option>)}</datalist>
    </>
  );
}

export function ProvChip({ provenance, onConfirm, readOnly }: { provenance?: Provenance[string]; onConfirm?: () => void; readOnly?: boolean }) {
  if (!provenance) return null;
  if (provenance.confirmed) return <PChip tone="ok" title={`Confirmed · ${provenance.label}`}><IconCheck />{provenance.source === "user" ? "Edited" : provenance.label}</PChip>;
  return (
    <span className="pp-prov">
      <PChip tone="acc" title={`Prefilled from ${provenance.label}`}>From {provenance.label.toLowerCase()}</PChip>
      {!readOnly && onConfirm ? <button type="button" className="pp-btn v-link s-sm" onClick={onConfirm}>Confirm</button> : null}
    </span>
  );
}

export function FieldShell({ id, label, required, blank, hint, always, provenance, onConfirm, readOnly, children, span }: {
  id: string; label: ReactNode; required?: boolean; blank?: boolean; hint?: string; always?: string; provenance?: Provenance[string];
  onConfirm?: () => void; readOnly?: boolean; children: ReactNode; span?: 1 | 2 | 3;
}) {
  const bad = Boolean(required && blank);
  const needsConfirm = Boolean(required && provenance && !provenance.confirmed);
  return (
    <div className={`pp-field${bad ? " bad" : ""}${needsConfirm ? " unconfirmed" : ""}${provenance && !provenance.confirmed ? " prefill" : ""}${span ? ` span-${span}` : ""}`} id={`pp-field-${id}`}>
      <label className="pp-lbl" htmlFor={`pp-in-${id}`}>
        {label}{required ? <span className="pp-req" title="Required">*</span> : null}
        <ProvChip provenance={provenance} onConfirm={onConfirm} readOnly={readOnly} />
      </label>
      {children}
      {bad ? <div className="pp-hint bad">{hint || REQUIRED_HINT}</div> : needsConfirm ? <div className="pp-hint warn">Confirm or change</div> : always ? <div className="pp-hint">{always}</div> : null}
    </div>
  );
}

function useFocusScroll(key: string, focusKey: string | null) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (focusKey !== key) return;
    const el = document.getElementById(`pp-field-${key}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const input = document.getElementById(`pp-in-${key}`) as HTMLElement | null;
    input?.focus();
  }, [key, focusKey]);
  return ref;
}

/** A registry-driven field bound to the workspace context. */
export function Field({ ctx, k, label, kind, options, placeholder, span, scope = "stage_one", teamPicker, stateList }: {
  ctx: StepCtx; k: string; label?: ReactNode; kind?: FieldDef["kind"]; options?: readonly string[] | Array<[string, string]>;
  placeholder?: string; span?: 1 | 2 | 3; scope?: "presentation" | "stage_one" | "stage_two"; teamPicker?: boolean; stateList?: boolean;
}) {
  const def = FIELD_BY_KEY[k];
  useFocusScroll(k, ctx.focusKey);
  if (!def) return null;
  const value = ctx.draft[k];
  const required = fieldRequiredNow(def, scope);
  const blank = isBlank(def, value);
  const readOnly = ctx.readOnly;
  const inputId = `pp-in-${k}`;
  const fieldKind = kind ?? def.kind;
  const opts = options ?? def.options;
  let control: ReactNode;
  if (fieldKind === "multiselect") {
    control = <MultiSelectChips options={(opts ?? []) as readonly string[]} value={Array.isArray(value) ? (value as string[]) : []} onChange={(v) => ctx.set(k, v)} disabled={readOnly} allowOther />;
  } else if (fieldKind === "textarea") {
    control = <textarea id={inputId} className="pp-input" rows={3} value={String(value ?? "")} disabled={readOnly} placeholder={placeholder} onChange={(e) => ctx.set(k, e.target.value)} />;
  } else if (stateList || (fieldKind === "select" && (k === "dealer_state" || k === "sponsor_state"))) {
    control = <ComboSelect id={inputId} value={String(value ?? "")} onChange={(v) => ctx.set(k, v)} options={US_STATES} placeholder="State" disabled={readOnly} />;
  } else if (teamPicker) {
    control = (
      <select id={inputId} className="pp-input" value={String(value ?? "")} disabled={readOnly} onChange={(e) => ctx.set(k, e.target.value)}>
        <option value="">Choose…</option>
        {String(value ?? "") && !ctx.teamOptions.some((t) => t.name === String(value)) ? <option value={String(value)}>{String(value)}</option> : null}
        {ctx.teamOptions.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
      </select>
    );
  } else if (fieldKind === "select") {
    const pairs: Array<[string, string]> = (opts ?? []).map((o) => (Array.isArray(o) ? [o[0], o[1]] : [String(o), String(o)]));
    control = (
      <select id={inputId} className="pp-input" value={String(value ?? "")} disabled={readOnly} onChange={(e) => ctx.set(k, e.target.value)}>
        <option value="">Choose…</option>
        {String(value ?? "") && !pairs.some((p) => p[0] === String(value)) ? <option value={String(value)}>{String(value)}</option> : null}
        {pairs.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    );
  } else if (fieldKind === "number") {
    control = (
      <span className={`pp-num${def.unit ? ` u-${def.unit === "$" ? "money" : def.unit === "%" ? "pct" : "unit"}` : ""}`}>
        {def.unit === "$" ? <span className="pp-affix">$</span> : null}
        <input id={inputId} className="pp-input" inputMode="decimal" value={value === "" || value === null || value === undefined ? "" : String(value)} disabled={readOnly} placeholder={placeholder}
          onChange={(e) => { const raw = e.target.value.replace(/[^0-9.\-]/g, ""); ctx.set(k, raw === "" ? "" : Number(raw)); }} />
        {def.unit && def.unit !== "$" ? <span className="pp-affix">{def.unit}</span> : null}
      </span>
    );
  } else if (fieldKind === "date") {
    control = <input id={inputId} type="date" className="pp-input" value={String(value ?? "")} disabled={readOnly} onChange={(e) => ctx.set(k, e.target.value)} />;
  } else {
    control = <input id={inputId} type={fieldKind === "email" ? "email" : fieldKind === "phone" ? "tel" : "text"} className="pp-input" value={String(value ?? "")} disabled={readOnly} placeholder={placeholder} onChange={(e) => ctx.set(k, e.target.value)} />;
  }
  return (
    <FieldShell id={k} label={label ?? def.label} required={required} blank={blank} hint={def.hint} always={def.always}
      provenance={ctx.provenance[k]} onConfirm={() => ctx.confirm(k)} readOnly={readOnly} span={span}>
      {control}
    </FieldShell>
  );
}

export function Overlay({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="pp-overlay" role="presentation" onClick={onClose}>
      <div className={`pp-drawer${wide ? " wide" : ""}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="pp-drawer-h"><h3 className="pp-sect">{title}</h3><button type="button" className="pp-btn v-ghost s-sm" onClick={onClose}>Close</button></header>
        <div className="pp-drawer-b">{children}</div>
      </div>
    </div>
  );
}
