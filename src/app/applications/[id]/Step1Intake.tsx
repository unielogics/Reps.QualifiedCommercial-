"use client";

// Step 1 — what the rep collected standing in the business.
//
// Everything here is stated rather than verified, which is exactly why the
// panels carry a completeness chip and not a "Verified" one. The distinction
// runs through the whole product: step 4 marks bank- and bureau-sourced fields
// as locked and verified, and those chips would mean nothing if this step used
// the same word for a number somebody typed.
//
// Saves on blur rather than behind a Save button. A rep correcting an EIN on a
// phone in a shop will not find a button at the bottom of a form.

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useCase } from "@/lib/useCase";
import UseOfProceeds from "./UseOfProceeds";

const ENTITY_TYPES = [
  "Limited liability company",
  "S corporation",
  "C corporation",
  "Partnership",
  "Sole proprietorship",
];

const INDUSTRIES: Array<[string, string]> = [
  ["restaurant_food_service", "Restaurant / food service"],
  ["auto_service", "Auto sales or service"],
  ["grocery_commodities", "Grocery / commodities"],
  ["trucking_logistics", "Trucking / logistics"],
  ["manufacturing", "Manufacturing"],
  ["retail_ecommerce", "Retail / e-commerce"],
  ["construction_trades", "Construction / trades"],
  ["professional_practice", "Professional practice"],
  ["other", "Something else"],
];

const PURPOSES: Array<[string, string]> = [
  ["working_capital", "Working capital"],
  ["equipment", "Equipment"],
  ["real_estate", "Real estate"],
  ["refinance", "Refinance existing debt"],
  ["floorplan", "Floorplan"],
  ["other", "Not sure yet"],
];

type Owner = {
  id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  ownership_pct: number | null;
  is_primary: boolean;
  invite_sent_at: string | null;
  credit_pulled_at: string | null;
  credit_required: boolean;
  credit_complete: boolean;
};

const EMPTY_OWNER = { first_name: "", last_name: "", ownership_pct: "", email: "", phone: "" };

type Consent = {
  consent_kind: string;
  granted: boolean;
  revoked_at: string | null;
  consenter_name: string | null;
  created_at: string;
  method: string;
  disclosure_version: string;
};

function chip(complete: boolean) {
  return (
    <span className={`cellchip ${complete ? "c-ok" : "c-warn"}`}>
      {complete ? "Complete" : "Incomplete"}
    </span>
  );
}

export default function Step1Intake({ dealerId }: { dealerId: string }) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const { dealer } = useCase(dealerId);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [showNewOwner, setShowNewOwner] = useState(false);
  const [newOwner, setNewOwner] = useState(EMPTY_OWNER);

  // Reset the local draft whenever the server view changes, so a value saved
  // elsewhere does not sit behind a stale keystroke.
  useEffect(() => setDraft({}), [dealer?.id]);

  const owners = useQuery({
    queryKey: ["owners", dealerId],
    queryFn: async () =>
      api<Owner[]>(`/dealer-os/dealers/${dealerId}/owners`, {
        authToken: (await getToken()) ?? undefined,
      }),
  });

  const consent = useQuery({
    queryKey: ["consent", dealerId],
    queryFn: async () =>
      api<Consent[]>(`/dealer-os/dealers/${dealerId}/sms-consent`, {
        authToken: (await getToken()) ?? undefined,
      }),
  });

  const patch = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      api(`/dealer-os/dealers/${dealerId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
        authToken: (await getToken()) ?? undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dealer", dealerId] });
      void qc.invalidateQueries({ queryKey: ["decision", dealerId] });
    },
  });

  // Indexed through a plain record: the field names are the API's, and typing
  // them as keyof Dealer buys nothing while fighting the optional dealer.
  const val = (k: string) =>
    draft[k] ?? (((dealer as Record<string, unknown> | undefined)?.[k] as string | number | null) ?? "").toString();

  const set = (k: string, v: string) => setDraft((p) => ({ ...p, [k]: v }));

  const commit = (k: string, transform?: (v: string) => unknown) => {
    const raw = draft[k];
    if (raw === undefined) return;
    const current = ((dealer as Record<string, unknown> | undefined)?.[k] ?? "").toString();
    if (raw === current) return;
    patch.mutate({ [k]: transform ? transform(raw) : raw.trim() || null });
  };

  const refreshOwners = () => {
    void qc.invalidateQueries({ queryKey: ["owners", dealerId] });
    void qc.invalidateQueries({ queryKey: ["decision", dealerId] });
  };

  const createOwner = useMutation({
    mutationFn: async () => {
      const pct = newOwner.ownership_pct.trim() === "" ? null : Number(newOwner.ownership_pct);
      return api(`/dealer-os/dealers/${dealerId}/owners`, {
        method: "POST",
        body: JSON.stringify({
          first_name: newOwner.first_name.trim(),
          last_name: newOwner.last_name.trim(),
          email: newOwner.email.trim() || null,
          phone: newOwner.phone.trim() || null,
          ownership_pct: pct,
          is_primary: (owners.data?.length ?? 0) === 0,
          is_guarantor: true,
        }),
        authToken: (await getToken()) ?? undefined,
      });
    },
    onSuccess: () => {
      setNewOwner(EMPTY_OWNER);
      setShowNewOwner(false);
      refreshOwners();
    },
  });

  const patchOwner = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(`/dealer-os/dealers/${dealerId}/owners/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
        authToken: (await getToken()) ?? undefined,
      }),
    onSuccess: refreshOwners,
  });

  const deleteOwner = useMutation({
    mutationFn: async (id: string) =>
      api(`/dealer-os/dealers/${dealerId}/owners/${id}`, {
        method: "DELETE",
        authToken: (await getToken()) ?? undefined,
      }),
    onSuccess: refreshOwners,
  });

  const ownerRows = owners.data ?? [];
  const ownershipTotal = Math.round(ownerRows.reduce((sum, owner) => sum + Number(owner.ownership_pct ?? 0), 0) * 100) / 100;
  const ownershipComplete = ownerRows.length > 0 && Math.abs(ownershipTotal - 100) < 0.005;
  const missingRequiredEmail = ownerRows.some(
    (owner) => Number(owner.ownership_pct ?? 0) >= 20 && !owner.email,
  );
  const smsGrant = (consent.data ?? []).find(
    (c) => c.consent_kind === "transactional" && c.granted && !c.revoked_at,
  );

  const entityComplete = Boolean(dealer?.name && dealer?.ein && dealer?.entity_type);
  const contactComplete = ownershipComplete && !missingRequiredEmail;
  const facilityComplete = Boolean(dealer?.funding_goal && dealer?.funding_purpose);

  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 12,
  };

  return (
    <>
      <div className="panel">
        <div className="panel-h">
          Applicant entity
          <span style={{ flex: 1 }} />
          {chip(entityComplete)}
        </div>
        <div className="panel-b">
          <div style={grid}>
            <div>
              <label className="lbl">Legal entity name</label>
              <input
                className="field"
                style={{ width: "100%" }}
                value={val("name")}
                onChange={(e) => set("name", e.target.value)}
                onBlur={() => commit("name")}
              />
            </div>
            <div>
              <label className="lbl">Entity type</label>
              <select
                className="field"
                style={{ width: "100%" }}
                value={val("entity_type")}
                onChange={(e) => {
                  set("entity_type", e.target.value);
                  patch.mutate({ entity_type: e.target.value || null });
                }}
              >
                <option value="">—</option>
                {ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="lbl">EIN</label>
              <input
                className="field"
                style={{ width: "100%" }}
                placeholder="00-0000000"
                value={val("ein")}
                onChange={(e) => set("ein", e.target.value)}
                onBlur={() => commit("ein")}
              />
            </div>
            <div>
              <label className="lbl">Industry</label>
              <select
                className="field"
                style={{ width: "100%" }}
                value={val("industry")}
                onChange={(e) => {
                  set("industry", e.target.value);
                  patch.mutate({ industry: e.target.value });
                }}
              >
                {INDUSTRIES.map(([slug, label]) => (
                  <option key={slug} value={slug}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="lbl">Trading since</label>
              <input
                className="field"
                style={{ width: "100%" }}
                type="date"
                value={val("started_on").slice(0, 10)}
                onChange={(e) => set("started_on", e.target.value)}
                onBlur={() => commit("started_on")}
              />
            </div>
            <div>
              <label className="lbl">Where they are</label>
              <input
                className="field"
                style={{ width: "100%" }}
                placeholder="City"
                value={val("city")}
                onChange={(e) => set("city", e.target.value)}
                onBlur={() => commit("city")}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          Business ownership
          <span style={{ flex: 1 }} />
          {chip(contactComplete)}
        </div>
        <div className="panel-b">
          <div className="row" style={{ alignItems: "center", marginBottom: 14 }}>
            <div>
              <b className="num">{ownershipTotal.toFixed(2)}% allocated</b>
              <span className="sub" style={{ display: "block", marginTop: 3 }}>
                {ownershipTotal < 100
                  ? `${(100 - ownershipTotal).toFixed(2)}% remaining`
                  : ownershipTotal > 100
                    ? `${(ownershipTotal - 100).toFixed(2)}% overallocated`
                    : "Ownership is fully allocated"}
              </span>
            </div>
            <span style={{ flex: 1 }} />
            <span className={`cellchip ${ownershipComplete ? "c-ok" : "c-warn"}`}>
              {ownershipComplete ? "100% complete" : "Draft"}
            </span>
            <button
              type="button"
              className="btn"
              disabled={ownerRows.length >= 5}
              onClick={() => setShowNewOwner(true)}
            >
              + Add owner
            </button>
          </div>

          {owners.isLoading && <span className="sub">Loading ownership…</span>}
          {!owners.isLoading && ownerRows.length === 0 && !showNewOwner && (
            <p className="sub">Add every owner before sending credit authorizations in Step 2.</p>
          )}

          <div style={{ display: "grid", gap: 12 }}>
            {ownerRows.map((owner, index) => {
              const required = Number(owner.ownership_pct ?? 0) >= 20;
              const locked = Boolean(owner.invite_sent_at || owner.credit_pulled_at);
              const save = (body: Record<string, unknown>) => patchOwner.mutate({ id: owner.id, body });
              return (
                <section
                  key={owner.id}
                  style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 14 }}
                >
                  <div className="row" style={{ marginBottom: 12 }}>
                    <b>Owner {index + 1}</b>
                    {owner.is_primary && <span className="cellchip">Primary contact</span>}
                    <span className={`cellchip ${required ? "c-warn" : ""}`}>
                      {required ? "Credit required" : "Below 20%"}
                    </span>
                    <span style={{ flex: 1 }} />
                    <button
                      type="button"
                      className="btn"
                      title={locked ? "Credit activity preserves this owner for audit" : "Remove owner"}
                      disabled={locked || deleteOwner.isPending}
                      onClick={() => {
                        if (window.confirm(`Remove ${owner.full_name} from this ownership schedule?`)) {
                          deleteOwner.mutate(owner.id);
                        }
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  <div style={grid}>
                    <div>
                      <label className="lbl">First name</label>
                      <input className="field" style={{ width: "100%" }} defaultValue={owner.first_name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== owner.first_name) save({ first_name: v }); }} />
                    </div>
                    <div>
                      <label className="lbl">Last name</label>
                      <input className="field" style={{ width: "100%" }} defaultValue={owner.last_name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== owner.last_name) save({ last_name: v }); }} />
                    </div>
                    <div>
                      <label className="lbl">Ownership %</label>
                      <input className="field num" style={{ width: "100%" }} inputMode="decimal" defaultValue={owner.ownership_pct ?? ""} onBlur={(e) => { const raw = e.target.value.trim(); const value = raw === "" ? null : Number(raw); if (value !== owner.ownership_pct) save({ ownership_pct: value }); }} />
                    </div>
                    <div>
                      <label className="lbl">Email {required ? "· required" : ""}</label>
                      <input className="field" style={{ width: "100%" }} type="email" defaultValue={owner.email ?? ""} onBlur={(e) => { const v = e.target.value.trim(); if (v !== (owner.email ?? "")) save({ email: v || null }); }} />
                    </div>
                    <div>
                      <label className="lbl">Phone · optional</label>
                      <input className="field" style={{ width: "100%" }} type="tel" defaultValue={owner.phone ?? ""} onBlur={(e) => { const v = e.target.value.trim(); if (v !== (owner.phone ?? "")) save({ phone: v || null }); }} />
                    </div>
                  </div>
                  {required && !owner.email && (
                    <span className="sub" style={{ color: "var(--warn)", display: "block", marginTop: 8 }}>
                      Add this owner&apos;s email before Step 2 can send their private authorization.
                    </span>
                  )}
                </section>
              );
            })}

            {showNewOwner && ownerRows.length < 5 && (
              <section style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 14 }}>
                <div className="row" style={{ marginBottom: 12 }}>
                  <b>New owner</b><span style={{ flex: 1 }} />
                  <button type="button" className="btn" onClick={() => { setShowNewOwner(false); setNewOwner(EMPTY_OWNER); }}>Cancel</button>
                </div>
                <div style={grid}>
                  {([
                    ["first_name", "First name"],
                    ["last_name", "Last name"],
                    ["ownership_pct", "Ownership %"],
                    ["email", "Email"],
                    ["phone", "Phone · optional"],
                  ] as const).map(([key, label]) => (
                    <div key={key}>
                      <label className="lbl">{label}</label>
                      <input
                        className={`field${key === "ownership_pct" ? " num" : ""}`}
                        style={{ width: "100%" }}
                        type={key === "email" ? "email" : key === "phone" ? "tel" : "text"}
                        inputMode={key === "ownership_pct" ? "decimal" : undefined}
                        value={newOwner[key]}
                        onChange={(e) => setNewOwner((current) => ({ ...current, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn pri mt"
                  disabled={!newOwner.first_name.trim() || !newOwner.last_name.trim() || createOwner.isPending}
                  onClick={() => createOwner.mutate()}
                >
                  Add owner
                </button>
              </section>
            )}
          </div>

          {(createOwner.isError || patchOwner.isError || deleteOwner.isError) && (
            <div className="note">
              <div>
                {(createOwner.error ?? patchOwner.error ?? deleteOwner.error) instanceof Error
                  ? (createOwner.error ?? patchOwner.error ?? deleteOwner.error)?.message
                  : "The ownership schedule did not save."}
              </div>
            </div>
          )}

          {smsGrant ? (
            <div className="note">
              <div>
                <b>Consent on record.</b> Account and application SMS authorized
                {smsGrant.consenter_name ? ` by ${smsGrant.consenter_name}` : ""} on{" "}
                {new Date(smsGrant.created_at).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
                {smsGrant.method === "rep_attested"
                  ? ", recorded by the rep"
                  : ", captured on the rep device"}
                . Terms and Privacy Policy accepted. The full disclosure text, version{" "}
                {smsGrant.disclosure_version}, is retained in the audit trail.
              </div>
            </div>
          ) : (
            <div className="note">
              <div>
                <b>No SMS consent on record.</b> Secure links go by email only until the owner
                opts in. You can capture it next time you are with them.
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          Facility request
          <span style={{ flex: 1 }} />
          {chip(facilityComplete)}
        </div>
        <div className="panel-b">
          <div style={grid}>
            <div>
              <label className="lbl">Amount requested</label>
              <input
                className="field num"
                style={{ width: "100%" }}
                inputMode="numeric"
                placeholder="250,000"
                value={val("funding_goal")}
                onChange={(e) => set("funding_goal", e.target.value)}
                onBlur={() =>
                  commit("funding_goal", (v) => {
                    const n = Number(v.replace(/[^0-9.]/g, ""));
                    return n > 0 ? n : null;
                  })
                }
              />
            </div>
            <div>
              <label className="lbl">Purpose</label>
              <select
                className="field"
                style={{ width: "100%" }}
                value={val("funding_purpose")}
                onChange={(e) => {
                  set("funding_purpose", e.target.value);
                  patch.mutate({ funding_purpose: e.target.value || null });
                }}
              >
                <option value="">—</option>
                {PURPOSES.map(([slug, label]) => (
                  <option key={slug} value={slug}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <span className="sub">
            The purpose decides which programs the file is screened against, so it is worth
            being specific here rather than leaving it at not sure.
          </span>

          <UseOfProceeds
            dealerId={dealerId}
            requested={dealer?.funding_goal ?? null}
            purpose={dealer?.funding_purpose ?? null}
            rows={dealer?.use_of_proceeds ?? null}
            note={dealer?.use_of_proceeds_note ?? null}
          />
        </div>
      </div>

      {patch.isError && (
        <div className="note">
          <div>That did not save. Check the value and try again.</div>
        </div>
      )}
    </>
  );
}
