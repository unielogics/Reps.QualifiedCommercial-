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
  full_name: string | null;
  email: string | null;
  phone: string | null;
  ownership_pct: number | null;
  is_primary: boolean;
};

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

  const owner = owners.data?.find((o) => o.is_primary) ?? owners.data?.[0];
  const smsGrant = (consent.data ?? []).find(
    (c) => c.consent_kind === "transactional" && c.granted && !c.revoked_at,
  );

  const entityComplete = Boolean(dealer?.name && dealer?.ein && dealer?.entity_type);
  const contactComplete = Boolean(owner?.full_name && (owner?.email || owner?.phone));
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
          Principal and contact
          <span style={{ flex: 1 }} />
          {chip(contactComplete)}
        </div>
        <div className="panel-b">
          {owners.isLoading && <span className="sub">Loading…</span>}
          {!owners.isLoading && !owner && (
            <p className="sub" style={{ margin: 0 }}>
              No principal recorded yet. The credit authorization is sent to a named person, so
              this is needed before step 2 can complete.
            </p>
          )}
          {owner && (
            <div style={grid}>
              <div>
                <label className="lbl">Principal name</label>
                <input className="field" style={{ width: "100%" }} value={owner.full_name ?? ""} readOnly />
              </div>
              <div>
                <label className="lbl">Ownership</label>
                <input
                  className="field"
                  style={{ width: "100%" }}
                  value={owner.ownership_pct !== null ? `${owner.ownership_pct}%` : "—"}
                  readOnly
                />
              </div>
              <div>
                <label className="lbl">Mobile</label>
                <input className="field" style={{ width: "100%" }} value={owner.phone ?? ""} readOnly />
              </div>
              <div>
                <label className="lbl">Email</label>
                <input className="field" style={{ width: "100%" }} value={owner.email ?? ""} readOnly />
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
