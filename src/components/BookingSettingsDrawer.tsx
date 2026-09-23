"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Link2, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import Drawer from "./Drawer";

type TimeRange = { start_time: string; end_time: string };
type DaySchedule = { weekday: number; intervals: TimeRange[] };
type BookingSettings = Record<string, unknown> & {
  enabled: boolean;
  slug?: string | null;
  timezone: string;
  duration_min: number;
  buffer_before_min: number;
  buffer_after_min: number;
  google_meet_enabled: boolean;
  weekly_schedule: DaySchedule[];
  available_days: number[];
  start_time: string;
  end_time: string;
  advance_booking_window_enabled: boolean;
  minimum_notice_minutes?: number;
  minimum_notice_days: number;
  maximum_advance_days: number;
};
type SharedBookingSettings = {
  host: { id: string; name: string; email: string };
  settings: BookingSettings;
  can_edit: boolean;
  public_url?: string | null;
  calendar_connection: { status: "connected" | "disconnected" | "error"; email?: string | null; last_error?: string | null };
};
type NoticeUnit = "minutes" | "hours" | "days";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function normalizeSchedule(value: DaySchedule[] | undefined, start: string, end: string): DaySchedule[] {
  const map = new Map((value ?? []).map((day) => [day.weekday, day]));
  return DAYS.map((_, weekday) => ({ weekday, intervals: map.get(weekday)?.intervals?.map((range) => ({ ...range })) ?? [] }));
}

function noticePresentation(minutes: number): { value: number; unit: NoticeUnit } {
  if (minutes > 0 && minutes % 1440 === 0) return { value: minutes / 1440, unit: "days" };
  if (minutes > 0 && minutes % 60 === 0) return { value: minutes / 60, unit: "hours" };
  return { value: minutes, unit: "minutes" };
}

function toMinutes(value: number, unit: NoticeUnit): number {
  return Math.max(0, Math.round(value * (unit === "days" ? 1440 : unit === "hours" ? 60 : 1)));
}

export default function BookingSettingsDrawer({ onClose }: { onClose: () => void }) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["shared-booking-settings"], queryFn: async () => api<SharedBookingSettings>("/dealer-os/booking/settings", { authToken: (await getToken()) ?? undefined }) });
  const [draft, setDraft] = useState<BookingSettings | null>(null);
  const [baseline, setBaseline] = useState("");
  const [noticeUnit, setNoticeUnit] = useState<NoticeUnit>("hours");
  const [noticeValue, setNoticeValue] = useState(2);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!settingsQuery.data) return;
    const settings = { ...settingsQuery.data.settings, weekly_schedule: normalizeSchedule(settingsQuery.data.settings.weekly_schedule, settingsQuery.data.settings.start_time, settingsQuery.data.settings.end_time) };
    const notice = noticePresentation(settings.minimum_notice_minutes ?? settings.minimum_notice_days * 1440);
    setDraft(settings);
    setBaseline(JSON.stringify(settings));
    setNoticeUnit(notice.unit);
    setNoticeValue(notice.value);
  }, [settingsQuery.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("Booking settings are not loaded.");
      const minimumNoticeMinutes = toMinutes(noticeValue, noticeUnit);
      const payload = { ...draft, minimum_notice_minutes: minimumNoticeMinutes, minimum_notice_days: Math.floor(minimumNoticeMinutes / 1440) };
      return api<SharedBookingSettings>("/dealer-os/booking/settings", { method: "PUT", body: JSON.stringify(payload), authToken: (await getToken()) ?? undefined });
    },
    onSuccess: (result) => {
      qc.setQueryData(["shared-booking-settings"], result);
      const settings = { ...result.settings, weekly_schedule: normalizeSchedule(result.settings.weekly_schedule, result.settings.start_time, result.settings.end_time) };
      setDraft(settings);
      setBaseline(JSON.stringify(settings));
      void qc.invalidateQueries({ queryKey: ["booking-availability"] });
    },
  });

  const patch = (next: Partial<BookingSettings>) => setDraft((current) => current ? { ...current, ...next } : current);
  const schedule = draft ? normalizeSchedule(draft.weekly_schedule, draft.start_time, draft.end_time) : [];
  const setSchedule = (next: DaySchedule[]) => {
    const enabled = next.filter((day) => day.intervals.length).map((day) => day.weekday);
    const ranges = next.flatMap((day) => day.intervals);
    patch({ weekly_schedule: next, available_days: enabled, start_time: ranges.length ? ranges.reduce((min, range) => range.start_time < min ? range.start_time : min, ranges[0].start_time) : draft?.start_time ?? "09:00", end_time: ranges.length ? ranges.reduce((max, range) => range.end_time > max ? range.end_time : max, ranges[0].end_time) : draft?.end_time ?? "17:00" });
  };
  const updateRange = (weekday: number, index: number, next: Partial<TimeRange>) => setSchedule(schedule.map((day) => day.weekday === weekday ? { ...day, intervals: day.intervals.map((range, rangeIndex) => rangeIndex === index ? { ...range, ...next } : range) } : day));
  const dirty = useMemo(() => draft ? JSON.stringify(draft) !== baseline || (draft.minimum_notice_minutes ?? draft.minimum_notice_days * 1440) !== toMinutes(noticeValue, noticeUnit) : false, [baseline, draft, noticeUnit, noticeValue]);
  const invalid = Boolean(draft?.advance_booking_window_enabled && (toMinutes(noticeValue, noticeUnit) > draft.maximum_advance_days * 1440));

  return <Drawer title="Booking settings" width={900} onClose={onClose} variant="workspace" dismissOnBackdrop={false}>
    {settingsQuery.isLoading && <div className="empty">Loading the shared QC booking policy…</div>}
    {settingsQuery.isError && <div className="note" role="alert">{settingsQuery.error instanceof Error ? settingsQuery.error.message : "The shared booking policy could not be loaded."}</div>}
    {draft && settingsQuery.data && <div className="bookingSettingsWorkspace">
      <section className="bookingSettingsSummary"><div><span className="lbl">Calendar host</span><b>{settingsQuery.data.host.name}</b><small>{settingsQuery.data.host.email}</small></div><div><span className="lbl">Google Calendar</span><b>{settingsQuery.data.calendar_connection.status === "connected" ? "Connected" : "Action required"}</b><small>{settingsQuery.data.calendar_connection.email || settingsQuery.data.calendar_connection.last_error || "No connected calendar"}</small></div><span className={`cellchip ${settingsQuery.data.can_edit ? "c-ok" : "c-mut"}`}>{settingsQuery.data.can_edit ? "Super Admin editing" : "Read only"}</span></section>

      <fieldset disabled={!settingsQuery.data.can_edit || save.isPending} className="bookingSettingsFields">
        <section className="panel"><div className="panel-h"><b>Publishing and meeting</b></div><div className="panel-b bookingSettingsGrid"><label className="bookingSettingsToggle"><span><b>Enable public booking page</b><small>Use the shared link for dealer scheduling.</small></span><input type="checkbox" checked={draft.enabled} onChange={(event) => patch({ enabled: event.target.checked })} /></label><label><span className="lbl">Public URL slug</span><input className="field" value={draft.slug ?? ""} onChange={(event) => patch({ slug: event.target.value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-") })} /></label><label><span className="lbl">Timezone</span><input className="field" value={draft.timezone} onChange={(event) => patch({ timezone: event.target.value })} /></label><label><span className="lbl">Meeting length</span><select className="field" value={draft.duration_min} onChange={(event) => patch({ duration_min: Number(event.target.value) })}>{[15, 20, 30, 45, 60, 90].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label><label className="bookingSettingsToggle"><span><b>Create Google Meet</b><small>Meet links come only from the connected shared calendar.</small></span><input type="checkbox" checked={draft.google_meet_enabled} onChange={(event) => patch({ google_meet_enabled: event.target.checked })} /></label></div></section>

        <section className="panel"><div className="panel-h"><b>Weekly availability</b></div><div className="panel-b bookingScheduleRows">{schedule.map((day) => <div className={`bookingScheduleDay${day.intervals.length ? " enabled" : ""}`} key={day.weekday}><label><input type="checkbox" checked={day.intervals.length > 0} onChange={(event) => setSchedule(schedule.map((item) => item.weekday === day.weekday ? { ...item, intervals: event.target.checked ? [{ start_time: draft.start_time || "09:00", end_time: draft.end_time || "17:00" }] : [] } : item))} /><b>{DAYS[day.weekday]}</b></label><div>{day.intervals.map((range, index) => <span key={`${day.weekday}-${index}`}><input className="field" type="time" value={range.start_time} onChange={(event) => updateRange(day.weekday, index, { start_time: event.target.value })} /><em>to</em><input className="field" type="time" value={range.end_time} onChange={(event) => updateRange(day.weekday, index, { end_time: event.target.value })} /><button type="button" className="iconBtn" aria-label={`Remove ${DAYS[day.weekday]} range`} onClick={() => setSchedule(schedule.map((item) => item.weekday === day.weekday ? { ...item, intervals: item.intervals.filter((_, rangeIndex) => rangeIndex !== index) } : item))}><Trash2 size={15} /></button></span>)}{day.intervals.length > 0 && day.intervals.length < 4 && <button type="button" className="btn sm" onClick={() => setSchedule(schedule.map((item) => item.weekday === day.weekday ? { ...item, intervals: [...item.intervals, { start_time: "13:00", end_time: "17:00" }] } : item))}><Plus size={14} /> Add hours</button>}</div></div>)}</div></section>

        <section className="panel"><div className="panel-h"><b>Booking window</b></div><div className="panel-b bookingSettingsGrid"><label className="bookingSettingsToggle full"><span><b>Limit advance booking</b><small>Controls same-day notice and how far into the future clients can book.</small></span><input type="checkbox" checked={draft.advance_booking_window_enabled} onChange={(event) => patch({ advance_booking_window_enabled: event.target.checked })} /></label>{draft.advance_booking_window_enabled && <><label><span className="lbl">Earliest booking</span><span className="bookingNoticeInput"><input className="field" type="number" min={0} value={noticeValue} onChange={(event) => setNoticeValue(Math.max(0, Number(event.target.value)))} /><select className="field" value={noticeUnit} onChange={(event) => setNoticeUnit(event.target.value as NoticeUnit)}><option value="minutes">minutes ahead</option><option value="hours">hours ahead</option><option value="days">days ahead</option></select></span></label><label><span className="lbl">Latest booking</span><span className="bookingNoticeInput"><input className="field" type="number" min={1} max={365} value={draft.maximum_advance_days} onChange={(event) => patch({ maximum_advance_days: Math.max(1, Number(event.target.value)) })} /><span>days ahead</span></span></label></>}<label><span className="lbl">Buffer before</span><select className="field" value={draft.buffer_before_min} onChange={(event) => patch({ buffer_before_min: Number(event.target.value) })}>{[0, 5, 10, 15, 20, 30, 45, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label><label><span className="lbl">Buffer after</span><select className="field" value={draft.buffer_after_min} onChange={(event) => patch({ buffer_after_min: Number(event.target.value) })}>{[0, 5, 10, 15, 20, 30, 45, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label>{invalid && <div className="note full" role="alert">Earliest booking must be before the end of the latest booking day.</div>}</div></section>
      </fieldset>

      {settingsQuery.data.public_url && <div className="bookingPublicUrl"><span><Link2 size={16} /><code>{settingsQuery.data.public_url}</code></span><button type="button" className="btn" onClick={async () => { await navigator.clipboard.writeText(settingsQuery.data!.public_url!); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check size={15} /> : <Link2 size={15} />}{copied ? "Copied" : "Copy"}</button><a className="btn" href={settingsQuery.data.public_url} target="_blank" rel="noreferrer">Open <ExternalLink size={14} /></a></div>}
      {save.isError && <div className="note" role="alert">{save.error instanceof Error ? save.error.message : "Booking settings could not be saved."}</div>}
      <div className="prospectDialogActions"><button type="button" className="btn" onClick={onClose}>Close</button>{settingsQuery.data.can_edit && <button type="button" className="btn pri" disabled={!dirty || invalid || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save booking settings"}</button>}</div>
    </div>}
  </Drawer>;
}
