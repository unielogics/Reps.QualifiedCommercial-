"use client";

import { useEffect, useMemo, useState } from "react";
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
  UserRound,
} from "lucide-react";
import RequestPanel from "@/components/RequestPanel";
import ProgramSelect, {
  GENERAL_PROGRAM_KEY,
  GENERAL_PROGRAM_NAME,
} from "@/components/ProgramSelect";
import { api } from "@/lib/api";
import {
  appointmentRsvpClass,
  appointmentRsvpLabel,
  appointmentRsvpTone,
  type RepAppointment,
} from "@/lib/appointments";
import {
  type ApplicationProfileData,
  type SubmissionReadiness,
} from "@/lib/applicationReadiness";
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

type GenerateResult = {
  status: string;
  placed: Record<string, string>;
  missing_data: string[];
  overlay_problems: string[];
  sha256: string;
  download_url: string | null;
};

type Template = {
  key: string;
  title: string;
  revision: number;
  active: boolean;
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

function SummarySection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="note" style={{ margin: 0, minWidth: 0 }}>
      <div className="row" style={{ gap: 8 }}>
        {icon}
        <b>{title}</b>
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </section>
  );
}

export default function Step5Contracts({ dealerId }: { dealerId: string }) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const { dealer, verification } = useCase(dealerId);
  const { isSuperAdmin } = useMe();
  const [generated, setGenerated] = useState<GenerateResult | null>(null);
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

  const authenticated = async <T,>(path: string, init?: RequestInit) =>
    api<T>(path, { ...init, authToken: (await getToken()) ?? undefined });

  const readiness = useQuery({
    queryKey: ["submission-readiness", dealerId],
    queryFn: () => authenticated<SubmissionReadiness>(
      `/dealer-os/dealers/${dealerId}/submission-readiness`,
    ),
  });
  const profile = useQuery({
    queryKey: ["application-profile", dealerId],
    queryFn: () => authenticated<ApplicationProfileData | null>(
      `/dealer-os/dealers/${dealerId}/application-profile`,
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
  const templates = useQuery({
    queryKey: ["contract-templates"],
    queryFn: () => authenticated<Template[]>("/dealer-os/contract-templates"),
  });
  const caseDocs = useQuery({
    queryKey: ["case-contracts", dealerId],
    queryFn: () => authenticated<CaseDoc[]>(`/dealer-os/dealers/${dealerId}/contracts`),
  });
  const handoff = useQuery({
    queryKey: ["dealer-handoff", dealerId],
    enabled: isSuperAdmin,
    queryFn: () => authenticated<Handoff>(`/dealer-os/dealers/${dealerId}/handoff`),
  });

  const template = templates.data?.find((item) => item.key === MASTER_KEY && item.active);
  const caseDoc = caseDocs.data?.find((item) => item.template_key === MASTER_KEY);
  const reviewPreference = activeUnderwritingReviewPreference(reviewPreferences.data);
  const requiredOwners = (owners.data ?? []).filter((owner) => owner.credit_required);
  const completedOwners = requiredOwners.filter((owner) => owner.credit_complete).length;
  const primaryOwner = (owners.data ?? []).find((owner) => owner.is_primary);
  const reviewAppointment = reviewPreference?.appointment_id
    ? (appointments.data ?? []).find((appointment) => appointment.id === reviewPreference.appointment_id) ?? null
    : null;
  const financial = profile.data;
  const dscr = useMemo(() => {
    const cash = financial?.annual_cash_flow_available_for_debt;
    const monthlyDebt = financial?.monthly_debt_payments;
    if (!cash || !monthlyDebt) return null;
    return cash / (monthlyDebt * 12);
  }, [financial?.annual_cash_flow_available_for_debt, financial?.monthly_debt_payments]);

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

  const generate = useMutation({
    mutationFn: () => authenticated<GenerateResult>(
      `/dealer-os/dealers/${dealerId}/contracts/${MASTER_KEY}/generate`,
      { method: "POST" },
    ),
    onSuccess: (result) => {
      setGenerated(result);
      void qc.invalidateQueries({ queryKey: ["case-contracts", dealerId] });
    },
  });
  const send = useMutation({
    mutationFn: () => authenticated<SendResult>(
      `/dealer-os/dealers/${dealerId}/contracts/${MASTER_KEY}/send-signature`,
      { method: "POST", body: JSON.stringify({ channel: "email" }) },
    ),
    onSuccess: (result) => {
      setRoomResult(result);
      void qc.invalidateQueries({ queryKey: ["case-contracts", dealerId] });
    },
  });
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
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["underwriting-review-preferences", dealerId] }),
        qc.invalidateQueries({ queryKey: ["appointments", dealerId] }),
        qc.invalidateQueries({ queryKey: ["rep-appointments"] }),
      ]);
    },
  });

  useEffect(() => {
    if (generated?.download_url) window.open(generated.download_url, "_blank", "noopener,noreferrer");
  }, [generated?.download_url]);

  const copy = async (label: string, value: string | null | undefined) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied((current) => current === label ? null : current), 1800);
  };

  const releaseReady = Boolean(readiness.data?.package_ready && template);
  const executed = caseDoc?.status === "executed";
  const outForSignature = caseDoc?.status === "out_for_signature";
  const decisionTone = readiness.data?.human_review_status === "fundable"
    ? "c-ok"
    : readiness.data?.human_review_status === "not_fundable"
      ? "c-bad"
      : "c-warn";
  const actionError = review.error ?? generate.error ?? send.error ?? download.error
    ?? rotateRoom.error ?? finalize.error ?? startHandoff.error ?? convertAudit.error
    ?? bookReview.error;

  return (
    <>
      <div className="panel">
        <div className="panel-h">
          Step 5 · Super-admin desk review and closing
          <span className="sp" />
          <span className={`cellchip ${decisionTone}`}>
            {humanStatus(readiness.data?.human_review_status)}
          </span>
        </div>
        <div className="panel-b">
          <p className="sub" style={{ marginTop: 0 }}>
            One place to review the complete file, the client’s three proposed review windows,
            the submitting agent, the desk decision, agreements, delivery, and closing status.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
            <SummarySection title="Step 1 · Applicant and request" icon={<ClipboardCheck size={17} />}>
              <div className="kv"><span>Business</span><b>{dealer?.legal_name || dealer?.name || "—"}</b></div>
              <div className="kv"><span>NAICS</span><b>{dealer?.naics_code ? `${dealer.naics_code} · ${dealer.naics_label || "Classified"}` : "Awaiting classification"}</b></div>
              <div className="kv"><span>Client requested</span><b>{money(dealer?.client_requested_amount ?? dealer?.funding_goal)}</b></div>
              <div className="kv"><span>Working funding goal</span><b>{money(dealer?.funding_goal)}</b></div>
              <div className="kv"><span>Use</span><b>{dealer?.use_of_proceeds_note || dealer?.funding_purpose?.replace(/_/g, " ") || "Awaiting detail"}</b></div>
            </SummarySection>
            <SummarySection title="Step 2 · Verification" icon={<ShieldCheck size={17} />}>
              <div className="kv"><span>Required owners</span><b>{completedOwners} of {requiredOwners.length} completed</b></div>
              <div className="kv"><span>Bank evidence</span><b>{verification.statement_months.length} qualifying months</b></div>
              <div className="kv"><span>Credit</span><b>{verification.credit_returned ? "Returned for every required owner" : "Incomplete"}</b></div>
            </SummarySection>
            <SummarySection title="Step 3 · Financial profile" icon={<Route size={17} />}>
              <div className="kv"><span>Annual sales</span><b>{money(financial?.annual_sales)}</b></div>
              <div className="kv"><span>Cash flow for debt</span><b>{money(financial?.annual_cash_flow_available_for_debt)}</b></div>
              <div className="kv"><span>Monthly debt</span><b>{money(financial?.monthly_debt_payments)}</b></div>
              <div className="kv"><span>Calculated DSCR</span><b>{dscr === null ? "Awaiting evidence" : dscr.toFixed(2)}</b></div>
            </SummarySection>
            <SummarySection title="Step 4 · Package" icon={<CheckCircle2 size={17} />}>
              <div className="kv"><span>Route</span><b>{readiness.data?.route_label || "Awaiting route"}</b></div>
              <div className="kv"><span>Evidence package</span><b>{readiness.data?.package_ready ? "Complete" : "Conditions remain"}</b></div>
              <div className="kv"><span>Rules</span><b>{readiness.data?.rules_version || "—"}</b></div>
            </SummarySection>
            <SummarySection title="Client review windows" icon={<CalendarClock size={17} />}>
              {(reviewPreference?.slots ?? []).map((slot, index) => (
                <div
                  className={`reviewProposal ${selectedReviewSlot === slot.starts_at ? "selected" : ""} ${
                    reviewPreference?.selected_slot_at === slot.starts_at && reviewAppointment
                      ? appointmentRsvpClass(reviewAppointment)
                      : ""
                  }`}
                  key={slot.starts_at}
                >
                  <button
                    type="button"
                    disabled={!isSuperAdmin || Boolean(reviewAppointment && reviewAppointment.client_rsvp_status !== "declined")}
                    onClick={() => setSelectedReviewSlot(slot.starts_at)}
                  >
                    <span>Option {index + 1}</span><b>{slot.date_label} · {slot.label}</b>
                    <small>
                      {reviewPreference?.selected_slot_at === slot.starts_at && reviewAppointment
                        ? appointmentRsvpLabel(reviewAppointment)
                        : reviewPreference?.selected_slot_at
                          ? "Not selected"
                          : "Proposed - does not reserve this time"}
                    </small>
                  </button>
                </div>
              ))}
              {!reviewPreference && <span className="sub">No active three-window preference.</span>}
              {reviewPreference && <div className="sub mt">{reviewPreference.timezone}</div>}
              {reviewAppointment && (
                <div className="mt">
                  <span className={`cellchip ${appointmentRsvpTone(reviewAppointment)}`}>
                    {appointmentRsvpLabel(reviewAppointment)}
                  </span>
                </div>
              )}
            </SummarySection>
            <SummarySection title="Submitting agent" icon={<UserRound size={17} />}>
              <div className="kv"><span>Name</span><b>{dealer?.submitting_agent_name || "Unassigned"}</b></div>
              <div className="kv"><span>Email</span><b>{dealer?.submitting_agent_email || "Not available"}</b></div>
              <div className="kv"><span>Primary signer</span><b>{primaryOwner?.full_name || "Awaiting owner record"}</b></div>
            </SummarySection>
          </div>
        </div>
      </div>

      {isSuperAdmin && (
        <div className="panel">
          <div className="panel-h"><ShieldCheck size={17} /> Human underwriting decision</div>
          <div className="panel-b">
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              <span className={`cellchip ${decisionTone}`}>{humanStatus(readiness.data?.human_review_status)}</span>
              <span className="sub">Only a super admin records the final fundability decision and closing status.</span>
            </div>
            <textarea className="field mt" style={{ width: "100%" }} rows={3} placeholder="Decision note, conditions, or reason this route is not fundable" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} />
            <div className="row mt" style={{ gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn pri" disabled={review.isPending || !readiness.data?.package_ready} onClick={() => review.mutate("fundable")}><CheckCircle2 size={16} /> Mark fundable</button>
              <button type="button" className="btn" disabled={review.isPending} onClick={() => review.mutate("pending")}>Return to pending</button>
              <button type="button" className="btn danger" disabled={review.isPending || !reviewNote.trim()} onClick={() => review.mutate("not_fundable")}>Mark not fundable</button>
            </div>
          </div>
        </div>
      )}

      {isSuperAdmin && reviewPreference && (!reviewAppointment || reviewAppointment.client_rsvp_status === "declined") && (
        <div className="panel">
          <div className="panel-h"><CalendarClock size={17} /> Send underwriting-review invitation</div>
          <div className="panel-b" style={{ display: "grid", gap: 12 }}>
            <div className="note">
              The three client proposals are not calendar holds. The selected time is checked against Franco&apos;s live calendar again before it is reserved.
            </div>
            {reviewAppointment?.client_rsvp_status === "declined" && (
              <div className="warnline">The client declined the prior invitation. Select a different proposed window and send a new invitation.</div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
              <label><span className="lbl">Client name</span><input className="field" value={reviewInviteeName} onChange={(event) => setReviewInviteeName(event.target.value)} /></label>
              <label><span className="lbl">Client email</span><input className="field" type="email" value={reviewInviteeEmail} onChange={(event) => setReviewInviteeEmail(event.target.value)} /></label>
              <label><span className="lbl">Client phone</span><input className="field" type="tel" value={reviewInviteePhone} onChange={(event) => setReviewInviteePhone(event.target.value)} /></label>
              <label><span className="lbl">Program</span><ProgramSelect programKey={reviewProgramKey} programName={reviewProgramName} onChange={(selection) => { setReviewProgramKey(selection.key); setReviewProgramName(selection.name); }} /></label>
            </div>
            <label><span className="lbl">Appointment notes</span><textarea className="field" rows={3} value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} /></label>
            <div className="row" style={{ gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <span className="sub">{selectedReviewSlot ? "One invitation will be created for the selected option." : "Select one of the three options above."}</span>
              <button
                type="button"
                className="btn pri"
                disabled={!selectedReviewSlot || !reviewInviteeName.trim() || !reviewInviteeEmail.trim() || bookReview.isPending}
                onClick={() => bookReview.mutate()}
              >
                <Mail size={16} /> {bookReview.isPending ? "Checking calendar…" : "Send invitation"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-h"><FileSignature size={17} /> Agreements and authorizations</div>
        <div className="panel-b">
          <div className="tblwrap">
            <table className="tbl" style={{ minWidth: 650 }}>
              <thead><tr><th>Stage</th><th>Record</th><th>Who completes it</th><th>Purpose</th></tr></thead>
              <tbody>
                <tr><td>Step 2</td><td><b>FCRA / iSoftPull consent</b></td><td>Every 20%+ owner</td><td>Independent authorization for that owner’s soft credit inquiry. This is not the financing application.</td></tr>
                <tr><td>Step 4</td><td><b>QC Business Financing Application and Certifications</b></td><td>Primary owner or authorized representative</td><td>Certifies the business, ownership, request, disclosures, and evidence summary before the file reaches desk review.</td></tr>
                <tr><td>Step 5</td><td><b>No new client signature</b></td><td>Super admin</td><td>Reviews the executed application, records the decision and status, manages the bucket, and completes the file disposition.</td></tr>
              </tbody>
            </table>
          </div>
          <p className="sub mt">Product-specific SBA, state, or downstream forms remain separate requested artifacts. They are not silently recreated or bundled into the QC master application.</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          QC master application
          <span className="sp" />
          <span className={`cellchip ${executed ? "c-ok" : releaseReady ? "c-acc" : "c-warn"}`}>
            {executed ? "Executed" : outForSignature ? "Awaiting signature" : releaseReady ? "Ready to generate" : "Step 4 package required"}
          </span>
        </div>
        <div className="panel-b">
          <p className="sub" style={{ marginTop: 0 }}>The populated lender-neutral PDF excludes SSNs, raw credit scores, and downstream lender identity. After execution, the customer receives the signed PDF by email and the secure room retains a download copy. An email failure never invalidates a signature.</p>
          {!releaseReady && !executed && <div className="warnline">Complete the Step 4 evidence package before generation or delivery.</div>}
          <div className="row mt" style={{ gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn pri" disabled={!releaseReady || generate.isPending || outForSignature || executed} onClick={() => generate.mutate()}><FileSignature size={16} /> {generate.isPending ? "Generating PDF…" : caseDoc?.filled_sha256 ? "Regenerate application" : "Generate application"}</button>
            {caseDoc?.filled_sha256 && <button type="button" className="btn" disabled={download.isPending} onClick={() => download.mutate()}><Download size={16} /> {executed ? "View executed agreement" : "View populated agreement"}</button>}
            {caseDoc?.filled_sha256 && !executed && <button type="button" className="btn pri" disabled={!releaseReady || send.isPending} onClick={() => send.mutate()}><Mail size={16} /> {send.isPending ? "Sending…" : outForSignature ? "Resend signature email" : "Email primary signer"}</button>}
          </div>
          {generated && <div className="note mt"><b>PDF generated.</b> SHA-256 <span className="num">{generated.sha256.slice(0, 16)}…</span>{generated.missing_data.length ? ` · Awaiting: ${generated.missing_data.join(" · ")}` : ""}</div>}
          {send.isSuccess && <div className="note mt"><b>{send.data.emailed ? "Signature email sent." : "Signature room ready."}</b>{send.data.detail ? ` ${send.data.detail}` : ""}</div>}
          {executed && <div className="note mt"><b>Executed by {caseDoc.signer_name || "the authorized representative"}</b><div className="sub">{caseDoc.signer_title || "Title recorded in certificate"} · {when(caseDoc.signed_at)} · Signature SHA-256 {caseDoc.signature_sha256 ? `${caseDoc.signature_sha256.slice(0, 16)}…` : "in certificate"}</div></div>}
        </div>
      </div>

      {isSuperAdmin && (
        <>
          <div className="panel">
            <div className="panel-h"><FolderLock size={17} /> Secure bucket and information requests</div>
            <div className="panel-b">
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <div><b>{dealer?.bucket_name || "Secure client room"}</b><div className="sub">The access PIN is stored as a hash. Showing a PIN rotates it and invalidates the previous code.</div></div>
                <span className="sp" />
                {dealer?.bucket_id && <button type="button" className="btn" onClick={() => window.open(`https://app.qualifiedcommercial.com/admin/buckets?bucket=${dealer.bucket_id}`, "_blank", "noopener,noreferrer")}><ExternalLink size={16} /> Open bucket</button>}
                <button type="button" className="btn pri" disabled={rotateRoom.isPending} onClick={() => rotateRoom.mutate()}><RefreshCw size={16} /> {rotateRoom.isPending ? "Securing room…" : "Create link + new PIN"}</button>
              </div>
              {roomResult?.url && <div className="note mt"><div className="kv"><span>Secure link</span><button type="button" className="btn" onClick={() => void copy("link", roomResult.url)}><Copy size={15} /> {copied === "link" ? "Copied" : "Copy link"}</button></div><div className="kv"><span>Six-digit PIN</span><button type="button" className="btn" disabled={!roomResult.passcode} onClick={() => void copy("pin", roomResult.passcode)}><Copy size={15} /> {roomResult.passcode || "Rotate to reveal"}</button></div></div>}
            </div>
          </div>
          <RequestPanel dealerId={dealerId} canText={false} />

          <div className="panel">
            <div className="panel-h">Super-admin file controls</div>
            <div className="panel-b">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
                <label><span className="lbl">File status</span><select className="field" style={{ width: "100%" }} value={statusDraft} onChange={(event) => setStatusDraft(event.target.value)}>{STATUS_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                <label><span className="lbl">Amount funded</span><input className="field" style={{ width: "100%" }} type="number" min="1" inputMode="decimal" disabled={statusDraft !== "complete"} value={fundedAmount} onChange={(event) => setFundedAmount(event.target.value)} placeholder={statusDraft === "complete" ? "Enter final funded amount" : "Available when status is Funded"} /></label>
              </div>
              <button type="button" className="btn pri mt" disabled={finalize.isPending || (statusDraft === "complete" && Number(fundedAmount) <= 0)} onClick={() => finalize.mutate()}>{finalize.isPending ? "Saving…" : "Save status"}</button>

              <div className="panel-h" style={{ margin: "22px -16px 0", borderTop: "1px solid var(--line)" }}>File destination</div>
              <p className="sub">Continue the same client record in the AI underwriting workspace or graduate the current file into the full audit system. Both actions preserve its evidence and audit history.</p>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn" disabled={startHandoff.isPending} onClick={() => handoff.data?.url ? window.open(handoff.data.url, "_blank", "noopener,noreferrer") : startHandoff.mutate()}><Route size={16} /> {handoff.data?.url ? "Open AI underwriting file" : "Create AI underwriting file"}</button>
                <button type="button" className="btn" disabled={Boolean(dealer?.audit_client_since) || convertAudit.isPending} onClick={() => convertAudit.mutate()}><ExternalLink size={16} /> {dealer?.audit_client_since ? "Full audit client enabled" : "Convert to full audit client"}</button>
              </div>
            </div>
          </div>
        </>
      )}

      {actionError && <div className="panel panel-invalid"><div className="panel-b">{actionError instanceof Error ? actionError.message : "That action did not complete."}</div></div>}
    </>
  );
}
