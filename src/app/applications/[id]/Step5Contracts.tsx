"use client";

// Step 5 — the contract package.
//
// The documents themselves arrive next: this step is built as a registry so
// they load as templates rather than as a code change. What is here now is the
// shape a rep works in — a switcher across the package, a paged view of the
// document with its fields filled in place, and the two signature blocks.
//
// The signing engine already exists in the backend (document_signature.py) and
// its good idea is that signing is mechanically an upload: the certificate is
// stored as a normal file against the case, with three hashes, an IP and a
// user agent. So "send to phone to sign" issues a one-time link into that
// flow rather than inventing a second one.
//
// Forms are held until the file is actually fundable. Paperwork that goes out
// on a file which then gets declined on the first thing a lender looks at
// costs the owner time and costs us the relationship.

import { useState } from "react";
import { useCase } from "@/lib/useCase";

const PACKAGE = [
  "Business loan agreement",
  "Personal guarantee",
  "ACH authorization",
  "Fee disclosure",
];

export default function Step5Contracts({ dealerId }: { dealerId: string }) {
  const { decision } = useCase(dealerId);
  const [doc, setDoc] = useState(PACKAGE[0]);

  const ready = decision?.ready_for_forms ?? false;

  return (
    <>
      <div className="panel">
        <div className="panel-h">
          Step 5 · Contract package
          <span style={{ flex: 1 }} />
          <span className={`cellchip ${ready ? "c-ok" : "c-warn"}`}>
            {ready ? "Ready for forms" : "Not ready for forms"}
          </span>
        </div>
        <div className="panel-b">
          <div className="seg">
            {PACKAGE.map((d) => (
              <button
                key={d}
                type="button"
                className={doc === d ? "on" : undefined}
                onClick={() => setDoc(d)}
              >
                {d}
              </button>
            ))}
          </div>
          <span className="sub" style={{ display: "block", marginTop: 10 }}>
            Every field is filled from steps 1 through 4. Edit in place on the document and the
            value writes back to the case record.
          </span>
          {!ready && (
            <div className="note">
              <div>
                Holding the package until the file clears. Sending an owner paperwork on a file
                that then gets declined costs them time and costs us the relationship.
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          {doc}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn sm" disabled>Previous</button>
          <button type="button" className="btn sm" disabled>Next</button>
          <button type="button" className="btn sm" disabled>Download</button>
        </div>
        <div className="panel-b">
          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: "var(--r-sm)",
              background: "var(--surface)",
              padding: "clamp(18px, 3vw, 34px)",
              minHeight: 260,
              display: "grid",
              placeItems: "center",
              textAlign: "center",
            }}
          >
            <div>
              <b style={{ fontFamily: "var(--fh)", fontSize: 15, display: "block" }}>
                {doc} not loaded yet
              </b>
              <span className="sub" style={{ display: "block", marginTop: 6, maxWidth: 460 }}>
                The package templates have not been uploaded. Once they are, this shows the
                document page by page with every known value filled in place and the unfilled
                ones marked, so a rep can see exactly what is still outstanding before asking
                for a signature.
              </span>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 18,
              marginTop: 18,
            }}
          >
            <div>
              <span className="lbl">Borrower signature</span>
              <div
                style={{
                  border: "1px dashed var(--line2)",
                  borderRadius: "var(--r-sm)",
                  padding: "14px 12px",
                  marginTop: 6,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <span className="sub">Awaiting the applicant</span>
                <span style={{ flex: 1 }} />
                <button type="button" className="btn sm pri" disabled title="Available once the package is loaded">
                  Send to phone to sign
                </button>
              </div>
            </div>
            <div>
              <span className="lbl">Lender signature</span>
              <div
                style={{
                  border: "1px dashed var(--line2)",
                  borderRadius: "var(--r-sm)",
                  padding: "14px 12px",
                  marginTop: 6,
                }}
              >
                <span className="sub">Countersigned after the borrower executes</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
