"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
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

const KINDS = [
  { key: "callback", label: "Callback" },
  { key: "program_intro", label: "Program intro" },
  { key: "underwriting_review", label: "Underwriting review" },
] as const;

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
  const [dealerId, setDealerId] = useState(initialDealerId ?? "");
  const [kind, setKind] = useState<(typeof KINDS)[number]["key"]>("callback");
  const [startsAt, setStartsAt] = useState("");
  const [inviteeName, setInviteeName] = useState(initialName ?? "");
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
    queryKey: ["booking-availability", dealerId],
    queryFn: async () =>
      api<Availability>(dealerId ? `/dealer-os/booking/availability?dealer_id=${dealerId}` : "/dealer-os/booking/availability", {
        authToken: (await getToken()) ?? undefined,
      }),
  });
  const book = useMutation({
    mutationFn: async () =>
      api(dealerId ? `/dealer-os/dealers/${dealerId}/appointments` : "/dealer-os/appointments", {
        method: "POST",
        body: JSON.stringify({
          kind,
          starts_at: startsAt,
          invitee_name: inviteeName.trim(),
          invitee_email: inviteeEmail.trim() || null,
          invitee_phone: inviteePhone.trim() || null,
          notes: notes.trim() || null,
        }),
        authToken: (await getToken()) ?? undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["appointments", dealerId] });
      onClose();
    },
  });

  const canBook = Boolean(startsAt && inviteeName.trim() && (inviteeEmail.trim() || inviteePhone.trim()));

  return (
    <Drawer title="Book appointment" width={720} onClose={onClose}>
      <div className="panel">
        <div className="panel-h">Appointment details</div>
        <div className="panel-b" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label className="lbl">File</label>
            <select className="field" value={dealerId} onChange={(e) => setDealerId(e.target.value)}>
              <option value="">No file yet</option>
              {(files.data ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}{f.case_ref ? ` · ${f.case_ref}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="lbl">Type</label>
            <div className="seg">
              {KINDS.map((k) => (
                <button key={k.key} type="button" className={kind === k.key ? "on" : undefined} onClick={() => setKind(k.key)}>
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
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

          <div>
            <label className="lbl">Available time</label>
            <select className="field" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} disabled={availability.isLoading}>
              <option value="">{availability.isLoading ? "Loading times..." : "Choose a time"}</option>
              {(availability.data?.slots ?? []).map((slot) => (
                <option key={slot.starts_at} value={slot.starts_at}>
                  {slot.date_label} · {slot.label}
                </option>
              ))}
            </select>
            {availability.data && availability.data.slots.length === 0 && (
              <span className="sub">No available slots are open in this rep calendar window.</span>
            )}
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
