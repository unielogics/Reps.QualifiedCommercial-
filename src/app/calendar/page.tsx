"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import BookingDrawer from "@/components/BookingDrawer";
import AppointmentEditorDrawer from "@/components/AppointmentEditorDrawer";
import AppointmentCrmWorkspace from "@/components/AppointmentCrmWorkspace";
import AppointmentOutcomeCatalogDrawer from "@/components/AppointmentOutcomeCatalogDrawer";
import { ExternalLink, Flag, FolderOpen, MoreVertical, RotateCcw, Settings2 } from "lucide-react";
import {
  appointmentOutcomeLabel,
  appointmentRsvpClass,
  appointmentRsvpLabel,
  appointmentRsvpTone,
  type AppointmentStatus,
  type RepCalendarCapabilities,
  type RepAppointment as Appointment,
} from "@/lib/appointments";

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
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const dismissedQueryAppointment = useRef<string | null>(null);
  const initialDate = useMemo(() => {
    const requestedDate = searchParams.get("date");
    if (!requestedDate || !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return new Date();
    const parsed = new Date(`${requestedDate}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [searchParams]);
  const [month, setMonth] = useState(() => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => startOfLocalDay(initialDate));
  const [bookingOpen, setBookingOpen] = useState(false);
  const [includeCancelled, setIncludeCancelled] = useState(() => searchParams.get("include_cancelled") === "1");
  const [activeAppointment, setActiveAppointment] = useState<{ row: Appointment; mode: "details" | "edit" | "reschedule" } | null>(null);
  const [crmAppointmentId, setCrmAppointmentId] = useState<string | null>(null);
  const [outcomeCatalogOpen, setOutcomeCatalogOpen] = useState(false);
  const [assignedRep, setAssignedRep] = useState("all");
  const [crmStatus, setCrmStatus] = useState("all");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [appointmentMenu, setAppointmentMenu] = useState<{ row: Appointment; x: number; y: number } | null>(null);

  const range = useMemo(() => gridRange(month), [month]);
  const appointments = useQuery({
    queryKey: ["rep-appointments", range, includeCancelled],
    queryFn: async () =>
      api<Appointment[]>(`/dealer-os/appointments?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&limit=500&include_cancelled=${includeCancelled}`, {
        authToken: (await getToken()) ?? undefined,
      }),
  });
  const calendarCapabilities = useQuery({
    queryKey: ["rep-calendar-capabilities"],
    queryFn: async () => api<RepCalendarCapabilities>("/dealer-os/calendar/capabilities", {
      authToken: (await getToken()) ?? undefined,
    }),
    staleTime: 60_000,
  });
  const canManageAll = Boolean(calendarCapabilities.data?.can_manage_all);
  const canManageCrm = Boolean(calendarCapabilities.data?.can_manage_appointment_crm);
  const canManageOutcomeCatalog = Boolean(calendarCapabilities.data?.can_manage_outcome_catalog);

  const rows = useMemo(
    () => (appointments.data ?? []).sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
    [appointments.data],
  );
  const repOptions = useMemo(() => {
    const values = new Map<string, string>();
    rows.forEach((row) => {
      const id = row.booked_by_user_id || row.owner_user_id;
      if (id) values.set(id, row.booked_by_name || row.owner_name || "Assigned staff");
    });
    return Array.from(values, ([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);
  const outcomeOptions = useMemo(() => {
    const values = new Set<string>();
    rows.forEach((row) => {
      const label = row.workflow_outcome_label || appointmentOutcomeLabel(row.outcome);
      if (label) values.add(label);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [rows]);
  const visibleRows = useMemo(() => {
    if (!canManageAll) return rows;
    return rows.filter((row) => {
      const repId = row.booked_by_user_id || row.owner_user_id;
      const outcome = row.workflow_outcome_label || appointmentOutcomeLabel(row.outcome);
      return (assignedRep === "all" || repId === assignedRep)
        && (crmStatus === "all" || row.crm_status === crmStatus)
        && (outcomeFilter === "all" || outcome === outcomeFilter);
    });
  }, [assignedRep, canManageAll, crmStatus, outcomeFilter, rows]);
  const days = useMemo(() => buildMonth(month, visibleRows), [month, visibleRows]);
  const selectedKey = localDateKey(selectedDate);
  const selectedRows = visibleRows.filter((appt) => localDateKey(new Date(appt.starts_at)) === selectedKey);
  const now = Date.now();
  const todayRows = visibleRows.filter((appt) => sameLocalDay(new Date(appt.starts_at), new Date()));
  const upcomingRows = visibleRows.filter((appt) => appt.status !== "cancelled" && new Date(appt.starts_at).getTime() >= now);
  const pendingRows = visibleRows.filter((appt) => appt.status === "pending" || appt.status === "confirmed");
  const awaitingOutcomeRows = visibleRows.filter((appt) => (
    appt.status !== "cancelled"
    && new Date(appt.starts_at).getTime() < now
    && !appt.workflow_outcome_label
    && !appt.outcome
  ));

  const closeAppointment = useCallback(() => {
    const requested = searchParams.get("appointment");
    dismissedQueryAppointment.current = activeAppointment?.row.id ?? requested;
    setActiveAppointment(null);
    if (!requested) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("appointment");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [activeAppointment, pathname, router, searchParams]);

  const closeCrmAppointment = useCallback(() => {
    const requested = searchParams.get("appointment");
    dismissedQueryAppointment.current = crmAppointmentId ?? requested;
    setCrmAppointmentId(null);
    if (!requested) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("appointment");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [crmAppointmentId, pathname, router, searchParams]);

  const openCrmAppointment = useCallback((row: Appointment) => {
    setAppointmentMenu(null);
    setCrmAppointmentId(row.id);
    const next = new URLSearchParams(searchParams.toString());
    next.set("appointment", row.id);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

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

  const cancelAppointment = useMutation({
    mutationFn: async (id: string) => api<Appointment>(`/dealer-os/appointments/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: "Cancelled by the booking rep." }),
      authToken: (await getToken()) ?? undefined,
    }),
    onSuccess: () => {
      setActiveAppointment(null);
      void qc.invalidateQueries({ queryKey: ["rep-appointments"] });
    },
  });

  useEffect(() => {
    const requestedDate = searchParams.get("date");
    if (!requestedDate || !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return;
    const date = new Date(`${requestedDate}T12:00:00`);
    if (Number.isNaN(date.getTime())) return;
    if (month.getFullYear() !== date.getFullYear() || month.getMonth() !== date.getMonth()) {
      setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
    if (!sameLocalDay(selectedDate, date)) setSelectedDate(startOfLocalDay(date));
  }, [month, searchParams, selectedDate]);

  useEffect(() => {
    const requested = searchParams.get("appointment");
    if (!requested) {
      dismissedQueryAppointment.current = null;
      return;
    }
    if (dismissedQueryAppointment.current === requested || activeAppointment?.row.id === requested || crmAppointmentId === requested || !appointments.data || !calendarCapabilities.isSuccess) return;
    const row = appointments.data.find((item) => item.id === requested);
    if (row) {
      if (canManageCrm) setCrmAppointmentId(row.id);
      else setActiveAppointment({ row, mode: "details" });
      const date = new Date(row.starts_at);
      setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
      setSelectedDate(startOfLocalDay(date));
    }
  }, [activeAppointment, appointments.data, calendarCapabilities.isSuccess, canManageCrm, crmAppointmentId, searchParams]);

  useEffect(() => {
    if (!appointmentMenu) return;
    const close = () => setAppointmentMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [appointmentMenu]);

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
        {canManageOutcomeCatalog ? (
          <button type="button" className="iconBtn calendarCatalogButton" aria-label="Configure shared outcomes" title="Configure shared outcomes" onClick={() => setOutcomeCatalogOpen(true)}>
            <Settings2 size={18} />
          </button>
        ) : null}
        <label className="chip" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={includeCancelled} onChange={(event) => setIncludeCancelled(event.target.checked)} />
          Include cancelled
        </label>
      </div>

      {canManageAll ? (
        <div className="appointmentCrmFilters mt" aria-label="Appointment CRM filters">
          <select className="field" aria-label="Assigned rep" value={assignedRep} onChange={(event) => setAssignedRep(event.target.value)}>
            <option value="all">All assigned staff</option>
            {repOptions.map((rep) => <option key={rep.id} value={rep.id}>{rep.label}</option>)}
          </select>
          <select className="field" aria-label="CRM status" value={crmStatus} onChange={(event) => setCrmStatus(event.target.value)}>
            <option value="all">All CRM statuses</option>
            <option value="scheduled">Scheduled</option><option value="confirmed">Confirmed</option><option value="completed">Completed</option><option value="follow_up">Follow-up</option><option value="no_show">No-show</option><option value="not_qualified">Not qualified</option><option value="converted">Converted</option><option value="cancelled">Cancelled</option>
          </select>
          <select className="field" aria-label="Outcome" value={outcomeFilter} onChange={(event) => setOutcomeFilter(event.target.value)}>
            <option value="all">All outcomes</option>
            {outcomeOptions.map((outcome) => <option key={outcome} value={outcome}>{outcome}</option>)}
          </select>
          <button type="button" className="iconBtn" aria-label="Clear calendar filters" title="Clear filters" onClick={() => { setAssignedRep("all"); setCrmStatus("all"); setOutcomeFilter("all"); }}><RotateCcw size={17} /></button>
        </div>
      ) : null}

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
        {canManageAll ? (
          <button type="button" className="kpi appointmentOutcomeKpi" onClick={() => { setAssignedRep("all"); setCrmStatus("all"); setOutcomeFilter("all"); }}>
            <span className="lbl">Awaiting outcome</span>
            <b className="knum num">{awaitingOutcomeRows.length}</b>
            <span className="sub">Past appointments without a recorded result</span>
          </button>
        ) : null}
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
                    <span key={appt.id} className={`repCalEvent ${appointmentRsvpClass(appt)}`}>
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
                    onOpen={(mode) => setActiveAppointment({ row: appt, mode })}
                    privileged={canManageCrm}
                    onManage={() => openCrmAppointment(appt)}
                    onMenu={(x, y) => setAppointmentMenu({ row: appt, x, y })}
                    onCancel={() => {
                      if (window.confirm(`Cancel and archive ${appt.title}? The appointment history will be retained.`)) {
                        cancelAppointment.mutate(appt.id);
                      }
                    }}
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
      {crmAppointmentId && canManageCrm ? (
        <AppointmentCrmWorkspace
          appointmentId={crmAppointmentId}
          onClose={closeCrmAppointment}
          onChanged={() => { void qc.invalidateQueries({ queryKey: ["rep-appointments"] }); }}
          onOpenEditor={(appointment, mode) => {
            closeCrmAppointment();
            setActiveAppointment({ row: appointment, mode });
          }}
        />
      ) : null}
      {outcomeCatalogOpen && canManageOutcomeCatalog ? <AppointmentOutcomeCatalogDrawer onClose={() => setOutcomeCatalogOpen(false)} /> : null}
      {activeAppointment && (
        <AppointmentEditorDrawer
          appointment={activeAppointment.row}
          mode={activeAppointment.mode}
          onClose={closeAppointment}
        />
      )}
      {appointmentMenu && canManageCrm ? (
        <AppointmentCrmMenu
          appointment={appointmentMenu.row}
          x={appointmentMenu.x}
          y={appointmentMenu.y}
          onClose={() => setAppointmentMenu(null)}
          onManage={() => openCrmAppointment(appointmentMenu.row)}
          onEdit={(mode) => { setAppointmentMenu(null); setActiveAppointment({ row: appointmentMenu.row, mode }); }}
        />
      ) : null}
    </>
  );
}

function AppointmentCard({
  appointment,
  busy,
  onStatus,
  onOpen,
  privileged,
  onManage,
  onMenu,
  onCancel,
}: {
  appointment: Appointment;
  busy: boolean;
  onStatus: (status: AppointmentStatus) => void;
  onOpen: (mode: "details" | "edit" | "reschedule") => void;
  privileged: boolean;
  onManage: () => void;
  onMenu: (x: number, y: number) => void;
  onCancel: () => void;
}) {
  const starts = new Date(appointment.starts_at);
  const isDone = appointment.status === "done";
  const isCancelled = appointment.status === "cancelled";

  return (
    <article
      className={`repApptCard ${appointment.status} ${appointmentRsvpClass(appointment)}`}
      onContextMenu={privileged ? (event) => { event.preventDefault(); onMenu(event.clientX, event.clientY); } : undefined}
    >
      <div className="repApptTime">
        <b className="num">{timeLabel(appointment.starts_at)}</b>
        <span>{appointment.duration_min} min</span>
      </div>
      <div className="repApptBody">
        <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
          <button type="button" className="linky" onClick={() => onOpen("details")}><b>{appointment.title}</b></button>
          <span className={`cellchip ${appointmentRsvpTone(appointment)}`}>{appointmentRsvpLabel(appointment)}</span>
          {appointment.outcome && <span className={`cellchip ${appointment.outcome === "converted" ? "c-ok" : appointment.outcome === "not_converted" ? "c-bad" : "c-warn"}`}>{appointmentOutcomeLabel(appointment.outcome)}</span>}
        </div>
        <div className="sub">
          {kindLabel(appointment.kind)} · {appointment.invitee_name}
          {appointment.invitee_email ? ` · ${appointment.invitee_email}` : ""}
          {appointment.invitee_phone ? ` · ${appointment.invitee_phone}` : ""}
        </div>
        {appointment.notes && <p>{appointment.notes}</p>}
        <div className="sub" style={{ marginTop: 7 }}>
          {[appointment.company, appointment.program_name, appointment.requested_amount, appointment.full_address].filter(Boolean).join(" · ")}
        </div>
        <div className="repApptActions">
          {privileged ? <button type="button" className="btn sm pri" onClick={onManage}><Settings2 size={15} />Manage appointment</button> : null}
          {!isDone && !isCancelled && (
            <button type="button" className="btn sm" disabled={busy} onClick={() => onStatus("done")}>
              Mark done
            </button>
          )}
          {isDone && !isCancelled ? (
            <button type="button" className="btn sm" disabled={busy} onClick={() => onStatus("pending")}>
              Reopen
            </button>
          ) : null}
          {!isCancelled && <button type="button" className="btn sm" onClick={() => onOpen("edit")}>Edit</button>}
          {!isCancelled && <button type="button" className="btn sm" onClick={() => onOpen("reschedule")}>Reschedule</button>}
          {!isCancelled && <button type="button" className="btn sm danger" disabled={busy} onClick={onCancel}>Cancel</button>}
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
      {privileged ? <button type="button" className="repApptMore" aria-label={`More actions for ${appointment.title}`} title="More appointment actions" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); onMenu(rect.right, rect.bottom); }}><MoreVertical size={18} /></button> : null}
      <span className="repApptDate num">
        {starts.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
      </span>
    </article>
  );
}

function AppointmentCrmMenu({
  appointment,
  x,
  y,
  onClose,
  onManage,
  onEdit,
}: {
  appointment: Appointment;
  x: number;
  y: number;
  onClose: () => void;
  onManage: () => void;
  onEdit: (mode: "edit" | "reschedule") => void;
}) {
  const left = Math.min(x, window.innerWidth - 246);
  const top = Math.min(y, window.innerHeight - 250);
  return (
    <div className="appointmentCrmMenu" role="menu" style={{ left: Math.max(8, left), top: Math.max(8, top) }} onPointerDown={(event) => event.stopPropagation()}>
      <button type="button" role="menuitem" onClick={onManage}><Settings2 size={17} /><span><b>Manage appointment</b><small>CRM, notes, outcome, file, delivery</small></span></button>
      <button type="button" role="menuitem" onClick={() => onEdit("edit")}><Flag size={17} /><span><b>Edit details</b><small>Contact and meeting information</small></span></button>
      <button type="button" role="menuitem" onClick={() => onEdit("reschedule")}><RotateCcw size={17} /><span><b>Reschedule</b><small>Recheck availability and resend</small></span></button>
      {appointment.join_url ? <a role="menuitem" href={appointment.join_url} target="_blank" rel="noreferrer" onClick={onClose}><ExternalLink size={17} /><span><b>Join meeting</b><small>Open the current meeting link</small></span></a> : null}
      {appointment.dealer_id ? <Link role="menuitem" href={`/applications/${appointment.dealer_id}`} onClick={onClose}><FolderOpen size={17} /><span><b>Open Field Desk file</b><small>Go to the linked application</small></span></Link> : null}
    </div>
  );
}
