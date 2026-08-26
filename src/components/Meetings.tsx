"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  appointmentRsvpClass,
  appointmentRsvpLabel,
  appointmentRsvpTone,
  type RepAppointment,
} from "@/lib/appointments";
import BookingDrawer from "./BookingDrawer";

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function Meetings({ dealerId }: { dealerId: string }) {
  const { getToken } = useAuth();
  const [booking, setBooking] = useState(false);
  const list = useQuery({
    queryKey: ["appointments", dealerId],
    queryFn: async () =>
      api<RepAppointment[]>(`/dealer-os/dealers/${dealerId}/appointments`, {
        authToken: (await getToken()) ?? undefined,
      }),
  });
  const now = Date.now();
  const rows = list.data ?? [];
  const upcoming = rows.filter((r) => r.status !== "cancelled" && new Date(r.starts_at).getTime() >= now);

  return (
    <>
      <div className="panel">
        <div className="panel-h">
          Appointments
          <span style={{ flex: 1 }} />
          <button type="button" className="linky" onClick={() => setBooking(true)}>
            Schedule
          </button>
        </div>
        <div className="panel-b">
          {list.isLoading && <span className="sub">Loading...</span>}
          {!list.isLoading && upcoming.length === 0 && (
            <span className="sub">No callbacks, intros, or underwriting reviews booked yet.</span>
          )}
          {upcoming.map((r) => (
            <div key={r.id} className={`meetingRow ${appointmentRsvpClass(r)}`} style={{ marginBottom: 10 }}>
              <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <b style={{ fontSize: 14 }}>{r.title}</b>
                <span className="cellchip c-acc">{r.kind.replace(/_/g, " ")}</span>
                <span className={`cellchip ${appointmentRsvpTone(r)}`}>{appointmentRsvpLabel(r)}</span>
              </div>
              <span className="sub">
                {when(r.starts_at)} · {r.duration_min} min · {r.invitee_name}
              </span>
              {r.join_url && (
                <div>
                  <a className="linky" href={r.join_url} target="_blank" rel="noreferrer">
                    Join link
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {booking && <BookingDrawer initialDealerId={dealerId} onClose={() => setBooking(false)} />}
    </>
  );
}
