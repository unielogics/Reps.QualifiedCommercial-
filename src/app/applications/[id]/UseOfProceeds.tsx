"use client";

// What the money is for, line by line.
//
// A single "amount requested" answers how much and no lender asks only that.
// The breakdown is what a credit file wants, and it is also what catches a
// request nobody has thought through: a rep and an owner who sit down and
// itemise it usually discover the number was either high or low.
//
// So the total is shown against the requested amount and the difference is
// named rather than silently reconciled. A table that quietly adds up to
// something other than what was asked for is worse than no table.
//
// The written note is composed FROM the rows, not typed independently. Two
// places to say the same thing is two places to disagree, and the one a
// lender reads is the sentence.

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type Row = { label: string; amount: number };

function money(n: number): string {
  return "$" + Math.round(n).toLocaleString();
}

/** The sentence a lender reads, built from the rows the owner agreed to. */
export function composeNote(rows: Row[], purpose: string | null): string {
  const real = rows.filter((r) => r.label.trim() && r.amount > 0);
  if (real.length === 0) return "";
  const total = real.reduce((a, r) => a + r.amount, 0);
  const parts = real.map((r) => `${money(r.amount)} toward ${r.label.trim().toLowerCase()}`);
  const list =
    parts.length === 1
      ? parts[0]
      : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
  const lead = purpose
    ? `The facility is requested for ${purpose.replace(/_/g, " ")}.`
    : "";
  return `${lead} Of the ${money(total)} requested, the applicant will apply ${list}.`.trim();
}

export default function UseOfProceeds({
  dealerId,
  requested,
  purpose,
  rows: saved,
  note: savedNote,
}: {
  dealerId: string;
  requested: number | null;
  purpose: string | null;
  rows: Row[] | null;
  note: string | null;
}) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>(saved?.length ? saved : [{ label: "", amount: 0 }]);
  const [note, setNote] = useState(savedNote ?? "");
  const [dirty, setDirty] = useState(false);

  // Adopt the server's version whenever it changes underneath, but never over
  // a row the rep is part-way through typing.
  useEffect(() => {
    if (dirty) return;
    setRows(saved?.length ? saved : [{ label: "", amount: 0 }]);
    setNote(savedNote ?? "");
  }, [saved, savedNote, dirty]);

  const total = useMemo(() => rows.reduce((a, r) => a + (r.amount || 0), 0), [rows]);
  const gap = requested === null ? null : requested - total;

  const save = useMutation({
    mutationFn: async (body: { use_of_proceeds: Row[]; use_of_proceeds_note: string | null }) =>
      api(`/dealer-os/dealers/${dealerId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
        authToken: (await getToken()) ?? undefined,
      }),
    onSuccess: () => {
      setDirty(false);
      void qc.invalidateQueries({ queryKey: ["dealer", dealerId] });
    },
  });

  const commit = (nextRows = rows, nextNote = note) =>
    save.mutate({
      use_of_proceeds: nextRows.filter((r) => r.label.trim() || r.amount > 0),
      use_of_proceeds_note: nextNote.trim() || null,
    });

  const setRow = (i: number, patch: Partial<Row>) => {
    setDirty(true);
    setRows((p) => p.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  return (
    <>
      <label className="lbl mt" style={{ display: "block" }}>
        What the funds are for
      </label>
      <div className="tblwrap" style={{ marginTop: 6 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Use</th>
              <th className="r" style={{ width: 170 }}>
                Amount
              </th>
              <th style={{ width: 44 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <input
                    className="field"
                    style={{ width: "100%" }}
                    placeholder="Two Freightliner tractors"
                    value={r.label}
                    onChange={(e) => setRow(i, { label: e.target.value })}
                    onBlur={() => dirty && commit()}
                  />
                </td>
                <td className="r">
                  <input
                    className="field num"
                    style={{ width: "100%", textAlign: "right" }}
                    inputMode="numeric"
                    placeholder="0"
                    value={r.amount ? r.amount.toLocaleString() : ""}
                    onChange={(e) =>
                      setRow(i, { amount: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })
                    }
                    onBlur={() => dirty && commit()}
                  />
                </td>
                <td className="r">
                  <button
                    type="button"
                    className="linky"
                    aria-label="Remove this line"
                    title="Remove this line"
                    onClick={() => {
                      const next = rows.filter((_, j) => j !== i);
                      const kept = next.length ? next : [{ label: "", amount: 0 }];
                      setRows(kept);
                      setDirty(true);
                      commit(kept);
                    }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <b>Total</b>
              </td>
              <td className="r num">
                <b>{money(total)}</b>
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <div className="row mt">
        <button
          type="button"
          className="btn sm"
          onClick={() => {
            setDirty(true);
            setRows((p) => [...p, { label: "", amount: 0 }]);
          }}
        >
          Add a line
        </button>
        <span style={{ flex: 1 }} />
        {gap !== null && gap !== 0 && total > 0 && (
          <span className={`cellchip ${Math.abs(gap) > 1 ? "c-warn" : "c-mut"}`}>
            {gap > 0
              ? `${money(gap)} of the request unaccounted for`
              : `${money(-gap)} over the amount requested`}
          </span>
        )}
        {gap === 0 && total > 0 && (
          <span className="cellchip c-ok">Matches the amount requested</span>
        )}
      </div>

      <div className="row mt">
        <label className="lbl" style={{ flex: 1 }}>
          Use of funds, in writing
        </label>
        <button
          type="button"
          className="btn sm"
          disabled={total === 0}
          onClick={() => {
            const drafted = composeNote(rows, purpose);
            setNote(drafted);
            setDirty(true);
            commit(rows, drafted);
          }}
        >
          Draft from the table
        </button>
      </div>
      <textarea
        className={`field required-field${note.trim() ? "" : " field-invalid"}`}
        required
        style={{ width: "100%", marginTop: 6 }}
        rows={3}
        placeholder="A sentence a lender can read. Draft it from the table, then edit."
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setDirty(true);
        }}
        onBlur={() => dirty && commit()}
      />
      <span className="sub">
        Drafted from the lines above so the two cannot disagree. Edit it freely; the sentence
        is what goes into the credit application at step 4.
      </span>

      {save.isError && (
        <div className="note">
          <div>That did not save. Check the amounts and try again.</div>
        </div>
      )}
    </>
  );
}
