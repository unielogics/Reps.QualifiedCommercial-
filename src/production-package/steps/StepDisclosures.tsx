// MIRROR: keep identical to QCRep/src/production-package/*
// Stage two only: Schedule 2 (relationship manager compensation), Schedule 3
// (compensation and conflict disclosure) and Schedule 4 (protected and
// preexisting funding relationships).
import { Callout, Field, KV, PPanel, RowsEditor, SigOnFileChip, type RowsColumn, type StepCtx } from "../ui";

type ProtectedRow = { name: string; rel: string; date: string; txn: string };
type ExistingRow = { name: string; rel: string; info: string };

const PROTECTED_FIELDS = ["name", "rel", "date", "txn"] as const;
const EXISTING_FIELDS = ["name", "rel", "info"] as const;
const PROTECTED_COLUMNS: RowsColumn<ProtectedRow>[] = [
  { key: "name", label: "Legal name", kind: "text", width: 180 },
  { key: "rel", label: "Relationship", kind: "text", width: 150 },
  { key: "date", label: "Date introduced", kind: "date", width: 150 },
  { key: "txn", label: "Funded transaction", kind: "text", width: 170 },
];
const EXISTING_COLUMNS: RowsColumn<ExistingRow>[] = [
  { key: "name", label: "Legal name", kind: "text", width: 180 },
  { key: "rel", label: "Existing relationship", kind: "text", width: 180 },
  { key: "info", label: "Supporting information", kind: "text", width: 220 },
];
const COMP_ROWS: Array<[string, string, string]> = [
  ["Funding Party → Qualified Commercial", "comp_fp_qc_amount", "comp_fp_qc_purpose"],
  ["Funding Party → Sponsor", "comp_fp_sponsor_amount", "comp_fp_sponsor_purpose"],
  ["Dealer → Qualified Commercial (post-funding)", "comp_dealer_qc_amount", "comp_dealer_qc_purpose"],
  ["Dealer → Sponsor (post-funding)", "comp_dealer_sponsor_amount", "comp_dealer_sponsor_purpose"],
];

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

export function StepDisclosures({ ctx }: { ctx: StepCtx }) {
  const { pkg, draft, readOnly, set, mode } = ctx;
  const sof = pkg.signatures_on_file ?? {};
  const protectedRows: ProtectedRow[] = [1, 2, 3].map((i) => ({ name: str(draft[`protected_${i}_name`]), rel: str(draft[`protected_${i}_rel`]), date: str(draft[`protected_${i}_date`]), txn: str(draft[`protected_${i}_txn`]) }));
  const existingRows: ExistingRow[] = [1, 2, 3, 4].map((i) => ({ name: str(draft[`existing_${i}_name`]), rel: str(draft[`existing_${i}_rel`]), info: str(draft[`existing_${i}_info`]) }));
  // The agreement prints flat keys; only the cells that changed are written.
  const writeProtected = (rows: ProtectedRow[]) => rows.forEach((r, idx) => PROTECTED_FIELDS.forEach((f) => { const key = `protected_${idx + 1}_${f}`; if (str(draft[key]) !== str(r[f])) set(key, str(r[f])); }));
  const writeExisting = (rows: ExistingRow[]) => rows.forEach((r, idx) => EXISTING_FIELDS.forEach((f) => { const key = `existing_${idx + 1}_${f}`; if (str(draft[key]) !== str(r[f])) set(key, str(r[f])); }));
  const cats = Array.isArray(draft.rm_comp_categories) ? (draft.rm_comp_categories as string[]) : [];
  return (
    <>
      <PPanel title="Relationship manager compensation (Schedule 2)" sub="The manager acknowledges the lawful category of their compensation. Bank points, lender commissions and any compensation tied to the funding decision are prohibited."
        right={mode === "operator" ? <SigOnFileChip sof={sof.rm} /> : null}>
        <div className="pp-grid" style={{ marginBottom: 10 }}>
          <KV label="Relationship manager" value={String(draft.rm_name || "—")} />
          <KV label="Employer" value={String(draft.rm_employer || "—")} />
          <KV label="Acknowledgment" value="Placed from the signature on file when sent" />
        </div>
        <div className="pp-grid">
          <Field ctx={ctx} k="rm_comp_categories" span={3} />
          {cats.includes("other") ? <Field ctx={ctx} k="rm_comp_other" span={3} placeholder="Describe the other lawful compensation" /> : null}
        </div>
        {mode === "operator" && sof.rm && !sof.rm.present ? <Callout tone="warn">{sof.rm.how_to_fix}</Callout> : null}
      </PPanel>

      <PPanel title="Compensation and conflict disclosure (Schedule 3)" sub="Every payment between the parties, in either direction. A blank line prints as $0 / None. The dealer initials this schedule at signing.">
        <div className="pp-tblwrap">
          <table className="pp-tbl pp-comp-tbl">
            <thead><tr><th>Payment</th><th>Amount or formula</th><th>Purpose</th></tr></thead>
            <tbody>
              {COMP_ROWS.map(([label, amountKey, purposeKey]) => (
                <tr key={amountKey}>
                  <td>{label}</td>
                  <td id={`pp-field-${amountKey}`}><input id={`pp-in-${amountKey}`} className="pp-input" placeholder="$0" value={str(draft[amountKey])} disabled={readOnly} onChange={(e) => set(amountKey, e.target.value)} /></td>
                  <td id={`pp-field-${purposeKey}`}><input id={`pp-in-${purposeKey}`} className="pp-input" placeholder="None" value={str(draft[purposeKey])} disabled={readOnly} onChange={(e) => set(purposeKey, e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pp-grid" style={{ marginTop: 12 }}>
          <Field ctx={ctx} k="program_economics_1" span={3} placeholder="None" />
          <Field ctx={ctx} k="program_economics_2" span={3} placeholder="None" />
          <Field ctx={ctx} k="program_economics_3" span={3} placeholder="None" />
          <Field ctx={ctx} k="financing_cost_included" span={draft.financing_cost_included === "Yes" ? 1 : 3} />
          {draft.financing_cost_included === "Yes" ? <Field ctx={ctx} k="financing_cost_explain" span={2} placeholder="How the compensation is included in the cost of financing" /> : null}
          <Field ctx={ctx} k="conflict_disclosure_1" span={3} placeholder="None" />
          <Field ctx={ctx} k="conflict_disclosure_2" span={3} placeholder="None" />
          <Field ctx={ctx} k="sba_status" span={3} />
        </div>
      </PPanel>

      <PPanel title="Protected funding sources (Schedule 4)" sub="Capital sources Qualified Commercial introduced. Three rows print; a lender named on the term sheet is written into row 1 when the final is drafted.">
        <RowsEditor<ProtectedRow> id="protected_1_name" rows={protectedRows} columns={PROTECTED_COLUMNS} empty={() => ({ name: "", rel: "", date: "", txn: "" })} max={3} fixed onChange={writeProtected} disabled={readOnly} />
        <div className="pp-grid" style={{ marginTop: 12 }}><Field ctx={ctx} k="protected_source" span={2} placeholder="The Protected Funding Source named on the certificate" /></div>
      </PPanel>

      <PPanel title="Preexisting funding relationships (Schedule 4)" sub="Relationships the dealer already had before the program. Four rows print.">
        <RowsEditor<ExistingRow> id="existing_1_name" rows={existingRows} columns={EXISTING_COLUMNS} empty={() => ({ name: "", rel: "", info: "" })} max={4} fixed onChange={writeExisting} disabled={readOnly} />
      </PPanel>
    </>
  );
}
