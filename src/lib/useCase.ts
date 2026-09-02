"use client";

// One fetch of the case, shared by the header and every step.
//
// The header shows the stage and the gate chip; the step rail decides what is
// reachable; steps 3 to 5 render or refuse. All of those are the same fact, so
// they read it from one query rather than each asking. If they asked
// separately they would disagree for a moment after a bank connection lands,
// and the moment a rep notices the header and the rail disagreeing is the
// moment they stop trusting either.
//
// The gate itself is the server's. `unlocked` here decides what to draw, never
// what is allowed.

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { ApiError, api } from "./api";

export type Verification = {
  bank_linked: boolean;
  bank_source: "assets" | "plaid" | "upload" | "none";
  statement_months: string[];
  missing_statement_months: string[];
  statement_target: number;
  bank_exception_available: boolean;
  bank_exception_active: boolean;
  credit_returned: boolean;
  unlocked: boolean;
  returned: number;
  reason: string;
  stage: string;
  credit_enabled: boolean;
  ownership_total: number;
  ownership_complete: boolean;
  owner_contact_complete: boolean;
  missing_credit_contact_owner_ids: string[];
  required_credit_owner_count: number;
  completed_credit_owner_count: number;
  pending_credit_owner_ids: string[];
  pre_screen_complete: boolean;
  pre_screen_blockers: string[];
  preliminary_program_fit: Record<string, unknown> | null;
};

export type Program = {
  key: string;
  label: string;
  status?: "recommended" | "potential" | "blocked" | string;
  eligible: boolean;
  needs: string[];
  blocked_by: string[];
};

export type FinancialMetricSource = {
  status: string;
  source: string;
  label: string;
  evidence: string | null;
};

export type FinancialSnapshot = {
  credit_quality_tier: string | null;
  credit_score_band: string | null;
  credit_status: string;
  credit_completed_owners: number;
  credit_required_owners: number;
  annual_sales: number | null;
  annual_cash_flow_available_for_debt: number | null;
  monthly_debt_payments: number | null;
  dscr: number | null;
  avg_daily_balance: number | null;
  negative_balance_days_90: number | null;
  returned_items: number | null;
  average_monthly_deposits: number | null;
  annualized_deposits: number | null;
  indicative_capacity: number | null;
  capacity_path: string | null;
  periods_used: number;
  statement_months: string[];
  sources: Record<string, FinancialMetricSource>;
};

export type Decision = {
  verdict: string;
  headline: string;
  blocking: Array<{ label?: string; detail?: string }>;
  balance_passed: boolean | null;
  balance_reasons: string[];
  capped_by_balance: boolean;
  best_path: { label?: string; path_key?: string } | null;
  goal_feasible: boolean | null;
  ready_for_forms: boolean;
  programs: Program[];
  financial: FinancialSnapshot;
  verification: Verification;
  workflow: ApplicationWorkflow;
};

export type ProgramSelection = {
  system_program_key: string | null;
  system_program_status: string | null;
  effective_program_key: string | null;
  effective_program_status: string | null;
  manually_selected: boolean;
  selected_by_user_id: string | null;
  selected_by_name: string | null;
  selected_at: string | null;
  note: string | null;
  rules_version: string | null;
  system_blockers?: string[];
};

export type WorkflowStep = {
  available: boolean;
  complete: boolean;
  blockers: string[];
  warnings: string[];
};

export type ApplicationWorkflow = {
  workflow_ungated: boolean;
  step_1: WorkflowStep;
  step_2: WorkflowStep;
  step_3: WorkflowStep;
  step_4: WorkflowStep;
  program_selection: ProgramSelection;
};

export type Dealer = {
  id: string;
  case_ref: string | null;
  application_lifecycle?: "active" | "draft";
  draft_source?: string | null;
  name: string;
  legal_name: string | null;
  ein: string | null;
  entity_type: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  industry: string;
  industry_label: string | null;
  subindustry: string | null;
  subindustry_label: string | null;
  industry_entry_id: string | null;
  subindustry_entry_id: string | null;
  activity_entry_id: string | null;
  naics_code: string | null;
  naics_label: string | null;
  status: string;
  is_training: boolean;
  workflow_ungated: boolean;
  owner_user_id: string | null;
  submitting_agent_name: string | null;
  submitting_agent_email: string | null;
  bucket_id: string | null;
  bucket_name: string | null;
  handoff_intake_id: string | null;
  audit_client_since: string | null;
  started_on: string | null;
  funding_goal: number | null;
  client_requested_amount: number | null;
  funded_amount: number | null;
  funding_purpose: string | null;
  use_of_proceeds: Array<{ label: string; amount: number }> | null;
  use_of_proceeds_note: string | null;
  created_at: string;
};

const NO_VERIFICATION: Verification = {
  bank_linked: false,
  bank_source: "none",
  statement_months: [],
  missing_statement_months: [],
  statement_target: 6,
  bank_exception_available: false,
  bank_exception_active: false,
  credit_returned: false,
  unlocked: false,
  returned: 0,
  reason: "Awaiting both authorizations",
  stage: "intake",
  credit_enabled: true,
  ownership_total: 0,
  ownership_complete: false,
  owner_contact_complete: false,
  missing_credit_contact_owner_ids: [],
  required_credit_owner_count: 0,
  completed_credit_owner_count: 0,
  pending_credit_owner_ids: [],
  pre_screen_complete: false,
  pre_screen_blockers: [],
  preliminary_program_fit: null,
};

const EMPTY_STEP: WorkflowStep = { available: false, complete: false, blockers: [], warnings: [] };
const NO_WORKFLOW: ApplicationWorkflow = {
  workflow_ungated: false,
  step_1: { ...EMPTY_STEP, available: true },
  step_2: { ...EMPTY_STEP },
  step_3: { ...EMPTY_STEP },
  step_4: { ...EMPTY_STEP },
  program_selection: {
    system_program_key: null,
    system_program_status: null,
    effective_program_key: null,
    effective_program_status: null,
    manually_selected: false,
    selected_by_user_id: null,
    selected_by_name: null,
    selected_at: null,
    note: null,
    rules_version: null,
    system_blockers: [],
  },
};

export function useCase(id: string) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const authReady = isLoaded && Boolean(isSignedIn) && Boolean(id);
  const authenticatedGet = async <T,>(path: string): Promise<T> => {
    try {
      return await api<T>(path, { authToken: (await getToken()) ?? undefined });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      return api<T>(path, { authToken: (await getToken({ skipCache: true })) ?? undefined });
    }
  };

  const dealer = useQuery({
    queryKey: ["dealer", id],
    enabled: authReady,
    queryFn: () => authenticatedGet<Dealer>(`/dealer-os/dealers/${id}`),
    refetchOnWindowFocus: "always",
    refetchInterval: 30_000,
  });

  const decision = useQuery({
    queryKey: ["decision", id],
    enabled: authReady,
    queryFn: () => authenticatedGet<Decision>(`/dealer-os/dealers/${id}/decision`),
    refetchOnWindowFocus: "always",
    refetchInterval: 30_000,
  });

  // Default to locked while loading. Drawing the unlocked shape first and
  // snapping shut a moment later would show a rep three steps that then
  // vanish, which reads as a bug rather than as a gate.
  const verification = decision.data?.verification ?? NO_VERIFICATION;
  const workflow = decision.data?.workflow ?? NO_WORKFLOW;

  return {
    dealer: dealer.data,
    decision: decision.data,
    verification,
    workflow,
    unlocked: verification.unlocked,
    isLoading: dealer.isLoading || decision.isLoading,
    isError: dealer.isError,
    notFound: dealer.isError,
  };
}
