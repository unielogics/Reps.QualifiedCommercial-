"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { RepAppointment } from "@/lib/appointments";
import BusinessAddressFields from "./BusinessAddressFields";
import Drawer from "./Drawer";

type AddressParts = { address: string; city: string; state: string; zip: string };

const KINDS = [
  { key: "callback", label: "Callback" },
  { key: "program_intro", label: "Program intro" },
  { key: "underwriting_review", label: "Underwriting review" },
] as const;

function localInputValue(iso: string): string {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function joinAddress(value: AddressParts): string | null {
  const locality = [value.city.trim(), value.state.trim(), value.zip.trim()].filter(Boolean).join(" ");
  return [value.address.trim(), locality].filter(Boolean).join(", ") || null;
}

function errorText(error: unknown): string {
  if (error instanceof ApiError && error.body && typeof error.body === "object" && "detail" in error.body) {
    const detail = (error.body as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return error instanceof Error ? error.message : "The appointment could not be updated.";
}

export default function AppointmentEditorDrawer({
  appointment,
  mode,
  onClose,
}: {
  appointment: RepAppointment;
  mode: "details" | "edit" | "reschedule";
  onClose: () => void;
}) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(mode !== "details");
  const [title, setTitle] = useState(appointment.title);
  const [kind, setKind] = useState(appointment.kind);
  const [startsAt, setStartsAt] = useState(localInputValue(appointment.starts_at));
  const [timezone, setTimezone] = useState(appointment.timezone);
  const [duration, setDuration] = useState(String(appointment.duration_min));
  const [name, setName] = useState(appointment.invitee_name);
  const [email, setEmail] = useState(appointment.invitee_email ?? "");
  const [phone, setPhone] = useState(appointment.invitee_phone ?? "");
  const [company, setCompany] = useState(appointment.company ?? "");
  const [program, setProgram] = useState(appointment.program_name ?? "");
  const [amount, setAmount] = useState(appointment.requested_amount ?? "");
  const [notes, setNotes] = useState(appointment.notes ?? "");
  const [joinUrl, setJoinUrl] = useState(appointment.join_url ?? "");
  const [confirmOutcomeReopen, setConfirmOutcomeReopen] = useState(false);
  const [address, setAddress] = useState<AddressParts>({
    address: appointment.full_address ?? "",
    city: "",
    state: "",
    zip: "",
  });

  useEffect(() => setEditing(mode !== "details"), [mode]);

  const rescheduleChanges = startsAt !== localInputValue(appointment.starts_at) || Number(duration) !== appointment.duration_min;
  const outcomeWillReopen = Boolean(
    rescheduleChanges && appointment.outcome && ["not_converted", "did_not_show"].includes(appointment.outcome),
  );

  const update = useMutation({
    mutationFn: async () => api<RepAppointment>(`/dealer-os/appointments/${appointment.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: title.trim(),
        kind,
        starts_at: new Date(startsAt).toISOString(),
        timezone: timezone.trim() || appointment.timezone,
        duration_min: Number(duration),
        invitee_name: name.trim(),
        invitee_email: email.trim() || null,
        invitee_phone: phone.trim() || null,
        company: company.trim() || null,
        program_name: program.trim() || null,
        requested_amount: amount.trim() || null,
        full_address: joinAddress(address),
        notes: notes.trim() || null,
        join_url: joinUrl.trim() || null,
        reopen_outcome: outcomeWillReopen ? confirmOutcomeReopen : false,
      }),
      authToken: (await getToken()) ?? undefined,
    }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["rep-appointments"] });
      await qc.invalidateQueries({ queryKey: ["appointments"] });
      onClose();
    },
  });

  const canSave = useMemo(() => Boolean(
    title.trim() && startsAt && name.trim() && (email.trim() || phone.trim()) && Number(duration) >= 15 && (!outcomeWillReopen || confirmOutcomeReopen),
  ), [confirmOutcomeReopen, duration, email, name, outcomeWillReopen, phone, startsAt, title]);

  const statusRows = [
    ["Google sync", appointment.google_sync_status],
    ["Client confirmation", appointment.confirmation_email_status],
    ["Email reminder", appointment.email_reminder_status],
    ["SMS confirmation", appointment.confirmation_sms_status],
    ["SMS reminder", appointment.sms_reminder_status],
    ["Your notification", appointment.rep_notification_status],
    ["Your reminder", appointment.rep_reminder_status],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <Drawer title={editing ? (mode === "reschedule" ? "Reschedule appointment" : "Edit appointment") : "Appointment details"} width={900} onClose={onClose}>
      {!editing ? (
        <div style={{ display: "grid", gap: 14 }}>
          <div className="panel">
            <div className="panel-h">
              <div>
                <b>{appointment.title}</b>
                <div className="sub">{new Date(appointment.starts_at).toLocaleString()} · {appointment.duration_min} minutes · {appointment.timezone}</div>
              </div>
              <span className="sp" />
              <span className={`cellchip ${appointment.status === "cancelled" ? "c-bad" : "c-ok"}`}>{appointment.status}</span>
            </div>
            <div className="panel-b" style={{ display: "grid", gap: 10 }}>
              <Detail label="Client" value={appointment.invitee_name} />
              <Detail label="Contact" value={[appointment.invitee_email, appointment.invitee_phone].filter(Boolean).join(" · ") || "Not provided"} />
              <Detail label="Company" value={appointment.company} />
              <Detail label="Program / amount" value={[appointment.program_name, appointment.requested_amount].filter(Boolean).join(" · ")} />
              <Detail label="Address" value={appointment.full_address} />
              <Detail label="Notes" value={appointment.notes} />
              {appointment.delivery_error && <div className="note">Delivery issue: {appointment.delivery_error}</div>}
            </div>
          </div>
          <div className="panel">
            <div className="panel-h">Delivery and reminders</div>
            <div className="panel-b" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
              {statusRows.length ? statusRows.map(([label, value]) => (
                <div key={label} className="kpi"><span className="lbl">{label}</span><b>{value.replaceAll("_", " ")}</b></div>
              )) : <span className="sub">No delivery status has been recorded yet.</span>}
            </div>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn pri" type="button" onClick={() => setEditing(true)}>Edit appointment</button>
            {appointment.join_url && <a className="btn" href={appointment.join_url} target="_blank" rel="noreferrer">Join meeting</a>}
            {appointment.dealer_id && <a className="btn" href={`/applications/${appointment.dealer_id}`}>Open file</a>}
          </div>
        </div>
      ) : (
        <form onSubmit={(event) => { event.preventDefault(); if (canSave) update.mutate(); }} style={{ display: "grid", gap: 14 }}>
          <div className="panel">
            <div className="panel-h">Meeting</div>
            <div className="panel-b" style={{ display: "grid", gap: 12 }}>
              <label><span className="lbl">Title</span><input className="field" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
                <label><span className="lbl">Type</span><select className="field" value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((row) => <option key={row.key} value={row.key}>{row.label}</option>)}</select></label>
                <label><span className="lbl">Date and time</span><input className="field" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></label>
                <label><span className="lbl">Duration</span><select className="field" value={duration} onChange={(e) => setDuration(e.target.value)}>{[15,20,25,30,45,60,90].map((value) => <option key={value} value={value}>{value} min</option>)}</select></label>
                <label><span className="lbl">Timezone</span><input className="field" value={timezone} onChange={(e) => setTimezone(e.target.value)} /></label>
              </div>
              <span className="sub">Rescheduled times are checked against Franco&apos;s live Google Calendar and the configured buffers before saving.</span>
              {outcomeWillReopen && (
                <label className="note row" style={{ gap: 8 }}>
                  <input type="checkbox" checked={confirmOutcomeReopen} onChange={(event) => setConfirmOutcomeReopen(event.target.checked)} />
                  Confirm that this reschedule reopens the recorded {appointment.outcome?.replaceAll("_", " ")} outcome.
                </label>
              )}
            </div>
          </div>
          <div className="panel">
            <div className="panel-h">Client and file context</div>
            <div className="panel-b" style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
                <label><span className="lbl">Client name</span><input className="field" value={name} onChange={(e) => setName(e.target.value)} /></label>
                <label><span className="lbl">Email</span><input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
                <label><span className="lbl">Phone</span><input className="field" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
                <label><span className="lbl">Company</span><input className="field" value={company} onChange={(e) => setCompany(e.target.value)} /></label>
                <label><span className="lbl">Program</span><input className="field" value={program} onChange={(e) => setProgram(e.target.value)} /></label>
                <label><span className="lbl">Requested amount</span><input className="field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
              </div>
              <BusinessAddressFields
                value={address}
                onChange={setAddress}
                manualFallback="when-needed"
                searchLabel="Business or property address"
                searchPlaceholder="Search the complete address"
                helperText="Select a Google result or use the manual address fields."
              />
              <label><span className="lbl">Notes</span><textarea className="field" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
              <label><span className="lbl">Join link</span><input className="field" type="url" value={joinUrl} onChange={(e) => setJoinUrl(e.target.value)} /></label>
            </div>
          </div>
          {update.isError && <div className="note">{errorText(update.error)}</div>}
          <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn pri" disabled={!canSave || update.isPending}>{update.isPending ? "Saving..." : "Save and synchronize"}</button>
          </div>
        </form>
      )}
    </Drawer>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return <div><span className="lbl">{label}</span><div style={{ marginTop: 3, whiteSpace: "pre-wrap" }}>{value || "Not provided"}</div></div>;
}
