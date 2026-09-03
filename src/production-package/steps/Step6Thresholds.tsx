// MIRROR: keep identical to QCRep/src/production-package/*
import { money, num, pct } from "../format";
import { Callout, PBtn, PPanel, type StepCtx } from "../ui";
import type { ThresholdKey } from "../types";

function fmt(v: number | null, format: "count" | "pct" | "money"): string {
  if (v === null || v === undefined) return "N/A";
  return format === "money" ? money(v) : format === "pct" ? pct(v, 0) : num(v);
}

export function Step6Thresholds({ ctx }: { ctx: StepCtx }) {
  const { computed, draft, readOnly, setThreshold, set, notify } = ctx;
  const t = computed.thresholds;
  const applyGuideline = () => {
    set("thresholds", {});
    notify("Operative thresholds reset to the Addendum A.3 guideline.", "acc");
  };
  return (
    <>
      <PPanel title="Operative thresholds (Addendum A.2)" sub="Verified baseline on the left; the operative requirement on the right follows the A.3 guideline — 85% monthly floor, 90% rolling three-month, 125% remittance coverage — and can be set by hand."
        right={<PBtn size="sm" onClick={applyGuideline} disabled={readOnly}>Apply the A.3 guideline</PBtn>}>
        <table className="pp-tbl thr">
          <thead><tr><th>Covenant</th><th className="n">Verified baseline</th><th className="n">Operative requirement</th></tr></thead>
          <tbody>
            {t.rows.map((r) => r.editable ? (
              <tr key={r.key} id={`pp-field-thresholds.${r.key}`} className={r.blank ? "bad" : ""}>
                <td>{r.label}{r.overridden ? <span className="pp-sub"> · set by hand</span> : null}</td>
                <td className="n muted">{fmt(r.baseline, r.format)}</td>
                <td className="n">
                  <span className={`pp-cell u-${r.format === "money" ? "money" : r.format === "pct" ? "pct" : "unit"}${r.blank ? " bad" : ""}`}>
                    {r.format === "money" ? <i>$</i> : null}
                    <input className="pp-input cell" inputMode="decimal" disabled={readOnly}
                      value={draft.thresholds?.[r.key as ThresholdKey] !== undefined && draft.thresholds?.[r.key as ThresholdKey] !== "" ? String(draft.thresholds[r.key as ThresholdKey]) : r.operative === null ? "" : String(r.operative)}
                      onChange={(e) => { const raw = e.target.value.replace(/[^0-9.]/g, ""); setThreshold(r.key as ThresholdKey, raw === "" ? "" : Number(raw)); }} />
                    {r.format === "pct" ? <i>%</i> : null}
                  </span>
                </td>
              </tr>
            ) : (
              <tr key={r.key} className="fixed"><td>{r.label}</td><td className="n muted">N/A</td><td className="n">{r.value}</td></tr>
            ))}
          </tbody>
        </table>
        {t.rows.some((r) => r.editable && r.blank) ? <Callout tone="bad">Addendum A.2: a blank field is not enforceable.</Callout> : null}
      </PPanel>
      <PPanel title="Rolling three-month (Addendum A.3)" sub="Three times the monthly floor; penetration at 90%.">
        <table className="pp-tbl">
          <tbody>{t.rolling.map((r) => <tr key={r.label}><td>{r.label}</td><td className="n">{fmt(r.value, r.format)}</td></tr>)}</tbody>
        </table>
        <p className="pp-sub" style={{ marginTop: 8 }}>Remittance covenant {money(t.remittance_req)} a month · repayment covers {pct(t.coverage_pct)} of it.</p>
      </PPanel>
    </>
  );
}
