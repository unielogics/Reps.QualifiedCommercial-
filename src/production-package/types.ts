// MIRROR: keep identical to QCRep/src/production-package/* (scripts/check-production-package-mirror.sh)
// Shapes mirror app/schemas/production_package.py on the backend.

export type PackageStatus = "draft" | "out_for_signature" | "executed" | "void";
export type PackageMode = "operator" | "rep" | "partner";
export type AccessVia = "operator" | "share_link" | "ownership";
export type StepKey =
  | "parties" | "lot" | "products" | "advance" | "buildout"
  | "thresholds" | "shortfall" | "funding" | "disclosures" | "projection" | "preview" | "send";

export type ProductKey = "vsc" | "gap" | "theft" | "appearance" | "key" | "tire" | "maint" | "power";
export type ThresholdKey =
  | "units" | "vsc_count" | "vsc_pen" | "vsc_pen3" | "vsc_gross" | "total_gross" | "debt_service" | "remittance";

export type Numberish = number | "";

export type ProductRow = {
  on: boolean;
  cur_rate: Numberish;
  cur_premium: Numberish;
  rate: Numberish;
  premium: Numberish;
  repay: Numberish;
  comm: Numberish;
  admin: Numberish;
  retention: Numberish;
  term: Numberish;
};

// §9.2 ownership schedule row (OWNER_FIELDS on the backend).
export type OwnerRow = { name: string; pct: Numberish; title: string; email: string; phone: string; auth: string };

// Schedule 1 use of funds (USE_OF_FUNDS_KEYS + other_label on the backend).
export type UseOfFundsKey = "inventory" | "debt_payoff" | "working_capital" | "equipment" | "real_estate" | "program_implementation" | "other";
export type UseOfFunds = Record<UseOfFundsKey, Numberish> & { other_label: string };

export type Arrangement = {
  [key: string]: unknown;
  products: Record<ProductKey, ProductRow>;
  thresholds: Partial<Record<ThresholdKey, Numberish>>;
  evidence: string[];
  use_of_funds: UseOfFunds;
  owners: OwnerRow[];
};

export type Provenance = Record<string, { source: string; label: string; confirmed: boolean }>;

export type AttentionItem = { step: StepKey; key: string; title: string; detail: string };

export type ProductEcon = {
  key: ProductKey; label: string; on: boolean;
  cur_rate: number; cur_premium: number; rate: number; premium: number;
  repay: number; comm: number; comm_pct: number; admin: number; retention_pct: number; reserve: number; term: number;
  contracts: number; cur_contracts: number; gross: number; cur_gross: number;
  repay_m: number; comm_m: number; admin_m: number; reserve_m: number;
  uplift: number; d_contracts: number; d_gross: number;
};

export type ThresholdRow = {
  key: ThresholdKey; label: string; format: "count" | "pct" | "money";
  baseline: number | null; guideline: number; operative: number | null; overridden: boolean; blank: boolean; editable: true;
} | { key: string; label: string; value: string; editable?: false };

export type Computed = {
  document_version: string;
  stage?: number;
  econ: {
    units: number; rows: ProductEcon[]; on: ProductKey[]; covered_labels: string[];
    contracts: number; gross: number; cur_contracts: number; cur_gross: number;
    d_contracts: number; d_gross: number; d_gross_term: number;
    repay_m: number; comm_m: number; admin_m: number; reserve_m: number; max_term: number;
    blended_attach: number | null; cur_per_vehicle: number | null;
    waterfall: Array<{ label: string; value: number }>;
  };
  lot: { lot_value: number; months_of_inventory: number | null; sell_through_pct: number | null };
  advance: {
    term: number; requested: number; supported: number; advance: number; sizing: "backsolve" | "fixed";
    implied_rate: number; cost_rate: number; spread: number; clears: boolean; floor_points: number;
    bank_cost: number; orig_cost: number; prof_fees: number; mgmt_total: number; loss_cost: number; total_cost: number;
    total_repay: number;
    cost_lines: Array<{ key: string; label: string; amount: number; when: string; share_pct: number | null }>;
  };
  thresholds: {
    rows: ThresholdRow[]; guideline: Record<string, unknown>; remittance_req: number; coverage_pct: number;
    rolling: Array<{ label: string; value: number; format: "count" | "pct" | "money" }>;
  };
  buildout: {
    debt_service: number; fund_target_pct: number; policy_funded: number; funded_pct: number; out_of_pocket: number;
    loan_free: boolean; need_monthly: number;
    solve_rows: Array<{ key: ProductKey; label: string; contracts: number; cur_premium: number; solve_repay: number; needed: number; uplift: number; steep: boolean }>;
    required_per_contract: number; required_uplift_pct: number;
    scenarios: Record<"with" | "without", {
      key: string; title: string; sub: string; tag: string; free: boolean; payment: number; funded: number;
      from_operations: number; total_from_operations: number; funded_pct: number; gross: number;
    }>;
  };
  sponsor: { markup_pct: number; markup_m: number; mgmt_m: number; total_over_term: number };
  projection: {
    span: number; term: number; bars: Array<{ m: number; repay: number; comm: number; reserve: number; total: number }>;
    peak: number; steady_from_month: number | null; plateau_monthly: number; retire_month: number | null;
    roll_off_months: number; first_month_total: number; totals: { repay: number; comm: number; reserve: number };
  };
  attention: AttentionItem[];
  attention_presentation: AttentionItem[];
  attention_stage_two: AttentionItem[];
  preview: Record<"one" | "two", Array<{ schedule: string; label: string; value: string; blank: boolean }>>;
};

export type SponsorAgreement = {
  id: string; contract_number: string; document_version: string; signed_at: string | null;
  signer_name: string | null; signer_title: string | null; certificate_url: string | null; admin_url: string | null;
};

export type SponsorOption = {
  company_id: string; name: string; entity_type: string | null; state_of_formation: string | null;
  principal_address: string | null; notice_email: string | null; notice_attention: string | null;
  agreement: SponsorAgreement | null;
};

export type ShareLink = {
  id: string; rep_user_id: string; rep_name: string | null; label: string | null; outside_book: boolean;
  created_at: string; expires_at: string; revoked_at: string | null; last_used_at: string | null; use_count: number; active: boolean;
};

export type SignatureParty = "dealer" | "qc" | "sponsor" | "rm" | "fp";

export type Signature = {
  id: string; party: SignatureParty; method: "electronic" | "manual" | "stored"; status: "pending" | "signed" | "voided";
  initials: string | null; stored_signature_id: string | null; stored_adopted_at: string | null; placed_at: string | null;
  expected_signer_name: string | null; typed_name: string | null; sent_at: string | null; viewed_at: string | null;
  signed_at: string | null; signer_name: string | null; signer_title: string | null; signed_on: string | null;
  recorded_at: string | null; recorded_by_name: string | null; scan_available: boolean; scan_url: string | null;
  note: string | null; voided_at: string | null; void_reason: string | null;
};

// The executed stage-one record a final was drafted from (package.original / revision.original).
export type OriginalRef = {
  package_id: string; revision_id: string; revision_no: number; content_sha256: string;
  executed_at: string | null; executed_url?: string | null; title?: string; executed_pdf_sha256?: string | null;
};

// Funding attestation as stored on the final's revision (revision.funding).
export type FundingRecord = {
  attested_by_user_id?: string; attested_by_name?: string; attested_at?: string;
  actual_funding_date?: string; amount_funded?: number; funding_party_name?: string;
  funding_reference?: string | null; note?: string | null; attestation_version?: string; text?: string;
};

export type Revision = {
  id: string; revision_no: number; stage: number; status: string; document_key: string; document_title: string;
  document_version: string; content_sha256: string; rendered_pdf_sha256: string | null; current_pdf_sha256: string | null;
  unsigned_url: string | null; current_url: string | null; executed_url: string | null;
  sent_at: string | null; completed_at: string | null; voided_at: string | null; void_reason: string | null;
  sponsor_snapshot: Record<string, unknown> | null; signatures: Signature[];
  funding: FundingRecord | null;
  arrangement?: Arrangement | null;
  original: OriginalRef | null;
};

export type Capabilities = {
  can_edit: boolean; can_confirm: boolean; can_generate: boolean; can_send: boolean; can_reopen: boolean;
  can_void: boolean; can_record: boolean; can_execute: boolean; can_share: boolean; can_pick_sponsor: boolean;
  can_capture_consent: boolean; can_remind: boolean; can_manage_terms: boolean; can_draft_final: boolean;
  can_compare: boolean; can_adopt_sponsor_signature: boolean;
};

export type SmsConsent = { phone: string | null; status: "granted" | "missing" | "opted_out" | "no_phone"; detail: string };

export type Presentation = { url: string | null; sha256: string | null; generated_at: string | null; stale: boolean; available: boolean };

export type DeliveryEntry = {
  at: string; action: string; channel: string; recipient_email: string | null; recipient_phone: string | null;
  emailed: boolean; texted: boolean; detail: string; by: string;
};

// ---- term sheet (ProductionTermSheetBody / Read / State / Result) ----

export type FundingPartyKind = "Sponsor" | "Qualified Commercial LLC" | "Lender";

export type TermSheetUseOfFunds = Partial<Record<UseOfFundsKey, number | null>> & { other_label?: string | null };

export type TermSheetBody = {
  funding_party_kind: FundingPartyKind;
  lender_id: string | null;
  funding_party_name: string;
  facility_type: string;
  approved_amount: number;
  min_activation_amount: number;
  rate_pct: number;
  term_months: number;
  monthly_debt_service: number | null;
  debt_service_is_level_payment: boolean;
  expected_funding_date: string | null;
  activation_date: string | null;
  commencement_date: string | null;
  maturity_date: string | null;
  use_of_funds: TermSheetUseOfFunds | null;
  conditions: string | null;
  notes: string | null;
  extra?: Record<string, unknown>;
};

export type TermSheet = {
  id: string; version: number; status: "current" | "superseded" | "withdrawn" | string;
  funding_party_kind: string; lender_id: string | null; funding_party_name: string; facility_type: string;
  approved_amount: number; min_activation_amount: number; rate_pct: number; term_months: number;
  monthly_debt_service: number; debt_service_is_level_payment: boolean;
  expected_funding_date: string | null; activation_date: string | null; commencement_date: string | null; maturity_date: string | null;
  use_of_funds: TermSheetUseOfFunds | null; conditions: string | null; notes: string | null;
  entered_at: string; entered_by_name: string | null; superseded_at: string | null; withdrawn_at: string | null;
  consumed_by_package_id: string | null; level_payment: number | null;
};

export type Lender = { id: string; name: string };

export type TermSheetState = {
  current: TermSheet | null;
  history: TermSheet[];
  defaults: Record<string, unknown>;
  defaults_source: Record<string, string>;
  lenders: Lender[];
  can_edit: boolean;
  facility_types: string[];
  funding_party_kinds: string[];
};

export type TermSheetResult = { state: TermSheetState; final: ProductionPackage | null };

// ---- original vs final ----

export type ComparisonRow = {
  section: string; key: string; label: string; format: string;
  before: string; after: string; changed: boolean; original_blank: boolean; dealer_visible: boolean;
};

export type Comparison = { rows: ComparisonRow[]; changed_count: number; source: "live" | "frozen" };

export type PreviousFinal = { id: string; status: string; created_at: string; voided_at: string | null };

// ---- signatures on file (qc / sponsor / rm) ----

export type SignatureOnFile = { present: boolean; typed_name: string | null; adopted_at: string | null; how_to_fix: string | null; user_id?: string | null };
export type SignaturesOnFile = { qc?: SignatureOnFile; sponsor?: SignatureOnFile; rm?: SignatureOnFile; ready?: boolean };

export type StoredSignatureRead = {
  id: string; subject_type: string; subject_id: string | null; typed_name: string; title: string | null; source: string;
  adopted_at: string | null; adopted_by_user_id?: string | null; consent_version?: string | null; [key: string]: unknown;
};

// ---- send ----

export type FundingAttestation = {
  confirm: boolean; actual_funding_date: string; amount_funded: number; funding_party_name: string;
  funding_reference?: string | null; note?: string | null;
};

export type SendRequest = {
  channel: "sms" | "email"; recipient_email?: string; recipient_phone?: string; funding_attestation?: FundingAttestation;
};

export type ProductionPackage = {
  id: string; profile_id: string; intake_id: string | null; dealer_id: string | null; stage: number;
  status: PackageStatus; version: number; business_name: string; client_email: string | null; client_phone: string | null;
  arrangement: Arrangement; prefill_provenance: Provenance; computed: Computed;
  attention: AttentionItem[]; attention_presentation: AttentionItem[];
  sponsor: SponsorOption | null; presentation: Presentation; active_revision: Revision | null; revisions: Revision[];
  share_links: ShareLink[]; delivery_history: DeliveryEntry[]; capabilities: Capabilities; sms_consent: SmsConsent;
  sent_at: string | null; executed_at: string | null; voided_at: string | null; void_reason: string | null;
  executed_url: string | null; updated_at: string; updated_by_name: string | null; sponsor_signing_url: string; mode: PackageMode;
  access_via: AccessVia; sent_by_name: string | null; sent_via: string | null; recipient_preview: string | null;
  execution_pending: boolean;
  // stage two
  parent_package_id: string | null; final_package_id: string | null; final_status: string | null;
  term_sheet: TermSheet | null; original: OriginalRef | null; comparison: Comparison | null;
  previous_finals: PreviousFinal[]; signatures_on_file: SignaturesOnFile;
};

export type SendResult = { package: ProductionPackage; delivered: boolean; emailed: boolean; texted: boolean; detail: string; already_sent: boolean };

export type HistoryEvent = {
  id: string; occurred_at: string; action: string; summary: string; actor_name: string | null; actor_role: string | null;
  source: string; metadata: Record<string, unknown>;
};

export type TeamMember = { id: string; name: string; email: string; role: string };

export type ApiInit = { method?: string; body?: unknown; headers?: Record<string, string> };
export type ApiCall = <T>(path: string, init?: ApiInit) => Promise<T>;
