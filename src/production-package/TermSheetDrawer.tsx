// MIRROR: keep identical to QCRep/src/production-package/*
// The term sheet: loan terms a super admin or underwriter records on the file
// before the final can be drafted. Versioned; the current row is what "Draft
// final package" consumes. Lives on the profile, not the package.
import { useCallback, useEffect, useState } from "react";
import type { PackageClient } from "./client";
import { dateLabel, errorDetail, errorMessage, errorStatus, money, pct, toNumber, whenLabel } from "./format";
import { FACILITY_TYPES, FUNDING_PARTIES, USE_OF_FUNDS_KEYS } from "./options";
import { Callout, KV, MoneySplit, Overlay, PBtn, PChip, Picks, emptyUseOfFunds } from "./ui";
import type { FundingPartyKind, ProductionPackage, TermSheet, TermSheetBody, TermSheetResult, TermSheetState, UseOfFunds } from "./types";

type FormState = {
  funding_party_kind: FundingPartyKind; lender_id: string; funding_party_name: string; facility_type: string;
  approved_amount: string; min_activation_amount: string; rate_pct: string; term_months: string; monthly_debt_service: string; level: boolean;
  expected_funding_date: string; activation_date: string; commencement_date: string; maturity_date: string;
  use_of_funds: UseOfFunds; conditions: string; notes: string;
};

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const SOURCE_LABELS: Record<string, string> = {
  underwriting: "From underwriting", stage_one: "From stage one", level_payment: "Level payment", today: "Today",
  funding: "From the funding date", dealer: "From the dealer file",
};

function isKind(v: string): v is FundingPartyKind { return (FUNDING_PARTIES as readonly string[]).includes(v); }

function formFrom(sheet: TermSheet | null, defaults: Record<string, unknown>): FormState {
  const src: Record<string, unknown> = sheet ? { ...sheet } : defaults;
  const uof = (src.use_of_funds && typeof src.use_of_funds === "object" ? src.use_of_funds : {}) as Record<string, unknown>;
  const kind = str(src.funding_party_kind);
  const split: UseOfFunds = { ...emptyUseOfFunds(), other_label: str(uof.other_label) };
  USE_OF_FUNDS_KEYS.forEach(([k]) => { split[k] = uof[k] === null || uof[k] === undefined || uof[k] === "" ? "" : Number(uof[k]); });
  return {
    funding_party_kind: isKind(kind) ? kind : "Lender",
    lender_id: str(src.lender_id), funding_party_name: str(src.funding_party_name), facility_type: str(src.facility_type) || FACILITY_TYPES[0],
    approved_amount: str(src.approved_amount), min_activation_amount: str(src.min_activation_amount), rate_pct: str(src.rate_pct), term_months: str(src.term_months),
    monthly_debt_service: str(src.monthly_debt_service), level: sheet ? sheet.debt_service_is_level_payment : true,
    expected_funding_date: str(src.expected_funding_date).slice(0, 10), activation_date: str(src.activation_date).slice(0, 10),
    commencement_date: str(src.commencement_date).slice(0, 10), maturity_date: str(src.maturity_date).slice(0, 10),
    use_of_funds: split, conditions: str(src.conditions), notes: str(src.notes),
  };
}

function toBody(f: FormState): TermSheetBody {
  const uof: TermSheetBody["use_of_funds"] = { other_label: f.use_of_funds.other_label || null };
  let any = false;
  USE_OF_FUNDS_KEYS.forEach(([k]) => { const v = f.use_of_funds[k]; if (v !== "" && v !== null && v !== undefined) { uof[k] = Number(v); any = true; } });
  return {
    funding_party_kind: f.funding_party_kind,
    lender_id: f.funding_party_kind === "Lender" && f.lender_id ? f.lender_id : null,
    funding_party_name: f.funding_party_name.trim(),
    facility_type: f.facility_type,
    approved_amount: toNumber(f.approved_amount),
    min_activation_amount: toNumber(f.min_activation_amount),
    rate_pct: toNumber(f.rate_pct),
    term_months: Math.round(toNumber(f.term_months)),
    // Blank + level → the server computes the level payment from the amount, rate and term when it records the sheet.
    monthly_debt_service: f.level ? null : toNumber(f.monthly_debt_service),
    debt_service_is_level_payment: f.level,
    expected_funding_date: f.expected_funding_date || null, activation_date: f.activation_date || null,
    commencement_date: f.commencement_date || null, maturity_date: f.maturity_date || null,
    use_of_funds: any ? uof : null,
    conditions: f.conditions.trim() || null, notes: f.notes.trim() || null,
  };
}

function sheetLine(s: TermSheet): string {
  return `${money(s.approved_amount)} at ${pct(s.rate_pct, 2)} for ${s.term_months} mo · ${s.funding_party_name}`;
}

export function TermSheetDrawer({ client, profileId, open, onClose, pkg, onSaved }: {
  client: PackageClient; profileId: string; open: boolean; onClose: () => void; pkg?: ProductionPackage | null; onSaved?: (result: TermSheetResult) => void;
}) {
  const [state, setState] = useState<TermSheetState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [withdrawAsk, setWithdrawAsk] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState("");

  const load = useCallback(async () => {
    if (!client.termSheet) { setLoadError("The term sheet is recorded from the desk."); return; }
    setLoadError(null);
    try {
      const next = await client.termSheet(profileId);
      setState(next);
      setForm(formFrom(next.current, next.defaults));
    } catch (err) {
      setLoadError(errorMessage(err, "The term sheet could not be loaded."));
    }
  }, [client, profileId]);

  useEffect(() => { if (open) { setDone(null); setErrors([]); load().catch(() => undefined); } }, [open, load]);

  const fail = (err: unknown, fallback: string) => {
    const detail = errorDetail(err);
    if (errorStatus(err) === 422 && detail?.code === "term_sheet_invalid" && Array.isArray(detail.errors)) {
      setErrors((detail.errors as unknown[]).map(String));
    } else {
      setErrors([typeof detail?.message === "string" ? detail.message : errorMessage(err, fallback)]);
    }
  };

  const save = async () => {
    if (!form || !client.saveTermSheet) return;
    setBusy("save"); setErrors([]); setDone(null);
    try {
      const result = await client.saveTermSheet(profileId, toBody(form));
      setState(result.state);
      setForm(formFrom(result.state.current, result.state.defaults));
      const v = result.state.current?.version;
      setDone(`Term sheet v${v ?? ""} recorded.${result.final ? " The draft final was re-applied with these terms." : ""}`);
      onSaved?.(result);
    } catch (err) {
      fail(err, "The term sheet could not be recorded.");
    } finally { setBusy(null); }
  };

  const withdraw = async () => {
    if (!client.withdrawTermSheet) return;
    setBusy("withdraw"); setErrors([]); setDone(null);
    try {
      const next = await client.withdrawTermSheet(profileId, withdrawReason.trim());
      setState(next);
      setForm(formFrom(next.current, next.defaults));
      setWithdrawAsk(false); setWithdrawReason("");
      setDone("Term sheet withdrawn.");
    } catch (err) {
      fail(err, "The term sheet could not be withdrawn.");
    } finally { setBusy(null); }
  };

  const current = state?.current ?? null;
  const canEdit = Boolean(state?.can_edit);
  const nextVersion = (current?.version ?? Math.max(0, ...(state?.history ?? []).map((h) => h.version))) + 1;
  const src = (key: string) => (current ? null : state?.defaults_source[key] ?? null);
  const SrcChip = ({ k }: { k: string }) => {
    if (current) return null;
    const s = src(k);
    return s ? <PChip tone="acc" title={`Prefilled: ${SOURCE_LABELS[s] ?? s}`}>{SOURCE_LABELS[s] ?? s}</PChip> : null;
  };
  const upd = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const kindChanged = (kind: FundingPartyKind) => {
    if (!form) return;
    const lender = state?.lenders.find((l) => l.id === form.lender_id);
    const name = kind === "Qualified Commercial LLC" ? "Qualified Commercial LLC" : kind === "Sponsor" ? (pkg?.sponsor?.name ?? "") : (lender?.name ?? "");
    upd({ funding_party_kind: kind, funding_party_name: name || form.funding_party_name });
  };
  const uofNote = str(state?.defaults.use_of_funds_note);
  const consumedByThis = Boolean(pkg && current && current.consumed_by_package_id === pkg.id);

  return (
    <Overlay open={open} onClose={onClose} title={current ? `Term sheet · v${current.version}` : "Record the term sheet"} wide>
      {loadError ? <div className="pp-notice t-warn"><span>{loadError}</span><PBtn size="sm" onClick={() => load()}>Try again</PBtn></div> : null}
      {!state || !form ? (!loadError ? <p className="pp-sub">Loading…</p> : null) : (
        <div className="pp-ts-form">
          <p className="pp-sub">
            The loan terms as approved. Recording a sheet writes the approved amount through to the Underwriting tab, and &quot;Draft final package&quot; on the executed commitment uses the current version.
            {" "}Recording a new version while the final is a draft re-applies the terms to it; while the final is out for signature or executed the terms are fixed.
          </p>
          {current ? (
            <div className="pp-row">
              <PChip tone="ok">Current · v{current.version}</PChip>
              <span className="pp-sub">{sheetLine(current)} · recorded by {current.entered_by_name ?? "the desk"} {whenLabel(current.entered_at)}</span>
              {current.consumed_by_package_id ? <PChip tone="gold" title={consumedByThis ? "This final was drafted from it" : undefined}>Used by the final</PChip> : null}
            </div>
          ) : <Callout tone="mut">No term sheet on this file yet. The figures below are prefilled where the file has them; check every one.</Callout>}

          {!canEdit ? (
            <>
              <Callout tone="mut">Only a super admin or underwriter records loan terms. Shown as recorded.</Callout>
              {current ? (
                <div className="pp-grid">
                  <KV label="Funding party" value={`${current.funding_party_kind} · ${current.funding_party_name}`} />
                  <KV label="Facility type" value={current.facility_type} />
                  <KV label="Approved amount" value={money(current.approved_amount)} />
                  <KV label="Minimum activation" value={money(current.min_activation_amount)} />
                  <KV label="Rate" value={pct(current.rate_pct, 2)} />
                  <KV label="Term" value={`${current.term_months} months`} />
                  <KV label="Monthly debt service" value={`${money(current.monthly_debt_service, 2)}${current.debt_service_is_level_payment ? " · level payment" : ""}`} />
                  <KV label="Expected funding" value={dateLabel(current.expected_funding_date)} />
                  <KV label="Activation" value={dateLabel(current.activation_date)} />
                  <KV label="Commencement" value={dateLabel(current.commencement_date)} />
                  <KV label="Maturity" value={dateLabel(current.maturity_date)} />
                  {current.conditions ? <KV label="Conditions" value={current.conditions} /> : null}
                  {current.notes ? <KV label="Notes" value={current.notes} /> : null}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <h4 className="pp-sect">Funding party</h4>
              <div className="pp-row">
                <Picks options={(state.funding_party_kinds.length ? state.funding_party_kinds : [...FUNDING_PARTIES]).filter(isKind).map((k) => [k, k] as [FundingPartyKind, string])} value={form.funding_party_kind} onChange={kindChanged} />
                <SrcChip k="funding_party_kind" />
              </div>
              <div className="pp-grid">
                {form.funding_party_kind === "Lender" ? (
                  <label className="pp-field"><span className="pp-lbl">Lender</span>
                    <select className="pp-input" value={form.lender_id} onChange={(e) => { const l = state.lenders.find((x) => x.id === e.target.value); upd({ lender_id: e.target.value, funding_party_name: l ? l.name : form.funding_party_name }); }}>
                      <option value="">Choose a lender…</option>
                      {state.lenders.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                    {!state.lenders.length ? <span className="pp-hint">No active lenders — name the funding party by hand.</span> : null}
                  </label>
                ) : null}
                <label className={`pp-field${form.funding_party_kind === "Lender" ? " span-2" : " span-3"}`}><span className="pp-lbl">Funding party legal name</span>
                  <input className="pp-input" value={form.funding_party_name} onChange={(e) => upd({ funding_party_name: e.target.value })} placeholder="As it prints on Schedule 1 and the certificate" /></label>
              </div>

              <h4 className="pp-sect">Facility</h4>
              <div className="pp-grid">
                <label className="pp-field"><span className="pp-lbl">Facility type <SrcChip k="facility_type" /></span>
                  <select className="pp-input" value={form.facility_type} onChange={(e) => upd({ facility_type: e.target.value })}>
                    {(state.facility_types.length ? state.facility_types : [...FACILITY_TYPES]).map((t) => <option key={t} value={t}>{t}</option>)}
                  </select></label>
                <label className="pp-field"><span className="pp-lbl">Approved amount <SrcChip k="approved_amount" /></span>
                  <span className="pp-num u-money"><span className="pp-affix">$</span><input className="pp-input" inputMode="decimal" value={form.approved_amount} onChange={(e) => upd({ approved_amount: e.target.value.replace(/[^0-9.]/g, "") })} /></span></label>
                <label className="pp-field"><span className="pp-lbl">Minimum activation amount <SrcChip k="min_activation_amount" /></span>
                  <span className="pp-num u-money"><span className="pp-affix">$</span><input className="pp-input" inputMode="decimal" value={form.min_activation_amount} onChange={(e) => upd({ min_activation_amount: e.target.value.replace(/[^0-9.]/g, "") })} /></span></label>
                <label className="pp-field"><span className="pp-lbl">Rate <SrcChip k="rate_pct" /></span>
                  <span className="pp-num u-pct"><input className="pp-input" inputMode="decimal" value={form.rate_pct} onChange={(e) => upd({ rate_pct: e.target.value.replace(/[^0-9.]/g, "") })} /><span className="pp-affix">%</span></span></label>
                <label className="pp-field"><span className="pp-lbl">Term <SrcChip k="term_months" /></span>
                  <span className="pp-num u-unit"><input className="pp-input" inputMode="numeric" value={form.term_months} onChange={(e) => upd({ term_months: e.target.value.replace(/[^0-9]/g, "") })} /><span className="pp-affix">months</span></span></label>
                <div className="pp-field">
                  <span className="pp-lbl">Monthly debt service {form.level ? <PChip tone="acc">Level payment</PChip> : <PChip tone="warn">Entered by hand</PChip>}</span>
                  <span className="pp-num u-money"><span className="pp-affix">$</span><input className="pp-input" inputMode="decimal" value={form.level ? (form.monthly_debt_service || "") : form.monthly_debt_service} disabled={form.level} placeholder={form.level ? "Computed when recorded" : ""} onChange={(e) => upd({ monthly_debt_service: e.target.value.replace(/[^0-9.]/g, "") })} /></span>
                  <span className="pp-hint">
                    {form.level
                      ? <>Computed from the amount, rate and term when the sheet is recorded{current?.level_payment ? ` (v${current.version}: ${money(current.level_payment, 2)})` : form.monthly_debt_service ? ` (prefilled ${money(toNumber(form.monthly_debt_service), 2)})` : ""}. <button type="button" className="pp-btn v-link s-sm" onClick={() => upd({ level: false, monthly_debt_service: form.monthly_debt_service || str(current?.level_payment ?? "") })}>Enter by hand</button></>
                      : <>Overrides the level payment. <button type="button" className="pp-btn v-link s-sm" onClick={() => upd({ level: true })}>Reset to level payment</button></>}
                  </span>
                </div>
              </div>

              <h4 className="pp-sect">Dates</h4>
              <div className="pp-grid">
                <label className="pp-field"><span className="pp-lbl">Expected funding <SrcChip k="expected_funding_date" /></span><input type="date" className="pp-input" value={form.expected_funding_date} onChange={(e) => upd({ expected_funding_date: e.target.value })} /></label>
                <label className="pp-field"><span className="pp-lbl">Activation <SrcChip k="activation_date" /></span><input type="date" className="pp-input" value={form.activation_date} onChange={(e) => upd({ activation_date: e.target.value })} /></label>
                <label className="pp-field"><span className="pp-lbl">Production commencement <SrcChip k="commencement_date" /></span><input type="date" className="pp-input" value={form.commencement_date} onChange={(e) => upd({ commencement_date: e.target.value })} /></label>
                <label className="pp-field"><span className="pp-lbl">Maturity <SrcChip k="maturity_date" /></span><input type="date" className="pp-input" value={form.maturity_date} onChange={(e) => upd({ maturity_date: e.target.value })} /></label>
              </div>
              <p className="pp-sub">Funding ≤ activation ≤ commencement &lt; maturity. The final is sent only once the funding date has passed.</p>

              <h4 className="pp-sect">Use of funds</h4>
              <MoneySplit id="ts-use-of-funds" value={form.use_of_funds} onChange={(next) => upd({ use_of_funds: next })} against={toNumber(form.approved_amount) || null} againstLabel="approved amount" />
              {uofNote ? <p className="pp-sub">Dealer file: {uofNote}</p> : null}

              <h4 className="pp-sect">Conditions and notes</h4>
              <div className="pp-grid">
                <label className="pp-field span-3"><span className="pp-lbl">Conditions</span><textarea className="pp-input" rows={3} value={form.conditions} onChange={(e) => upd({ conditions: e.target.value })} placeholder="Conditions precedent to funding, if any" /></label>
                <label className="pp-field span-3"><span className="pp-lbl">Notes</span><textarea className="pp-input" rows={2} value={form.notes} onChange={(e) => upd({ notes: e.target.value })} placeholder="Internal notes" /></label>
              </div>

              {errors.length ? <ul className="pp-errors">{errors.map((e) => <li key={e}>{e}</li>)}</ul> : null}
              {done ? <Callout tone="ok">{done}</Callout> : null}
              <div className="pp-row">
                <PBtn variant="pri" onClick={save} busy={busy === "save"} disabled={!form.funding_party_name.trim() || !toNumber(form.approved_amount) || !toNumber(form.min_activation_amount) || !toNumber(form.term_months)}>Record term sheet v{nextVersion}</PBtn>
                {current && !withdrawAsk ? <PBtn variant="danger" size="sm" onClick={() => setWithdrawAsk(true)} disabled={Boolean(current.consumed_by_package_id)} title={current.consumed_by_package_id ? "Void the final that uses this term sheet first" : undefined}>Withdraw v{current.version}</PBtn> : null}
              </div>
              {withdrawAsk ? (
                <div className="pp-inline">
                  <b>Withdraw term sheet v{current?.version}?</b>
                  <p className="pp-sub">The file goes back to having no term sheet; a new version can be recorded afterwards. Refused while a final uses it.</p>
                  <input className="pp-input" placeholder="Reason (kept in the audit trail)" value={withdrawReason} onChange={(e) => setWithdrawReason(e.target.value)} />
                  <div className="pp-row"><PBtn variant="danger" onClick={withdraw} busy={busy === "withdraw"} disabled={withdrawReason.trim().length < 3}>Withdraw</PBtn><PBtn onClick={() => setWithdrawAsk(false)}>Cancel</PBtn></div>
                </div>
              ) : null}
            </>
          )}

          <h4 className="pp-sect">History</h4>
          {state.history.length ? (
            <ul className="pp-ts-hist">
              {state.history.map((h) => (
                <li key={h.id} className={h.status === "current" ? "current" : ""}>
                  <b>v{h.version}</b>
                  <PChip tone={h.status === "current" ? "ok" : h.status === "withdrawn" ? "bad" : "mut"}>{h.status === "current" ? "Current" : h.status === "withdrawn" ? "Withdrawn" : "Superseded"}</PChip>
                  <span>{sheetLine(h)}</span>
                  <span className="pp-sub">{h.entered_by_name ?? "the desk"} · {whenLabel(h.entered_at)}{h.superseded_at ? ` · superseded ${whenLabel(h.superseded_at)}` : ""}{h.withdrawn_at ? ` · withdrawn ${whenLabel(h.withdrawn_at)}` : ""}</span>
                  {h.consumed_by_package_id ? <PChip tone="gold">Used by a final</PChip> : null}
                </li>
              ))}
            </ul>
          ) : <p className="pp-sub">No versions yet.</p>}
        </div>
      )}
    </Overlay>
  );
}
