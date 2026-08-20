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

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useCase } from "@/lib/useCase";

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
  const { dealer } = useCase(dealerId);

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

  const owner = owners.data?.find((o) => o.is_primary) ?? owners.data?.[0];
  const acct = accounts.data?.[0];

  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: 12,
  };

  const verifiedCount = [dealer?.name, dealer?.ein, acct?.institution_name, owner?.full_name,
    owner?.credit_score].filter(Boolean).length;

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

      <div className="panel">
        <div className="panel-h">Business and banking</div>
        <div className="panel-b">
          <div style={grid}>
            <div>
              <label className="lbl">Legal entity name <Verified source="Verified" /></label>
              <input className="field" style={{ width: "100%" }} value={dealer?.legal_name || dealer?.name || ""} readOnly />
            </div>
            <div>
              <label className="lbl">EIN <Verified source="Verified" /></label>
              <input className="field" style={{ width: "100%" }} value={dealer?.ein ?? ""} readOnly />
            </div>
            <div>
              <label className="lbl">Operating account <Verified source="Bank" /></label>
              <input
                className="field"
                style={{ width: "100%" }}
                value={acct ? `${acct.institution_name ?? ""} ${acct.mask ? "····" + acct.mask : ""}`.trim() : ""}
                readOnly
              />
            </div>
            <div>
              <label className="lbl">Landlord or mortgagee</label>
              <input className="field" style={{ width: "100%" }} placeholder="Required for the equipment program" />
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">Guarantor</div>
        <div className="panel-b">
          <div style={grid}>
            <div>
              <label className="lbl">Name <Verified source="Verified" /></label>
              <input className="field" style={{ width: "100%" }} value={owner?.full_name ?? ""} readOnly />
            </div>
            <div>
              <label className="lbl">Credit band <Verified source="Soft inquiry" /></label>
              <input className="field" style={{ width: "100%" }} value={band(owner?.credit_score)} readOnly />
            </div>
            <div>
              <label className="lbl">Home address</label>
              <input className="field" style={{ width: "100%" }} placeholder="Street, city, state, ZIP" />
            </div>
            <div>
              <label className="lbl">Date of birth</label>
              <input className="field" style={{ width: "100%" }} type="date" />
            </div>
          </div>
          <span className="sub" style={{ display: "block", marginTop: 10 }}>
            These are held on the case only when saved. Persisting the application package is
            the next piece of this step.
          </span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">Facility terms requested</div>
        <div className="panel-b">
          <div style={grid}>
            <div>
              <label className="lbl">Amount <Verified source="From step 1" /></label>
              <input
                className="field num"
                style={{ width: "100%" }}
                value={dealer?.funding_goal ? "$" + Math.round(dealer.funding_goal).toLocaleString() : ""}
                readOnly
              />
            </div>
            <div>
              <label className="lbl">Purpose <Verified source="From step 1" /></label>
              <input
                className="field"
                style={{ width: "100%" }}
                value={(dealer?.funding_purpose ?? "").replace(/_/g, " ")}
                readOnly
              />
            </div>
            <div>
              <label className="lbl">Term requested</label>
              <input className="field" style={{ width: "100%" }} placeholder="Months" inputMode="numeric" />
            </div>
            <div>
              <label className="lbl">Use of proceeds</label>
              <input className="field" style={{ width: "100%" }} placeholder="What the money buys" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
