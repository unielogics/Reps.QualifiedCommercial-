"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CalendarSlotDay } from "@/lib/repWorkflows";
import type { RepAppointment } from "@/lib/appointments";
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
  calendar_sync_status: "connected" | "disconnected" | "unavailable";
  slots: Slot[];
};
type SourceMode = "file" | "lead";
type AddressParts = { address: string; city: string; state: string; zip: string };

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
  initialKind,
}: {
  onClose: () => void;
  initialDealerId?: string | null;
  initialName?: string | null;
  initialEmail?: string | null;
  initialPhone?: string | null;
  initialKind?: (typeof KINDS)[number]["key"];
}) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [sourceMode, setSourceMode] = useState<SourceMode>(initialDealerId ? "file" : "lead");
  const [dealerId, setDealerId] = useState(initialDealerId ?? "");
  const [kind, setKind] = useState<(typeof KINDS)[number]["key"]>(initialKind ?? "callback");
  const [startsAt, setStartsAt] = useState("");
  const [dayIndex, setDayIndex] = useState(0);
  const [inviteeName, setInviteeName] = useState(initialName ?? "");
  const [company, setCompany] = useState("");
  const [inviteeEmail, setInviteeEmail] = useState(initialEmail ?? "");
  const [inviteePhone, setInviteePhone] = useState(initialPhone ?? "");
  const [notes, setNotes] = useState("");
  const [programKey, setProgramKey] = useState(GENERAL_PROGRAM_KEY);
  const [programName, setProgramName] = useState(GENERAL_PROGRAM_NAME);
  const [requestedAmount, setRequestedAmount] = useState("");
  const [address, setAddress] = useState<AddressParts>({ address: "", city: "", state: "", zip: "" });
  const [smsConsent, setSmsConsent] = useState(false);
  // After booking: the room kit to read out or copy. The drawer stays open so a
  // rep sitting with the client can hand over the PIN before closing.
  const [booked, setBooked] = useState<RepAppointment | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [requestedDocumentKeys, setRequestedDocumentKeys] = useState<string[]>([]);

  const files = useQuery({
    queryKey: ["files"],
    queryFn: async () => api<FileRow[]>("/dealer-os/dealers", { authToken: (await getToken()) ?? undefined }),
  });
  const selected = useMemo(
    () => (files.data ?? []).find((f) => f.id === dealerId) ?? null,
    [files.data, dealerId],
  );
  const availability = useQuery({
    queryKey: ["booking-availability", sourceMode, dealerId],
    queryFn: async () =>
      api<Availability>(
        sourceMode === "file" && dealerId
          ? `/dealer-os/booking/availability?dealer_id=${dealerId}`
          : "/dealer-os/booking/availability",
        { authToken: (await getToken()) ?? undefined },
      ),
  });
  const days = useMemo(() => groupSlots(availability.data?.slots), [availability.data?.slots]);
  const activeDay = days[Math.min(dayIndex, Math.max(days.length - 1, 0))];
  const selectedSlot = useMemo(
    () => (availability.data?.slots ?? []).find((s) => s.starts_at === startsAt),
    [availability.data?.slots, startsAt],
  );

  useEffect(() => {
    if (dayIndex >= days.length) setDayIndex(0);
    if (startsAt && !(availability.data?.slots ?? []).some((s) => s.starts_at === startsAt)) {
      setStartsAt("");
    }
  }, [availability.data?.slots, dayIndex, days.length, startsAt]);

  const book = useMutation({
    mutationFn: async () =>
      api<RepAppointment>(sourceMode === "file" && dealerId ? `/dealer-os/dealers/${dealerId}/appointments` : "/dealer-os/appointments", {
        method: "POST",
        body: JSON.stringify({
          kind,
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
          // The field desk books here; that is what opens the draft file.
          origin: "field_desk",
          requested_document_keys: kind === "underwriting_review" ? requestedDocumentKeys : [],
        }),
        authToken: (await getToken()) ?? undefined,
      }),
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: ["appointments", dealerId] });
      void qc.invalidateQueries({ queryKey: ["rep-appointments"] });
      void qc.invalidateQueries({ queryKey: ["inbox-threads"] });
      void qc.invalidateQueries({ queryKey: ["dealers"] });
      if (created?.room_url) setBooked(created);
      else onClose();
    },
  });
  const copy = async (label: string, value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(label); window.setTimeout(() => setCopied(null), 1600); } catch { /* clipboard unavailable */ }
  };

  const needsCompany = sourceMode === "lead";
  const canBook = Boolean(
    startsAt &&
      inviteeName.trim() &&
      (!needsCompany || company.trim()) &&
      (inviteeEmail.trim() || inviteePhone.trim()),
  );

  if (booked) {
    const pinVia = booked.precall?.pin_delivered_via;
    return (
      <Drawer title="Appointment booked" width={640} onClose={onClose} variant="workspace" dismissOnBackdrop={false}>
        <div className="panel">
          <div className="panel-h">Draft file opened · secure room ready</div>
          <div className="panel-b" style={{ display: "grid", gap: 14 }}>
            <p className="sub" style={{ margin: 0 }}>
              {booked.invitee_name} is booked. A draft file{booked.precall?.case_ref ? ` (${booked.precall.case_ref})` : ""} and a secure room were opened for this call; the confirmation carries the room link and the “Before your call” checklist (owners → bank → soft credit).
            </p>
            <div>
              <label className="lbl">Secure room link</label>
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                <code style={{ fontSize: 12, wordBreak: "break-all" }}>{booked.room_url}</code>
                <button type="button" className="btn sm" onClick={() => void copy("link", booked.room_url!)}>{copied === "link" ? "Copied" : "Copy"}</button>
              </div>
            </div>
            {booked.room_passcode ? (
              <div className="note" style={{ display: "grid", gap: 6 }}>
                <b>Room PIN: <span className="num" style={{ fontSize: 20, letterSpacing: ".12em" }}>{booked.room_passcode}</span></b>
                <span className="sub">
                  {pinVia === "sms" ? "Texted to the client. " : pinVia === "email" ? "Emailed to the client separately. " : "Not delivered automatically — "}
                  {pinVia === "sms" || pinVia === "email" ? "Read it out too if you are with them." : "read this PIN to the client."} They can change it the first time they open the room.
                </span>
                <div><button type="button" className="btn sm" onClick={() => void copy("pin", booked.room_passcode!)}>{copied === "pin" ? "Copied" : "Copy PIN"}</button></div>
              </div>
            ) : (
              <span className="sub">This client already had a room PIN from an earlier booking; the room link was sent again.</span>
            )}
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
          <div>
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
          </div>

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
              />
            </div>
          )}

          <div>
            <label className="lbl">Type</label>
            <div className="seg" style={{ marginTop: 6 }}>
              {KINDS.map((k) => (
                <button key={k.key} type="button" className={kind === k.key ? "on" : undefined} onClick={() => setKind(k.key)}>
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
            <div>
              <label className="lbl">Invitee</label>
              <input className="field" value={inviteeName} onChange={(e) => setInviteeName(e.target.value)} placeholder="Client name" />
            </div>
            <div>
              <label className="lbl">Email</label>
              <input className="field" type="email" value={inviteeEmail} onChange={(e) => setInviteeEmail(e.target.value)} placeholder={selected?.email ?? ""} />
            </div>
            <div>
              <label className="lbl">Phone</label>
              <input className="field" type="tel" value={inviteePhone} onChange={(e) => setInviteePhone(e.target.value)} placeholder={selected?.phone ?? ""} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
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
          </div>
          <BusinessAddressFields
            key={`${sourceMode}:${dealerId || "new"}`}
            value={address}
            onChange={setAddress}
            manualFallback="when-needed"
            searchLabel="Business or property address"
            searchPlaceholder="Start typing the full address"
            helperText="Choose a verified result. If it is not listed, enter the complete address manually."
          />

          <div className="bookingCalendar">
            {availability.data?.calendar_sync_status !== "connected" ? (
              <div className="note" style={{ gridColumn: "1 / -1" }}>
                {availability.data?.calendar_sync_status === "unavailable"
                  ? "Franco's Google Calendar is temporarily unavailable. Booking is paused to prevent a double-booking."
                  : "Franco's Google Calendar must be reconnected before reps can book a time."}
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
              {availability.data && availability.data.slots.length === 0 && (
                <span className="sub">No available slots are open in this rep calendar window.</span>
              )}
            </div>
            <div className="slotSummary">
              <span className="lbl">Selected time</span>
              <b>{selectedSummary(selectedSlot)}</b>
              <span className="sub">{availability.data?.timezone ?? "Rep calendar"}</span>
              {availability.data ? (
                <span className="sub">
                  {availability.data.duration_min} min with {availability.data.buffer_before_min} min before and {availability.data.buffer_after_min} min after
                  {availability.data.host_name ? ` · ${availability.data.host_name}'s calendar` : ""}
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

          {book.isError && <div className="note">{book.error instanceof Error ? book.error.message : "That appointment could not be booked."}</div>}

          <button type="button" className="btn pri" disabled={!canBook || book.isPending} onClick={() => book.mutate()}>
            {book.isPending ? "Booking..." : "Review and book"}
          </button>
        </div>
      </div>
    </Drawer>
  );
}
