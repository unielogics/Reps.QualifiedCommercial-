"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import BookingDrawer from "@/components/BookingDrawer";

type AppointmentStatus = "pending" | "confirmed" | "cancelled" | "done";

type Appointment = {
  id: string;
  dealer_id: string | null;
  kind: "callback" | "program_intro" | "underwriting_review" | string;
  title: string;
  starts_at: string;
  duration_min: number;
  timezone: string;
  invitee_name: string;
  invitee_email: string | null;
  invitee_phone: string | null;
  join_url: string | null;
  notes: string | null;
  status: AppointmentStatus;
};

type CalendarDay = {
  key: string;
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  appointments: Appointment[];
};

function startOfLocalDay(value: Date): Date {
  const out = new Date(value);
  out.setHours(0, 0, 0, 0);
  return out;
}

function endOfLocalDay(value: Date): Date {
  const out = new Date(value);
  out.setHours(23, 59, 59, 999);
  return out;
}

function localDateKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function addDays(value: Date, days: number): Date {
  const out = new Date(value);
  out.setDate(out.getDate() + days);
  return out;
}

function addMonths(value: Date, months: number): Date {
  return new Date(value.getFullYear(), value.getMonth() + months, 1);
}

function monthLabel(value: Date): string {
  return value.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function dayLabel(value: Date): string {
  return value.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function kindLabel(kind: string): string {
  if (kind === "program_intro") return "Program intro";
  if (kind === "underwriting_review") return "Underwriting review";
  return "Callback";
}

function statusClass(status: AppointmentStatus): string {
  if (status === "done") return "c-ok";
  if (status === "cancelled") return "c-bad";
  if (status === "pending") return "c-warn";
  return "c-acc";
}

function buildMonth(anchor: Date, appointments: Appointment[]): CalendarDay[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = addDays(first, -first.getDay());
  const today = new Date();
  const byDay = appointments.reduce<Record<string, Appointment[]>>((acc, appt) => {
    const key = localDateKey(new Date(appt.starts_at));
    (acc[key] ||= []).push(appt);
    return acc;
  }, {});

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    const key = localDateKey(date);
    return {
      key,
      date,
      inMonth: date.getMonth() === anchor.getMonth(),
      isToday: sameLocalDay(date, today),
      appointments: byDay[key] ?? [],
    };
  });
}

function gridRange(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = addDays(first, -first.getDay());
  const gridEnd = addDays(gridStart, 41);
  return {
    from: startOfLocalDay(gridStart).toISOString(),
    to: endOfLocalDay(gridEnd).toISOString(),
  };
}

export default function RepCalendarPage() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => startOfLocalDay(new Date()));
  const [bookingOpen, setBookingOpen] = useState(false);

  const range = useMemo(() => gridRange(month), [month]);
  const appointments = useQuery({
    queryKey: ["rep-appointments", range],
    queryFn: async () =>
      api<Appointment[]>(`/dealer-os/appointments?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&limit=500`, {
        authToken: (await getToken()) ?? undefined,
      }),
  });

  const rows = useMemo(
    () => (appointments.data ?? []).sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
    [appointments.data],
  );
  const days = useMemo(() => buildMonth(month, rows), [month, rows]);
  const selectedKey = localDateKey(selectedDate);
  const selectedRows = rows.filter((appt) => localDateKey(new Date(appt.starts_at)) === selectedKey);
  const now = Date.now();
  const todayRows = rows.filter((appt) => sameLocalDay(new Date(appt.starts_at), new Date()));
  const upcomingRows = rows.filter((appt) => appt.status !== "cancelled" && new Date(appt.starts_at).getTime() >= now);
  const pendingRows = rows.filter((appt) => appt.status === "pending" || appt.status === "confirmed");

  const patchStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AppointmentStatus }) =>
      api<Appointment>(`/dealer-os/appointments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
        authToken: (await getToken()) ?? undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["rep-appointments"] });
    },
  });

  return (
    <>
      <div className="hd">
        <h2>Calendar</h2>
        <p className="lede">Appointments, callbacks, program intros, and underwriting reviews.</p>
      </div>

      <div className="calendarTop mt">
        <div>
          <span className="lbl">Calendar month</span>
          <h3>{monthLabel(month)}</h3>
        </div>
        <div className="sp" />
        <div className="seg">
          <button type="button" onClick={() => setMonth(addMonths(month, -1))}>
            Previous
          </button>
          <button
            type="button"
            className={sameLocalDay(month, new Date(new Date().getFullYear(), new Date().getMonth(), 1)) ? "on" : undefined}
            onClick={() => {
              const today = new Date();
              setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
              setSelectedDate(startOfLocalDay(today));
            }}
          >
            Today
          </button>
          <button type="button" onClick={() => setMonth(addMonths(month, 1))}>
            Next
          </button>
        </div>
        <button type="button" className="btn pri" onClick={() => setBookingOpen(true)}>
          Add appointment
        </button>
      </div>

      <div className="kpis mt">
        <div className="kpi">
          <span className="lbl">Today</span>
          <b className="knum num">{todayRows.length}</b>
          <span className="sub">Scheduled for this calendar day</span>
        </div>
        <div className="kpi">
          <span className="lbl">Upcoming</span>
          <b className="knum num">{upcomingRows.length}</b>
          <span className="sub">Open future appointments in this month view</span>
        </div>
        <div className="kpi">
          <span className="lbl">Active</span>
          <b className="knum num">{pendingRows.length}</b>
          <span className="sub">Pending or confirmed appointments</span>
        </div>
      </div>

      {appointments.isError && <div className="note mt">Could not load appointments.</div>}

      <div className="repCalendarLayout mt">
        <section className="repCalendar">
          <div className="repCalHead">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day}>{day}</div>
            ))}
          </div>
          <div className="repCalBody">
            {days.map((day) => (
              <button
                key={day.key}
                type="button"
                className={[
                  "repCalDay",
                  day.inMonth ? "" : "out",
                  day.isToday ? "today" : "",
                  day.key === selectedKey ? "selected" : "",
                ].filter(Boolean).join(" ")}
                onClick={() => setSelectedDate(day.date)}
              >
                <span className="repCalNum num">{day.date.getDate()}</span>
                <span className="repCalEvents">
                  {day.appointments.slice(0, 3).map((appt) => (
                    <span key={appt.id} className={`repCalEvent ${appt.status}`}>
                      <b className="num">{timeLabel(appt.starts_at)}</b>
                      {appt.invitee_name}
                    </span>
                  ))}
                  {day.appointments.length > 3 && (
                    <span className="repCalMore">+{day.appointments.length - 3} more</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>

        <aside className="repAgenda">
          <div className="panel">
            <div className="panel-h">
              <b>{dayLabel(selectedDate)}</b>
              <span className="sp" />
              <span className="cellchip c-mut">{selectedRows.length} item{selectedRows.length === 1 ? "" : "s"}</span>
            </div>
            <div className="panel-b">
              {appointments.isLoading && <span className="sub">Loading appointments...</span>}
              {!appointments.isLoading && selectedRows.length === 0 && (
                <div className="repEmpty">
                  <b>No appointments</b>
                  <span className="sub">Use Add appointment to book a callback, intro, or review.</span>
                </div>
              )}
              <div className="repAgendaList">
                {selectedRows.map((appt) => (
                  <AppointmentCard
                    key={appt.id}
                    appointment={appt}
                    busy={patchStatus.isPending}
                    onStatus={(status) => patchStatus.mutate({ id: appt.id, status })}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="panel mt">
            <div className="panel-h">Upcoming</div>
            <div className="panel-b">
              <div className="repMiniList">
                {upcomingRows.slice(0, 8).map((appt) => (
                  <button
                    type="button"
                    key={appt.id}
                    className="repMiniAppt"
                    onClick={() => {
                      const date = new Date(appt.starts_at);
                      setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
                      setSelectedDate(startOfLocalDay(date));
                    }}
                  >
                    <span className="num">{timeLabel(appt.starts_at)}</span>
                    <b>{appt.invitee_name}</b>
                    <small>{dayLabel(new Date(appt.starts_at))}</small>
                  </button>
                ))}
                {!appointments.isLoading && upcomingRows.length === 0 && (
                  <span className="sub">No upcoming appointments in this calendar view.</span>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {bookingOpen && <BookingDrawer onClose={() => setBookingOpen(false)} />}
    </>
  );
}

function AppointmentCard({
  appointment,
  busy,
  onStatus,
}: {
  appointment: Appointment;
  busy: boolean;
  onStatus: (status: AppointmentStatus) => void;
}) {
  const starts = new Date(appointment.starts_at);
  const isDone = appointment.status === "done";
  const isCancelled = appointment.status === "cancelled";

  return (
    <article className={`repApptCard ${appointment.status}`}>
      <div className="repApptTime">
        <b className="num">{timeLabel(appointment.starts_at)}</b>
        <span>{appointment.duration_min} min</span>
      </div>
      <div className="repApptBody">
        <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
          <b>{appointment.title}</b>
          <span className={`cellchip ${statusClass(appointment.status)}`}>{appointment.status}</span>
        </div>
        <div className="sub">
          {kindLabel(appointment.kind)} · {appointment.invitee_name}
          {appointment.invitee_email ? ` · ${appointment.invitee_email}` : ""}
          {appointment.invitee_phone ? ` · ${appointment.invitee_phone}` : ""}
        </div>
        {appointment.notes && <p>{appointment.notes}</p>}
        <div className="repApptActions">
          {!isDone && !isCancelled && (
            <button type="button" className="btn sm" disabled={busy} onClick={() => onStatus("done")}>
              Mark done
            </button>
          )}
          {isDone || isCancelled ? (
            <button type="button" className="btn sm" disabled={busy} onClick={() => onStatus("confirmed")}>
              Reopen
            </button>
          ) : (
            <button type="button" className="btn sm danger" disabled={busy} onClick={() => onStatus("cancelled")}>
              Cancel
            </button>
          )}
          {appointment.join_url && (
            <a className="btn sm" href={appointment.join_url} target="_blank" rel="noreferrer">
              Join
            </a>
          )}
          {appointment.dealer_id && (
            <Link className="btn sm" href={`/applications/${appointment.dealer_id}`}>
              Open file
            </Link>
          )}
        </div>
      </div>
      <span className="repApptDate num">
        {starts.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
      </span>
    </article>
  );
}
