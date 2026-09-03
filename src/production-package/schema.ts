// MIRROR: keep identical to QCRep/src/production-package/*
// The field registry mirrors FIELD_RULES in app/services/production_arrangement.py.
// The server is authoritative for the attention list; this copy drives labels,
// controls, required styling and the deep-links.
import { ADJUSTMENTS, BUILDOUT_MODES, CADENCES, ENTITY_TYPES, EVIDENCE_OPTIONS, FACILITY_TYPES, FUNDING_PARTIES, SIZING_MODES } from "./options";
import type { StepKey } from "./types";

export type FieldKind = "text" | "number" | "date" | "email" | "phone" | "select" | "multiselect" | "textarea";
export type RequiredFor = "presentation" | "stage_one" | "stage_two" | "never";

export type FieldDef = {
  key: string;
  step: StepKey;
  label: string;
  kind: FieldKind;
  requiredFor: RequiredFor;
  nonZero?: boolean;
  hint?: string;
  always?: string;
  options?: readonly string[];
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

  f("cadence", "shortfall", "Shortfall billing cadence", "select", "never", { options: CADENCES.map((c) => c.key) }),
  f("cure_days", "shortfall", "Shortage cure period", "number", "stage_one", { nonZero: true, always: "Business days after notice", unit: "days" }),
  f("corrective", "shortfall", "Corrective period", "text", "stage_one"),
  f("adj", "shortfall", "Program rate adjustment", "select", "never", { options: ADJUSTMENTS.map((a) => a[0]) }),
  f("adj_value", "shortfall", "Adjustment value", "number"),
  f("exclusions", "shortfall", "Approved exclusions", "textarea"),

  f("funding_party", "send", "Funding party", "select", "stage_two", { options: FUNDING_PARTIES }),
  f("funding_date", "send", "Actual funding date", "date", "stage_two"),
  f("funded_amount", "send", "Funded amount", "number", "stage_two", { nonZero: true, unit: "$" }),
  f("commencement", "send", "Production commencement date", "date", "stage_two"),
  f("activation_date", "send", "Activation date", "date", "stage_two", { always: "May not be earlier than actual funding" }),
  f("maturity", "send", "Original maturity date", "date", "stage_two"),
];

export const FIELD_BY_KEY: Record<string, FieldDef> = Object.fromEntries(FIELDS.map((d) => [d.key, d]));
export const SPONSOR_KEYS = new Set(["sponsor_name", "sponsor_state", "sponsor_entity", "sponsor_address", "sponsor_platform", "sponsor_email"]);

export const STEPS: Array<{ key: StepKey; label: string; title: string; sub: string }> = [
  { key: "parties", label: "Parties", title: "Parties to the agreement", sub: "Dealer, sponsor and relationship manager, exactly as they print on both agreements." },
  { key: "lot", label: "Lot and baseline", title: "The lot and the verified baseline", sub: "What the dealer has on the ground today, and the trailing production the thresholds are derived from." },
  { key: "products", label: "Products and attachment", title: "Covered products and attachment rates", sub: "Which products carry a commitment, how often they attach, and what each contract is worth." },
  { key: "advance", label: "Advance and programme cost", title: "Advance and programme cost", sub: "What the dealer is asking for, what the programme actually costs to run, and whether the deal clears." },
  { key: "buildout", label: "Policy buildout", title: "Policy buildout", sub: "Whether the policies carry the loan payment, and what the dealer is left paying out of pocket." },
  { key: "thresholds", label: "Operative thresholds", title: "Operative thresholds", sub: "The exact figures that become enforceable at activation." },
  { key: "shortfall", label: "Shortfall and cure", title: "Shortfall billing and cure", sub: "What happens in a month when production comes in light." },
  { key: "projection", label: "Projection", title: "Repayment and earnout timeline", sub: "How repayment, commissions and reserves build over the life of the deal." },
  { key: "preview", label: "Contract preview", title: "Contract preview", sub: "What prints on the agreement as it stands right now." },
  { key: "send", label: "Send and signatures", title: "Send and signatures", sub: "Both stages, who has signed, and what is blocking the next one." },
];

export function isBlank(def: FieldDef, value: unknown): boolean {
  if (def.kind === "number") {
    if (value === "" || value === null || value === undefined) return true;
    const n = Number(value);
    return Number.isNaN(n) || (Boolean(def.nonZero) && n === 0);
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
