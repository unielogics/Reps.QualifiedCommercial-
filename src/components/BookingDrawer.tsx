"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CalendarSlotDay } from "@/lib/repWorkflows";
import Drawer from "./Drawer";

type FileRow = {
  id: string;
  name: string;
  case_ref: string | null;
  email?: string | null;
  phone?: string | null;
};

type Slot = { starts_at: string; label: string; date_label: string };
type Availability = { timezone: string; duration_min: number; slots: Slot[] };
type SourceMode = "file" | "lead";

const KINDS = [
  { key: "callback", label: "Callback" },
  { key: "program_intro", label: "Program intro" },
  { key: "underwriting_review", label: "Underwriting review" },
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
}: {
  onClose: () => void;
  initialDealerId?: string | null;
  initialName?: string | null;
  initialEmail?: string | null;
  initialPhone?: string | null;
}) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [sourceMode, setSourceMode] = useState<SourceMode>(initialDealerId ? "file" : "lead");
  const [dealerId, setDealerId] = useState(initialDealerId ?? "");
  const [kind, setKind] = useState<(typeof KINDS)[number]["key"]>("callback");
  const [startsAt, setStartsAt] = useState("");
  const [dayIndex, setDayIndex] = useState(0);
  const [inviteeName, setInviteeName] = useState(initialName ?? "");
  const [company, setCompany] = useState("");
  const [inviteeEmail, setInviteeEmail] = useState(initialEmail ?? "");
  const [inviteePhone, setInviteePhone] = useState(initialPhone ?? "");
  const [notes, setNotes] = useState("");

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
      api(sourceMode === "file" && dealerId ? `/dealer-os/dealers/${dealerId}/appointments` : "/dealer-os/appointments", {
        method: "POST",
        body: JSON.stringify({
          kind,
          starts_at: startsAt,
          company: sourceMode === "lead" ? company.trim() : company.trim() || selected?.name || null,
          invitee_name: inviteeName.trim(),
          invitee_email: inviteeEmail.trim() || null,
          invitee_phone: inviteePhone.trim() || null,
          notes: notes.trim() || null,
        }),
        authToken: (await getToken()) ?? undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["appointments", dealerId] });
      void qc.invalidateQueries({ queryKey: ["rep-appointments"] });
      void qc.invalidateQueries({ queryKey: ["inbox-threads"] });
      onClose();
    },
  });

  const needsCompany = sourceMode === "lead";
  const canBook = Boolean(
    startsAt &&
      inviteeName.trim() &&
      (!needsCompany || company.trim()) &&
      (inviteeEmail.trim() || inviteePhone.trim()),
  );

  return (
    <Drawer title="Book appointment" width={980} onClose={onClose}>
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

          <div className="bookingCalendar">
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
            </div>
          </div>

          <div>
            <label className="lbl">Notes</label>
            <textarea className="field" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Agenda, callback reason, or program questions." />
          </div>

          {book.isError && <div className="note">{book.error instanceof Error ? book.error.message : "That appointment could not be booked."}</div>}

          <button type="button" className="btn pri" disabled={!canBook || book.isPending} onClick={() => book.mutate()}>
            {book.isPending ? "Booking..." : "Review and book"}
          </button>
        </div>
      </div>
    </Drawer>
  );
}
