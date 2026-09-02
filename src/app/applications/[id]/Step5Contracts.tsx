"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  ExternalLink,
  FileSignature,
  FolderLock,
  Mail,
  RefreshCw,
  Route,
  ShieldCheck,
} from "lucide-react";
import Drawer from "@/components/Drawer";
import RequestPanel from "@/components/RequestPanel";
import AdminContractPackageControls from "@/components/AdminContractPackageControls";
import ProgramSelect, {
  GENERAL_PROGRAM_KEY,
  GENERAL_PROGRAM_NAME,
} from "@/components/ProgramSelect";
import { api } from "@/lib/api";
import {
  appointmentRsvpLabel,
  appointmentRsvpTone,
  type RepAppointment,
} from "@/lib/appointments";
import { type SubmissionReadiness } from "@/lib/applicationReadiness";
import {
  activeUnderwritingReviewPreference,
  type UnderwritingReviewPreference,
} from "@/lib/underwritingReview";
import { type Dealer, useCase } from "@/lib/useCase";
import { useMe } from "@/lib/useMe";

const MASTER_KEY = "qc_business_financing_application";

type Owner = {
  id: string;
  full_name: string;
  ownership_pct: number | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  credit_required: boolean;
  credit_complete: boolean;
};

type CaseDoc = {
  id: string;
  template_key: string;
  status: string;
  filled_sha256: string | null;
  signed_at: string | null;
  signer_name: string | null;
  signer_title: string | null;
  signature_sha256: string | null;
};

type ContractEnvelope = {
  id: string;
  title: string;
  package_version: number;
  program_key: string;
  status: string;
  signer_name: string | null;
  signer_title: string | null;
  completed_at: string | null;
  bundle_sha256: string | null;
  bundle_download_url: string | null;
  documents: Array<{ id: string; title: string; status: string; executed_sha256: string | null }>;
};

type SendResult = {
  url: string;
  passcode: string | null;
  delivered: boolean;
  emailed: boolean;
  texted: boolean;
  detail: string | null;
};

type Handoff = { intake_id: string | null; url: string | null };

const STATUS_OPTIONS = [
  ["active", "In review"],
  ["decision_ready", "Decision ready"],
  ["forms_out", "Agreements sent"],
  ["signed", "Signed"],
  ["complete", "Funded"],
  ["declined", "Not proceeding"],
] as const;

function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Awaiting evidence";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function ratio(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? "Awaiting evidence"
    : `${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
}

function when(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function humanStatus(value: string | null | undefined): string {
  return (value || "pending").replace(/_/g, " ");
}

function EvidenceGroup({
  title,
  icon,
  status,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  status?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="underwritingEvidenceGroup">
      <header>
        <span className="underwritingEvidenceIcon">{icon}</span>
        <b>{title}</b>
        {status && <span className="sp" />}
        {status}
      </header>
      <div className="underwritingEvidenceRows">{children}</div>
    </section>
  );
}

export default function Step5Contracts({ dealerId }: { dealerId: string }) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const { dealer, decision, verification } = useCase(dealerId);
  const { isSuperAdmin } = useMe();
  const [reviewNote, setReviewNote] = useState("");
  const [statusDraft, setStatusDraft] = useState("active");
  const [fundedAmount, setFundedAmount] = useState("");
  const [roomResult, setRoomResult] = useState<SendResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedReviewSlot, setSelectedReviewSlot] = useState("");
  const [reviewInviteeName, setReviewInviteeName] = useState("");
  const [reviewInviteeEmail, setReviewInviteeEmail] = useState("");
  const [reviewInviteePhone, setReviewInviteePhone] = useState("");
  const [reviewProgramKey, setReviewProgramKey] = useState(GENERAL_PROGRAM_KEY);
  const [reviewProgramName, setReviewProgramName] = useState(GENERAL_PROGRAM_NAME);
  const [reviewNotes, setReviewNotes] = useState("");
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);

  const authenticated = async <T,>(path: string, init?: RequestInit) =>
    api<T>(path, { ...init, authToken: (await getToken()) ?? undefined });

  const readiness = useQuery({
    queryKey: ["submission-readiness", dealerId],
    queryFn: () => authenticated<SubmissionReadiness>(
      `/dealer-os/dealers/${dealerId}/submission-readiness`,
    ),
  });
  const owners = useQuery({
    queryKey: ["owners", dealerId],
    queryFn: () => authenticated<Owner[]>(`/dealer-os/dealers/${dealerId}/owners`),
  });
  const reviewPreferences = useQuery({
    queryKey: ["underwriting-review-preferences", dealerId],
    queryFn: () => authenticated<UnderwritingReviewPreference[]>(
      `/dealer-os/dealers/${dealerId}/underwriting-review-preferences`,
    ),
  });
  const appointments = useQuery({
    queryKey: ["appointments", dealerId],
    queryFn: () => authenticated<RepAppointment[]>(`/dealer-os/dealers/${dealerId}/appointments`),
  });
  const caseDocs = useQuery({
    queryKey: ["case-contracts", dealerId],
    queryFn: () => authenticated<CaseDoc[]>(`/dealer-os/dealers/${dealerId}/contracts`),
  });
  const envelopes = useQuery({
    queryKey: ["contract-envelopes", dealerId],
    queryFn: () => authenticated<ContractEnvelope[]>(
      `/dealer-os/dealers/${dealerId}/contract-envelopes`,
    ),
    refetchInterval: 15_000,
  });
  const handoff = useQuery({
    queryKey: ["dealer-handoff", dealerId],
    enabled: isSuperAdmin,
    queryFn: () => authenticated<Handoff>(`/dealer-os/dealers/${dealerId}/handoff`),
  });

  const caseDoc = caseDocs.data?.find((item) => item.template_key === MASTER_KEY);
  const packageEnvelope = envelopes.data?.find((item) => item.status === "executed")
    ?? envelopes.data?.find((item) => item.status !== "void")
    ?? null;
  const reviewPreference = activeUnderwritingReviewPreference(reviewPreferences.data);
  const requiredOwners = (owners.data ?? []).filter((owner) => owner.credit_required);
  const completedOwners = requiredOwners.filter((owner) => owner.credit_complete).length;
  const primaryOwner = (owners.data ?? []).find((owner) => owner.is_primary);
  const reviewAppointment = reviewPreference?.appointment_id
    ? (appointments.data ?? []).find((appointment) => appointment.id === reviewPreference.appointment_id) ?? null
    : null;
  const financial = decision?.financial;
  const selectedReviewOption = reviewPreference?.slots.find(
    (slot) => slot.starts_at === selectedReviewSlot,
  ) ?? null;

  useEffect(() => {
    if (!dealer) return;
    setStatusDraft(dealer.status || "active");
    setFundedAmount(dealer.funded_amount?.toString() ?? "");
  }, [dealer?.status, dealer?.funded_amount]);

  useEffect(() => {
    setReviewNote(readiness.data?.human_review_note ?? "");
  }, [readiness.data?.human_review_note]);

  useEffect(() => {
    if (!dealer || !primaryOwner) return;
    setReviewInviteeName((current) => current || primaryOwner.full_name || dealer.name);
    setReviewInviteeEmail((current) => current || primaryOwner.email || dealer.email || "");
    setReviewInviteePhone((current) => current || primaryOwner.phone || dealer.phone || "");
    setReviewNotes((current) => current || `Underwriting review for ${dealer.name}.`);
  }, [dealer, primaryOwner]);

  useEffect(() => {
    if (reviewPreference?.selected_slot_at) setSelectedReviewSlot(reviewPreference.selected_slot_at);
  }, [reviewPreference?.selected_slot_at]);

  const download = useMutation({
    mutationFn: () => authenticated<{ url: string }>(
      `/dealer-os/dealers/${dealerId}/contracts/${MASTER_KEY}/url`,
    ),
    onSuccess: (result) => window.open(result.url, "_blank", "noopener,noreferrer"),
  });
  const review = useMutation({
    mutationFn: (status: "fundable" | "not_fundable" | "pending") =>
      authenticated<SubmissionReadiness>(
        `/dealer-os/dealers/${dealerId}/submission-readiness/human-review`,
        {
          method: "PATCH",
          body: JSON.stringify({ status, note: reviewNote.trim() || null }),
        },
      ),
    onSuccess: (result) => qc.setQueryData(["submission-readiness", dealerId], result),
  });
  const rotateRoom = useMutation({
    mutationFn: () => authenticated<SendResult>(
      `/dealer-os/dealers/${dealerId}/room/access-code`,
      { method: "POST" },
    ),
    onSuccess: (result) => {
      setRoomResult(result);
      void qc.invalidateQueries({ queryKey: ["dealer", dealerId] });
    },
  });
  const finalize = useMutation({
    mutationFn: () => authenticated<Dealer>(`/dealer-os/dealers/${dealerId}/finalization`, {
      method: "PATCH",
      body: JSON.stringify({
        status: statusDraft,
        ...(statusDraft === "complete" ? { funded_amount: Number(fundedAmount) } : {}),
      }),
    }),
    onSuccess: (result) => qc.setQueryData(["dealer", dealerId], result),
  });
  const startHandoff = useMutation({
    mutationFn: () => authenticated<Handoff>(`/dealer-os/dealers/${dealerId}/handoff`, {
      method: "POST",
    }),
    onSuccess: (result) => {
      qc.setQueryData(["dealer-handoff", dealerId], result);
      if (result.url) window.open(result.url, "_blank", "noopener,noreferrer");
    },
  });
  const convertAudit = useMutation({
    mutationFn: () => authenticated<{ dealer: Dealer; invite_error: string | null }>(
      `/dealer-os/dealers/${dealerId}/convert-to-audit`,
      { method: "POST", body: JSON.stringify({ send_login_invite: false }) },
    ),
    onSuccess: (result) => qc.setQueryData(["dealer", dealerId], result.dealer),
  });
  const bookReview = useMutation({
    mutationFn: () => authenticated<RepAppointment>(
      `/dealer-os/dealers/${dealerId}/underwriting-review-preferences/${reviewPreference?.id}/book`,
      {
        method: "POST",
        body: JSON.stringify({
          starts_at: selectedReviewSlot,
          invitee_name: reviewInviteeName.trim(),
          invitee_email: reviewInviteeEmail.trim(),
          invitee_phone: reviewInviteePhone.trim() || null,
          program_key: reviewProgramKey,
          program_name: reviewProgramName,
          requested_amount: dealer?.funding_goal ? money(dealer.funding_goal) : null,
          full_address: [
            dealer?.address,
            [dealer?.city, dealer?.state, dealer?.zip].filter(Boolean).join(" "),
          ].filter(Boolean).join(", ") || null,
          notes: reviewNotes.trim() || null,
          transactional_sms_consent: false,
        }),
      },
    ),
    onSuccess: async () => {
      setBookingOpen(false);
      setBookingConfirmed(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["underwriting-review-preferences", dealerId] }),
        qc.invalidateQueries({ queryKey: ["appointments", dealerId] }),
        qc.invalidateQueries({ queryKey: ["rep-appointments"] }),
      ]);
    },
  });

  const copy = async (label: string, value: string | null | undefined) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied((current) => current === label ? null : current), 1800);
  };

  const executed = packageEnvelope?.status === "executed" || caseDoc?.status === "executed";
  const decisionTone = readiness.data?.human_review_status === "fundable"
    ? "c-ok"
    : readiness.data?.human_review_status === "not_fundable"
      ? "c-bad"
      : "c-warn";
  const actionError = review.error ?? download.error
    ?? rotateRoom.error ?? finalize.error ?? startHandoff.error ?? convertAudit.error
    ?? bookReview.error;

  return (
    <>
      <div className="panel underwritingDesk">
        <div className="underwritingDeskHeader">
          <div>
            <span className="underwritingEyebrow">Final decision workspace</span>
            <h2>Underwriting desk review</h2>
            <p>Review the verified file, resolve the client meeting, record the credit decision, and complete disposition.</p>
          </div>
          <span className={`underwritingDecisionBadge ${decisionTone}`}>
            <span>Desk posture</span>
            <b>{humanStatus(readiness.data?.human_review_status)}</b>
          </span>
        </div>
        <div className="underwritingStatusStrip">
          <div><span>System route</span><b>{readiness.data?.route_label || "Awaiting route"}</b></div>
          <div><span>Verified bank evidence</span><b>{verification.statement_months.length} months</b></div>
          <div><span>Application package</span><b>{packageEnvelope ? humanStatus(packageEnvelope.status) : "Not generated"}</b></div>
          <div><span>Client meeting</span><b>{reviewAppointment ? appointmentRsvpLabel(reviewAppointment) : reviewPreference ? "Selection required" : "No windows submitted"}</b></div>
        </div>
        <div className="underwritingEvidenceGrid">
          <EvidenceGroup title="Applicant and request" icon={<Route size={17} />} status={<span className="cellchip c-acc">Current file</span>}>
            <div className="kv"><span>Business</span><b>{dealer?.legal_name || dealer?.name || "—"}</b></div>
            <div className="kv"><span>NAICS</span><b>{dealer?.naics_code ? `${dealer.naics_code} · ${dealer.naics_label || "Classified"}` : "Awaiting classification"}</b></div>
            <div className="kv"><span>Client requested</span><b>{money(dealer?.client_requested_amount ?? dealer?.funding_goal)}</b></div>
            <div className="kv"><span>Working funding goal</span><b>{money(dealer?.funding_goal)}</b></div>
            <div className="kv"><span>Use of funds</span><b>{dealer?.use_of_proceeds_note || dealer?.funding_purpose?.replace(/_/g, " ") || "Awaiting detail"}</b></div>
          </EvidenceGroup>
          <EvidenceGroup title="Verification and credit" icon={<ShieldCheck size={17} />} status={<span className={`cellchip ${verification.credit_returned ? "c-ok" : "c-warn"}`}>{verification.credit_returned ? "Returned" : "Incomplete"}</span>}>
            <div className="kv"><span>Required owners</span><b>{completedOwners} of {requiredOwners.length} completed</b></div>
            <div className="kv"><span>Bank evidence</span><b>{verification.statement_months.length} qualifying months</b></div>
            <div className="kv"><span>Owner credit</span><b>{verification.credit_returned ? "Returned for every required owner" : "One or more results remain"}</b></div>
            <div className="kv"><span>Primary signer</span><b>{primaryOwner?.full_name || "Awaiting owner record"}</b></div>
          </EvidenceGroup>
          <EvidenceGroup title="Financial capacity" icon={<CheckCircle2 size={17} />} status={<span className={`cellchip ${financial?.dscr ? "c-ok" : "c-warn"}`}>{financial?.dscr ? ratio(financial.dscr) : "Needs review"}</span>}>
            <div className="kv"><span>Annual sales</span><b>{money(financial?.annual_sales)}</b></div>
            <div className="kv"><span>Cash flow for debt</span><b>{money(financial?.annual_cash_flow_available_for_debt)}</b></div>
            <div className="kv"><span>Monthly debt</span><b>{money(financial?.monthly_debt_payments)}</b></div>
            <div className="kv"><span>Average daily balance</span><b>{money(financial?.avg_daily_balance)}</b></div>
            <div className="kv"><span>Annualized deposits</span><b>{money(financial?.annualized_deposits)}</b></div>
            <div className="kv"><span>Negative days / returned items</span><b>{financial?.negative_balance_days_90 ?? "—"} / {financial?.returned_items ?? "—"}</b></div>
          </EvidenceGroup>
          <EvidenceGroup title="Package and ownership" icon={<FileSignature size={17} />} status={<span className={`cellchip ${readiness.data?.package_ready ? "c-ok" : "c-warn"}`}>{readiness.data?.package_ready ? "Ready" : "Conditions"}</span>}>
            <div className="kv"><span>Evidence package</span><b>{readiness.data?.package_ready ? "Complete" : "Conditions remain"}</b></div>
            <div className="kv"><span>Signing package</span><b>{packageEnvelope ? `${packageEnvelope.title} · ${humanStatus(packageEnvelope.status)}` : "Not generated"}</b></div>
            <div className="kv"><span>Rules version</span><b>{readiness.data?.rules_version || "—"}</b></div>
            <div className="kv"><span>Submitting agent</span><b>{dealer?.submitting_agent_name || "Unassigned"}</b></div>
            <div className="kv"><span>Agent email</span><b>{dealer?.submitting_agent_email || "Not available"}</b></div>
          </EvidenceGroup>
        </div>
      </div>

      <div className="panel underwritingMeetingPanel">
        <div className="panel-h">
          <CalendarClock size={18} /> Client underwriting meeting
          <span className="sp" />
          <span className={`cellchip ${reviewAppointment ? appointmentRsvpTone(reviewAppointment) : reviewPreference ? "c-warn" : "c-mut"}`}>
            {reviewAppointment ? appointmentRsvpLabel(reviewAppointment) : reviewPreference ? "Choose and book" : "No proposals"}
          </span>
        </div>
        <div className="panel-b">
          {reviewAppointment && reviewAppointment.client_rsvp_status !== "declined" ? (
            <div className="underwritingBookedMeeting">
              <span className="underwritingBookedIcon"><CheckCircle2 size={22} /></span>
              <div>
                <span>Booked meeting</span>
                <b>{new Date(reviewAppointment.starts_at).toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}</b>
                <small>{reviewAppointment.invitee_name} · {reviewAppointment.invitee_email || "No email"} · {reviewAppointment.timezone}</small>
              </div>
              <div className="underwritingBookedActions">
                {reviewAppointment.join_url && <a className="btn" href={reviewAppointment.join_url} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Join meeting</a>}
                <a className="btn" href={`/calendar?appointment=${reviewAppointment.id}`}><CalendarClock size={15} /> Manage appointment</a>
              </div>
            </div>
          ) : (
            <>
              <div className="underwritingMeetingIntro">
                <div><b>{reviewAppointment?.client_rsvp_status === "declined" ? "Select a replacement window" : "Select one proposed window"}</b><span>Choosing a window opens the booking review. Availability is checked again before the invitation is created.</span></div>
                {reviewPreference && <span className="cellchip c-mut">{reviewPreference.timezone}</span>}
              </div>
              <div className="underwritingSlotGrid">
                {(reviewPreference?.slots ?? []).map((slot, index) => (
                  <button
                    type="button"
                    className={`underwritingSlot ${selectedReviewSlot === slot.starts_at ? "selected" : ""}`}
                    key={slot.starts_at}
                    disabled={!isSuperAdmin}
                    onClick={() => {
                      setSelectedReviewSlot(slot.starts_at);
                      setBookingConfirmed(false);
                      setBookingOpen(true);
                    }}
                  >
                    <span>Option {index + 1}</span>
                    <b>{slot.date_label}</b>
                    <strong>{slot.label}</strong>
                    <small>{slot.duration_min || 30} min · Proposed</small>
                  </button>
                ))}
              </div>
              {!reviewPreference && <div className="underwritingEmptyState">The submitting agent has not provided three review windows.</div>}
              {reviewAppointment?.client_rsvp_status === "declined" && <div className="warnline mt">The previous invitation was declined. Booking a replacement preserves that appointment in the audit history.</div>}
            </>
          )}
        </div>
      </div>

      {bookingOpen && reviewPreference && selectedReviewOption && (!reviewAppointment || reviewAppointment.client_rsvp_status === "declined") && (
        <Drawer
          title="Confirm underwriting review"
          width={820}
          dismissOnBackdrop={false}
          onClose={() => {
            setBookingOpen(false);
            setBookingConfirmed(false);
          }}
          bodyClassName="underwritingBookingModalBody"
        >
          <div className="underwritingBookingReview">
            <div className="underwritingBookingSelection">
              <span className="underwritingBookedIcon"><CalendarClock size={22} /></span>
              <div>
                <span>Selected appointment</span>
                <b>{selectedReviewOption.date_label} · {selectedReviewOption.label}</b>
                <small>{selectedReviewOption.duration_min || 30} minutes · {reviewPreference.timezone}</small>
              </div>
              <span className="cellchip c-warn">Availability rechecked on booking</span>
            </div>

            <section className="underwritingBookingSection">
              <header><b>Client and meeting details</b><span>The invitation is sent to this recipient.</span></header>
              <div className="underwritingBookingFields">
                <label><span className="lbl">Client name</span><input className="field" value={reviewInviteeName} onChange={(event) => setReviewInviteeName(event.target.value)} /></label>
                <label><span className="lbl">Client email</span><input className="field" type="email" value={reviewInviteeEmail} onChange={(event) => setReviewInviteeEmail(event.target.value)} /></label>
                <label><span className="lbl">Client phone</span><input className="field" type="tel" value={reviewInviteePhone} onChange={(event) => setReviewInviteePhone(event.target.value)} /></label>
                <label><span className="lbl">Program</span><ProgramSelect programKey={reviewProgramKey} programName={reviewProgramName} onChange={(selection) => { setReviewProgramKey(selection.key); setReviewProgramName(selection.name); }} /></label>
              </div>
              <label><span className="lbl">Internal appointment notes</span><textarea className="field" rows={3} value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} /></label>
            </section>

            <section className="underwritingBookingSection">
              <header><b>Booking effects</b><span>These actions occur together.</span></header>
              <div className="underwritingBookingEffects">
                <div><CalendarClock size={17} /><span><b>Reserve the live calendar</b><small>Create the appointment and Google Meet link when enabled.</small></span></div>
                <div><Mail size={17} /><span><b>Send the client invitation</b><small>Email the confirmed time and track the client response.</small></span></div>
                <div><FolderLock size={17} /><span><b>Prepare the secure review room</b><small>Link the appointment and required review documents to this file.</small></span></div>
              </div>
            </section>

            <label className={`underwritingBookingConfirm ${bookingConfirmed ? "on" : ""}`}>
              <input type="checkbox" checked={bookingConfirmed} onChange={(event) => setBookingConfirmed(event.target.checked)} />
              <span><b>I reviewed the time and recipient</b><small>Book this appointment and send the client invitation now.</small></span>
            </label>

            {bookReview.isError && <div className="warnline">{bookReview.error instanceof Error ? bookReview.error.message : "The appointment could not be booked."}</div>}
            <div className="underwritingBookingActions">
              <button type="button" className="btn" onClick={() => { setBookingOpen(false); setBookingConfirmed(false); }}>Cancel</button>
              <button
                type="button"
                className="btn pri"
                disabled={!bookingConfirmed || !reviewInviteeName.trim() || !reviewInviteeEmail.trim() || bookReview.isPending}
                onClick={() => bookReview.mutate()}
              >
                <CalendarClock size={16} /> {bookReview.isPending ? "Checking calendar..." : "Book meeting and send invitation"}
              </button>
            </div>
          </div>
        </Drawer>
      )}

      {isSuperAdmin && (
        <div className="panel underwritingDecisionPanel">
          <div className="panel-h">
            <ShieldCheck size={18} /> Credit decision
            <span className="sp" />
            <span className={`cellchip ${decisionTone}`}>{humanStatus(readiness.data?.human_review_status)}</span>
          </div>
          <div className="panel-b underwritingDecisionBody">
            <div className="underwritingDecisionContext">
              <div><span>System route</span><b>{readiness.data?.route_label || "Awaiting route"}</b></div>
              <div><span>Evidence posture</span><b>{readiness.data?.package_ready ? "Decision-ready package" : "Open conditions remain"}</b></div>
              <div><span>Current desk status</span><b>{humanStatus(readiness.data?.human_review_status)}</b></div>
            </div>
            <label className="underwritingDecisionNote">
              <span className="lbl">Decision rationale and retained conditions</span>
              <textarea className="field" rows={4} placeholder="Record the approval rationale, retained conditions, exception basis, or decline reason." value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} />
            </label>
            <div className="underwritingDecisionActions">
              <button type="button" className="btn pri" disabled={review.isPending || !readiness.data?.package_ready} onClick={() => review.mutate("fundable")}><CheckCircle2 size={16} /> Approve as fundable</button>
              <button type="button" className="btn" disabled={review.isPending} onClick={() => review.mutate("pending")}>Hold for review</button>
              <button type="button" className="btn danger" disabled={review.isPending || !reviewNote.trim()} onClick={() => review.mutate("not_fundable")}>Record not fundable</button>
              {!readiness.data?.package_ready && <span className="hint">Fundable approval unlocks when the evidence package is decision-ready.</span>}
            </div>
          </div>
        </div>
      )}

      {isSuperAdmin && (
        <AdminContractPackageControls dealerId={dealerId} routeKey={readiness.data?.route_key} />
      )}

      <div className="panel">
        <div className="panel-h"><FileSignature size={17} /> Authorization and execution record</div>
        <div className="panel-b">
          <div className="underwritingAuthorizationList">
            <div>
              <span className={`underwritingAuthorizationIcon ${completedOwners === requiredOwners.length ? "ok" : "warn"}`}><ShieldCheck size={17} /></span>
              <span><b>Owner credit authorization</b><small>Independent FCRA authorization for every required 20%+ owner.</small></span>
              <span className={`cellchip ${completedOwners === requiredOwners.length ? "c-ok" : "c-warn"}`}>{completedOwners} of {requiredOwners.length}</span>
            </div>
            <div>
              <span className={`underwritingAuthorizationIcon ${executed ? "ok" : "warn"}`}><FileSignature size={17} /></span>
              <span><b>Client application package</b><small>The authorized signer reviews the populated forms and executes the listed package.</small></span>
              <span className={`cellchip ${executed ? "c-ok" : "c-warn"}`}>{executed ? "Executed" : "Execution required"}</span>
            </div>
            <div>
              <span className="underwritingAuthorizationIcon"><ClipboardCheck size={17} /></span>
              <span><b>Desk disposition</b><small>No additional client signature. The decision team records final status, destination, and funded amount.</small></span>
              <span className={`cellchip ${decisionTone}`}>{humanStatus(readiness.data?.human_review_status)}</span>
            </div>
          </div>
          <p className="sub mt">Executed documents remain immutable even when a later form or package revision is published.</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          Program application package
          <span className="sp" />
          <span className={`cellchip ${executed ? "c-ok" : "c-warn"}`}>
            {executed ? "Executed" : "Client execution required"}
          </span>
        </div>
        <div className="panel-b">
          <p className="sub" style={{ marginTop: 0 }}>
            Client-facing package review and signature delivery remain in the execution workspace.
            The decision desk reviews the exact frozen or executed forms here without creating a second signing path.
          </p>
          {!executed && (
            <div className="underwritingPackageAction">
              <div><b>Client execution is incomplete</b><span>Review the populated application package and send it to the primary signer before final disposition.</span></div>
              <a className="btn" href={`/applications/${dealerId}?step=4`}><ExternalLink size={15} /> Open execution workspace</a>
            </div>
          )}
          {executed && (packageEnvelope?.bundle_download_url || caseDoc?.filled_sha256) && (
            <div className="row mt" style={{ gap: 8, flexWrap: "wrap" }}>
              {packageEnvelope?.bundle_download_url
                ? <a className="btn" href={packageEnvelope.bundle_download_url} target="_blank" rel="noreferrer"><Download size={16} /> View executed package</a>
                : <button type="button" className="btn" disabled={download.isPending} onClick={() => download.mutate()}><Download size={16} /> {download.isPending ? "Opening…" : "View legacy executed agreement"}</button>}
            </div>
          )}
          {executed && <div className="note mt"><b>Executed by {packageEnvelope?.signer_name || caseDoc?.signer_name || "the authorized representative"}</b><div className="sub">{packageEnvelope?.signer_title || caseDoc?.signer_title || "Title recorded in certificate"} · {when(packageEnvelope?.completed_at || caseDoc?.signed_at)} · Package SHA-256 {packageEnvelope?.bundle_sha256 ? `${packageEnvelope.bundle_sha256.slice(0, 16)}…` : caseDoc?.signature_sha256 ? `${caseDoc.signature_sha256.slice(0, 16)}…` : "in certificate"}</div></div>}
        </div>
      </div>

      {isSuperAdmin && (
        <>
          <div className="panel underwritingRoomPanel">
            <div className="panel-h"><FolderLock size={17} /> Secure room and information requests <span className="sp" /> <span className={`cellchip ${dealer?.bucket_id ? "c-ok" : "c-warn"}`}>{dealer?.bucket_id ? "Room active" : "Room not created"}</span></div>
            <div className="panel-b underwritingRoomBody">
              <div className="underwritingRoomSummary">
                <span className="underwritingEvidenceIcon"><FolderLock size={18} /></span>
                <div><b>{dealer?.bucket_name || "Secure client room"}</b><span>The active PIN does not expire. Generating a replacement invalidates the prior PIN immediately.</span></div>
                <span className="sp" />
                {dealer?.bucket_id && <button type="button" className="btn" onClick={() => window.open(`https://app.qualifiedcommercial.com/admin/buckets?bucket=${dealer.bucket_id}`, "_blank", "noopener,noreferrer")}><ExternalLink size={16} /> Open bucket</button>}
                <button type="button" className="btn pri" disabled={rotateRoom.isPending} onClick={() => rotateRoom.mutate()}><RefreshCw size={16} /> {rotateRoom.isPending ? "Generating…" : "Generate new PIN"}</button>
              </div>
              {roomResult?.url && <div className="underwritingRoomCredentials"><div><span>Secure link</span><button type="button" className="btn" onClick={() => void copy("link", roomResult.url)}><Copy size={15} /> {copied === "link" ? "Copied" : "Copy link"}</button></div><div><span>Replacement PIN</span><button type="button" className="btn" disabled={!roomResult.passcode} onClick={() => void copy("pin", roomResult.passcode)}><Copy size={15} /> {roomResult.passcode || "Generate to display"}</button></div></div>}
            </div>
          </div>
          <RequestPanel dealerId={dealerId} canText={false} />

          <div className="panel underwritingDispositionPanel">
            <div className="panel-h"><CheckCircle2 size={17} /> Final disposition <span className="sp" /> <span className="cellchip c-acc">Super admin</span></div>
            <div className="panel-b underwritingDispositionGrid">
              <section>
                <header><b>File status</b><span>Record the operational outcome after the credit decision.</span></header>
                <div className="underwritingDispositionFields">
                  <label><span className="lbl">Status</span><select className="field" value={statusDraft} onChange={(event) => setStatusDraft(event.target.value)}>{STATUS_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                  <label><span className="lbl">Amount funded</span><input className="field" type="number" min="1" inputMode="decimal" disabled={statusDraft !== "complete"} value={fundedAmount} onChange={(event) => setFundedAmount(event.target.value)} placeholder={statusDraft === "complete" ? "Enter final funded amount" : "Enabled when status is Funded"} /></label>
                </div>
                <button type="button" className="btn pri" disabled={finalize.isPending || (statusDraft === "complete" && Number(fundedAmount) <= 0)} onClick={() => finalize.mutate()}>{finalize.isPending ? "Saving…" : "Save disposition"}</button>
              </section>
              <section>
                <header><b>File destination</b><span>Continue the same evidence and audit history in the appropriate downstream workspace.</span></header>
                <div className="underwritingDestinationActions">
                  <button type="button" className="btn" disabled={startHandoff.isPending} onClick={() => handoff.data?.url ? window.open(handoff.data.url, "_blank", "noopener,noreferrer") : startHandoff.mutate()}><Route size={16} /> <span><b>{handoff.data?.url ? "Open AI underwriting file" : "Create AI underwriting file"}</b><small>Continue advanced underwriting analysis.</small></span></button>
                  <button type="button" className="btn" disabled={Boolean(dealer?.audit_client_since) || convertAudit.isPending} onClick={() => convertAudit.mutate()}><ExternalLink size={16} /> <span><b>{dealer?.audit_client_since ? "Full audit client enabled" : "Convert to full audit client"}</b><small>Graduate the verified file into the audit system.</small></span></button>
                </div>
              </section>
              </div>
          </div>
        </>
      )}

      {actionError && <div className="panel panel-invalid"><div className="panel-b">{actionError instanceof Error ? actionError.message : "That action did not complete."}</div></div>}
    </>
  );
}
