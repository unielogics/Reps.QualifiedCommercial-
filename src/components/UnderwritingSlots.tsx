"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Preference = {
  id: string;
  timezone: string;
  slots: Array<{ starts_at: string; label: string; date_label: string }>;
  status: string;
  submitted_at: string;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function inputValue(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultSlots(): string[] {
  const out: string[] = [];
  const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  while (out.length < 3) {
    if (d.getDay() !== 0 && d.getDay() !== 6) out.push(inputValue(new Date(d)));
    d.setHours(d.getHours() + 3);
  }
  return out;
}

export default function UnderwritingSlots({ dealerId }: { dealerId: string }) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [slots, setSlots] = useState(defaultSlots);
  const [timezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York");

  const prefs = useQuery({
    queryKey: ["underwriting-review-preferences", dealerId],
    queryFn: async () =>
      api<Preference[]>(`/dealer-os/dealers/${dealerId}/underwriting-review-preferences`, {
        authToken: (await getToken()) ?? undefined,
      }),
  });
  const latest = useMemo(() => (prefs.data ?? [])[0] ?? null, [prefs.data]);
  const submit = useMutation({
    mutationFn: async () =>
      api<Preference>(`/dealer-os/dealers/${dealerId}/underwriting-review-preferences`, {
        method: "POST",
        body: JSON.stringify({
          timezone,
          slots: slots.map((s) => new Date(s).toISOString()),
        }),
        authToken: (await getToken()) ?? undefined,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["underwriting-review-preferences", dealerId] }),
  });

  return (
    <div className="panel">
      <div className="panel-h">
        Underwriting review times
        <span style={{ flex: 1 }} />
        {latest && <span className="cellchip c-ok">{latest.status}</span>}
      </div>
      <div className="panel-b">
        <p className="sub" style={{ marginTop: 0 }}>
          After contracts are prepared, collect three times that work for the client in the next
          48 business hours. Saturdays and Sundays are not available.
        </p>

        {latest && (
          <div className="note">
            <div>
              Latest submitted times: {latest.slots.map((slot) => `${slot.date_label} ${slot.label}`).join(" · ")}
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, marginTop: 14 }}>
          {slots.map((slot, idx) => (
            <div key={idx}>
              <label className="lbl">Option {idx + 1}</label>
              <input
                className="field"
                type="datetime-local"
                value={slot}
                onChange={(e) => setSlots((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))}
              />
            </div>
          ))}
        </div>

        {submit.isError && (
          <div className="note">
            {submit.error instanceof Error ? submit.error.message : "Those times could not be saved."}
          </div>
        )}
        {submit.isSuccess && <div className="note">Saved. The desk can pick and book one of these windows.</div>}

        <button type="button" className="btn pri mt" disabled={submit.isPending || slots.some((s) => !s)} onClick={() => submit.mutate()}>
          {submit.isPending ? "Saving..." : "Save three review times"}
        </button>
      </div>
    </div>
  );
}
