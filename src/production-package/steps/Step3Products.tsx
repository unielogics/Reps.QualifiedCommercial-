// MIRROR: keep identical to QCRep/src/production-package/*
import { money, num, pct, signedMoney, signedNum } from "../format";
import { PRODUCTS } from "../options";
import { IconCheck } from "../icons";
import { Callout, Derived, PChip, PPanel, type StepCtx } from "../ui";
import type { ProductKey } from "../types";

const COLS: Array<{ field: string; label: string; unit: "%" | "$" | "mo" }> = [
  { field: "cur_rate", label: "Today attach", unit: "%" },
  { field: "cur_premium", label: "Today premium", unit: "$" },
  { field: "rate", label: "Committed attach", unit: "%" },
  { field: "premium", label: "Committed premium", unit: "$" },
  { field: "repay", label: "Repayment withheld", unit: "$" },
  { field: "comm", label: "Commission", unit: "%" },
  { field: "admin", label: "Admin fee", unit: "$" },
  { field: "retention", label: "Retention", unit: "%" },
  { field: "term", label: "Term", unit: "mo" },
];

export function Step3Products({ ctx }: { ctx: StepCtx }) {
  const { draft, prov, readOnly, saving, setProduct, computed } = ctx;
  const rows = prov.rows;
  const attention = computed.attention.filter((a) => a.step === "products");
  return (
    <>
      <PPanel title="Covered products" sub="Today's numbers are what the dealer runs now, verified on the onsite review. Committed numbers are what the program commits to. The delta is the whole case for the arrangement."
        right={<PChip tone={draft.products.vsc.on ? "acc" : "bad"}>{rows.filter((r) => r.on).length} of 8 covered</PChip>}>
        <div className="pp-tblwrap">
          <table className="pp-tbl products">
            <thead>
              <tr>
                <th>Product</th>
                {COLS.map((c) => <th key={c.field} className="n">{c.label}</th>)}
                <th className="n">Contracts / mo</th><th className="n">Gross / mo</th><th className="n">+ Contracts</th><th className="n">+ Gross</th><th className="n">Uplift</th>
              </tr>
            </thead>
            <tbody>
              {PRODUCTS.map((p) => {
                const v = draft.products[p.key];
                const r = rows.find((x) => x.key === p.key)!;
                const bad = (f: string) => v.on && (f === "rate" || f === "premium" || f === "repay") && !Number(v[f as keyof typeof v]);
                return (
                  <tr key={p.key} className={v.on ? "" : "off"}>
                    <td>
                      <button type="button" className={`pp-chk${v.on ? " on" : ""}`} onClick={() => setProduct(p.key as ProductKey, "on", !v.on)} disabled={readOnly} aria-pressed={v.on} aria-label={`${v.on ? "Uncover" : "Cover"} ${p.label}`}>{v.on ? <IconCheck /> : null}</button>
                      <span className="pp-prod">{p.label}{p.primary ? <PChip tone="gold">Primary</PChip> : null}</span>
                    </td>
                    {COLS.map((c) => (
                      <td key={c.field} className="n">
                        <span className={`pp-cell u-${c.unit === "$" ? "money" : c.unit === "%" ? "pct" : "unit"}${bad(c.field) ? " bad" : ""}`}>
                          {c.unit === "$" ? <i>$</i> : null}
                          <input className="pp-input cell" inputMode="decimal" value={v[c.field as keyof typeof v] === "" ? "" : String(v[c.field as keyof typeof v])} disabled={readOnly || !v.on}
                            onChange={(e) => { const raw = e.target.value.replace(/[^0-9.]/g, ""); setProduct(p.key as ProductKey, c.field, raw === "" ? "" : Number(raw)); }} />
                          {c.unit !== "$" ? <i>{c.unit}</i> : null}
                        </span>
                      </td>
                    ))}
                    <td className="n">{v.on ? num(r.contracts) : "—"}</td>
                    <td className="n">{v.on ? money(r.gross) : "—"}</td>
                    <td className={`n ${r.d_contracts >= 0 ? "c-ok" : "c-bad"}`}>{v.on ? signedNum(r.d_contracts) : "—"}</td>
                    <td className={`n ${r.d_gross >= 0 ? "c-ok" : "c-bad"}`}>{v.on ? signedMoney(r.d_gross) : "—"}</td>
                    <td className={`n ${r.uplift >= 0 ? "c-ok" : "c-bad"}`}>{v.on ? signedMoney(r.uplift) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th>Monthly totals</th>
                <th colSpan={COLS.length} className="n muted">on {num(prov.units)} retail units · blended {prov.units ? (prov.contracts / prov.units).toFixed(2) : "—"}× per vehicle (today {prov.units ? (prov.cur_contracts / prov.units).toFixed(2) : "—"}×)</th>
                <th className="n">{num(prov.contracts)}</th><th className="n">{money(prov.gross)}</th>
                <th className={`n ${prov.contracts - prov.cur_contracts >= 0 ? "c-ok" : "c-bad"}`}>{signedNum(prov.contracts - prov.cur_contracts)}</th>
                <th className={`n ${prov.d_gross >= 0 ? "c-ok" : "c-bad"}`}>{signedMoney(prov.d_gross)}</th><th />
              </tr>
            </tfoot>
          </table>
        </div>
        {attention.length ? attention.map((a) => <Callout key={a.key} tone="bad"><b>{a.title}.</b> {a.detail}</Callout>) : null}
      </PPanel>
      <div className="pp-cols">
        <PPanel title="Per contract, where the premium goes" sub="One VSC, from what the customer pays to what stays in reserve.">
          {computed.econ.waterfall.map((w) => <div key={w.label} className="pp-kv row"><span className="pp-lbl">{w.label}</span><span className="pp-val">{money(w.value, 2)}</span></div>)}
        </PPanel>
        <PPanel title="Monthly economics" sub="Across every covered product.">
          <div className="pp-grid">
            <Derived label="Contracts" value={num(prov.contracts)} provisional={saving} />
            <Derived label="Gross" value={money(prov.gross)} provisional={saving} />
            <Derived label="Repayment withheld" value={money(prov.repay_m)} provisional={saving} />
            <Derived label="Agency commissions" value={money(prov.comm_m)} provisional={saving} />
            <Derived label="Admin fees" value={money(prov.admin_m)} provisional={saving} />
            <Derived label="Earned reserves" value={money(prov.reserve_m)} provisional={saving} />
            <Derived label="Today's gross" value={money(prov.cur_gross)} provisional={saving} />
            <Derived label="Change over the term" value={signedMoney(prov.d_gross * (Number(draft.term) || 1))} tone={prov.d_gross >= 0 ? "ok" : "bad"} provisional={saving} />
            <Derived label="Remittance coverage" value={pct(prov.coverage_pct)} note={`of the ${money(prov.remittance_req)} covenant`} tone={prov.coverage_pct >= 100 ? "ok" : "bad"} provisional={saving} />
          </div>
        </PPanel>
      </div>
    </>
  );
}
