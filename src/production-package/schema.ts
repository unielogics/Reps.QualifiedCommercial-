// MIRROR: keep identical to QCRep/src/production-package/*
// The field registry mirrors FIELD_RULES in app/services/production_arrangement.py.
// The server is authoritative for the attention list; this copy drives labels,
// controls, required styling and the deep-links.
import {
  ADJUSTMENTS, BUILDOUT_MODES, CADENCES, ENTITY_TYPES, EVIDENCE_OPTIONS, FACILITY_TYPES, FUNDING_PARTIES,
  PROGRAM_SUPPORT_OPTIONS, RM_COMP_OPTIONS, SBA_OPTIONS, SIZING_MODES, YES_NO,
} from "./options";
import type { StepKey } from "./types";

export type FieldKind = "text" | "number" | "date" | "email" | "phone" | "select" | "multiselect" | "textarea" | "rows" | "money_group";
export type RequiredFor = "presentation" | "stage_one" | "stage_two" | "never";
// Plain strings print as they are stored; pairs are [stored value, label as printed].
export type FieldOptions = readonly string[] | ReadonlyArray<readonly [string, string]>;

export type FieldDef = {
  key: string;
  step: StepKey;
  label: string;
  kind: FieldKind;
  requiredFor: RequiredFor;
  nonZero?: boolean;
  hint?: string;
  always?: string;
  options?: FieldOptions;
  unit?: "$" | "%" | "days" | "months";
};

const f = (key: string, step: StepKey, label: string, kind: FieldKind, requiredFor: RequiredFor = "never", extra: Partial<FieldDef> = {}): FieldDef =>
  ({ key, step, label, kind, requiredFor, ...extra });

export const FIELDS: FieldDef[] = [
  f("dealer_name", "parties", "Full legal name", "text", "presentation", { hint: "Every schedule prints the dealer's full legal name." }),
  f("dealer_state", "parties", "State of formation", "select", "stage_one"),
  f("dealer_entity", "parties", "Entity type", "select", "stage_one", { options: ENTITY_TYPES }),
  f("dealer_dba", "parties", "DBA", "text"),
  f("dealer_address", "parties", "Address", "text", "stage_one", { hint: "Formal notice cannot be served without it." }),
  f("dealer_signer_name", "parties", "Authorized signer", "text", "stage_one", { always: "The person who signs for the dealer — they type this name to sign" }),
  f("dealer_signer_title", "parties", "Signer title", "text", "stage_one"),
  f("sponsor_name", "parties", "Full legal name", "select", "presentation", { hint: "Chosen from the companies holding a signed Referral Protection Agreement." }),
  f("sponsor_state", "parties", "State of formation", "select", "stage_one"),
  f("sponsor_entity", "parties", "Entity type", "select", "stage_one", { options: ENTITY_TYPES }),
  f("sponsor_address", "parties", "Principal address", "text"),
  f("sponsor_platform", "parties", "Sponsor platform", "text", "stage_one", { always: "The administration platform named on Schedule A" }),
  f("sponsor_email", "parties", "Notice email", "email", "stage_one", { hint: "Notice under both agreements is served by confirmed email." }),
  f("rm_name", "parties", "Relationship manager", "select", "presentation"),
  f("rm_employer", "parties", "Employer", "text", "stage_one"),
  f("rm_email", "parties", "Email", "email", "stage_one"),
  f("rm_phone", "parties", "Phone", "phone", "stage_one"),
  // stage two — §9.1 business identity, §9.2 ownership schedule, notice email
  f("identity_formation_date", "parties", "Formation date", "date", "stage_two", { hint: "§9.1 requires the dealer's formation date." }),
  f("identity_ein", "parties", "EIN", "text", "stage_two", { hint: "§9.1 requires the EIN." }),
  f("identity_naics", "parties", "NAICS (6-digit)", "text", "stage_two", { hint: "§9.1 requires the exact six-digit NAICS activity." }),
  f("identity_license", "parties", "Dealer license no.", "text"),
  f("identity_website", "parties", "Website", "text"),
  f("owners", "parties", "Ownership schedule", "rows", "stage_two", { hint: "§9.2 requires every owner, totalling exactly 100.00%." }),
  f("dealer_notice_email", "parties", "Dealer notice email", "email", "stage_two", { hint: "Formal notice is served by confirmed email.", always: "Defaults to the intake email — the room login" }),

  f("lot_units", "lot", "Vehicles in the lot", "number", "presentation", { nonZero: true, always: "Counted on the onsite review" }),
  f("avg_cost", "lot", "Average cost of car", "number", "presentation", { nonZero: true, always: "Average acquisition cost, not retail price", unit: "$" }),
  f("monthly_units", "lot", "Average monthly retail units", "number", "presentation", { nonZero: true, always: "Trailing twelve-month average" }),
  f("cancels", "lot", "Cancellations per month", "number"),
  f("chargebacks", "lot", "Chargebacks per month", "number"),
  f("base_from", "lot", "Baseline from", "date", "presentation"),
  f("base_through", "lot", "Baseline through", "date", "presentation"),
  f("evidence", "lot", "Evidence relied upon", "multiselect", "presentation", { options: EVIDENCE_OPTIONS, always: "DMS records, sponsor reports, bank records, product reports" }),
  f("seasonality", "lot", "Seasonality", "textarea"),

  f("requested", "advance", "Requested amount", "number", "presentation", { nonZero: true, always: "What the dealer is asking for", unit: "$" }),
  f("min_activation", "advance", "Minimum activation amount", "number", "presentation", { nonZero: true, always: "No partial advance below this activates", unit: "$" }),
  f("facility_type", "advance", "Requested facility type", "select", "presentation", { options: FACILITY_TYPES }),
  f("term", "advance", "Term", "number", "presentation", { nonZero: true, unit: "months" }),
  f("dealer_cof", "advance", "Dealer cost of funds", "number", "presentation", { nonZero: true, always: "Negotiated with the dealer on their credit profile", unit: "%" }),
  f("exclusivity", "advance", "Exclusivity window", "number", "stage_one", { nonZero: true, unit: "days" }),
  f("bank_cof", "advance", "Bank cost of funds", "number", "never", { always: "Near zero — we lend against a bank line", unit: "%" }),
  f("orig_cost", "advance", "Origination and underwriting", "number", "presentation", { nonZero: true, always: "One-time, carried against the whole term", unit: "$" }),
  f("prof_fees", "advance", "Consulting and professional fees", "number", "presentation", { nonZero: true, always: "Legal, advisory, onsite review", unit: "$" }),
  f("mgmt_fee", "advance", "Programme management", "number", "never", { always: "A month", unit: "$" }),
  f("loss_prov", "advance", "Loss provision", "number", "never", { unit: "%" }),
  f("fund_target", "buildout", "Share of payment policies should fund", "number", "never", { unit: "%" }),
  f("debt_service", "advance", "Monthly facility debt service", "number", "presentation", { nonZero: true, always: "Sets the 125% remittance covenant", unit: "$" }),
  f("markup", "advance", "Sponsor markup", "number", "presentation", { nonZero: true, always: "The sponsor's margin on every contract sold", unit: "%" }),
  f("sizing", "advance", "Advance sizing", "select", "never", { options: SIZING_MODES.map((s) => s[0]) }),
  f("buildout_mode", "buildout", "Buildout mode", "select", "never", { options: BUILDOUT_MODES.map((s) => s[0]) }),
  // Commitment header dates (optional; print blank unless entered)
  f("written_approval_date", "advance", "Written approval date", "date", "never", { always: "Starts the exclusivity window" }),
  f("outside_funding_date", "advance", "Outside funding date", "date", "never", { always: "The commitment expires if unfunded by this date" }),

  f("cadence", "shortfall", "Shortfall billing cadence", "select", "never", { options: CADENCES.map((c) => c.key) }),
  f("cure_days", "shortfall", "Shortage cure period", "number", "stage_one", { nonZero: true, always: "Business days after notice", unit: "days" }),
  f("corrective", "shortfall", "Corrective period", "text", "stage_one"),
  f("adj", "shortfall", "Program rate adjustment", "select", "never", { options: ADJUSTMENTS.map((a) => a[0]) }),
  f("adj_value", "shortfall", "Adjustment value", "number"),
  f("exclusions", "shortfall", "Approved exclusions", "textarea"),
  f("exclusion_1", "shortfall", "Approved exclusion 1", "text"),
  f("exclusion_2", "shortfall", "Approved exclusion 2", "text"),
  f("exclusion_3", "shortfall", "Approved exclusion 3", "text"),

  // stage two — §9.5 / §10.7
  f("audit_discrepancy_threshold", "thresholds", "Audit discrepancy threshold", "number", "stage_two", { nonZero: true, unit: "%", always: "§9.5 — the reporting discrepancy that triggers audit-cost reimbursement (suggested 5%)" }),
  f("review_threshold", "thresholds", "Right-of-first-review threshold", "number", "stage_two", { nonZero: true, unit: "$", always: "§10.7 — new business-purpose financing above this is offered to Qualified Commercial first" }),

  // stage two — funding facility (Schedule 1) and activation certificate (Schedule 5)
  f("funding_party", "funding", "Funding party", "select", "stage_two", { options: FUNDING_PARTIES }),
  f("funding_party_name", "funding", "Funding party legal name", "text", "stage_two", { hint: "Schedule 1 and the activation certificate name the entity that advanced the capital." }),
  f("funding_date", "funding", "Actual funding date", "date", "stage_two"),
  f("funded_amount", "funding", "Funded amount", "number", "stage_two", { nonZero: true, unit: "$" }),
  f("commencement", "funding", "Production commencement date", "date", "stage_two"),
  f("activation_date", "funding", "Activation date", "date", "stage_two", { always: "May not be earlier than actual funding" }),
  f("maturity", "funding", "Original maturity date", "date", "stage_two"),
  f("funding_docs_executed_date", "funding", "Final funding documents executed on", "date", "stage_two", { always: "Certificate line 1 — on or before actual funding" }),
  f("controlled_account", "funding", "Controlled account", "text", "stage_two", { hint: "Schedule 1 names the controlled or remittance account." }),
  f("ach_account", "funding", "ACH account", "text", "stage_two", { hint: "Schedule 1 names the ACH true-up account." }),
  f("use_of_funds", "funding", "Approved use of funds", "money_group", "stage_two", { hint: "Schedule 1 allocates the funded amount across approved purposes." }),
  f("program_support", "funding", "Program support provided", "multiselect", "never", { options: PROGRAM_SUPPORT_OPTIONS }),
  f("program_support_other", "funding", "Other program support", "text"),
  f("fp_joinder", "funding", "Funding Party joinder", "select", "never", { options: [["no", "No joinder"], ["yes", "The Funding Party joins (signs in wet ink)"]] }),

  // stage two — Schedules 2–4
  f("rm_comp_categories", "disclosures", "Compensation category", "multiselect", "stage_two", { options: RM_COMP_OPTIONS, hint: "Schedule 2 names the compensation category; bank points and lender commissions are prohibited." }),
  f("rm_comp_other", "disclosures", "Other lawful compensation", "text"),
  f("comp_fp_qc_amount", "disclosures", "Amount or formula", "text"),
  f("comp_fp_qc_purpose", "disclosures", "Purpose", "text"),
  f("comp_fp_sponsor_amount", "disclosures", "Amount or formula", "text"),
  f("comp_fp_sponsor_purpose", "disclosures", "Purpose", "text"),
  f("comp_dealer_qc_amount", "disclosures", "Amount or formula", "text"),
  f("comp_dealer_qc_purpose", "disclosures", "Purpose", "text"),
  f("comp_dealer_sponsor_amount", "disclosures", "Amount or formula", "text"),
  f("comp_dealer_sponsor_purpose", "disclosures", "Purpose", "text"),
  f("program_economics_1", "disclosures", "Sponsor or product economics (line 1)", "text"),
  f("program_economics_2", "disclosures", "Sponsor or product economics (line 2)", "text"),
  f("program_economics_3", "disclosures", "Sponsor or product economics (line 3)", "text"),
  f("financing_cost_included", "disclosures", "Compensation included in the cost of financing?", "select", "stage_two", { options: YES_NO }),
  f("financing_cost_explain", "disclosures", "If yes, explain", "textarea"),
  f("conflict_disclosure_1", "disclosures", "Conflict disclosure (line 1)", "text"),
  f("conflict_disclosure_2", "disclosures", "Conflict disclosure (line 2)", "text"),
  f("sba_status", "disclosures", "SBA status", "select", "stage_two", { options: SBA_OPTIONS }),
  f("protected_source", "disclosures", "Protected Funding Source", "text", "never", { always: "Certificate line 15" }),
  ...[1, 2, 3].flatMap((i) => [
    f(`protected_${i}_name`, "disclosures", `Protected funding source ${i} — legal name`, "text"),
    f(`protected_${i}_rel`, "disclosures", `Protected funding source ${i} — relationship`, "text"),
    f(`protected_${i}_date`, "disclosures", `Protected funding source ${i} — date introduced`, "date"),
    f(`protected_${i}_txn`, "disclosures", `Protected funding source ${i} — funded transaction`, "text"),
  ]),
  ...[1, 2, 3, 4].flatMap((i) => [
    f(`existing_${i}_name`, "disclosures", `Preexisting relationship ${i} — legal name`, "text"),
    f(`existing_${i}_rel`, "disclosures", `Preexisting relationship ${i} — existing relationship`, "text"),
    f(`existing_${i}_info`, "disclosures", `Preexisting relationship ${i} — supporting information`, "text"),
  ]),
];

export const FIELD_BY_KEY: Record<string, FieldDef> = Object.fromEntries(FIELDS.map((d) => [d.key, d]));
export const SPONSOR_KEYS = new Set(["sponsor_name", "sponsor_state", "sponsor_entity", "sponsor_address", "sponsor_platform", "sponsor_email"]);
// Keys the term sheet owns on the final; the desk changes them on the sheet, not the form.
export const TERM_SHEET_KEYS = new Set([
  "requested", "sizing", "funded_amount", "dealer_cof", "term", "debt_service", "min_activation", "facility_type",
  "funding_party", "funding_party_name", "funding_date", "activation_date", "commencement", "maturity", "use_of_funds",
]);

export type StepDef = { key: StepKey; label: string; title: string; sub: string; stages: readonly number[] };

export const STEPS: StepDef[] = [
  { key: "parties", label: "Parties", title: "Parties to the agreement", sub: "Dealer, sponsor and relationship manager, exactly as they print on both agreements.", stages: [1, 2] },
  { key: "lot", label: "Lot and baseline", title: "The lot and the verified baseline", sub: "What the dealer has on the ground today, and the trailing production the thresholds are derived from.", stages: [1, 2] },
  { key: "products", label: "Products and attachment", title: "Covered products and attachment rates", sub: "Which products carry a commitment, how often they attach, and what each contract is worth.", stages: [1, 2] },
  { key: "advance", label: "Advance and programme cost", title: "Advance and programme cost", sub: "What the dealer is asking for, what the programme actually costs to run, and whether the deal clears.", stages: [1, 2] },
  { key: "buildout", label: "Policy buildout", title: "Policy buildout", sub: "Whether the policies carry the loan payment, and what the dealer is left paying out of pocket.", stages: [1, 2] },
  { key: "thresholds", label: "Operative thresholds", title: "Operative thresholds", sub: "The exact figures that become enforceable at activation.", stages: [1, 2] },
  { key: "shortfall", label: "Shortfall and cure", title: "Shortfall billing and cure", sub: "What happens in a month when production comes in light.", stages: [1, 2] },
  { key: "funding", label: "Funding facility", title: "Funding facility — Schedule 1", sub: "The facility as funded: party, amounts, dates, accounts and use of funds, from the term sheet.", stages: [2] },
  { key: "disclosures", label: "Compensation and relationships", title: "Compensation and relationships — Schedules 2–4", sub: "The relationship manager's compensation category, every disclosed fee, and the protected and preexisting funding relationships.", stages: [2] },
  { key: "projection", label: "Projection", title: "Repayment and earnout timeline", sub: "How repayment, commissions and reserves build over the life of the deal.", stages: [1, 2] },
  { key: "preview", label: "Contract preview", title: "Contract preview", sub: "What prints on the agreement as it stands right now.", stages: [1, 2] },
  { key: "send", label: "Send and signatures", title: "Send and signatures", sub: "Both stages, who has signed, and what is blocking the next one.", stages: [1, 2] },
];

/** The steps a package of this stage walks through, in order. */
export function stepsFor(stage: number | null | undefined): StepDef[] {
  const s = stage === 2 ? 2 : 1;
  return STEPS.filter((d) => d.stages.includes(s));
}

export function optionPairs(opts: FieldOptions | undefined): Array<[string, string]> {
  return (opts ?? []).map((o) => (Array.isArray(o) ? [String(o[0]), String(o[1])] : [String(o), String(o)]));
}

export function optionLabel(opts: FieldOptions | undefined, value: string): string {
  return optionPairs(opts).find((p) => p[0] === value)?.[1] ?? value;
}

export function isBlank(def: FieldDef, value: unknown): boolean {
  if (def.kind === "number") {
    if (value === "" || value === null || value === undefined) return true;
    const n = Number(value);
    return Number.isNaN(n) || (Boolean(def.nonZero) && n === 0);
  }
  if (def.kind === "rows") {
    if (!Array.isArray(value)) return true;
    return !value.some((row) => row && typeof row === "object" && Object.values(row as Record<string, unknown>).some((v) => v !== null && v !== undefined && String(v).trim() !== ""));
  }
  if (def.kind === "money_group") {
    if (!value || typeof value !== "object") return true;
    return !Object.entries(value as Record<string, unknown>).some(([k, v]) => k !== "other_label" && v !== "" && v !== null && v !== undefined && Number(v) !== 0 && !Number.isNaN(Number(v)));
  }
  if (Array.isArray(value)) return !value.some((v) => String(v).trim());
  return value === null || value === undefined || !String(value).trim();
}

export function fieldRequiredNow(def: FieldDef, scope: "presentation" | "stage_one" | "stage_two" = "stage_one"): boolean {
  if (def.requiredFor === "never") return false;
  if (scope === "presentation") return def.requiredFor === "presentation";
  if (scope === "stage_one") return def.requiredFor === "presentation" || def.requiredFor === "stage_one";
  return true;
}

export const REQUIRED_HINT = "Required — a blank field is not enforceable";
