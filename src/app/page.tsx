"use client";

// The portfolio: every application, and what each one is waiting on.
//
// The columns are chosen to answer one question without opening anything —
// what do I do next on this file. So Bank and Credit are separate chips rather
// than a single "verified" state, because a file waiting on the bank link and
// a file waiting on the credit authorization need different messages sent to
// different places, and Next action reads straight off that pair.
//
// The filter is the same four states the funnel counts, so the number a rep
// sees here and the number on Production are the same number.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMe } from "@/lib/useMe";
import Modal from "@/components/Modal";
import NewApplicationForm from "@/components/NewApplicationForm";

type Row = {
  id: string;
  case_ref: string | null;
  name: string;
  city: string | null;
  state: string | null;
  industry: string | null;
  status: string;
  score: number | null;
  funding_goal: number | null;
  bank_linked: boolean;
  credit_returned: boolean;
  verified: boolean;
  audit_client_since: string | null;
  created_at: string;
};

type Filter = "all" | "awaiting" | "verified" | "contract";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "awaiting", label: "Awaiting verification" },
  { key: "verified", label: "Verified" },
  { key: "contract", label: "In contract" },
];

function money(n: number | null): string {
  if (n === null) return "—";
  return "$" + Math.round(n).toLocaleString();
}

/** What to do next, read off the two authorizations. */
function nextAction(r: Row): string {
  if (!r.bank_linked && !r.credit_returned) return "Send both authorizations";
  if (!r.bank_linked) return "Chase the bank connection";
  if (!r.credit_returned) return "Resend credit authorization";
  if (r.status === "complete") return "Collect signature";
  return "Work the profile";
}

function stageChip(r: Row) {
  // Graduated files show it plainly: the client this rep brought in is now a
  // full audit client, and the rep still sees the file they earned.
  if (r.audit_client_since) return <span className="cellchip c-acc">Audit client</span>;
  if (r.status === "complete") return <span className="cellchip c-acc">Contract</span>;
  if (r.verified) return <span className="cellchip c-acc">Underwriting</span>;
  if (r.bank_linked || r.credit_returned) return <span className="cellchip c-warn">Verification</span>;
  return <span className="cellchip c-mut">Intake</span>;
}

export default function Portfolio() {
  const { getToken } = useAuth();
  const router = useRouter();
  const { isRep, isTeam } = useMe();
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);

  const q = useQuery({
    queryKey: ["files"],
    queryFn: async () =>
      api<Row[]>("/dealer-os/dealers", { authToken: (await getToken()) ?? undefined }),
    enabled: isRep || isTeam,
  });

  const rows = useMemo(() => q.data ?? [], [q.data]);

  const stats = useMemo(() => {
    const verified = rows.filter((r) => r.verified);
    return {
      open: rows.length,
      awaiting: rows.filter((r) => !r.verified).length,
      verified: verified.length,
      contract: rows.filter((r) => r.status === "complete").length,
      // Only verified files carry a capacity figure. Summing what a rep typed
      // into an unverified file would make the headline number a wish.
      capacity: verified.reduce((a, r) => a + (r.funding_goal ?? 0), 0),
    };
  }, [rows]);

  const shown = useMemo(() => {
    if (filter === "awaiting") return rows.filter((r) => !r.verified);
    if (filter === "verified") return rows.filter((r) => r.verified);
    if (filter === "contract") return rows.filter((r) => r.status === "complete");
    return rows;
  }, [rows, filter]);

  return (
    <>
      <div className="hd">
        <h2>{isRep ? "Portfolio" : "All applications"}</h2>
        <p className="lede">Every application you have opened, and what each one is waiting on.</p>
      </div>

      <div className="kpis mt">
        <div className="kpi">
          <span className="lbl">Open applications</span>
          <b className="knum num">{stats.open}</b>
          <span className="sub">{stats.awaiting} awaiting verification</span>
        </div>
        <div className="kpi">
          <span className="lbl">Fully verified</span>
          <b className="knum num">{stats.verified}</b>
          <span className="sub">Bank and credit returned</span>
        </div>
        <div className="kpi">
          <span className="lbl">In contract</span>
          <b className="knum num">{stats.contract}</b>
          <span className="sub">Awaiting signature</span>
        </div>
        <div className="kpi">
          <span className="lbl">Capacity in flight</span>
          <b className="knum num">
            {stats.capacity ? "$" + (stats.capacity / 1_000_000).toFixed(1) + "M" : "—"}
          </b>
          <span className="sub">Requested, verified files only</span>
        </div>
      </div>

      <div className="row mt" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="seg">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={filter === f.key ? "on" : undefined}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button type="button" className="btn pri" onClick={() => setCreating(true)}>
          Open new application
        </button>
      </div>

      <div className="panel mt">
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Applicant</th>
                <th>Where</th>
                <th>Stage</th>
                <th>Bank</th>
                <th>Credit</th>
                <th className="r">Requested</th>
                <th>Next action</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.name}</b>
                    {r.case_ref && (
                      <span className="sub num" style={{ display: "block" }}>
                        {r.case_ref}
                      </span>
                    )}
                  </td>
                  <td className="sub">{[r.city, r.state].filter(Boolean).join(", ") || "—"}</td>
                  <td>{stageChip(r)}</td>
                  <td>
                    <span className={`cellchip ${r.bank_linked ? "c-ok" : "c-warn"}`}>
                      {r.bank_linked ? "Linked" : "Awaiting"}
                    </span>
                  </td>
                  <td>
                    <span className={`cellchip ${r.credit_returned ? "c-ok" : "c-warn"}`}>
                      {r.credit_returned ? "Returned" : "Awaiting"}
                    </span>
                  </td>
                  <td className="r num">{money(r.funding_goal)}</td>
                  <td className="sub">{nextAction(r)}</td>
                  <td className="r">
                    <Link className="linky" href={`/applications/${r.id}`}>
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
              {q.isLoading && (
                <tr>
                  <td colSpan={8} className="sub">
                    Loading…
                  </td>
                </tr>
              )}
              {!q.isLoading && shown.length === 0 && (
                <tr>
                  <td colSpan={8} className="sub">
                    {rows.length === 0
                      ? "No applications yet. Open one while you are standing in the business."
                      : "Nothing in this state right now."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {creating && (
        <Modal title="Open a new application" width={980} onClose={() => setCreating(false)}>
          <NewApplicationForm
            onCancel={() => setCreating(false)}
            onCreated={(id) => {
              setCreating(false);
              router.push(`/applications/${id}`);
            }}
          />
        </Modal>
      )}
    </>
  );
}
