"use client";

// Step 4 — the submission package.
//
// The whole point of arriving here through the gate is that most of this is
// already known and cannot be retyped. Fields sourced from the bank connection
// or the bureau render locked with a source chip; a rep who could overwrite a
// verified figure would make every "Verified" chip in the product meaningless.
//
// The rest is what a lender asks for and nobody has yet: a landlord, a
// guarantor's home address, a date of birth. Those are the rep's to collect,
// and they carry into the contract package at step 5.

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useCase } from "@/lib/useCase";
import StepActions from "@/components/StepActions";
import { applicationProfileReady, type ApplicationProfileData } from "@/lib/applicationReadiness";

type Owner = {
  id: string;
  full_name: string | null;
  email: string | null;
  credit_score: number | null;
  is_primary: boolean;
};

type Account = {
  id: string;
  institution_name: string | null;
  name: string | null;
  mask: string | null;
};

type ApplicationProfile = ApplicationProfileData;

function Verified({ source }: { source: string }) {
  return <span className="cellchip c-pet">{source}</span>;
}

function band(score: number | null | undefined): string {
  if (score === null || score === undefined) return "";
  const lo = Math.floor(score / 30) * 30;
  return `${lo}–${lo + 29}`;
}

export default function Step4Application({ dealerId }: { dealerId: string }) {
  const { getToken } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const { dealer, decision } = useCase(dealerId);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const owners = useQuery({
    queryKey: ["owners", dealerId],
    queryFn: async () =>
      api<Owner[]>(`/dealer-os/dealers/${dealerId}/owners`, {
        authToken: (await getToken()) ?? undefined,
      }),
  });

  const accounts = useQuery({
    queryKey: ["accounts", dealerId],
    queryFn: async () =>
      api<Account[]>(`/dealer-os/dealers/${dealerId}/accounts`, {
        authToken: (await getToken()) ?? undefined,
      }),
  });

  const profile = useQuery({
    queryKey: ["application-profile", dealerId],
    queryFn: async () =>
      api<ApplicationProfile | null>(`/dealer-os/dealers/${dealerId}/application-profile`, {
        authToken: (await getToken()) ?? undefined,
      }),
  });

  useEffect(() => setDraft({}), [dealerId, profile.data]);

  const patch = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      api<ApplicationProfile>(`/dealer-os/dealers/${dealerId}/application-profile`, {
        method: "PATCH",
        body: JSON.stringify(body),
        authToken: (await getToken()) ?? undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["application-profile", dealerId] });
      void qc.invalidateQueries({ queryKey: ["decision", dealerId] });
    },
  });

  const owner = owners.data?.find((o) => o.is_primary) ?? owners.data?.[0];
  const acct = accounts.data?.[0];

  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: 12,
  };

  const verifiedCount = [dealer?.name, dealer?.ein, acct?.institution_name, owner?.full_name,
    owner?.credit_score].filter(Boolean).length;

  const val = (key: keyof ApplicationProfile) =>
    draft[key] ?? String((profile.data?.[key] ?? "") as string | number);
  const set = (key: keyof ApplicationProfile, value: string) =>
    setDraft((p) => ({ ...p, [key]: value }));
  const commit = (key: keyof ApplicationProfile, transform?: (v: string) => unknown) => {
    if (draft[key] === undefined) return;
    const next = transform ? transform(draft[key]) : draft[key].trim() || null;
    patch.mutate({ [key]: next });
  };
  const liveProfile: ApplicationProfile = {
    landlord_mortgagee: val("landlord_mortgagee") || null,
    guarantor_home_address: val("guarantor_home_address") || null,
    guarantor_dob: val("guarantor_dob") || null,
    selected_program: val("selected_program") || null,
    term_requested_months: Number(val("term_requested_months")) || null,
    collateral_description: val("collateral_description") || null,
    use_of_proceeds_text: val("use_of_proceeds_text") || null,
  };
  const verifiedComplete = Boolean(
    (dealer?.legal_name || dealer?.name)
      && dealer?.ein
      && acct
      && owner?.full_name
      && owner?.credit_score
      && dealer?.funding_goal
      && dealer?.funding_purpose,
  );
  const profileComplete = applicationProfileReady(liveProfile, dealer?.funding_purpose);
  const stepReady = verifiedComplete && profileComplete && Boolean(decision?.ready_for_forms) && !patch.isPending;
  const equipmentProgram = dealer?.funding_purpose === "equipment"
    || val("selected_program").toLowerCase().includes("equipment");

  const saveAndContinue = async () => {
    if (!stepReady) return;
    await patch.mutateAsync(liveProfile);
    router.push(`/applications/${dealerId}?step=5`);
  };

  return (
    <>
      <div className="panel">
        <div className="panel-h">
          Step 4 · Credit application
          <span style={{ flex: 1 }} />
          <span className="cellchip c-acc num">{verifiedCount} fields prefilled</span>
        </div>
        <div className="panel-b">
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            Verified data populates the submission automatically. Fields marked{" "}
            <span className="cellchip c-pet">Verified</span> are locked to their source; the
            remainder are entered here and carried into the contract package at step 5.
          </p>
        </div>
      </div>

      <div className={`panel${verifiedComplete ? "" : " panel-invalid"}`}>
        <div className="panel-h">Business and banking</div>
        <div className="panel-b">
          <div style={grid}>
            <div>
              <label className="lbl">Legal entity name <Verified source="Verified" /></label>
              <input className={`field${dealer?.legal_name || dealer?.name ? "" : " field-invalid"}`} style={{ width: "100%" }} value={dealer?.legal_name || dealer?.name || ""} readOnly />
            </div>
            <div>
              <label className="lbl">EIN <Verified source="Verified" /></label>
              <input className={`field${dealer?.ein ? "" : " field-invalid"}`} style={{ width: "100%" }} value={dealer?.ein ?? ""} readOnly />
            </div>
            <div>
              <label className="lbl">Operating account <Verified source="Bank" /></label>
              <input
                className={`field${acct ? "" : " field-invalid"}`}
                style={{ width: "100%" }}
                value={acct ? `${acct.institution_name ?? ""} ${acct.mask ? "····" + acct.mask : ""}`.trim() : ""}
                readOnly
              />
            </div>
            <div>
              <label className="lbl">Landlord or mortgagee</label>
              <input
                className={`field${equipmentProgram ? " required-field" : ""}`}
                required={equipmentProgram}
                style={{ width: "100%" }}
                placeholder="Required for the equipment program"
                value={val("landlord_mortgagee")}
                onChange={(e) => set("landlord_mortgagee", e.target.value)}
                onBlur={() => commit("landlord_mortgagee")}
              />
            </div>
          </div>
        </div>
      </div>

      <div className={`panel${owner?.full_name && owner?.credit_score && val("guarantor_home_address").trim() && val("guarantor_dob").trim() ? "" : " panel-invalid"}`}>
        <div className="panel-h">Guarantor</div>
        <div className="panel-b">
          <div style={grid}>
            <div>
              <label className="lbl">Name <Verified source="Verified" /></label>
              <input className={`field${owner?.full_name ? "" : " field-invalid"}`} style={{ width: "100%" }} value={owner?.full_name ?? ""} readOnly />
            </div>
            <div>
              <label className="lbl">Credit band <Verified source="Soft inquiry" /></label>
              <input className={`field${owner?.credit_score ? "" : " field-invalid"}`} style={{ width: "100%" }} value={band(owner?.credit_score)} readOnly />
            </div>
            <div>
              <label className="lbl">Home address</label>
              <input
                className="field required-field"
                required
                style={{ width: "100%" }}
                placeholder="Street, city, state, ZIP"
                value={val("guarantor_home_address")}
                onChange={(e) => set("guarantor_home_address", e.target.value)}
                onBlur={() => commit("guarantor_home_address")}
              />
            </div>
            <div>
              <label className="lbl">Date of birth</label>
              <input
                className="field required-field"
                required
                style={{ width: "100%" }}
                type="date"
                value={val("guarantor_dob").slice(0, 10)}
                onChange={(e) => set("guarantor_dob", e.target.value)}
                onBlur={() => commit("guarantor_dob", (v) => v || null)}
              />
            </div>
          </div>
          <span className="sub" style={{ display: "block", marginTop: 10 }}>
            These save back to the case and carry into the contract package at step 5.
          </span>
          {patch.isError && (
            <div className="note">
              {patch.error instanceof Error ? patch.error.message : "That field did not save."}
            </div>
          )}
        </div>
      </div>

      <div className={`panel${profileComplete && dealer?.funding_goal && dealer?.funding_purpose ? "" : " panel-invalid"}`}>
        <div className="panel-h">Facility terms requested</div>
        <div className="panel-b">
          <div style={grid}>
            <div>
              <label className="lbl">Amount <Verified source="From step 1" /></label>
              <input
                className={`field num${dealer?.funding_goal ? "" : " field-invalid"}`}
                style={{ width: "100%" }}
                value={dealer?.funding_goal ? "$" + Math.round(dealer.funding_goal).toLocaleString() : ""}
                readOnly
              />
            </div>
            <div>
              <label className="lbl">Purpose <Verified source="From step 1" /></label>
              <input
                className={`field${dealer?.funding_purpose ? "" : " field-invalid"}`}
                style={{ width: "100%" }}
                value={(dealer?.funding_purpose ?? "").replace(/_/g, " ")}
                readOnly
              />
            </div>
            <div>
              <label className="lbl">Term requested</label>
              <input
                className="field required-field"
                required
                type="number"
                min="1"
                max="360"
                style={{ width: "100%" }}
                placeholder="Months"
                inputMode="numeric"
                value={val("term_requested_months")}
                onChange={(e) => set("term_requested_months", e.target.value)}
                onBlur={() =>
                  commit("term_requested_months", (v) => {
                    const n = Number(v.replace(/\D/g, ""));
                    return n > 0 ? n : null;
                  })
                }
              />
            </div>
            <div>
              <label className="lbl">Use of proceeds</label>
              <input
                className="field required-field"
                required
                style={{ width: "100%" }}
                placeholder="What the money buys"
                value={val("use_of_proceeds_text")}
                onChange={(e) => set("use_of_proceeds_text", e.target.value)}
                onBlur={() => commit("use_of_proceeds_text")}
              />
            </div>
            <div>
              <label className="lbl">Program</label>
              <input
                className="field required-field"
                required
                style={{ width: "100%" }}
                placeholder="Working capital, equipment, SBA referral..."
                value={val("selected_program")}
                onChange={(e) => set("selected_program", e.target.value)}
                onBlur={() => commit("selected_program")}
              />
            </div>
            <div>
              <label className="lbl">Collateral description</label>
              <input
                className="field required-field"
                required
                style={{ width: "100%" }}
                placeholder="Equipment, receivables, real estate, or none"
                value={val("collateral_description")}
                onChange={(e) => set("collateral_description", e.target.value)}
                onBlur={() => commit("collateral_description")}
              />
            </div>
          </div>
        </div>
      </div>

      <StepActions
        ready={stepReady}
        message={
          !verifiedComplete
            ? "A red verified field is still missing. Return to the earlier step that supplies it."
            : !profileComplete
              ? "Complete every red lender-application field before generating contracts."
              : !decision?.ready_for_forms
                ? "The application is complete, but contracts remain locked until underwriting clears the file."
                : "The application fields are complete and ready for the contract package."
        }
        buttonLabel="Continue to Step 5"
        onContinue={() => void saveAndContinue()}
        pending={patch.isPending}
      />
    </>
  );
}
