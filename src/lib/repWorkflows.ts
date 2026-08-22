export type ComposeChannel = "email" | "sms";
export type BankEvidenceSource = "plaid" | "upload" | "none";

export type BankEvidenceRead = {
  bank_linked: boolean;
  bank_source: BankEvidenceSource;
  statement_months: string[];
  missing_statement_months: string[];
  statement_target: number;
  bucket_id?: string | null;
  upload_url?: string | null;
  passcode?: string | null;
};

export type BankUploadRequestResult = {
  url: string;
  passcode?: string | null;
  delivered: boolean;
  emailed: boolean;
  texted: boolean;
  detail?: string | null;
  bucket_id?: string | null;
  upload_link_id?: string | null;
  requested_document_id?: string | null;
};

export type CalendarSlotDay = {
  label: string;
  slots: Array<{ starts_at: string; label: string; date_label: string }>;
};

export type ProgramPdfAttachment = {
  key: string;
  title: string;
  description: string;
  filename: string;
  download_url?: string;
};

export type InboxComposeRequest = {
  dealer_id?: string | null;
  recipient_name: string;
  company?: string | null;
  recipient_email?: string | null;
  recipient_phone?: string | null;
  channels: ComposeChannel[];
  subject: string;
  body: string;
  transactional_sms_consent?: boolean;
  marketing_sms_consent?: boolean;
  consent_method?: "self_web" | "in_person_device" | "rep_attested";
};

export type StandaloneRepAppointment = {
  kind: "callback" | "program_intro" | "underwriting_review";
  title?: string | null;
  starts_at: string;
  duration_min?: number | null;
  timezone?: string | null;
  invitee_name: string;
  company?: string | null;
  invitee_email?: string | null;
  invitee_phone?: string | null;
  join_url?: string | null;
  notes?: string | null;
};

export type ContactShareRequest = {
  dealer_id?: string | null;
  recipient_name: string;
  company?: string | null;
  recipient_email?: string | null;
  recipient_phone?: string | null;
  channel: "email" | "sms" | "email_sms";
  transactional_sms_consent?: boolean;
  marketing_sms_consent?: boolean;
  consent_method?: "self_web" | "in_person_device" | "rep_attested";
  program_pdf_keys?: string[];
  notes?: string | null;
};
