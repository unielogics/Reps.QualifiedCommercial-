"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CalendarSlotDay } from "@/lib/repWorkflows";
import type { RepAppointment } from "@/lib/appointments";
import type {
  DealerProspect,
  ProspectDuplicateCheck,
  ProspectReassignmentReceipt,
  ProspectReassignmentRequest,
} from "@/lib/prospects";
import BusinessAddressFields from "./BusinessAddressFields";
import Drawer from "./Drawer";
import ProgramSelect, { GENERAL_PROGRAM_KEY, GENERAL_PROGRAM_NAME } from "./ProgramSelect";

type FileRow = {
  id: string;
  name: string;
  case_ref: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  funding_goal?: number | string | null;
  funding_purpose?: string | null;
};

type Slot = { starts_at: string; label: string; date_label: string };
type Availability = {
  timezone: string;
  duration_min: number;
  buffer_before_min: number;
  buffer_after_min: number;
  host_name: string | null;
  google_meet_enabled: boolean;
  calendar_sync_status: "connected" | "disconnected" | "unavailable";
  slots: Slot[];
  page_start_date?: string | null;
  page_end_date?: string | null;
  next_start_date?: string | null;
  window_end_date?: string | null;
};
type SourceMode = "file" | "lead" | "prospect";
type MeetingMode = "video" | "phone" | "in_person";
type AddressParts = { address: string; city: string; state: string; zip: string };
type ProspectBookingDelivery = {
  state: "queued" | "meet_ready" | "action_required";
  google_sync_status?: string | null;
  email_status?: string | null;
  sms_status?: string | null;
  meet_url?: string | null;
  error?: string | null;
};
type ProspectBookingResponse = {
  appointment: RepAppointment;
  prospect: DealerProspect;
  delivery: ProspectBookingDelivery;
  idempotent_replay: boolean;
};

const KINDS = [
  { key: "callback", label: "Callback" },
  { key: "program_intro", label: "Program intro" },
  { key: "underwriting_review", label: "Underwriting review" },
] as const;

const UNDERWRITING_DOCUMENTS = [
  { key: "ytd_profit_and_loss", label: "Current YTD profit and loss", help: "Current year through the latest closed month." },
  { key: "debt_schedule", label: "Current business debt schedule", help: "Lender, balance, and payment for each obligation." },
  { key: "use_of_funds_support", label: "Use-of-funds support", help: "Invoices, estimates, payoff letters, or related support." },
  { key: "entity_documents", label: "Business entity documents", help: "Formation, ownership, or signing-authority documents." },
] as const;

function groupSlots(slots: Slot[] | undefined): CalendarSlotDay[] {
  const days: CalendarSlotDay[] = [];
  for (const slot of slots ?? []) {
    const last = days[days.length - 1];
    if (last?.label === slot.date_label) last.slots.push(slot);
    else days.push({ label: slot.date_label, slots: [slot] });
  }
  return days;
}

function selectedSummary(slot: Slot | undefined): string {
  if (!slot) return "Choose a time";
  return `${slot.date_label} at ${slot.label}`;
}

export default function BookingDrawer({
  onClose,
  initialDealerId,
  initialName,
  initialEmail,
  initialPhone,
  initialCompany,
  initialKnownContact = false,
  initialKind,
  initialNotes,
  triggerOutcomeKey,
  prospect,
  onBooked,
}: {
  onClose: () => void;
  initialDealerId?: string | null;
  initialName?: string | null;
  initialEmail?: string | null;
  initialPhone?: string | null;
  initialCompany?: string | null;
  /** The seed came from an existing Inbox conversation, not a new identity. */
  initialKnownContact?: boolean;
  initialKind?: (typeof KINDS)[number]["key"];
  initialNotes?: string | null;
  triggerOutcomeKey?: string | null;
  prospect?: DealerProspect | null;
  onBooked?: (appointment: RepAppointment, prospect?: DealerProspect) => void;
}) {
  const { getToken } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [sourceMode, setSourceMode] = useState<SourceMode>(prospect ? "prospect" : initialDealerId ? "file" : "lead");
  const [dealerId, setDealerId] = useState(initialDealerId ?? "");
  const [kind, setKind] = useState<(typeof KINDS)[number]["key"]>(initialKind ?? "callback");
  const [startsAt, setStartsAt] = useState("");
  const [dayIndex, setDayIndex] = useState(0);
  const [inviteeName, setInviteeName] = useState(initialName ?? "");
  const [company, setCompany] = useState(initialCompany ?? prospect?.dealer_name ?? "");
  const [inviteeEmail, setInviteeEmail] = useState(initialEmail ?? "");
  const [inviteePhone, setInviteePhone] = useState(initialPhone ?? "");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [meetingMode, setMeetingMode] = useState<MeetingMode>("video");
  const [meetingLocation, setMeetingLocation] = useState("");
  const [programKey, setProgramKey] = useState(GENERAL_PROGRAM_KEY);
  const [programName, setProgramName] = useState(GENERAL_PROGRAM_NAME);
  const [requestedAmount, setRequestedAmount] = useState("");
  const [address, setAddress] = useState<AddressParts>({ address: "", city: "", state: "", zip: "" });
  const [smsConsent, setSmsConsent] = useState(false);
  // After booking: the room kit to read out or copy. The drawer stays open so a
  // rep sitting with the client can hand over the PIN before closing.
  const [booked, setBooked] = useState<RepAppointment | null>(null);
  const [bookingDelivery, setBookingDelivery] = useState<ProspectBookingDelivery | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [copied, setCopied] = useState<string | null>(null);
  const [requestedDocumentKeys, setRequestedDocumentKeys] = useState<string[]>([]);
  const [duplicateInput, setDuplicateInput] = useState({ email: inviteeEmail.trim(), phone: inviteePhone.trim() });
  const reassignmentKey = useRef("");

  const files = useQuery({
    queryKey: ["files"],
    queryFn: async () => api<FileRow[]>("/dealer-os/dealers", { authToken: (await getToken()) ?? undefined }),
  });
  const selected = useMemo(
    () => (files.data ?? []).find((f) => f.id === dealerId) ?? null,
    [files.data, dealerId],
  );
  useEffect(() => {
    if (
      prospect
      || !initialKnownContact
      || sourceMode !== "file"
      || !dealerId
      || !files.isSuccess
      || selected
    ) return;
    // Unified Inbox threads historically used one source id for either a
    // dealer or a CRM contact. If it is not an actual dealer file, keep the
    // authoritative contact identity and use standalone contact booking.
    setSourceMode("lead");
    setDealerId("");
  }, [dealerId, files.isSuccess, initialKnownContact, prospect, selected, sourceMode]);
  useEffect(() => {
    const timer = window.setTimeout(
      () => setDuplicateInput({ email: inviteeEmail.trim(), phone: inviteePhone.trim() }),
      350,
    );
    return () => window.clearTimeout(timer);
  }, [inviteeEmail, inviteePhone]);

  const duplicateCheck = useQuery({
    queryKey: ["prospect-duplicate-check", "calendar-new-lead", duplicateInput.email.toLowerCase(), duplicateInput.phone],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (duplicateInput.email) params.set("email", duplicateInput.email);
      if (duplicateInput.phone) params.set("phone", duplicateInput.phone);
      return api<ProspectDuplicateCheck>(`/dealer-os/prospects/duplicate-check?${params}`, {
        authToken: (await getToken()) ?? undefined,
      });
    },
    enabled: sourceMode === "lead" && Boolean(duplicateInput.email || duplicateInput.phone),
    staleTime: 15_000,
  });
  const restoreProspect = useMutation({
    mutationFn: async ({ prospectId, version }: { prospectId: string; version: number }) => api<DealerProspect>(`/dealer-os/prospects/${prospectId}/restore`, {
      method: "POST",
      body: JSON.stringify({ expected_version: version }),
      authToken: (await getToken()) ?? undefined,
    }),
    onSuccess: (restored) => {
      onClose();
      router.push(`/marketing/prospects/${restored.id}`);
    },
  });
  const requestReassignment = useMutation({
    mutationFn: async () => {
      if (!reassignmentKey.current) reassignmentKey.current = crypto.randomUUID();
      const request: ProspectReassignmentRequest = {
        email: inviteeEmail.trim() || null,
        phone: inviteePhone.trim() || null,
        idempotency_key: reassignmentKey.current,
        reason: "Calendar booking was blocked by an existing assigned Marketing contact.",
      };
      return api<ProspectReassignmentReceipt>("/dealer-os/prospects/reassignment-requests", {
        method: "POST",
        body: JSON.stringify(request),
        authToken: (await getToken()) ?? undefined,
      });
    },
  });
  useEffect(() => {
    reassignmentKey.current = "";
    requestReassignment.reset();
    restoreProspect.reset();
    // Mutation reset functions are stable. A changed identity is a new
    // restore/reassignment decision rather than a retry of the old one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteeEmail, inviteePhone]);
  const availability = useInfiniteQuery({
    queryKey: ["booking-availability", sourceMode, dealerId, prospect?.id],
    initialPageParam: "",
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ days: "7" });
      if (sourceMode === "file" && dealerId) params.set("dealer_id", dealerId);
      if (pageParam) params.set("start_date", pageParam);
      return api<Availability>(`/dealer-os/booking/availability?${params}`, {
        authToken: (await getToken()) ?? undefined,
      });
    },
    getNextPageParam: (page) => page.next_start_date || undefined,
  });
  const availabilityInfo = availability.data?.pages[0];
  const availabilitySlots = useMemo(() => {
    const unique = new Map<string, Slot>();
    for (const page of availability.data?.pages ?? []) {
      for (const slot of page.slots) unique.set(slot.starts_at, slot);
    }
    return [...unique.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [availability.data?.pages]);
  const days = useMemo(() => groupSlots(availabilitySlots), [availabilitySlots]);
  const activeDay = days[Math.min(dayIndex, Math.max(days.length - 1, 0))];
  const selectedSlot = useMemo(
    () => availabilitySlots.find((s) => s.starts_at === startsAt),
    [availabilitySlots, startsAt],
  );

  useEffect(() => {
    if (availabilityInfo?.google_meet_enabled === false && meetingMode === "video") {
      setMeetingMode("phone");
    }
  }, [availabilityInfo?.google_meet_enabled, meetingMode]);

  useEffect(() => {
    if (dayIndex >= days.length) setDayIndex(0);
    if (startsAt && !availabilitySlots.some((s) => s.starts_at === startsAt)) {
      setStartsAt("");
    }
  }, [availabilitySlots, dayIndex, days.length, startsAt]);

  const book = useMutation({
    mutationFn: async (): Promise<{ appointment: RepAppointment; prospect?: DealerProspect; delivery?: ProspectBookingDelivery }> => {
      if (prospect) {
        const result = await api<ProspectBookingResponse>(`/dealer-os/prospects/${prospect.id}/appointments`, {
          method: "POST",
          body: JSON.stringify({
            expected_version: prospect.version,
            idempotency_key: idempotencyKey,
            starts_at: startsAt,
            duration_min: availabilityInfo?.duration_min,
            meeting_mode: meetingMode,
            location: meetingMode === "in_person" ? meetingLocation.trim() || null : null,
            notes: notes.trim() || null,
            trigger_outcome_key: triggerOutcomeKey || null,
            transactional_sms_consent: smsConsent,
          }),
          authToken: (await getToken()) ?? undefined,
        });
        return { appointment: result.appointment, prospect: result.prospect, delivery: result.delivery };
      }
      const appointment = await api<RepAppointment>(sourceMode === "file" && dealerId ? `/dealer-os/dealers/${dealerId}/appointments` : "/dealer-os/appointments", {
        method: "POST",
        body: JSON.stringify({
          kind,
          creation_idempotency_key: idempotencyKey,
          starts_at: startsAt,
          company: sourceMode === "lead" ? company.trim() : company.trim() || selected?.name || null,
          invitee_name: inviteeName.trim(),
          invitee_email: inviteeEmail.trim() || null,
          invitee_phone: inviteePhone.trim() || null,
          notes: notes.trim() || null,
          program_key: programKey,
          program_name: programName.trim() || null,
          requested_amount: requestedAmount.trim() || null,
          full_address: [
            address.address.trim(),
            [address.city.trim(), address.state.trim(), address.zip.trim()].filter(Boolean).join(" "),
          ].filter(Boolean).join(", ") || null,
          // The parts as typed, not only the joined string. The client file
          // needs city, state and ZIP; joining them threw them away and left
          // three address blockers on a file the rep had already filled in.
          street: address.address.trim() || null,
          city: address.city.trim() || null,
          state: address.state.trim() || null,
          zip: address.zip.trim() || null,
          transactional_sms_consent: smsConsent,
          meeting_mode: meetingMode,
          location: meetingMode === "in_person" ? meetingLocation.trim() || null : null,
          // The field desk books here; that is what opens the draft file.
          origin: "field_desk",
          requested_document_keys: kind === "underwriting_review" ? requestedDocumentKeys : [],
        }),
        authToken: (await getToken()) ?? undefined,
      });
      return { appointment };
    },
    onSuccess: (result) => {
      const created = result.appointment;
      setIdempotencyKey(crypto.randomUUID());
      onBooked?.(created, result.prospect);
      setBookingDelivery(result.delivery ?? null);
      void qc.invalidateQueries({ queryKey: ["appointments", dealerId] });
      void qc.invalidateQueries({ queryKey: ["rep-appointments"] });
      void qc.invalidateQueries({ queryKey: ["inbox-threads"] });
      void qc.invalidateQueries({ queryKey: ["dealers"] });
      if (prospect) {
        void qc.invalidateQueries({ queryKey: ["dealer-prospect", prospect.id] });
        void qc.invalidateQueries({ queryKey: ["dealer-prospects"] });
      }
      if (created?.room_url || prospect) setBooked(created);
      else onClose();
    },
    onError: () => {
      if (!prospect) return;
      void qc.invalidateQueries({ queryKey: ["dealer-prospect", prospect.id] });
      void qc.invalidateQueries({ queryKey: ["dealer-prospects"] });
    },
  });
  const copy = async (label: string, value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(label); window.setTimeout(() => setCopied(null), 1600); } catch { /* clipboard unavailable */ }
  };

  const needsCompany = sourceMode === "lead" || sourceMode === "prospect";
  const duplicateInputIsCurrent = duplicateInput.email === inviteeEmail.trim()
    && duplicateInput.phone === inviteePhone.trim();
  const knownIdentityUnchanged = inviteeEmail.trim().toLowerCase() === (initialEmail ?? "").trim().toLowerCase()
    && inviteePhone.replace(/\D/g, "") === (initialPhone ?? "").replace(/\D/g, "");
  const linkedExistingContact = Boolean(
    initialKnownContact
      && knownIdentityUnchanged
      && duplicateInputIsCurrent
      && duplicateCheck.data?.state === "active_match"
      && !duplicateCheck.data.assignment_required
      && duplicateCheck.data.visible_matches.length === 1
      && duplicateCheck.data.visible_matches[0]?.contact_id
      && !duplicateCheck.data.visible_matches[0]?.prospect_id
      && !duplicateCheck.data.visible_matches[0]?.archived,
  );
  const duplicateBlocked = sourceMode === "lead"
    && duplicateCheck.data?.blocked === true
    && !linkedExistingContact;
  const duplicatePending = sourceMode === "lead"
    && Boolean(inviteeEmail.trim() || inviteePhone.trim())
    && (!duplicateInputIsCurrent || duplicateCheck.isFetching);
  const canBook = Boolean(
    selectedSlot &&
      inviteeName.trim() &&
      (!needsCompany || company.trim()) &&
      (inviteeEmail.trim() || inviteePhone.trim()) &&
      !duplicateBlocked &&
      !duplicatePending &&
      !availability.isError &&
      (meetingMode !== "phone" || inviteePhone.trim()) &&
      (meetingMode !== "in_person" || meetingLocation.trim()) &&
      availabilityInfo?.calendar_sync_status === "connected",
  );

  if (booked) {
    const pinVia = booked.precall?.pin_delivered_via;
    const meetUrl = bookingDelivery?.meet_url || booked.join_url;
    return (
      <Drawer title="Appointment booked" width={640} onClose={onClose} variant="workspace" dismissOnBackdrop={false}>
        <div className="panel">
          <div className="panel-h">{prospect ? "Prospect booked" : "Draft file opened · secure room ready"}</div>
          <div className="panel-b" style={{ display: "grid", gap: 14 }}>
            <p className="sub" style={{ margin: 0 }}>
              {prospect
                ? `${booked.invitee_name} is booked and ${prospect.dealer_name} has moved to Booked. ${booked.meeting_mode === "video" ? "Google Calendar, Meet, and confirmations" : "Google Calendar and confirmations"} continue from the durable delivery queue.`
                : `${booked.invitee_name} is booked. A draft file${booked.precall?.case_ref ? ` (${booked.precall.case_ref})` : ""} and a secure room were opened for this call; the confirmation carries the room link and the “Before your call” checklist (owners → bank → soft credit).`}
            </p>
            {bookingDelivery && <div className={`bookingDeliveryState ${bookingDelivery.state}`} role="status"><b>{bookingDelivery.state === "meet_ready" ? "Google Meet ready" : bookingDelivery.state === "action_required" ? "Booking saved · action required" : "Booking saved · delivery queued"}</b><span>{bookingDelivery.error || (bookingDelivery.state === "queued" ? "The appointment is secure. This panel can be closed while delivery finishes." : "Google and delivery status are recorded on the appointment.")}</span></div>}
            {meetUrl && <div>
              <label className="lbl">Google Meet link</label>
              <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <code style={{ fontSize: 12, wordBreak: "break-all" }}>{meetUrl}</code>
                <a className="btn sm" href={meetUrl} target="_blank" rel="noreferrer">Open Meet</a>
                <button type="button" className="btn sm" onClick={() => void copy("meet", meetUrl)}>{copied === "meet" ? "Copied" : "Copy"}</button>
              </div>
            </div>}
            {booked.room_url && <div>
              <label className="lbl">Secure room link</label>
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                <code style={{ fontSize: 12, wordBreak: "break-all" }}>{booked.room_url}</code>
                <button type="button" className="btn sm" onClick={() => void copy("link", booked.room_url!)}>{copied === "link" ? "Copied" : "Copy"}</button>
              </div>
            </div>}
            {booked.room_url && booked.room_passcode ? (
              <div className="note" style={{ display: "grid", gap: 6 }}>
                <b>Room PIN: <span className="num" style={{ fontSize: 20, letterSpacing: ".12em" }}>{booked.room_passcode}</span></b>
                <span className="sub">
                  {pinVia === "sms" ? "Texted to the client. " : pinVia === "email" ? "Emailed to the client separately. " : "Not delivered automatically — "}
                  {pinVia === "sms" || pinVia === "email" ? "Read it out too if you are with them." : "read this PIN to the client."} They can change it the first time they open the room.
                </span>
                <div><button type="button" className="btn sm" onClick={() => void copy("pin", booked.room_passcode!)}>{copied === "pin" ? "Copied" : "Copy PIN"}</button></div>
              </div>
            ) : booked.room_url ? (
              <span className="sub">This client already had a room PIN from an earlier booking; the room link was sent again.</span>
            ) : null}
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn pri" onClick={onClose}>Done</button>
            </div>
          </div>
        </div>
      </Drawer>
    );
  }

  return (
    <Drawer
      title="Book appointment"
      width={980}
      onClose={onClose}
      variant="workspace"
      dismissOnBackdrop={false}
    >
      <div className="panel">
        <div className="panel-h">Appointment details</div>
        <div className="panel-b" style={{ display: "grid", gap: 14 }}>
          {!prospect && <div>
            <label className="lbl">Source</label>
            <div className="seg" style={{ marginTop: 6 }}>
              <button
                type="button"
                className={sourceMode === "file" ? "on" : undefined}
                onClick={() => setSourceMode("file")}
              >
                Existing file
              </button>
              <button
                type="button"
                className={sourceMode === "lead" ? "on" : undefined}
                onClick={() => {
                  setSourceMode("lead");
                  setDealerId("");
                }}
              >
                New lead
              </button>
            </div>
          </div>}

          {sourceMode === "file" ? (
            <div>
              <label className="lbl">File</label>
              <select
                className="field"
                value={dealerId}
                onChange={(e) => {
                  const next = e.target.value;
                  setDealerId(next);
                  const file = (files.data ?? []).find((f) => f.id === next);
                  if (file) {
                    if (!inviteeName.trim()) setInviteeName(file.name);
                    if (!inviteeEmail.trim() && file.email) setInviteeEmail(file.email);
                    if (!inviteePhone.trim() && file.phone) setInviteePhone(file.phone);
                    if (!company.trim()) setCompany(file.name);
                    if (!requestedAmount.trim() && file.funding_goal) {
                      setRequestedAmount(
                        new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
                          .format(Number(file.funding_goal)),
                      );
                    }
                    if (!Object.values(address).some((part) => part.trim())) {
                      setAddress({
                        address: file.address ?? "",
                        city: file.city ?? "",
                        state: file.state ?? "",
                        zip: file.zip ?? "",
                      });
                    }
                  }
                }}
              >
                <option value="">Choose a file</option>
                {(files.data ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}{f.case_ref ? ` · ${f.case_ref}` : ""}
                  </option>
                ))}
              </select>
              <span className="sub" style={{ display: "block", marginTop: 5 }}>
                Pick a file to write the booking back to the case, or switch to New lead for a
                client you are meeting before an application exists.
              </span>
            </div>
          ) : (
            <div>
              <label className="lbl">Business name</label>
              <input
                className="field"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Business name"
                readOnly={Boolean(prospect)}
              />
              {prospect && <span className="sub" style={{ display: "block", marginTop: 5 }}>Linked to this Marketing prospect. Contact identity cannot be changed while booking.</span>}
            </div>
          )}

          {prospect ? <div className="bookingProspectLinkage" role="status">
            <span><small>Marketing file</small><b>{prospect.dealer_name}</b></span>
            <span><small>Assigned agent</small><b>{prospect.owner_name || "Unassigned"}</b></span>
            <span><small>Appointment type</small><b>Dealer appointment</b></span>
          </div> : <div>
            <label className="lbl">Type</label>
            <div className="seg" style={{ marginTop: 6 }}>
              {KINDS.map((k) => (
                <button key={k.key} type="button" className={kind === k.key ? "on" : undefined} onClick={() => setKind(k.key)}>
                  {k.label}
                </button>
              ))}
            </div>
          </div>}

          <div>
            <label className="lbl">Meeting method</label>
            <div className="seg" style={{ marginTop: 6, flexWrap: "wrap" }} role="radiogroup" aria-label="Meeting method">
              <button type="button" role="radio" aria-checked={meetingMode === "video"} className={meetingMode === "video" ? "on" : undefined} disabled={availabilityInfo?.google_meet_enabled === false} onClick={() => setMeetingMode("video")}>Google Meet</button>
              <button type="button" role="radio" aria-checked={meetingMode === "phone"} className={meetingMode === "phone" ? "on" : undefined} onClick={() => setMeetingMode("phone")}>Phone call</button>
              <button type="button" role="radio" aria-checked={meetingMode === "in_person"} className={meetingMode === "in_person" ? "on" : undefined} onClick={() => setMeetingMode("in_person")}>In person</button>
            </div>
            {availabilityInfo?.google_meet_enabled === false && <span className="sub" style={{ display: "block", marginTop: 5 }}>Google Meet is disabled in the shared calendar settings. Choose phone or in person.</span>}
          </div>
          {meetingMode === "in_person" && <label><span className="lbl">Meeting location</span><input className="field" required value={meetingLocation} onChange={(event) => setMeetingLocation(event.target.value)} placeholder="Office, dealership, or full address" /></label>}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
            <div>
              <label className="lbl">Invitee</label>
              <input className="field" value={inviteeName} onChange={(e) => setInviteeName(e.target.value)} placeholder="Client name" readOnly={Boolean(prospect || (initialKnownContact && initialName))} />
            </div>
            <div>
              <label className="lbl">Email</label>
              <input className="field" type="email" value={inviteeEmail} onChange={(e) => setInviteeEmail(e.target.value)} placeholder={selected?.email ?? ""} readOnly={Boolean(prospect || (initialKnownContact && initialEmail))} />
            </div>
            <div>
              <label className="lbl">Phone</label>
              <input className="field" type="tel" value={inviteePhone} onChange={(e) => setInviteePhone(e.target.value)} placeholder={selected?.phone ?? ""} readOnly={Boolean(prospect || (initialKnownContact && initialPhone))} />
            </div>
          </div>

          {sourceMode === "lead" && duplicateCheck.isFetching && duplicateInputIsCurrent ? (
            <div className="prospectDuplicatePreflight" role="status">Checking email and phone for an existing Marketing contact…</div>
          ) : null}
          {sourceMode === "lead" && linkedExistingContact ? (
            <div className="prospectDuplicatePreflight" role="status">
              Existing Inbox contact recognized. This appointment will attach to the canonical contact instead of creating a duplicate.
            </div>
          ) : null}
          {sourceMode === "lead" && duplicateCheck.data?.blocked && duplicateInputIsCurrent && !linkedExistingContact ? (
            <div className="prospectDuplicateWarning" role="alert">
              <b>{duplicateCheck.data.state === "identity_conflict"
                ? "Email and phone belong to different contacts."
                : duplicateCheck.data.state === "archived_match"
                  ? "An archived Marketing prospect already uses these details."
                  : "This contact already exists."}</b>
              <span>{duplicateCheck.data.message || "Open the existing record, or change the conflicting email or phone before booking."}</span>
              {duplicateCheck.data.visible_matches.map((candidate) => {
                const key = `${candidate.prospect_id || candidate.contact_id}:${candidate.matched_on.join("-")}`;
                if (candidate.prospect_id && candidate.archived && candidate.version != null) {
                  return <button type="button" className="btn" key={key} disabled={restoreProspect.isPending} onClick={() => restoreProspect.mutate({ prospectId: candidate.prospect_id!, version: candidate.version! })}>{restoreProspect.isPending ? "Restoring…" : "Restore & open prospect"}</button>;
                }
                if (candidate.prospect_id) {
                  return <button type="button" className="btn" key={key} onClick={() => { onClose(); router.push(`/marketing/prospects/${candidate.prospect_id}`); }}>Open active prospect</button>;
                }
                if (candidate.contact_id) {
                  return <button type="button" className="btn" key={key} onClick={() => { onClose(); router.push(`/marketing/${candidate.contact_id}`); }}>Open existing contact</button>;
                }
                return null;
              })}
              {duplicateCheck.data.assignment_required && !requestReassignment.isSuccess ? <>
                <small>A matching contact is assigned elsewhere. Private details remain hidden.</small>
                <button type="button" className="btn" disabled={requestReassignment.isPending} onClick={() => requestReassignment.mutate()}>{requestReassignment.isPending ? "Sending request…" : "Request reassignment"}</button>
              </> : null}
              {requestReassignment.isSuccess ? <small>Reassignment requested. An administrator can review it without creating a duplicate.</small> : null}
              {requestReassignment.isError ? <small>The reassignment request could not be sent. {requestReassignment.error instanceof Error ? requestReassignment.error.message : "Try again."}</small> : null}
              {restoreProspect.isError ? <small>The archived prospect could not be restored. {restoreProspect.error instanceof Error ? restoreProspect.error.message : "Refresh and try again."}</small> : null}
            </div>
          ) : null}
          {sourceMode === "lead" && duplicateCheck.isError && duplicateInputIsCurrent ? (
            <div className="note" role="status">Live duplicate preview is temporarily unavailable. Booking will still run the authoritative server duplicate check.</div>
          ) : null}

          {!prospect && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
            <div>
              <label className="lbl">Program to discuss</label>
              <ProgramSelect
                programKey={programKey}
                programName={programName}
                onChange={(selection) => {
                  setProgramKey(selection.key);
                  setProgramName(selection.name);
                }}
              />
            </div>
            <div>
              <label className="lbl">Interested amount</label>
              <input className="field" inputMode="decimal" value={requestedAmount} onChange={(e) => setRequestedAmount(e.target.value)} placeholder="$250,000" />
            </div>
          </div>}
          {!prospect && <BusinessAddressFields
            key={`${sourceMode}:${dealerId || "new"}`}
            value={address}
            onChange={setAddress}
            manualFallback="when-needed"
            searchLabel="Business or property address"
            searchPlaceholder="Start typing the full address"
            helperText="Choose a verified result. If it is not listed, enter the complete address manually."
          />}

          <div className="bookingCalendar">
            {availability.isError ? (
              <div className="note" role="alert" style={{ gridColumn: "1 / -1" }}>
                <b>Available times could not be loaded.</b>
                <span style={{ display: "block", marginTop: 4 }}>No appointment can be booked until the shared calendar responds.</span>
                <button type="button" className="btn mt" disabled={availability.isFetching} onClick={() => void availability.refetch()}>{availability.isFetching ? "Retrying…" : "Retry availability"}</button>
              </div>
            ) : availabilityInfo && availabilityInfo.calendar_sync_status !== "connected" ? (
              <div className="note" style={{ gridColumn: "1 / -1" }}>
                {availabilityInfo.calendar_sync_status === "unavailable"
                  ? `${availabilityInfo.host_name || "The shared QC calendar"} is temporarily unavailable. Booking is paused to prevent a double-booking.`
                  : `${availabilityInfo.host_name || "The shared QC calendar"} must be reconnected before appointments can be booked.`}
              </div>
            ) : null}
            <div className="slotRail" aria-label="Available days">
              {availability.isLoading && <span className="sub">Loading times...</span>}
              {days.map((day, index) => (
                <button
                  key={day.label}
                  type="button"
                  className={index === dayIndex ? "on" : undefined}
                  onClick={() => setDayIndex(index)}
                >
                  <b>{day.label}</b>
                  <span>{day.slots.length} time{day.slots.length === 1 ? "" : "s"}</span>
                </button>
              ))}
              {availability.hasNextPage && <button type="button" className="slotLoadMore" disabled={availability.isFetchingNextPage} aria-label="Load more complete days of appointment availability" onClick={() => void availability.fetchNextPage()}><b>{availability.isFetchingNextPage ? "Loading…" : "More days"}</b><span>{availability.isFetchingNextPage ? "Checking calendar" : "Load next dates"}</span></button>}
            </div>
            <div className="slotGrid" aria-label="Available times">
              {(activeDay?.slots ?? []).map((slot) => (
                <button
                  key={slot.starts_at}
                  type="button"
                  className={startsAt === slot.starts_at ? "on" : undefined}
                  onClick={() => setStartsAt(slot.starts_at)}
                >
                  {slot.label}
                </button>
              ))}
              {availabilityInfo && availabilitySlots.length === 0 && !availability.hasNextPage && (
                <span className="sub">No available slots are open in this rep calendar window.</span>
              )}
            </div>
            <div className="slotSummary">
              <span className="lbl">Selected time</span>
              <b>{selectedSummary(selectedSlot)}</b>
              <span className="sub">{availabilityInfo?.timezone ?? "Rep calendar"}</span>
              {availabilityInfo ? (
                <span className="sub">
                  {availabilityInfo.duration_min} min with {availabilityInfo.buffer_before_min} min before and {availabilityInfo.buffer_after_min} min after
                  {availabilityInfo.host_name ? ` · ${availabilityInfo.host_name}'s calendar` : ""}
                </span>
              ) : null}
            </div>
          </div>

          <div>
            <label className="lbl">Notes</label>
            <textarea className="field" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Agenda, callback reason, or program questions." />
          </div>

          {kind === "underwriting_review" && sourceMode === "file" && dealerId ? (
            <section className="bookingDocumentChecklist">
              <div>
                <b>Client-room document checklist</b>
                <span className="sub">Booking automatically requests two years of business tax returns and two years of personal tax returns from every required 20%+ owner. Select any additional items needed for this review.</span>
              </div>
              <div className="bookingDocumentOptions">
                {UNDERWRITING_DOCUMENTS.map((item) => {
                  const checked = requestedDocumentKeys.includes(item.key);
                  return (
                    <label className={`pick${checked ? " selected" : ""}`} key={item.key}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => setRequestedDocumentKeys((current) => (
                          event.target.checked
                            ? [...new Set([...current, item.key])]
                            : current.filter((key) => key !== item.key)
                        ))}
                      />
                      <span><b>{item.label}</b><span className="sub">{item.help}</span></span>
                    </label>
                  );
                })}
              </div>
            </section>
          ) : null}

          {inviteePhone.trim() ? (
            <label className="pick" style={{ alignItems: "flex-start" }}>
              <input
                type="checkbox"
                checked={smsConsent}
                onChange={(e) => setSmsConsent(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>
                <b>Transactional SMS consent confirmed</b>
                <span className="sub" style={{ display: "block", marginTop: 3 }}>
                  The client agreed to receive appointment confirmations and reminders from Qualified Commercial. Message and data rates may apply. Reply STOP to opt out.
                </span>
              </span>
            </label>
          ) : null}

          {book.isError && <div className="note" role="alert">{book.error instanceof Error ? book.error.message : "That appointment could not be booked."}</div>}

          <button type="button" className="btn pri" disabled={!canBook || book.isPending} onClick={() => book.mutate()}>
            {book.isPending ? "Booking..." : prospect ? "Book prospect" : "Review and book"}
          </button>
        </div>
      </div>
    </Drawer>
  );
}
