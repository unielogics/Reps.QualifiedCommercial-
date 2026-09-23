"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Slot = { starts_at: string; label: string; date_label: string };
type Profile = {
  agent_name: string;
  title: string;
  intro: string;
  duration_min: number;
  timezone: string;
  meeting_mode?: "video" | "phone";
  slots: Slot[];
  page_start_date?: string | null;
  page_end_date?: string | null;
  next_start_date?: string | null;
  window_end_date?: string | null;
  sms_disclosure_text?: string;
  booking_questions?: Partial<Record<"business_name" | "phone" | "requested_amount" | "bank_statement", boolean>>;
  precall_enabled?: boolean;
  precall_default_variant?: "dealer" | "real_estate" | "main_street" | "mca_refinance";
  precall_allowed_variants?: Array<"dealer" | "real_estate" | "main_street" | "mca_refinance">;
  precall_allow_vertical_choice?: boolean;
};

type BookingVertical = "dealer" | "real_estate" | "main_street" | "mca_refinance";
type BankMethod = "plaid" | "statements" | "decide_later";

const VERTICAL_LABELS: Record<BookingVertical, string> = {
  dealer: "Automotive dealership",
  real_estate: "Commercial real estate",
  main_street: "Business financing",
  mca_refinance: "MCA refinance",
};

// Mirrors app/schemas/phone.py, and Step1Intake's copy of the same rule: ten
// digits is a US number, eleven leading with 1 is the same number written out,
// and a leading + is an international number taken on trust.
function validPhone(value: string | null | undefined): boolean {
  const raw = (value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1")) || (raw.startsWith("+") && digits.length >= 8 && digits.length <= 15);
}

function groupSlots(slots: Slot[]): Array<{ label: string; slots: Slot[] }> {
  const days: Array<{ label: string; slots: Slot[] }> = [];
  for (const slot of slots) {
    const last = days[days.length - 1];
    if (last?.label === slot.date_label) last.slots.push(slot);
    else days.push({ label: slot.date_label, slots: [slot] });
  }
  return days;
}

export default function PublicBookPage() {
  const { slug } = useParams<{ slug: string }>();
  const [slot, setSlot] = useState("");
  const [dayIndex, setDayIndex] = useState(0);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [requestedAmount, setRequestedAmount] = useState("");
  const [preferredBankMethod, setPreferredBankMethod] = useState<BankMethod | "">("");
  const [vertical, setVertical] = useState<BookingVertical | "">("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [notes, setNotes] = useState("");
  const [creationIdempotencyKey, setCreationIdempotencyKey] = useState(() => crypto.randomUUID());
  const profile = useInfiniteQuery({
    queryKey: ["public-booking", slug],
    initialPageParam: "",
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ days: "7" });
      if (pageParam) params.set("start_date", pageParam);
      return api<Profile>(`/public/booking/${slug}?${params}`);
    },
    getNextPageParam: (page) => page.next_start_date || undefined,
  });
  const book = useMutation({
    mutationFn: async () =>
      api(`/public/booking/${slug}`, {
        method: "POST",
        body: JSON.stringify({
          creation_idempotency_key: creationIdempotencyKey,
          starts_at: slot,
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          business_name: businessName.trim() || null,
          requested_amount: requestedAmount.trim()
            ? Number(requestedAmount.replace(/[$,\s]/g, ""))
            : null,
          preferred_bank_method: preferredBankMethod || null,
          // Only submit a vertical when this public page actually offered the
          // choice. When the host locks a default, the server owns that value.
          vertical: p?.precall_enabled && p.precall_allow_vertical_choice
            ? vertical || p.precall_default_variant || null
            : null,
          notes: notes.trim() || null,
          transactional_sms_consent: smsConsent,
          // The link's origin hint (the product booklet appends ?source=…) tells
          // the server this is a rep-related booking, which opens the draft file.
          source: typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("source") : null,
        }),
      }),
    onSuccess: () => setCreationIdempotencyKey(crypto.randomUUID()),
  });
  const p = profile.data?.pages[0];
  const slots = useMemo(() => {
    const unique = new Map<string, Slot>();
    for (const page of profile.data?.pages ?? []) {
      for (const available of page.slots) unique.set(available.starts_at, available);
    }
    return [...unique.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [profile.data?.pages]);
  const days = useMemo(() => groupSlots(slots), [slots]);
  const activeDay = days[Math.min(dayIndex, Math.max(days.length - 1, 0))];
  const selected = slots.find((s) => s.starts_at === slot);
  const meetingMode = p?.meeting_mode ?? "video";
  const questions = p?.booking_questions ?? {};
  const parsedRequestedAmount = Number(requestedAmount.replace(/[$,\s]/g, ""));
  const requestedAmountValid = !questions.requested_amount
    || (requestedAmount.trim().length > 0 && Number.isFinite(parsedRequestedAmount) && parsedRequestedAmount > 0);
  const businessNameValid = !questions.business_name || businessName.trim().length > 0;
  const bankMethodValid = !questions.bank_statement || Boolean(preferredBankMethod);
  const requiredQuestionsComplete = businessNameValid && requestedAmountValid && bankMethodValid;

  useEffect(() => {
    if (dayIndex >= days.length) setDayIndex(0);
    if (slot && !slots.some((available) => available.starts_at === slot)) setSlot("");
  }, [dayIndex, days.length, slot, slots]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, background: "var(--sunken)" }}>
      <div className="card hi" style={{ width: "min(980px, 100%)" }}>
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
          <img src="/qc-icon.svg" alt="Qualified Commercial" className="mark" style={{ background: "none", objectFit: "contain" }} />
          <div>
            <b>Qualified Commercial</b>
            <span>{p?.agent_name ?? "Booking"}</span>
          </div>
        </div>
        {profile.isLoading && <p className="sub mt">Loading times...</p>}
        {profile.isError && <div className="note mt" role="alert"><b>Available times could not be loaded.</b><span style={{ display: "block", marginTop: 4 }}>The calendar was not changed. Retry before choosing an appointment.</span><button type="button" className="btn mt" disabled={profile.isFetching} onClick={() => void profile.refetch()}>{profile.isFetching ? "Retrying…" : "Retry availability"}</button></div>}
        {p && (
          <>
            <h1 style={{ fontFamily: "var(--fh)", fontSize: 28, margin: "22px 0 8px" }}>{p.title}</h1>
            <p className="lede">{p.intro}</p>
            <div className="panel mt">
              <div className="panel-h">
                {p.duration_min} minute call
                <span style={{ flex: 1 }} />
                <span className="sub">{p.timezone}</span>
              </div>
              <div className="panel-b" style={{ display: "grid", gap: 14 }}>
                <div className="bookingCalendar">
                  <div className="slotRail" aria-label="Available days">
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
                    {profile.hasNextPage && <button type="button" className="slotLoadMore" disabled={profile.isFetchingNextPage} aria-label="Load more complete days of appointment availability" onClick={() => void profile.fetchNextPage()}><b>{profile.isFetchingNextPage ? "Loading…" : "More days"}</b><span>{profile.isFetchingNextPage ? "Checking calendar" : "Load next dates"}</span></button>}
                  </div>
                  <div className="slotGrid" aria-label="Available times">
                    {(activeDay?.slots ?? []).map((s) => (
                      <button
                        key={s.starts_at}
                        type="button"
                        className={slot === s.starts_at ? "on" : undefined}
                        onClick={() => setSlot(s.starts_at)}
                      >
                        {s.label}
                      </button>
                    ))}
                    {slots.length === 0 && !profile.hasNextPage && <span className="sub">No available times are open right now.</span>}
                  </div>
                  <div className="slotSummary">
                    <span className="lbl">Selected time</span>
                    <b>{selected ? `${selected.date_label} at ${selected.label}` : "Choose a time"}</b>
                    <span className="sub">{p.timezone}</span>
                    <span className="sub">{meetingMode === "video" ? "Google Meet link provided after booking" : "Phone appointment — QC will call the mobile number entered below"}</span>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
                  <div>
                    <label className="lbl">Name *</label>
                    <input className={`field required-field${fullName.trim() ? "" : " field-invalid"}`} value={fullName} onChange={(e) => setFullName(e.target.value)} />
                  </div>
                  <div>
                    <label className="lbl">Email *</label>
                    <input className={`field required-field${email.trim() ? "" : " field-invalid"}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div>
                    {/* Always asked. A host's `booking_questions.phone` setting
                        cannot take this off the page: the server refuses a
                        booking without a number. */}
                    <label className="lbl">Mobile number *</label>
                    <input className={`field required-field${validPhone(phone) ? "" : " field-invalid"}`} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                    {!validPhone(phone) && <span className="validation-hint">{phone.trim() ? "That number does not look complete. Enter a 10-digit US mobile, or include the country code for an international number." : "A mobile number is required so we can reach you about your booking."}</span>}
                  </div>
                </div>
                {(questions.business_name || questions.requested_amount || questions.bank_statement || (p.precall_enabled && p.precall_allow_vertical_choice)) && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
                  {questions.business_name && <div>
                    <label className="lbl">Business name *</label>
                    <input className={`field required-field${businessNameValid ? "" : " field-invalid"}`} value={businessName} onChange={(event) => setBusinessName(event.target.value)} />
                  </div>}
                  {questions.requested_amount && <div>
                    <label className="lbl">Requested amount *</label>
                    <input className={`field required-field${requestedAmountValid ? "" : " field-invalid"}`} inputMode="decimal" value={requestedAmount} onChange={(event) => setRequestedAmount(event.target.value)} placeholder="$250,000" />
                  </div>}
                  {questions.bank_statement && <div>
                    <label className="lbl">Bank evidence preference *</label>
                    <select className={`field required-field${bankMethodValid ? "" : " field-invalid"}`} value={preferredBankMethod} onChange={(event) => setPreferredBankMethod(event.target.value as BankMethod | "")}>
                      <option value="">Choose one</option>
                      <option value="plaid">Connect securely with Plaid</option>
                      <option value="statements">Upload bank statements</option>
                      <option value="decide_later">Decide later</option>
                    </select>
                  </div>}
                  {p.precall_enabled && p.precall_allow_vertical_choice && <div>
                    <label className="lbl">Financing focus</label>
                    <select className="field" value={vertical || p.precall_default_variant || "main_street"} onChange={(event) => setVertical(event.target.value as BookingVertical)}>
                      {(p.precall_allowed_variants?.length ? p.precall_allowed_variants : [p.precall_default_variant || "main_street"]).map((value) => <option key={value} value={value}>{VERTICAL_LABELS[value]}</option>)}
                    </select>
                  </div>}
                </div>}
                <div>
                  <label className="lbl">Notes</label>
                  <textarea className="field" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
                {p.sms_disclosure_text && <label className={`consent${smsConsent ? " on" : ""}`}><input type="checkbox" checked={smsConsent} onChange={(event) => setSmsConsent(event.target.checked)} /><span className="ctext"><span className="ctitle">Text me about this appointment</span>{p.sms_disclosure_text}</span></label>}
                {book.isError && <div className="note">{book.error instanceof Error ? book.error.message : "That time could not be booked."}</div>}
                {book.isSuccess && <div className="note">Appointment reserved. {meetingMode === "video" ? "Your Google Meet link and confirmation" : "Your phone-call confirmation"} are being prepared.</div>}
                <button type="button" className="btn pri" disabled={!selected || !fullName.trim() || !email.trim() || !validPhone(phone) || !requiredQuestionsComplete || profile.isError || book.isPending || book.isSuccess} onClick={() => book.mutate()}>
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
