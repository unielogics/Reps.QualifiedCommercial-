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
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useCase } from "@/lib/useCase";
import UseOfProceeds from "./UseOfProceeds";
import StepActions from "@/components/StepActions";

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
type OwnerDraft = typeof EMPTY_OWNER & { key: string; state: "unsaved" | "saving" | "invalid" };
type OwnerField = keyof typeof EMPTY_OWNER;

function validEmail(value: string | null | undefined): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value ?? "").trim());
}

function validPhone(value: string | null | undefined): boolean {
  const raw = (value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1")) || (raw.startsWith("+") && digits.length >= 8 && digits.length <= 15);
}

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
  const router = useRouter();
  const qc = useQueryClient();
  const { dealer } = useCase(dealerId);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [newOwners, setNewOwners] = useState<OwnerDraft[]>([]);
  const [ownerEdits, setOwnerEdits] = useState<Record<string, Partial<Record<OwnerField, string>>>>({});
  const [ownerSaveState, setOwnerSaveState] = useState<Record<string, "saving" | "saved" | "invalid">>({});

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
    mutationFn: async (draft: OwnerDraft) => {
      const pct = draft.ownership_pct.trim() === "" ? null : Number(draft.ownership_pct);
      return api<Owner>(`/dealer-os/dealers/${dealerId}/owners`, {
        method: "POST",
        body: JSON.stringify({
          first_name: draft.first_name.trim(),
          last_name: draft.last_name.trim(),
          email: draft.email.trim() || null,
          phone: draft.phone.trim() || null,
          ownership_pct: pct,
          is_primary: (owners.data?.length ?? 0) === 0,
          is_guarantor: true,
        }),
        authToken: (await getToken()) ?? undefined,
      });
    },
    onSuccess: (created, draft) => {
      setNewOwners((rows) => rows.filter((row) => row.key !== draft.key));
      qc.setQueryData<Owner[]>(["owners", dealerId], (rows = []) => [...rows, created]);
      refreshOwners();
    },
    onError: (_error, draft) => {
      setNewOwners((rows) => rows.map((row) => row.key === draft.key ? { ...row, state: "invalid" } : row));
    },
  });

  const patchOwner = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api<Owner>(`/dealer-os/dealers/${dealerId}/owners/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
        authToken: (await getToken()) ?? undefined,
      }),
    onMutate: ({ id }) => setOwnerSaveState((state) => ({ ...state, [id]: "saving" })),
    onSuccess: (savedOwner, variables) => {
      qc.setQueryData<Owner[]>(["owners", dealerId], (rows = []) =>
        rows.map((row) => row.id === savedOwner.id ? savedOwner : row),
      );
      setOwnerSaveState((state) => ({ ...state, [variables.id]: "saved" }));
      setOwnerEdits((edits) => {
        const next = { ...edits };
        const row = { ...(next[variables.id] ?? {}) };
        Object.keys(variables.body).forEach((key) => delete row[key as OwnerField]);
        if (Object.keys(row).length) next[variables.id] = row;
        else delete next[variables.id];
        return next;
      });
      refreshOwners();
    },
    onError: (_error, variables) => setOwnerSaveState((state) => ({ ...state, [variables.id]: "invalid" })),
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
  const ownerValue = (owner: Owner, field: OwnerField): string => {
    const edited = ownerEdits[owner.id]?.[field];
    if (edited !== undefined) return edited;
    const value = owner[field as keyof Owner];
    return value === null || value === undefined ? "" : String(value);
  };
  const effectiveOwnership = (owner: Owner) => Number(ownerValue(owner, "ownership_pct") || 0);
  const ownershipTotal = Math.round(ownerRows.reduce((sum, owner) => sum + effectiveOwnership(owner), 0) * 100) / 100;
  const ownershipComplete = ownerRows.length > 0 && Math.abs(ownershipTotal - 100) < 0.005;
  const missingRequiredEmail = ownerRows.some(
    (owner) => effectiveOwnership(owner) >= 20 && !validEmail(ownerValue(owner, "email")),
  );
  const missingRequiredPhone = ownerRows.some(
    (owner) => effectiveOwnership(owner) >= 20 && !validPhone(ownerValue(owner, "phone")),
  );
  const normalizedEmails = ownerRows.map((owner) => ownerValue(owner, "email").trim().toLowerCase()).filter(Boolean) as string[];
  const hasDuplicateEmail = new Set(normalizedEmails).size !== normalizedEmails.length;
  const smsGrant = (consent.data ?? []).find(
    (c) => c.consent_kind === "transactional" && c.granted && !c.revoked_at,
  );

  const entityComplete = Boolean(val("name").trim() && val("ein").trim() && val("entity_type").trim());
  const rowsSaved = newOwners.length === 0 && Object.keys(ownerEdits).length === 0 && !Object.values(ownerSaveState).includes("saving") && !Object.values(ownerSaveState).includes("invalid");
  const contactComplete = ownershipComplete && !missingRequiredEmail && !missingRequiredPhone && !hasDuplicateEmail && rowsSaved;
  const facilityComplete = Number(val("funding_goal").replace(/[^0-9.]/g, "")) > 0 && Boolean(val("funding_purpose").trim());
  const stepReady = entityComplete && contactComplete && facilityComplete && !patch.isPending;

  const saveAndContinue = async () => {
    if (!stepReady) return;
    await patch.mutateAsync({
      name: val("name").trim(),
      ein: val("ein").trim(),
      entity_type: val("entity_type").trim(),
      funding_goal: Number(val("funding_goal").replace(/[^0-9.]/g, "")),
      funding_purpose: val("funding_purpose").trim(),
    });
    router.push(`/applications/${dealerId}?step=2`);
  };

  const addOwnerRow = () => {
    if (ownerRows.length + newOwners.length >= 5) return;
    setNewOwners((rows) => [
      ...rows,
      { ...EMPTY_OWNER, key: crypto.randomUUID(), state: "unsaved" },
    ]);
  };

  const updateNewOwner = (key: string, field: keyof typeof EMPTY_OWNER, value: string) => {
    setNewOwners((rows) => rows.map((row) => row.key === key ? { ...row, [field]: value, state: "unsaved" } : row));
  };

  const updateOwner = (ownerId: string, field: OwnerField, value: string) => {
    setOwnerEdits((edits) => ({
      ...edits,
      [ownerId]: { ...(edits[ownerId] ?? {}), [field]: value },
    }));
    setOwnerSaveState((state) => ({ ...state, [ownerId]: "invalid" }));
  };

  const commitOwner = (owner: Owner, field: OwnerField) => {
    const raw = ownerValue(owner, field).trim();
    const pct = field === "ownership_pct" ? Number(raw) : effectiveOwnership(owner);
    const requiredContact = Number.isFinite(pct) && pct >= 20;
    const valid = field === "first_name" || field === "last_name"
      ? Boolean(raw)
      : field === "ownership_pct"
        ? Boolean(raw) && Number.isFinite(pct) && pct >= 0 && pct <= 100
        : field === "email"
          ? !requiredContact || validEmail(raw)
          : !requiredContact || validPhone(raw);
    if (!valid) {
      setOwnerSaveState((state) => ({ ...state, [owner.id]: "invalid" }));
      return;
    }
    const bodyValue = field === "ownership_pct" ? Number(raw) : raw || null;
    patchOwner.mutate({ id: owner.id, body: { [field]: bodyValue } });
  };

  const autosaveNewOwner = (draft: OwnerDraft) => {
    const pct = Number(draft.ownership_pct);
    const required = Number.isFinite(pct) && pct >= 20;
    const valid = Boolean(
      draft.first_name.trim()
      && draft.last_name.trim()
      && draft.ownership_pct.trim()
      && Number.isFinite(pct)
      && pct >= 0
      && pct <= 100
      && (!required || (validEmail(draft.email) && validPhone(draft.phone))),
    );
    if (!valid) {
      setNewOwners((rows) => rows.map((row) => row.key === draft.key ? { ...row, state: "invalid" } : row));
      return;
    }
    setNewOwners((rows) => rows.map((row) => row.key === draft.key ? { ...row, state: "saving" } : row));
    createOwner.mutate({ ...draft, state: "saving" });
  };

  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 12,
  };

  return (
    <>
      <div className={`panel${entityComplete ? "" : " panel-invalid"}`}>
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
                className="field required-field"
                required
                style={{ width: "100%" }}
                value={val("name")}
                onChange={(e) => set("name", e.target.value)}
                onBlur={() => commit("name")}
              />
            </div>
            <div>
              <label className="lbl">Entity type</label>
              <select
                className="field required-field"
                required
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
                className="field required-field"
                required
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

      <div className={`panel${contactComplete ? "" : " panel-invalid"}`}>
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
            <button type="button" className="btn" disabled={ownerRows.length + newOwners.length >= 5} onClick={addOwnerRow}>
              + Add owner
            </button>
          </div>

          {owners.isLoading && <span className="sub">Loading ownership…</span>}
          {!owners.isLoading && ownerRows.length === 0 && newOwners.length === 0 && (
            <p className="sub">Add every owner before sending credit authorizations in Step 2.</p>
          )}

          <div className="tblwrap">
            <table className="tbl" style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <th>First name</th>
                  <th>Last name</th>
                  <th style={{ width: 120 }}>Ownership %</th>
                  <th>Personal email</th>
                  <th>Personal phone</th>
                  <th>iSoftPull</th>
                  <th>Save</th>
                  <th />
                </tr>
              </thead>
              <tbody>
            {ownerRows.map((owner) => {
              const required = effectiveOwnership(owner) >= 20;
              const locked = Boolean(owner.invite_sent_at || owner.credit_pulled_at);
              const saveState = ownerSaveState[owner.id] ?? "saved";
              const duplicateEmail = Boolean(ownerValue(owner, "email")) && normalizedEmails.filter((email) => email === ownerValue(owner, "email").trim().toLowerCase()).length > 1;
              return (
                <tr key={owner.id}>
                  <td><input aria-label={`${owner.full_name} first name`} className="field required-field" required style={{ minWidth: 130 }} value={ownerValue(owner, "first_name")} onChange={(e) => updateOwner(owner.id, "first_name", e.target.value)} onBlur={() => commitOwner(owner, "first_name")} /></td>
                  <td><input aria-label={`${owner.full_name} last name`} className="field required-field" required style={{ minWidth: 130 }} value={ownerValue(owner, "last_name")} onChange={(e) => updateOwner(owner.id, "last_name", e.target.value)} onBlur={() => commitOwner(owner, "last_name")} /></td>
                  <td><input aria-label={`${owner.full_name} ownership percentage`} className="field required-field num" required min="0" max="100" type="number" step="0.01" style={{ width: 100 }} inputMode="decimal" value={ownerValue(owner, "ownership_pct")} onChange={(e) => updateOwner(owner.id, "ownership_pct", e.target.value)} onBlur={() => commitOwner(owner, "ownership_pct")} /></td>
                  <td><input aria-label={`${owner.full_name} personal email`} className={`field${required ? " required-field" : ""}${duplicateEmail ? " field-invalid" : ""}`} required={required} style={{ minWidth: 190 }} type="email" value={ownerValue(owner, "email")} onChange={(e) => updateOwner(owner.id, "email", e.target.value)} onBlur={() => commitOwner(owner, "email")} /></td>
                  <td><input aria-label={`${owner.full_name} personal phone`} className={`field${required ? " required-field" : ""}`} required={required} style={{ minWidth: 150 }} type="tel" value={ownerValue(owner, "phone")} onChange={(e) => { e.currentTarget.setCustomValidity(required && e.target.value && !validPhone(e.target.value) ? "Enter a valid personal phone" : ""); updateOwner(owner.id, "phone", e.target.value); }} onBlur={(e) => { e.currentTarget.setCustomValidity(required && !validPhone(e.currentTarget.value) ? "Enter a valid personal phone" : ""); commitOwner(owner, "phone"); }} /></td>
                  <td>
                    <span className={`cellchip ${required ? "c-warn" : "c-mut"}`}>
                      {required ? "Required" : "Not required"}
                    </span>
                    {required && (!validEmail(ownerValue(owner, "email")) || !validPhone(ownerValue(owner, "phone"))) && <span className="validation-hint">Valid email + phone needed</span>}
                  </td>
                  <td><span className={`cellchip ${saveState === "invalid" ? "c-warn" : saveState === "saved" ? "c-ok" : "c-mut"}`}>{saveState === "saving" ? "Saving…" : saveState === "invalid" ? "Fix row" : "Saved"}</span></td>
                  <td className="r">
                    <button
                      type="button"
                      className="btn sm"
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
                  </td>
                </tr>
              );
            })}

            {newOwners.map((draft) => {
              const pct = Number(draft.ownership_pct);
              const required = draft.ownership_pct.trim() !== "" && Number.isFinite(pct) && pct >= 20;
              return (
                <tr key={draft.key}>
                  {(["first_name", "last_name", "ownership_pct", "email", "phone"] as const).map((field) => (
                    <td key={field}>
                      <input
                        aria-label={`New owner ${field.replace("_", " ")}`}
                        className={`field required-field${field === "ownership_pct" ? " num" : ""}`}
                        required={field === "first_name" || field === "last_name" || field === "ownership_pct" || required}
                        min={field === "ownership_pct" ? "0" : undefined}
                        max={field === "ownership_pct" ? "100" : undefined}
                        step={field === "ownership_pct" ? "0.01" : undefined}
                        style={{ minWidth: field === "email" ? 190 : field === "phone" ? 150 : 120, width: field === "ownership_pct" ? 100 : undefined }}
                        type={field === "email" ? "email" : field === "phone" ? "tel" : field === "ownership_pct" ? "number" : "text"}
                        inputMode={field === "ownership_pct" ? "decimal" : undefined}
                        value={draft[field]}
                        onChange={(event) => {
                          if (field === "phone") event.currentTarget.setCustomValidity(required && event.target.value && !validPhone(event.target.value) ? "Enter a valid personal phone" : "");
                          updateNewOwner(draft.key, field, event.target.value);
                        }}
                        onBlur={(event) => {
                          if (field === "phone") event.currentTarget.setCustomValidity(required && !validPhone(event.currentTarget.value) ? "Enter a valid personal phone" : "");
                          autosaveNewOwner(draft);
                        }}
                      />
                    </td>
                  ))}
                  <td><span className={`cellchip ${required ? "c-warn" : "c-mut"}`}>{required ? "Required" : "Not required"}</span></td>
                  <td><span className={`cellchip ${draft.state === "saving" ? "c-mut" : draft.state === "invalid" ? "c-warn" : ""}`}>{draft.state === "saving" ? "Saving…" : draft.state === "invalid" ? "Complete row" : "Unsaved"}</span></td>
                  <td className="r"><button type="button" className="btn sm" onClick={() => setNewOwners((rows) => rows.filter((row) => row.key !== draft.key))}>Remove</button></td>
                </tr>
              );
            })}
              </tbody>
            </table>
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

      <div className={`panel${facilityComplete ? "" : " panel-invalid"}`}>
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
                className={`field required-field num${Number(val("funding_goal").replace(/[^0-9.]/g, "")) > 0 ? "" : " field-invalid"}`}
                required
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
                className="field required-field"
                required
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

      <StepActions
        ready={stepReady}
        message={
          !entityComplete
            ? "Complete the red applicant entity fields."
            : !contactComplete
              ? !rowsSaved
                ? "Save or remove every incomplete owner row."
                : !ownershipComplete
                  ? "Ownership must total exactly 100.00%."
                  : hasDuplicateEmail
                    ? "Each owner must use a different personal email."
                    : "Every 20%+ owner needs a valid personal email and phone."
              : !facilityComplete
                ? "Complete the red amount and funding-purpose fields."
                : "Step 1 is complete. Continue to create the required owner authorizations."
        }
        buttonLabel="Continue to Step 2"
        onContinue={() => void saveAndContinue()}
        pending={patch.isPending || patchOwner.isPending || createOwner.isPending}
      />
    </>
  );
}
