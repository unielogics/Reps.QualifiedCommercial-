export type ProspectStage = {
  id?: string;
  key: string;
  label: string;
  position: number;
  color?: string | null;
  is_active?: boolean;
};

export type ProspectStageStrategy = "advance_follow_up";
export type ProspectEmailAction = "dealer_information_pack" | "missed_call" | "callback_confirmation" | "booking_link";
export type ProspectWorkflowAction = "book_appointment";

export type ProspectOutcomeActionConfig = {
  target_stage_key?: string;
  stage_strategy?: ProspectStageStrategy;
  email_action?: ProspectEmailAction;
  workflow_action?: ProspectWorkflowAction;
  requires_follow_up?: boolean;
  requires_appointment?: boolean;
  increment_call_attempt?: boolean;
  set_do_not_contact?: boolean;
  clear_follow_up?: boolean;
  suppress_email?: boolean;
  follow_up_delay_hours?: number;
};

export type ProspectOutcome = {
  id?: string;
  key: string;
  label: string;
  position: number;
  is_active?: boolean;
  requires_follow_up?: boolean;
  requires_appointment?: boolean;
  creates_email_draft?: boolean;
  action_config?: ProspectOutcomeActionConfig;
};

export type ProspectDraftPurpose = "dealer_information" | "missed_call" | "callback_confirmation" | "client_will_call_back" | "booking" | "general";
export type ProspectCcScope = "this_email" | "this_and_future";
export type ProspectGenerationReason = "ai_generated" | "ai_disabled" | "ai_access_blocked" | "ai_provider_error" | "ai_output_rejected" | "ai_usage_record_failed" | "approved_fallback" | "fallback_reason_not_recorded";
export type ProspectInstructionDisposition = "none" | "submitted_to_ai" | "not_applied_fallback" | "unknown";

export function prospectGenerationReasonLabel(reason?: ProspectGenerationReason | null): string | null {
  if (!reason) return null;
  const labels: Record<ProspectGenerationReason, string> = {
    ai_generated: "AI completed the personalized draft.",
    ai_disabled: "AI drafting is currently disabled.",
    ai_access_blocked: "The drafting service could not access the approved AI model.",
    ai_provider_error: "The AI provider could not complete this draft.",
    ai_output_rejected: "The AI response did not pass QC's content safeguards.",
    ai_usage_record_failed: "AI processing could not be completed with the required audit record.",
    approved_fallback: "The approved deterministic template was selected.",
    fallback_reason_not_recorded: "This earlier result did not record a specific fallback reason.",
  };
  return labels[reason];
}

export type ProspectOutreachPolicy = ProspectSenderIdentity & {
  drafting_guidance: string;
  additional_blocked_phrases: string[];
  locked_rules: string[];
  review_seconds: number;
  test_recipient_email: string;
  updated_at?: string | null;
  updated_by_user_id?: string | null;
};

export type ProspectTestEmailRequest = {
  idempotency_key: string;
  purpose: ProspectDraftPurpose;
  sample_contact_name: string;
  sample_dealer_name: string;
  verified_conversation_context?: string | null;
  ai_instructions?: string | null;
  include_collateral: boolean;
  collateral_asset_ids: string[];
};

export type ProspectEmailDraftCreateRequest = {
  idempotency_key: string;
  compose_mode?: "ai" | "manual";
  purpose: ProspectDraftPurpose;
  private_note?: string | null;
  verified_conversation_context?: string | null;
  ai_instructions?: string | null;
  cc_emails?: string[];
  cc_scope?: ProspectCcScope;
  subject?: string | null;
  body?: string | null;
  include_collateral: boolean;
  collateral_asset_ids: string[];
};

export type DealerProspectCreateRequest = {
  contact_id?: string | null;
  contact_name: string;
  dealer_name: string;
  email: string;
  phone: string;
  source: "quick_add";
  initial_note?: string | null;
};

export type ProspectSenderIdentity = {
  sender_display_name?: string | null;
  sender_title?: string | null;
  sender_phone?: string | null;
  sender_display_email?: string | null;
  sender_from_name?: string | null;
  envelope_from_email?: string | null;
  reply_contact_email?: string | null;
  alternate_contact_email?: string | null;
};

export type MarketingCollateralAsset = {
  id: string;
  assignment?: string;
  logical_key?: string;
  name: string;
  file_name: string;
  version: number;
  sort_order: number;
  status: "pending_approval" | "active" | "retired";
  content_type?: string;
  size_bytes?: number | null;
  sha256?: string | null;
  validation_status?: string | null;
  validation_detail?: string | null;
  preview_url?: string | null;
  download_url?: string | null;
  uploaded_by_user_id?: string | null;
  approved_by_user_id?: string | null;
  retired_by_user_id?: string | null;
  created_at?: string;
};

export type MarketingCollateralList = { items: MarketingCollateralAsset[] };

export type ProspectCollateralOption = {
  id: string;
  name: string;
  file_name: string;
  version: number;
  sort_order: number;
  size_bytes: number;
  preview_url?: string | null;
};

export type ProspectCollateralOptionList = { items: ProspectCollateralOption[] };

export type ProspectTestEmailResponse = ProspectSenderIdentity & {
  ok: boolean;
  delivery_state: "sent" | "failed" | "uncertain";
  to_email: string;
  subject: string;
  draft_source: "ai" | "fallback";
  generation_reason?: ProspectGenerationReason | null;
  instruction_disposition?: ProspectInstructionDisposition | null;
  attachment_names: string[];
  detail: string;
};

export type DealerProspect = {
  id: string;
  contact_id?: string | null;
  name: string;
  dealer_name: string;
  email: string;
  phone: string;
  owner_user_id?: string | null;
  owner_name?: string | null;
  stage_key: string;
  stage_label?: string | null;
  last_outcome_key?: string | null;
  last_outcome_label?: string | null;
  call_attempt_count: number;
  next_follow_up_at?: string | null;
  follow_up_state?: "none" | "upcoming" | "due" | "overdue";
  last_activity_at?: string | null;
  created_at?: string;
  updated_at: string;
  version: number;
  do_not_contact?: boolean;
  marketing_sms_consent?: boolean;
  default_cc_emails?: string[];
  conversion_target?: "portfolio_application" | "dealer_ai_intake" | null;
  converted_application_id?: string | null;
  converted_intake_id?: string | null;
};

export type ProspectDuplicateMatch = {
  entity_type?: "prospect" | "contact";
  prospect_id?: string | null;
  contact_id?: string | null;
  owner_user_id?: string | null;
  archived: boolean;
  can_restore?: boolean;
  version?: number | null;
  matched_on: Array<"email" | "phone">;
};

export type ProspectReassignmentRequest = {
  email?: string | null;
  phone?: string | null;
  idempotency_key: string;
  reason?: string | null;
};

export type ProspectReassignmentReceipt = {
  status: "accepted";
  request_token: string;
};

export type ProspectDuplicateCheck = {
  blocked: boolean;
  state: "clear" | "active_match" | "archived_match" | "hidden_match" | "identity_conflict";
  email_normalized?: string | null;
  phone_normalized?: string | null;
  visible_matches: ProspectDuplicateMatch[];
  assignment_required: boolean;
  can_restore: boolean;
  message: string;
};

export type ProspectTimelineItem = {
  id: string;
  source: string;
  source_id: string;
  kind: string;
  body?: string | null;
  metadata?: Record<string, unknown> | null;
  actor_user_id?: string | null;
  actor_name?: string | null;
  occurred_at: string;
};

export type ProspectTimelinePage = {
  items: ProspectTimelineItem[];
  next_cursor?: string | null;
};

export type ProspectFollowUpChoice = "next_business_day" | "two_business_days" | "custom";

export type ProspectFollowUpSuggestion = {
  scheduled_at: string;
  timezone: string;
  business_days: number;
};

export type ProspectActivity = {
  id: string;
  kind: string;
  body?: string | null;
  actor_name?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

export type ProspectEmailDraft = ProspectSenderIdentity & {
  id: string;
  prospect_id?: string;
  compose_mode?: "ai" | "manual";
  to_email?: string;
  cc_emails?: string[];
  from_email?: string;
  reply_to?: string;
  subject: string;
  body: string;
  status: "drafting" | "pending_review" | "editing" | "queued" | "sending" | "sent" | "failed" | "blocked" | "cancelled";
  send_after?: string | null;
  countdown_seconds?: number | null;
  sent_at?: string | null;
  prospect_name?: string | null;
  contact_id?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  dealer_name?: string | null;
  owner_user_id?: string | null;
  owner_name?: string | null;
  owner_email?: string | null;
  triggering_agent_id?: string | null;
  triggering_agent_name?: string | null;
  triggering_agent_email?: string | null;
  prospect_archived_at?: string | null;
  delivery_status?: string | null;
  provider_detail?: string | null;
  provider_status?: string | null;
  provider?: string | null;
  provider_message_id?: string | null;
  message_send_id?: string | null;
  delivered_at?: string | null;
  opened_at?: string | null;
  failed_at?: string | null;
  editable_body?: string | null;
  locked_footer_text?: string | null;
  attachment_count?: number;
  attachment_names?: string[];
  attachments?: ProspectEmailAttachment[];
  version?: number;
  draft_source?: "ai" | "fallback" | "manual";
  generation_reason?: ProspectGenerationReason | null;
  instruction_disposition?: ProspectInstructionDisposition | null;
  secure_bundle_link_required?: boolean;
  delivery_mode?: "attachments" | "secure_link";
  secure_bundle_expires_at?: string | null;
  created_at: string;
  updated_at?: string;
  error?: string | null;
};

export type ProspectEmailAttachment = {
  id: string;
  name: string;
  file_name: string;
  version: number;
  content_type?: string | null;
  size_bytes?: number | null;
  sha256?: string | null;
  preview_url?: string | null;
  download_url?: string | null;
};

export type ProspectConversionTarget = "portfolio_application" | "dealer_ai_intake";
export type ProspectConversionAction = "detect" | "link" | "reactivate" | "create";
export type ProspectConversionCandidate = {
  id: string;
  target: ProspectConversionTarget;
  status: string;
  archived: boolean;
  display_name: string;
  email?: string | null;
  phone?: string | null;
  created_at?: string | null;
  match_reasons?: string[];
  route?: string | null;
};
export type ProspectConversionCandidates = {
  target: ProspectConversionTarget;
  prospect_id: string;
  already_converted?: boolean;
  candidates: ProspectConversionCandidate[];
};
export type PortfolioConversionFields = {
  entity_type: string;
  requested_amount: number;
  funding_purpose: string;
  use_of_proceeds_note: string;
  secure_room_pin: string;
};

export type ProspectPage = {
  items: DealerProspect[];
  total: number;
  limit: number;
  offset: number;
  stages: ProspectStage[];
  outcomes: ProspectOutcome[];
  server_now?: string;
  follow_up_timezone?: string;
};

export type ProspectDetail = DealerProspect & {
  activities: ProspectActivity[];
  email_drafts?: ProspectEmailDraft[];
  thread_id?: string | null;
  appointment_id?: string | null;
  appointment_label?: string | null;
};

export type ProspectAccessUser = {
  user_id: string;
  name: string;
  email: string;
  role: string;
  account_status: string;
  field_desk_access: boolean;
  eligible: boolean;
  enabled: boolean;
  effective_enabled: boolean;
  updated_at?: string | null;
};

export type ProspectAccessList = {
  global_enabled: boolean;
  items: ProspectAccessUser[];
};

export const DEFAULT_PROSPECT_STAGES: ProspectStage[] = [
  { key: "new", label: "New", position: 0 },
  { key: "emailed", label: "Emailed", position: 1 },
  { key: "follow_up_1", label: "Follow-up 1", position: 2 },
  { key: "follow_up_2", label: "Follow-up 2", position: 3 },
  { key: "booked", label: "Booked", position: 4 },
  { key: "converted", label: "Converted", position: 5 },
  { key: "not_interested", label: "Not interested", position: 6 },
];

export const DEFAULT_PROSPECT_OUTCOMES: ProspectOutcome[] = [
  { key: "not_connected", label: "Not connected", position: 0, creates_email_draft: true },
  { key: "call_back", label: "Not available / call back", position: 1, requires_follow_up: true, creates_email_draft: true },
  { key: "wants_to_book", label: "Wants to book", position: 2, creates_email_draft: true },
  { key: "booked", label: "Booked", position: 3, requires_appointment: true, action_config: { requires_appointment: true } },
  { key: "interested_send_information", label: "Interested / send information", position: 4, creates_email_draft: true },
  { key: "not_interested", label: "Not interested", position: 5 },
  { key: "bad_contact_unsubscribe", label: "Bad contact / unsubscribe", position: 6 },
];

export function stageLabel(stages: ProspectStage[], key: string): string {
  return stages.find((stage) => stage.key === key)?.label ?? key.replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

export function displayDate(value?: string | null, includeTime = false): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return includeTime ? date.toLocaleString() : date.toLocaleDateString();
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
}
