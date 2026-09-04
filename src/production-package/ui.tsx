// MIRROR: keep identical to QCRep/src/production-package/*
// Self-contained primitives on the shared design tokens (no app imports).
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { FIELD_BY_KEY, REQUIRED_HINT, SPONSOR_KEYS, TERM_SHEET_KEYS, fieldRequiredNow, isBlank, optionPairs, type FieldDef, type FieldOptions } from "./schema";
import { USE_OF_FUNDS_KEYS, US_STATES } from "./options";
import { dateLabel, money, toNumber } from "./format";
import type {
  Arrangement, Computed, OwnerRow, PackageMode, ProductKey, ProductionPackage, Provenance, SignatureOnFile, ThresholdKey, UseOfFunds,
} from "./types";
import type { Provisional } from "./compute";
import { IconCheck, IconLock } from "./icons";

export type Tone = "ok" | "warn" | "bad" | "acc" | "mut" | "gold";

export type StepCtx = {
  pkg: ProductionPackage;
  draft: Arrangement;
  computed: Computed;
  prov: Provisional;
  provenance: Provenance;
  saving: boolean;
  readOnly: boolean;
  // Derived from the role on the backend (operator / rep / partner), never from the transport.
  mode: PackageMode;
  profileId: string;
  focusKey: string | null;
  set: (key: string, value: unknown) => void;
  setProduct: (key: ProductKey, field: string, value: unknown) => void;
  setThreshold: (key: ThresholdKey, value: unknown) => void;
  confirm: (key: string) => void;
  go: (step: import("./types").StepKey) => void;
  notify: (message: string, tone?: Tone) => void;
  teamOptions: Array<{ id: string; name: string; email: string; phone?: string | null; title?: string | null }>;
  teamError?: boolean;
  // Stage-two hand-offs to the host app; the workspace provides defaults where it can.
  onOpenTermSheet?: () => void;
  onOpenFinal?: (finalPackageId: string) => void;
  onOpenOriginal?: (parentPackageId: string) => void;
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

/** Chip toggles. Options may be plain strings or [stored value, printed label] pairs; the stored values go on the arrangement. */
export function MultiSelectChips({ options, value, onChange, disabled, allowOther }: { options: FieldOptions; value: string[]; onChange: (next: string[]) => void; disabled?: boolean; allowOther?: boolean }) {
  const [other, setOther] = useState("");
  const pairs = optionPairs(options);
  const known = new Set(pairs.map((p) => p[0]));
  const extras = value.filter((v) => !known.has(v));
  const toggle = (opt: string) => {
    if (disabled) return;
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  };
  return (
    <div className="pp-chips">
      {pairs.map(([opt, label]) => (
        <button key={opt} type="button" className={`pp-chipbtn${value.includes(opt) ? " on" : ""}`} aria-pressed={value.includes(opt)} onClick={() => toggle(opt)} disabled={disabled}>
          {value.includes(opt) ? <IconCheck /> : null}{label}
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

/** "From the term sheet" — a key the term sheet owns on the final; the desk changes it on the sheet, not here. */
export function LockedChip({ children = "From the term sheet", title = "Maintained by the term sheet — record a new term sheet to change it" }: { children?: ReactNode; title?: string }) {
  return <span className="pp-locked-chip" title={title}><IconLock />{children}</span>;
}

/** Signature-on-file state for a counterparty (qc / sponsor / rm). */
export function SigOnFileChip({ sof, adoptedAt }: { sof?: SignatureOnFile | null; adoptedAt?: string | null }) {
  if (adoptedAt) return <PChip tone="ok" title="Placed from the signature on file"><IconCheck />Placed from file · adopted {dateLabel(adoptedAt)}</PChip>;
  if (!sof) return null;
  if (sof.present) return <PChip tone="ok" title={sof.typed_name ? `On file as ${sof.typed_name}` : undefined}><IconCheck />Signature on file · adopted {dateLabel(sof.adopted_at)}</PChip>;
  return <PChip tone="bad" title={sof.how_to_fix ?? undefined}>No signature on file</PChip>;
}

export function FieldShell({ id, label, required, blank, hint, always, provenance, onConfirm, readOnly, children, span, locked, lockedLabel }: {
  id: string; label: ReactNode; required?: boolean; blank?: boolean; hint?: string; always?: string; provenance?: Provenance[string];
  onConfirm?: () => void; readOnly?: boolean; children: ReactNode; span?: 1 | 2 | 3; locked?: boolean; lockedLabel?: string;
}) {
  const bad = Boolean(required && blank);
  const needsConfirm = Boolean(required && provenance && !provenance.confirmed && !locked);
  return (
    <div className={`pp-field${bad ? " bad" : ""}${needsConfirm ? " unconfirmed" : ""}${provenance && !provenance.confirmed ? " prefill" : ""}${locked ? " locked" : ""}${span ? ` span-${span}` : ""}`} id={`pp-field-${id}`}>
      <label className="pp-lbl" htmlFor={`pp-in-${id}`}>
        {label}{required ? <span className="pp-req" title="Required">*</span> : null}
        {locked ? <LockedChip title={lockedLabel ? "Carried from the executed commitment — the sponsor is not changed on the final" : undefined}>{lockedLabel ?? "From the term sheet"}</LockedChip> : <ProvChip provenance={provenance} onConfirm={onConfirm} readOnly={readOnly} />}
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

const EMPTY_OWNER: OwnerRow = { name: "", pct: "", title: "", email: "", phone: "", auth: "" };
const OWNER_COLUMNS: RowsColumn<OwnerRow>[] = [
  { key: "name", label: "Owner", kind: "text", width: 180 },
  { key: "pct", label: "Ownership %", kind: "number", width: 90 },
  { key: "title", label: "Title", kind: "text", width: 130 },
  { key: "email", label: "Email", kind: "email", width: 170 },
  { key: "phone", label: "Phone", kind: "phone", width: 130 },
  { key: "auth", label: "Credit authorization", kind: "select", options: ["Yes", "No"], width: 110 },
];

export function emptyUseOfFunds(): UseOfFunds {
  return { inventory: "", debt_payoff: "", working_capital: "", equipment: "", real_estate: "", program_implementation: "", other: "", other_label: "" };
}

/** A registry-driven field bound to the workspace context. Required styling follows the package's stage. */
const KEPT_NAME = "__kept";

export function Field({ ctx, k, label, kind, options, placeholder, span, scope, teamPicker, stateList }: {
  ctx: StepCtx; k: string; label?: ReactNode; kind?: FieldDef["kind"]; options?: FieldOptions;
  placeholder?: string; span?: 1 | 2 | 3; scope?: "presentation" | "stage_one" | "stage_two"; teamPicker?: boolean; stateList?: boolean;
}) {
  const def = FIELD_BY_KEY[k];
  useFocusScroll(k, ctx.focusKey);
  if (!def) return null;
  const stageTwo = ctx.pkg.stage === 2;
  const value = ctx.draft[k];
  const required = fieldRequiredNow(def, scope ?? (stageTwo ? "stage_two" : "stage_one"));
  const blank = isBlank(def, value);
  // On the final the term sheet owns the loan terms and the sponsor is carried from the executed commitment.
  const lockedBy = stageTwo ? (TERM_SHEET_KEYS.has(k) ? "term_sheet" : SPONSOR_KEYS.has(k) ? "stage_one" : null) : null;
  const locked = lockedBy !== null;
  const readOnly = ctx.readOnly || locked;
  const inputId = `pp-in-${k}`;
  const fieldKind = kind ?? def.kind;
  const opts = options ?? def.options;
  let control: ReactNode;
  if (fieldKind === "rows") {
    control = <RowsEditor<OwnerRow> id={k} rows={Array.isArray(value) ? (value as OwnerRow[]) : []} columns={OWNER_COLUMNS} empty={() => ({ ...EMPTY_OWNER })} max={5} onChange={(rows) => ctx.set(k, rows)} disabled={readOnly} addLabel="Add an owner" />;
  } else if (fieldKind === "money_group") {
    control = <MoneySplit id={k} value={(value && typeof value === "object" ? value : emptyUseOfFunds()) as UseOfFunds} onChange={(next) => ctx.set(k, next)} against={toNumber(ctx.draft.funded_amount) || null} againstLabel="funded amount" disabled={readOnly} />;
  } else if (fieldKind === "multiselect") {
    control = <MultiSelectChips options={opts ?? []} value={Array.isArray(value) ? (value as string[]) : []} onChange={(v) => ctx.set(k, v)} disabled={readOnly} allowOther={!optionPairs(opts).some((p) => p[0] !== p[1])} />;
  } else if (fieldKind === "textarea") {
    control = <textarea id={inputId} className="pp-input" rows={3} value={String(value ?? "")} disabled={readOnly} placeholder={placeholder} onChange={(e) => ctx.set(k, e.target.value)} />;
  } else if (stateList || (fieldKind === "select" && (k === "dealer_state" || k === "sponsor_state"))) {
    control = <ComboSelect id={inputId} value={String(value ?? "")} onChange={(v) => ctx.set(k, v)} options={US_STATES} placeholder="State" disabled={readOnly} />;
  } else if (teamPicker) {
    // Keyed on the user id, not the display name: two colleagues can share a
    // name, and the signature on file is matched to the person, not the string.
    const kept = String(value ?? "");
    const chosen = String(ctx.draft.rm_user_id ?? "");
    const known = ctx.teamOptions.some((t) => t.id === chosen);
    control = (
      <select id={inputId} className="pp-input" value={known ? chosen : kept ? KEPT_NAME : ""} disabled={readOnly} onChange={(e) => {
        const member = ctx.teamOptions.find((t) => t.id === e.target.value);
        if (e.target.value === KEPT_NAME) return;
        ctx.set(k, member ? member.name : "");
        ctx.set("rm_user_id", member ? member.id : "");
        // Everything the document needs about this person travels with the pick,
        // so choosing a different manager cannot leave the last one's contact
        // details behind.
        if (member) {
          ctx.set("rm_email", member.email ?? "");
          if (member.phone) ctx.set("rm_phone", member.phone);
        }
      }}>
        <option value="">{ctx.teamOptions.length ? "Choose…" : ctx.teamError ? "The team list could not be loaded" : "No team members yet"}</option>
        {!known && kept ? <option value={KEPT_NAME}>{kept}</option> : null}
        {ctx.teamOptions.map((t) => <option key={t.id} value={t.id}>{t.title ? `${t.name} — ${t.title}` : t.name}</option>)}
      </select>
    );
  } else if (fieldKind === "select") {
    const pairs = optionPairs(opts);
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
      provenance={ctx.provenance[k]} onConfirm={() => ctx.confirm(k)} readOnly={ctx.readOnly} span={span} locked={locked} lockedLabel={lockedBy === "stage_one" ? "Carried from stage one" : undefined}>
      {control}
    </FieldShell>
  );
}

// ---- rows (owners, protected sources, preexisting relationships) ----

export type RowsColumn<T> = {
  key: keyof T & string; label: string; kind?: "text" | "number" | "date" | "email" | "phone" | "select"; options?: FieldOptions; width?: number; placeholder?: string;
};

/** Editable rows. `fixed` renders exactly `max` rows with no add/remove (the agreement prints a fixed table). */
export function RowsEditor<T extends Record<string, unknown>>({ id, rows, columns, empty, max, onChange, disabled, addLabel = "Add a row", footer, fixed }: {
  id: string; rows: T[]; columns: RowsColumn<T>[]; empty: () => T; max: number; onChange: (rows: T[]) => void; disabled?: boolean; addLabel?: string; footer?: ReactNode; fixed?: boolean;
}) {
  const shown: T[] = fixed ? Array.from({ length: max }, (_, i) => rows[i] ?? empty()) : rows;
  const update = (i: number, key: keyof T & string, value: unknown) => {
    const next = shown.map((r, idx) => (idx === i ? { ...r, [key]: value } : r));
    onChange(next);
  };
  const remove = (i: number) => onChange(shown.filter((_, idx) => idx !== i));
  const add = () => { if (shown.length < max) onChange([...shown, empty()]); };
  const mutable = !disabled && !fixed;
  return (
    <div className="pp-rows" id={`pp-rows-${id}`}>
      <div className="pp-tblwrap">
        <table className="pp-tbl rows">
          <thead><tr>{columns.map((c) => <th key={c.key} style={c.width ? { minWidth: c.width } : undefined}>{c.label}</th>)}{mutable ? <th /> : null}</tr></thead>
          <tbody>
            {shown.length ? shown.map((row, i) => (
              <tr key={i}>
                {columns.map((c, ci) => {
                  const v = row[c.key];
                  const inputId = i === 0 && ci === 0 ? `pp-in-${id}` : undefined;
                  if (c.kind === "select") {
                    return (
                      <td key={c.key}>
                        <select id={inputId} className="pp-input cell wide" value={String(v ?? "")} disabled={disabled} onChange={(e) => update(i, c.key, e.target.value)}>
                          <option value="">—</option>
                          {optionPairs(c.options).map(([ov, ol]) => <option key={ov} value={ov}>{ol}</option>)}
                        </select>
                      </td>
                    );
                  }
                  if (c.kind === "number") {
                    return (
                      <td key={c.key}>
                        <input id={inputId} className="pp-input cell" inputMode="decimal" value={v === "" || v === null || v === undefined ? "" : String(v)} disabled={disabled} placeholder={c.placeholder}
                          onChange={(e) => { const raw = e.target.value.replace(/[^0-9.]/g, ""); update(i, c.key, raw === "" ? "" : Number(raw)); }} />
                      </td>
                    );
                  }
                  return (
                    <td key={c.key}>
                      <input id={inputId} type={c.kind === "date" ? "date" : c.kind === "email" ? "email" : c.kind === "phone" ? "tel" : "text"} className="pp-input cell wide" value={String(v ?? "")} disabled={disabled} placeholder={c.placeholder}
                        onChange={(e) => update(i, c.key, e.target.value)} />
                    </td>
                  );
                })}
                {mutable ? <td className="n"><button type="button" className="pp-btn v-link s-sm" onClick={() => remove(i)} title="Remove this row">Remove</button></td> : null}
              </tr>
            )) : (
              <tr><td colSpan={columns.length + (mutable ? 1 : 0)} className="muted">{disabled ? "None recorded." : "Nothing yet."}</td></tr>
            )}
          </tbody>
          {footer ? <tfoot><tr><td colSpan={columns.length + (mutable ? 1 : 0)}>{footer}</td></tr></tfoot> : null}
        </table>
      </div>
      {mutable ? (
        <div className="pp-row" style={{ marginTop: 6 }}>
          <PBtn size="sm" onClick={add} disabled={shown.length >= max} title={shown.length >= max ? `At most ${max} rows print on the agreement` : undefined}>{addLabel}</PBtn>
          <span className="pp-sub">{shown.length} of {max}</span>
        </div>
      ) : null}
    </div>
  );
}

// ---- use of funds (Schedule 1) ----

/** Seven amounts plus an "other" label, with the running total against the figure they must add up to. */
export function MoneySplit({ id, value, onChange, against, againstLabel = "approved amount", disabled }: {
  id: string; value: UseOfFunds; onChange: (next: UseOfFunds) => void; against: number | null; againstLabel?: string; disabled?: boolean;
}) {
  const total = USE_OF_FUNDS_KEYS.reduce((acc, [k]) => acc + toNumber(value[k]), 0);
  const diff = against === null ? null : total - against;
  const tone: Tone = against === null || total === 0 ? "mut" : Math.abs(diff ?? 0) <= 1 ? "ok" : "bad";
  const setAmount = (k: keyof UseOfFunds, raw: string) => {
    const clean = raw.replace(/[^0-9.]/g, "");
    onChange({ ...value, [k]: clean === "" ? "" : Number(clean) });
  };
  return (
    <div className="pp-split" id={`pp-split-${id}`}>
      {USE_OF_FUNDS_KEYS.map(([k, label], i) => (
        <label key={k} className="pp-split-row">
          <span className="pp-split-lbl">{label}{k === "other" ? <input className="pp-input" placeholder="Describe the other purpose" value={String(value.other_label ?? "")} disabled={disabled} onChange={(e) => onChange({ ...value, other_label: e.target.value })} /> : null}</span>
          <span className="pp-num u-money">
            <span className="pp-affix">$</span>
            <input id={i === 0 ? `pp-in-${id}` : undefined} className="pp-input" inputMode="decimal" value={value[k] === "" || value[k] === null || value[k] === undefined ? "" : String(value[k])} disabled={disabled} onChange={(e) => setAmount(k, e.target.value)} />
          </span>
        </label>
      ))}
      <div className={`pp-split-total t-${tone}`}>
        <span className="pp-lbl">Allocated</span>
        <b>{money(total)}</b>
        {against !== null ? <span className="pp-sub">against {money(against)} {againstLabel}{diff !== null && Math.abs(diff) > 1 ? ` · ${diff > 0 ? "over" : "short"} by ${money(Math.abs(diff))}` : diff !== null && total > 0 ? " · adds up" : ""}</span> : null}
      </div>
    </div>
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
