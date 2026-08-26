export type AppointmentStatus = "pending" | "confirmed" | "cancelled" | "done";
export type AppointmentOutcome = "not_converted" | "did_not_show" | "converted";
export type ClientRsvpStatus = "needs_action" | "accepted" | "tentative" | "declined" | "unknown";

export type RepAppointment = {
  id: string;
  dealer_id: string | null;
  owner_user_id: string | null;
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
  outcome: AppointmentOutcome | null;
  outcome_note: string | null;
  outcome_at: string | null;
  archived_at: string | null;
  cancellation_reason: string | null;
  conversion_target: "field_desk" | "ai_intake" | null;
  converted_dealer_id: string | null;
  converted_intake_id: string | null;
  confirmation_email_status: string | null;
  confirmation_sms_status: string | null;
  email_reminder_status: string | null;
  sms_reminder_status: string | null;
  google_sync_status: string | null;
  rep_notification_status: string | null;
  rep_reminder_status: string | null;
  delivery_error: string | null;
  notification_results: Record<string, string> | null;
  created_at: string;
  updated_at: string;
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
