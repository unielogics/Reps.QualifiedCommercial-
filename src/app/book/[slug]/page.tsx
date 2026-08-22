"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Slot = { starts_at: string; label: string; date_label: string };
type Profile = {
  agent_name: string;
  title: string;
  intro: string;
  duration_min: number;
  timezone: string;
  slots: Slot[];
};

export default function PublicBookPage() {
  const { slug } = useParams<{ slug: string }>();
  const [slot, setSlot] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const profile = useQuery({
    queryKey: ["public-booking", slug],
    queryFn: async () => api<Profile>(`/public/booking/${slug}`),
  });
  const book = useMutation({
    mutationFn: async () =>
      api(`/public/booking/${slug}`, {
        method: "POST",
        body: JSON.stringify({
          starts_at: slot,
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          notes: notes.trim() || null,
        }),
      }),
  });
  const p = profile.data;
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, background: "var(--sunken)" }}>
      <div className="card hi" style={{ width: "min(760px, 100%)" }}>
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
          <img src="/qc-icon.svg" alt="Qualified Commercial" className="mark" style={{ background: "none", objectFit: "contain" }} />
          <div>
            <b>Qualified Commercial</b>
            <span>{p?.agent_name ?? "Booking"}</span>
          </div>
        </div>
        {profile.isLoading && <p className="sub mt">Loading times...</p>}
        {profile.isError && <p className="sub mt">This booking page is not available.</p>}
        {p && (
          <>
            <h1 style={{ fontFamily: "var(--fh)", fontSize: 28, margin: "22px 0 8px" }}>{p.title}</h1>
            <p className="lede">{p.intro}</p>
            <div className="panel mt">
              <div className="panel-h">{p.duration_min} minute call</div>
              <div className="panel-b" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label className="lbl">Time</label>
                <select className="field" value={slot} onChange={(e) => setSlot(e.target.value)}>
                  <option value="">Choose a time</option>
                  {p.slots.map((s) => (
                    <option key={s.starts_at} value={s.starts_at}>
                      {s.date_label} · {s.label}
                    </option>
                  ))}
                </select>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
                  <div>
                    <label className="lbl">Name</label>
                    <input className="field" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                  </div>
                  <div>
                    <label className="lbl">Email</label>
                    <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div>
                    <label className="lbl">Phone</label>
                    <input className="field" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="lbl">Notes</label>
                  <textarea className="field" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
                {book.isError && <div className="note">{book.error instanceof Error ? book.error.message : "That time could not be booked."}</div>}
                {book.isSuccess && <div className="note">Booked. A calendar invitation is on its way.</div>}
                <button type="button" className="btn pri" disabled={!slot || !fullName.trim() || !email.trim() || book.isPending || book.isSuccess} onClick={() => book.mutate()}>
                  {book.isPending ? "Booking..." : "Book this time"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
