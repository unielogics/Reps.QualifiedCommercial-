// MIRROR: keep identical to QCRep/src/production-package/* (scripts/check-production-package-mirror.sh)
// Shapes mirror app/schemas/production_package.py on the backend.

export type PackageStatus = "draft" | "out_for_signature" | "executed" | "void";
export type PackageMode = "operator" | "rep";
export type StepKey =
  | "parties" | "lot" | "products" | "advance" | "buildout"
  | "thresholds" | "shortfall" | "projection" | "preview" | "send";

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

export type Arrangement = {
  [key: string]: unknown;
  products: Record<ProductKey, ProductRow>;
  thresholds: Partial<Record<ThresholdKey, Numberish>>;
  evidence: string[];
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

export type Signature = {
  id: string; party: "dealer" | "qc" | "sponsor"; method: "electronic" | "manual"; status: "pending" | "signed" | "voided";
  expected_signer_name: string | null; typed_name: string | null; sent_at: string | null; viewed_at: string | null;
  signed_at: string | null; signer_name: string | null; signer_title: string | null; signed_on: string | null;
  recorded_at: string | null; recorded_by_name: string | null; scan_available: boolean; scan_url: string | null;
  note: string | null; voided_at: string | null; void_reason: string | null;
};

export type Revision = {
  id: string; revision_no: number; stage: number; status: string; document_key: string; document_title: string;
  document_version: string; content_sha256: string; rendered_pdf_sha256: string | null; current_pdf_sha256: string | null;
  unsigned_url: string | null; current_url: string | null; executed_url: string | null;
  sent_at: string | null; completed_at: string | null; voided_at: string | null; void_reason: string | null;
  sponsor_snapshot: Record<string, unknown> | null; signatures: Signature[];
};

export type Capabilities = {
  can_edit: boolean; can_confirm: boolean; can_generate: boolean; can_send: boolean; can_reopen: boolean;
  can_void: boolean; can_record: boolean; can_execute: boolean; can_share: boolean; can_pick_sponsor: boolean;
  can_capture_consent: boolean;
};

export type SmsConsent = { phone: string | null; status: "granted" | "missing" | "opted_out" | "no_phone"; detail: string };

export type Presentation = { url: string | null; sha256: string | null; generated_at: string | null; stale: boolean; available: boolean };

export type DeliveryEntry = {
  at: string; action: string; channel: string; recipient_email: string | null; recipient_phone: string | null;
  emailed: boolean; texted: boolean; detail: string; by: string;
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
};

export type SendResult = { package: ProductionPackage; delivered: boolean; emailed: boolean; texted: boolean; detail: string; already_sent: boolean };

export type HistoryEvent = {
  id: string; occurred_at: string; action: string; summary: string; actor_name: string | null; actor_role: string | null;
  source: string; metadata: Record<string, unknown>;
};

export type TeamMember = { id: string; name: string; email: string; role: string };

export type ApiInit = { method?: string; body?: unknown; headers?: Record<string, string> };
export type ApiCall = <T>(path: string, init?: ApiInit) => Promise<T>;
