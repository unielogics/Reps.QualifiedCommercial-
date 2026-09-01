export type AppointmentStatus = "pending" | "confirmed" | "cancelled" | "done";
export type AppointmentOutcome = "not_converted" | "did_not_show" | "converted";
export type ClientRsvpStatus = "needs_action" | "accepted" | "tentative" | "declined" | "unknown";
export type AppointmentCrmStatus = "scheduled" | "confirmed" | "completed" | "follow_up" | "no_show" | "not_qualified" | "converted" | "cancelled";

export type RepAppointment = {
  id: string;
  dealer_id: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  calendar_event_id: string | null;
  contact_id: string | null;
  kind: "callback" | "program_intro" | "underwriting_review" | string;
  title: string;
  starts_at: string;
  duration_min: number;
  timezone: string;
  invitee_name: string;
  invitee_email: string | null;
  invitee_phone: string | null;
  company: string | null;
  program_key: string | null;
  program_name: string | null;
  requested_amount: string | null;
  full_address: string | null;
  join_url: string | null;
  notes: string | null;
  status: AppointmentStatus;
  client_rsvp_status: ClientRsvpStatus;
  client_rsvp_at: string | null;
  rsvp_checked_at: string | null;
  booked_by_user_id: string | null;
  booked_by_name: string | null;
  outcome: AppointmentOutcome | null;
  outcome_note: string | null;
  outcome_at: string | null;
  archived_at: string | null;
  cancellation_reason: string | null;
  conversion_target: "field_desk" | "ai_intake" | "funding_loan" | null;
  converted_dealer_id: string | null;
  converted_intake_id: string | null;
  linked_loan_id: string | null;
  meeting_mode: "video" | "phone" | "in_person";
  location: string | null;
  crm_status: AppointmentCrmStatus;
  follow_up_at: string | null;
  crm_updated_at: string | null;
  crm_updated_by_user_id: string | null;
  workflow_outcome_definition_id: string | null;
  workflow_outcome_label: string | null;
  workflow_outcome_effects: string[] | null;
  workflow_outcome_results: Record<string, unknown> | null;
  workflow_outcome_applied_at: string | null;
  workflow_outcome_by_user_id: string | null;
  confirmation_email_status: string | null;
  confirmation_sms_status: string | null;
  email_reminder_status: string | null;
  sms_reminder_status: string | null;
  google_sync_status: string | null;
  rep_notification_status: string | null;
  rep_reminder_status: string | null;
  delivery_error: string | null;
  /** When that failure was recorded — a stale error should not read as live. */
  delivery_error_at: string | null;
  notification_results: Record<string, string> | null;
  created_at: string;
  updated_at: string;
};

export type AppointmentActivity = {
  id: string;
  appointment_id: string;
  event_type: string;
  body: string | null;
  actor_user_id: string | null;
  actor_name: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
};

export type AppointmentApplicationSummary = {
  intake_id: string;
  profile_id: string | null;
  loan_id: string | null;
  vertical: string;
  underwriting_status: string;
  is_draft: boolean;
  ready_for_step_2: boolean;
  unlocked: boolean;
  blockers: string[];
};

export type AppointmentFundingSummary = {
  loan_id: string;
  deal_id: string;
  client_id: string;
  stage: string;
  amount: number | null;
  entity_name: string | null;
  address: string | null;
};

export type AppointmentFileOption = {
  kind: "intake" | "loan";
  id: string;
  label: string;
  subtitle: string | null;
  status: string;
  href: string;
};

export type AppointmentWorkspace = {
  appointment: RepAppointment;
  activities: AppointmentActivity[];
  application: AppointmentApplicationSummary | null;
  funding_file: AppointmentFundingSummary | null;
  application_candidates: Array<{
    intake_id: string;
    variant: string;
    business_name: string | null;
    full_name: string;
    email: string;
    status: string;
    created_at: string;
  }>;
  booking_data_review: Array<{
    field: string;
    label: string;
    current_value: string | null;
    proposed_value: string | null;
    status: "matches" | "missing_in_file" | "conflict" | "file_only" | "empty" | "unlinked";
    target_kind: "intake" | "loan" | null;
  }>;
  capabilities: {
    can_edit: boolean;
    can_add_notes: boolean;
    can_manage_crm: boolean;
    can_start_application: boolean;
    can_retry_delivery: boolean;
    can_manage_outcomes: boolean;
    can_manage_outcome_catalog: boolean;
    can_link_files: boolean;
    can_create_funding_loan: boolean;
  };
};

export type RepCalendarCapabilities = {
  can_manage_all: boolean;
  can_manage_appointment_crm: boolean;
  can_apply_outcomes: boolean;
  can_manage_outcome_catalog: boolean;
};

export type AppointmentOutcomeEffect = "log_activity" | "file_action" | "schedule_follow_up" | "request_documents" | "send_no_show_rebooking" | "close_enquiry";

export type AppointmentOutcomeDefinition = {
  id: string;
  owner_user_id: string | null;
  scope: "personal" | "shared";
  name: string;
  description: string | null;
  color: "blue" | "green" | "amber" | "red" | "violet" | "gray";
  target_crm_status: AppointmentCrmStatus;
  effects: AppointmentOutcomeEffect[];
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type AppointmentActionResult = {
  action: string;
  status: "completed" | "skipped" | "failed" | "pending";
  detail: string | null;
  href: string | null;
};

export type ApplyAppointmentOutcomeResult = {
  appointment_id: string;
  outcome_definition_id: string;
  outcome_label: string;
  crm_status: AppointmentCrmStatus;
  idempotent_replay: boolean;
  actions: AppointmentActionResult[];
  workspace: AppointmentWorkspace;
  attempted_at: string;
};

export function appointmentRsvpLabel(appointment: Pick<RepAppointment, "status" | "client_rsvp_status">): string {
  if (appointment.status === "cancelled") return "Cancelled";
  if (appointment.client_rsvp_status === "accepted") return "Confirmed";
  if (appointment.client_rsvp_status === "needs_action") return "Invitation sent - awaiting response";
  if (appointment.client_rsvp_status === "tentative") return "Tentative";
  if (appointment.client_rsvp_status === "declined") return "Declined";
  return "Confirmation unknown";
}

export function appointmentRsvpTone(appointment: Pick<RepAppointment, "status" | "client_rsvp_status">): string {
  if (appointment.status === "cancelled") return "c-mut";
  if (appointment.client_rsvp_status === "accepted") return "c-ok";
  if (appointment.client_rsvp_status === "needs_action") return "c-warn";
  if (appointment.client_rsvp_status === "tentative") return "c-acc";
  if (appointment.client_rsvp_status === "declined") return "c-bad";
  return "c-mut";
}

export function appointmentRsvpClass(appointment: Pick<RepAppointment, "status" | "client_rsvp_status">): string {
  if (appointment.status === "cancelled") return "rsvp-unknown";
  return `rsvp-${appointment.client_rsvp_status || "unknown"}`;
}

export function appointmentOutcomeLabel(value: AppointmentOutcome | null): string | null {
  if (value === "not_converted") return "Not converted";
  if (value === "did_not_show") return "Did not show";
  if (value === "converted") return "Converted";
  return null;
}

export function appointmentCrmLabel(value: AppointmentCrmStatus): string {
  return {
    scheduled: "Scheduled",
    confirmed: "Confirmed",
    completed: "Completed",
    follow_up: "Follow-up",
    no_show: "No-show",
    not_qualified: "Not qualified",
    converted: "Converted",
    cancelled: "Cancelled",
  }[value];
}
