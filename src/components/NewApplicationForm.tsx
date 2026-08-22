"use client";

// Open a file, standing in the business.
//
// Designed for a phone in one hand. Only two things are actually required —
// the business name and a way to reach them — because a rep who has to fill in
// twelve fields before anything saves will fill in none of them and do it
// later from memory. Everything else can follow, and the AI fills gaps from
// the documents anyway.
//
// The one field worth insisting on is industry: it decides which documents get
// requested and which programs the file can even reach, and it is far better
// answered by the person standing in the shop than inferred from a bank
// statement three days later.
//
// The consent block is the exception to "keep it short", and it is not
// negotiable. Carriers audit the screen a person saw before their number was
// enrolled, so every element of it is load-bearing: the phone field stays
// optional, the two SMS permissions are separate and start unchecked, the
// terms checkbox is its own box rather than a line inside the SMS one, and the
// wording is fetched from the server so what is displayed is byte-identical to
// what gets stored as proof. Nothing here is pre-ticked, and nothing about the
// file depends on any of it being ticked at all.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

// The shared vocabulary — same slugs the backend uses to pick document
// checklists and gate industry-specific programs.
const INDUSTRIES: Array<{ slug: string; label: string }> = [
  { slug: "restaurant_food_service", label: "Restaurant / food service" },
  { slug: "auto_service", label: "Auto sales or service" },
  { slug: "grocery_commodities", label: "Grocery / commodities" },
  { slug: "trucking_logistics", label: "Trucking / logistics" },
  { slug: "manufacturing", label: "Manufacturing" },
  { slug: "retail_ecommerce", label: "Retail / e-commerce" },
  { slug: "construction_trades", label: "Construction / trades" },
  { slug: "professional_practice", label: "Professional practice" },
  { slug: "other", label: "Something else" },
];

const PURPOSES: Array<{ slug: string; label: string }> = [
  { slug: "working_capital", label: "Working capital" },
  { slug: "equipment", label: "Equipment" },
  { slug: "real_estate", label: "Real estate" },
  { slug: "refinance", label: "Refinance existing debt" },
  { slug: "floorplan", label: "Floorplan" },
  { slug: "other", label: "Not sure yet" },
];

const STATES = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(
  " ",
);

type Form = {
  name: string;
  phone: string;
  email: string;
  industry: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  funding_goal: string;
  funding_purpose: string;
  notes: string;
  smsTransactional: boolean;
  smsMarketing: boolean;
  acceptedLegal: boolean;
  consentMethod: "in_person_device" | "rep_attested";
  consenterName: string;
};

const EMPTY: Form = {
  name: "",
  phone: "",
  email: "",
  industry: "other",
  address: "",
  city: "",
  state: "",
  zip: "",
  funding_goal: "",
  funding_purpose: "",
  notes: "",
  smsTransactional: false,
  smsMarketing: false,
  acceptedLegal: false,
  consentMethod: "in_person_device",
  consenterName: "",
};

type Disclosure = {
  version: string;
  brand: string;
  transactional: string;
  marketing: string;
  legal: string;
  terms_url: string;
  privacy_url: string;
  support_email: string;
};

/** Opening an application, from a page or from a modal.
 *
 * One component rather than two forms, because the consent block is the part
 * that must never drift: two copies would mean two wordings, and the record we
 * store has to match what the owner actually read.
 */
export default function NewApplicationForm({
  onCreated,
  onCancel,
}: {
  /** Where to go once the file exists. Defaults to opening the new case. */
  onCreated?: (id: string) => void;
  /** Rendered as a Cancel button when present, for the modal. */
  onCancel?: () => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const { getToken } = useAuth();
  const [f, setF] = useState<Form>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  // The wording is the server's, not this component's. If this request fails
  // the consent block does not render at all, which is the correct failure:
  // capturing agreement to text we cannot display is worse than capturing
  // nothing and asking again later from the file.
  const disclosure = useQuery({
    queryKey: ["sms-disclosure"],
    queryFn: async () =>
      api<Disclosure>("/dealer-os/sms-disclosure", {
        authToken: (await getToken()) ?? undefined,
      }),
    staleTime: 60 * 60 * 1000,
  });
  const d = disclosure.data;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  // A way to reach them, not both. A rep often has only one.
  const reachable = f.phone.trim().length > 0 || f.email.trim().length > 0;

  // Mirrors the server's normalize_phone, which refuses anything it cannot be
  // confident about. Checked here as well as there because the server rejects
  // the whole request, and a 400 would throw away a form the rep filled in
  // standing in a shop.
  const phoneDigits = f.phone.replace(/\D/g, "");
  const phoneUsable =
    phoneDigits.length === 10 ||
    (phoneDigits.length === 11 && phoneDigits.startsWith("1")) ||
    (f.phone.trim().startsWith("+") && phoneDigits.length >= 8 && phoneDigits.length <= 15);

  const wantsSms = f.smsTransactional || f.smsMarketing;
  const consentIncomplete = wantsSms && (!f.acceptedLegal || !phoneUsable);
  const canSubmit = f.name.trim().length > 0 && reachable && !consentIncomplete;

  const create = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        name: f.name.trim(),
        industry: f.industry,
      };
      // Only send what was filled in. Empty strings would overwrite good
      // defaults with blanks and trip the server's pattern validators.
      const optional: Array<[keyof Form, string]> = [
        ["phone", "phone"],
        ["email", "email"],
        ["address", "address"],
        ["city", "city"],
        ["state", "state"],
        ["zip", "zip"],
        ["notes", "notes"],
        ["funding_purpose", "funding_purpose"],
      ];
      for (const [key, field] of optional) {
        const v = String(f[key] ?? "").trim();
        if (v) body[field] = v;
      }
      const goal = Number(f.funding_goal.replace(/[^0-9.]/g, ""));
      if (goal > 0) body.funding_goal = goal;

      // Only sent when something was actually agreed to. The server writes the
      // disclosure text from its own copy, so none is sent from here.
      if (f.phone.trim() && (f.smsTransactional || f.smsMarketing)) {
        body.sms_consent = {
          phone: f.phone.trim(),
          transactional: f.smsTransactional,
          marketing: f.smsMarketing,
          accepted_legal: f.acceptedLegal,
          method: f.consentMethod,
          consenter_name: f.consenterName.trim() || null,
        };
      }

      return api<{ id: string; name: string }>("/dealer-os/dealers", {
        method: "POST",
        body: JSON.stringify(body),
        authToken: (await getToken()) ?? undefined,
      });
    },
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: ["files"] });
      // Straight into the case. A rep who just opened a file is standing in
      // front of the owner and the next thing they do is send the two
      // authorizations, which is step 2 of the file they just made.
      if (onCreated) onCreated(created.id);
      else router.push(`/applications/${created.id}?step=2`);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Could not open the file.";
      setError(msg);
    },
  });

  return (
    <>
      <form
        className="cg mt"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (canSubmit) create.mutate();
        }}
      >
        <div className="s7">
          <div className="panel">
            <div className="panel-h">The business</div>
            <div className="panel-b">
              <label className="lbl">Business name *</label>
              <input
                className="field"
                value={f.name}
                onChange={(e) => set("name", e.target.value)}
                autoComplete="organization"
                autoFocus
                required
              />

              <label className="lbl mt">Industry *</label>
              <select
                className="field"
                value={f.industry}
                onChange={(e) => set("industry", e.target.value)}
              >
                {INDUSTRIES.map((i) => (
                  <option key={i.slug} value={i.slug}>
                    {i.label}
                  </option>
                ))}
              </select>
              <span className="sub">
                This decides which documents we ask for and which programs the file can
                reach, so it is worth getting right here.
              </span>

              <div className="row mt" style={{ gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label className="lbl">Phone (optional)</label>
                  <input
                    className="field"
                    type="tel"
                    inputMode="tel"
                    value={f.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    autoComplete="tel"
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label className="lbl">Email (optional)</label>
                  <input
                    className="field"
                    type="email"
                    inputMode="email"
                    value={f.email}
                    onChange={(e) => set("email", e.target.value)}
                    autoComplete="email"
                  />
                </div>
              </div>
              {!reachable && f.name.trim() && (
                <span className="sub">One of phone or email is needed to send them anything.</span>
              )}
            </div>
          </div>

          {f.phone.trim().length > 0 && disclosure.isError && (
            <div className="note mt">
              The consent wording could not be loaded, so the text opt-in cannot be shown.
              Open the file anyway and add it from the file once you are back on signal.
            </div>
          )}

          {f.phone.trim().length > 0 && d && (
            <div className="panel mt">
              <div className="panel-h">Permission to text them</div>
              <div className="panel-b">
                <p className="sub" style={{ marginTop: 0 }}>
                  Hand the phone or tablet to the owner and let them tick these themselves.
                  Their number is not enrolled in anything unless they do. Leave it all
                  unticked and the file still opens; you just send links by email instead.
                </p>

                <div className={`consent mt${f.smsTransactional ? " on" : ""}`}>
                  <label>
                    <input
                      type="checkbox"
                      checked={f.smsTransactional}
                      onChange={(e) => set("smsTransactional", e.target.checked)}
                    />
                    <span className="ctext">
                      <span className="ctitle">Account and application texts</span>
                      {d.transactional}
                    </span>
                  </label>
                </div>

                <div className={`consent${f.smsMarketing ? " on" : ""}`}>
                  <label>
                    <input
                      type="checkbox"
                      checked={f.smsMarketing}
                      onChange={(e) => set("smsMarketing", e.target.checked)}
                    />
                    <span className="ctext">
                      <span className="ctitle">Promotional texts</span>
                      {d.marketing}
                    </span>
                  </label>
                </div>

                <div className={`consent${f.acceptedLegal ? " on" : ""}`}>
                  <label>
                    <input
                      type="checkbox"
                      checked={f.acceptedLegal}
                      onChange={(e) => set("acceptedLegal", e.target.checked)}
                    />
                    <span className="ctext">
                      <span className="ctitle">Terms and Privacy Policy</span>
                      I have read and agree to the {d.brand}{" "}
                      <a href={d.terms_url} target="_blank" rel="noreferrer">
                        Terms and Conditions
                      </a>{" "}
                      and{" "}
                      <a href={d.privacy_url} target="_blank" rel="noreferrer">
                        Privacy Policy
                      </a>
                      .
                    </span>
                  </label>
                </div>

                {wantsSms && (
                  <>
                    <label className="lbl mt">Who agreed</label>
                    <input
                      className="field"
                      placeholder="Name of the person who ticked the boxes"
                      value={f.consenterName}
                      onChange={(e) => set("consenterName", e.target.value)}
                    />
                    <label className="lbl mt">How</label>
                    <select
                      className="field"
                      value={f.consentMethod}
                      onChange={(e) =>
                        set("consentMethod", e.target.value as Form["consentMethod"])
                      }
                    >
                      <option value="in_person_device">They ticked the boxes themselves</option>
                      <option value="rep_attested">They told me yes and I ticked for them</option>
                    </select>
                    <p className="consent-note">
                      Answer this honestly. It is recorded with your name, the time, and the
                      exact wording shown above, and it is what we produce if a carrier or a
                      regulator asks how this number came to be on our list. Them ticking it
                      themselves is the stronger record, so hand the device over whenever you
                      can.
                    </p>
                  </>
                )}

                {wantsSms && !f.acceptedLegal && (
                  <div className="note mt">
                    The Terms and Privacy Policy box has to be ticked too. The text message
                    programs are described there, so agreeing to texts without it is not a
                    record we could stand behind.
                  </div>
                )}

                {wantsSms && !phoneUsable && (
                  <div className="note mt">
                    That phone number is not complete enough to enrol. Check the digits, or
                    untick the text boxes and open the file without them.
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="panel mt">
            <div className="panel-h">Where they are</div>
            <div className="panel-b">
              <label className="lbl">Street</label>
              <input
                className="field"
                value={f.address}
                onChange={(e) => set("address", e.target.value)}
                autoComplete="street-address"
              />
              <div className="row mt" style={{ gap: 10 }}>
                <div style={{ flex: 2, minWidth: 0 }}>
                  <label className="lbl">City</label>
                  <input
                    className="field"
                    value={f.city}
                    onChange={(e) => set("city", e.target.value)}
                  />
                </div>
                <div style={{ width: 90 }}>
                  <label className="lbl">State</label>
                  <select
                    className="field"
                    value={f.state}
                    onChange={(e) => set("state", e.target.value)}
                  >
                    <option value="">—</option>
                    {STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ width: 110 }}>
                  <label className="lbl">ZIP</label>
                  <input
                    className="field"
                    inputMode="numeric"
                    value={f.zip}
                    onChange={(e) => set("zip", e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="s5">
          <div className="panel">
            <div className="panel-h">What they are after</div>
            <div className="panel-b">
              <label className="lbl">How much</label>
              <input
                className="field"
                inputMode="numeric"
                placeholder="250,000"
                value={f.funding_goal}
                onChange={(e) => set("funding_goal", e.target.value)}
              />
              <label className="lbl mt">What for</label>
              <select
                className="field"
                value={f.funding_purpose}
                onChange={(e) => set("funding_purpose", e.target.value)}
              >
                <option value="">—</option>
                {PURPOSES.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.label}
                  </option>
                ))}
              </select>
              <span className="sub">
                A goal lets the system work backwards and tell you what the file needs to
                hit, so it is useful even as a rough number.
              </span>
            </div>
          </div>

          <div className="panel mt">
            <div className="panel-h">Notes from the visit</div>
            <div className="panel-b">
              <textarea
                className="field"
                rows={5}
                placeholder="Anything worth remembering: who you met, what they said about the bank, when to follow up."
                value={f.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>
          </div>

          {error && <div className="note mt">{error}</div>}

          <div className="row mt">
            {onCancel && (
              <button type="button" className="btn" onClick={onCancel}>
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="btn pri"
              style={{ flex: 1 }}
              disabled={!canSubmit || create.isPending}
            >
              {create.isPending ? "Opening…" : "Open the application"}
            </button>
          </div>
          <span className="sub">
            A document room is created with the file, so you can request statements straight
            away.
          </span>
        </div>
      </form>
    </>
  );
}
