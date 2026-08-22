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
import { api } from "./api";

export type Verification = {
  bank_linked: boolean;
  bank_source: "plaid" | "upload" | "none";
  statement_months: string[];
  missing_statement_months: string[];
  credit_returned: boolean;
  unlocked: boolean;
  returned: number;
  reason: string;
  stage: string;
  credit_enabled: boolean;
};

export type Program = {
  key: string;
  label: string;
  eligible: boolean;
  needs: string[];
  blocked_by: string[];
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
  verification: Verification;
};

export type Dealer = {
  id: string;
  case_ref: string | null;
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
  status: string;
  started_on: string | null;
  funding_goal: number | null;
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
  credit_returned: false,
  unlocked: false,
  returned: 0,
  reason: "Awaiting both authorizations",
  stage: "intake",
  credit_enabled: true,
};

export function useCase(id: string) {
  const { getToken } = useAuth();

  const dealer = useQuery({
    queryKey: ["dealer", id],
    queryFn: async () =>
      api<Dealer>(`/dealer-os/dealers/${id}`, { authToken: (await getToken()) ?? undefined }),
  });

  const decision = useQuery({
    queryKey: ["decision", id],
    queryFn: async () =>
      api<Decision>(`/dealer-os/dealers/${id}/decision`, {
        authToken: (await getToken()) ?? undefined,
      }),
  });

  // Default to locked while loading. Drawing the unlocked shape first and
  // snapping shut a moment later would show a rep three steps that then
  // vanish, which reads as a bug rather than as a gate.
  const verification = decision.data?.verification ?? NO_VERIFICATION;

  return {
    dealer: dealer.data,
    decision: decision.data,
    verification,
    unlocked: verification.unlocked,
    isLoading: dealer.isLoading || decision.isLoading,
    isError: dealer.isError,
    notFound: dealer.isError,
  };
}
