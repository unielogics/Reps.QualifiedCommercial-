export type ApplicationProfileData = {
  dba_name: string | null;
  website: string | null;
  state_of_formation: string | null;
  location_type: string | null;
  mailing_address: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_zip: string | null;
  annual_sales: number | null;
  annual_cash_flow_available_for_debt: number | null;
  monthly_debt_payments: number | null;
  signer_title: string | null;
  landlord_mortgagee: string | null;
  guarantor_home_address: string | null;
  guarantor_dob: string | null;
  selected_program: string | null;
  term_requested_months: number | null;
  collateral_description: string | null;
  use_of_proceeds_text: string | null;
  human_review_status?: "pending" | "fundable" | "not_fundable";
  human_review_note?: string | null;
};

export type SubmissionReadinessItem = {
  requirement: string;
  status: "complete" | "missing" | "supplemental" | "not_applicable";
  evidence: string;
  route: string;
  source: string | null;
};

export type SubmissionReadiness = {
  ready: boolean;
  package_ready: boolean;
  route_key: string | null;
  route_label: string | null;
  human_review_status: "pending" | "fundable" | "not_fundable";
  human_review_note: string | null;
  human_reviewed_at: string | null;
  human_reviewed_by_user_id: string | null;
  rules_version: string | null;
  items: SubmissionReadinessItem[];
  counts: Record<string, number>;
};

export function applicationProfileReady(
  profile: ApplicationProfileData | null | undefined,
): boolean {
  if (!profile) return false;
  return Boolean(
    profile.state_of_formation?.trim()
      && profile.mailing_address?.trim()
      && profile.mailing_city?.trim()
      && profile.mailing_state?.trim()
      && profile.mailing_zip?.trim()
      && profile.signer_title?.trim()
      && Number(profile.annual_sales ?? 0) > 0,
  );
}
