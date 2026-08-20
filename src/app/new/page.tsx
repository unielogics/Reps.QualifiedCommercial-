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

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
};

export default function NewFile() {
  const router = useRouter();
  const qc = useQueryClient();
  const { getToken } = useAuth();
  const [f, setF] = useState<Form>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  // A way to reach them, not both. A rep often has only one.
  const reachable = f.phone.trim().length > 0 || f.email.trim().length > 0;
  const canSubmit = f.name.trim().length > 0 && reachable;

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

      return api<{ id: string; name: string }>("/dealer-os/dealers", {
        method: "POST",
        body: JSON.stringify(body),
        authToken: (await getToken()) ?? undefined,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["files"] });
      router.push("/");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Could not open the file.";
      setError(msg);
    },
  });

  return (
    <>
      <div className="hd">
        <h2>New file</h2>
        <p className="lede">
          Enough to get started is a name and a way to reach them. The rest can follow, and
          the documents fill in most of it.
        </p>
      </div>

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
                  <label className="lbl">Phone</label>
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
                  <label className="lbl">Email</label>
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

          <button
            type="submit"
            className="btn pri mt"
            style={{ width: "100%" }}
            disabled={!canSubmit || create.isPending}
          >
            {create.isPending ? "Opening…" : "Open the file"}
          </button>
          <span className="sub">
            A document room is created with the file, so you can request statements straight
            away.
          </span>
        </div>
      </form>
    </>
  );
}
