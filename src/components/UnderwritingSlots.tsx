"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, ChevronRight, Clock3, X } from "lucide-react";
import { api } from "@/lib/api";
import type {
  UnderwritingReviewPreference,
  UnderwritingReviewSlot,
} from "@/lib/underwritingReview";

type Availability = {
  timezone: string;
  duration_min: number;
  buffer_before_min: number;
  buffer_after_min: number;
  host_name: string | null;
  calendar_sync_status: "connected" | "disconnected" | "unavailable";
  slots: UnderwritingReviewSlot[];
};

type SlotDay = { label: string; slots: UnderwritingReviewSlot[] };

function groupSlots(slots: UnderwritingReviewSlot[] | undefined): SlotDay[] {
  const days: SlotDay[] = [];
  for (const slot of slots ?? []) {
    const current = days[days.length - 1];
    if (current?.label === slot.date_label) current.slots.push(slot);
    else days.push({ label: slot.date_label, slots: [slot] });
  }
  return days;
}

export default function UnderwritingSlots({
  dealerId,
  existing,
  onClose,
  onComplete,
}: {
  dealerId: string;
  existing?: UnderwritingReviewPreference | null;
  onClose: () => void;
  onComplete: (preference: UnderwritingReviewPreference) => void;
}) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [dayIndex, setDayIndex] = useState(0);
  const [seeded, setSeeded] = useState(false);

  const availability = useQuery({
    queryKey: ["underwriting-review-availability", dealerId],
    queryFn: async () =>
      api<Availability>(
        `/dealer-os/dealers/${dealerId}/underwriting-review-preferences/availability`,
        { authToken: (await getToken()) ?? undefined },
      ),
  });
  const days = useMemo(() => groupSlots(availability.data?.slots), [availability.data?.slots]);
  const activeDay = days[Math.min(dayIndex, Math.max(days.length - 1, 0))] ?? null;
  const selectedSlots = useMemo(
    () =>
      selected
        .map((startsAt) => availability.data?.slots.find((slot) => slot.starts_at === startsAt))
        .filter((slot): slot is UnderwritingReviewSlot => Boolean(slot)),
    [availability.data?.slots, selected],
  );

  useEffect(() => {
    if (dayIndex >= days.length) setDayIndex(0);
  }, [dayIndex, days.length]);

  useEffect(() => {
    if (seeded || !availability.data) return;
    const available = new Set(availability.data.slots.map((slot) => slot.starts_at));
    const retained = (existing?.slots ?? [])
      .map((slot) => slot.starts_at)
      .filter((startsAt) => available.has(startsAt));
    setSelected(retained.slice(0, 3));
    setSeeded(true);
  }, [availability.data, existing?.slots, seeded]);

  const submit = useMutation({
    mutationFn: async () =>
      api<UnderwritingReviewPreference>(
        `/dealer-os/dealers/${dealerId}/underwriting-review-preferences`,
        {
          method: "POST",
          body: JSON.stringify({
            timezone: availability.data?.timezone ?? "America/New_York",
            slots: selected,
          }),
          authToken: (await getToken()) ?? undefined,
        },
      ),
    onSuccess: (preference) => {
      qc.setQueryData<UnderwritingReviewPreference[]>(
        ["underwriting-review-preferences", dealerId],
        (current) => [
          preference,
          ...(current ?? []).map((item) =>
            item.status === "pending" ? { ...item, status: "expired" as const } : item,
          ),
        ],
      );
      onComplete(preference);
    },
  });

  const toggle = (startsAt: string) => {
    setSelected((current) => {
      if (current.includes(startsAt)) return current.filter((item) => item !== startsAt);
      if (current.length >= 3) return current;
      return [...current, startsAt];
    });
  };

  return (
    <div className="modalOverlay reviewWindowOverlay" role="presentation">
      <section className="modalDialog reviewWindowDialog" role="dialog" aria-modal="true" aria-labelledby="review-window-title">
        <header className="modalHead reviewWindowHead">
          <span className="reviewWindowIcon" aria-hidden><CalendarClock size={22} /></span>
          <div>
            <span className="eyebrow">Required checkpoint · Between Steps 3 and 4</span>
            <h2 id="review-window-title">Choose three client review windows</h2>
            <p>Use real openings on the shared team calendar. The desk will confirm one time with the client.</p>
          </div>
          <button type="button" className="iconAction" onClick={onClose} aria-label="Close review-window checkpoint"><X size={18} /></button>
        </header>

        <div className="modalBody reviewWindowBody">
          <div className="reviewWindowPolicy">
            <div><Clock3 size={17} /><b>{availability.data?.duration_min ?? 20}-minute review</b></div>
            <span>{availability.data?.buffer_before_min ?? 5} min before</span>
            <span>{availability.data?.buffer_after_min ?? 5} min after</span>
            <span>Weekdays only</span>
            <span>Next 48 hours · weekends skipped</span>
          </div>

          <section className="reviewWindowSelection" aria-label="Selected review windows">
            <div className="reviewWindowSectionTitle">
              <div><span className="eyebrow">Selected windows</span><b>{selected.length} of 3 selected</b></div>
              {availability.data?.slots.length ? (
                <button type="button" className="btn sm" onClick={() => setSelected(availability.data.slots.slice(0, 3).map((slot) => slot.starts_at))}>
                  Use next three openings
                </button>
              ) : null}
            </div>
            <div className="reviewWindowChoices">
              {[0, 1, 2].map((index) => {
                const slot = selectedSlots[index];
                return (
                  <article key={index} className={slot ? "filled" : ""}>
                    <span>{slot ? <Check size={15} /> : index + 1}</span>
                    <div><small>Option {index + 1}</small><b>{slot ? slot.date_label : "Choose an opening"}</b><p>{slot?.label ?? "Not selected"}</p></div>
                    {slot && <button type="button" onClick={() => toggle(slot.starts_at)} aria-label={`Remove option ${index + 1}`}><X size={15} /></button>}
                  </article>
                );
              })}
            </div>
          </section>

          {availability.isLoading && <div className="reviewWindowState">Checking the shared calendar…</div>}
          {availability.isError && <div className="reviewWindowState error">{availability.error instanceof Error ? availability.error.message : "Calendar availability could not be loaded."}</div>}
          {!availability.isLoading && availability.data?.calendar_sync_status !== "connected" && <div className="reviewWindowState error">The shared calendar must be connected before review windows can be selected.</div>}
          {!availability.isLoading && availability.data?.calendar_sync_status === "connected" && days.length === 0 && <div className="reviewWindowState">No open weekday windows remain in the next 48 hours after skipping the weekend. Adjust the shared calendar availability and retry.</div>}

          {days.length > 0 && (
            <section className="reviewWindowCalendar">
              <div className="reviewWindowDays" aria-label="Available days">
                {days.map((day, index) => (
                  <button key={day.label} type="button" className={index === dayIndex ? "active" : ""} onClick={() => setDayIndex(index)}>
                    <b>{day.label}</b><span>{day.slots.length} openings</span>
                  </button>
                ))}
              </div>
              <div className="reviewWindowTimes" aria-label={activeDay?.label ?? "Available times"}>
                {activeDay?.slots.map((slot) => {
                  const chosen = selected.includes(slot.starts_at);
                  return <button key={slot.starts_at} type="button" className={chosen ? "selected" : ""} onClick={() => toggle(slot.starts_at)}>{chosen && <Check size={14} />}{slot.label}</button>;
                })}
              </div>
            </section>
          )}

          {submit.isError && <div className="reviewWindowState error">{submit.error instanceof Error ? submit.error.message : "The review windows could not be saved."}</div>}
        </div>

        <footer className="reviewWindowFooter">
          <div><b>Step 4 unlocks after three windows are saved.</b><span>The times remain proposals until one is confirmed and booked.</span></div>
          <span className="sp" />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn pri" disabled={selected.length !== 3 || submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? "Saving windows…" : <>Save and continue <ChevronRight size={16} /></>}
          </button>
        </footer>
      </section>
    </div>
  );
}
