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

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useCase } from "@/lib/useCase";

type CaseDoc = {
  id: string;
  template_key: string;
  status: string;
  field_values: Record<string, string> | null;
  filled_sha256: string | null;
};

type GenerateResult = {
  status: string;
  placed: Record<string, string>;
  missing_data: string[];
  overlay_problems: string[];
  download_url: string | null;
};

type Template = {
  key: string;
  title: string;
  page_count: number | null;
  has_acroform: boolean;
  revision: number;
  active: boolean;
  s3_key: string | null;
};

export default function Step5Contracts({ dealerId }: { dealerId: string }) {
  const { decision } = useCase(dealerId);
  const { getToken } = useAuth();
  const [doc, setDoc] = useState<string | null>(null);

  // The package comes from the registry the desk maintains, so a new
  // agreement uploaded on the dashboard appears here without a deploy.
  const templates = useQuery({
    queryKey: ["contract-templates"],
    queryFn: async () =>
      api<Template[]>("/dealer-os/contract-templates", {
        authToken: (await getToken()) ?? undefined,
      }),
  });
  const pkg = (templates.data ?? []).filter((t) => t.active && t.s3_key);
  useEffect(() => {
    if (doc === null && pkg.length) setDoc(pkg[0].key);
  }, [doc, pkg]);
  const current = pkg.find((t) => t.key === doc) ?? pkg[0];

  const ready = decision?.ready_for_forms ?? false;
  const qc = useQueryClient();
  const [gen, setGen] = useState<GenerateResult | null>(null);

  const caseDocs = useQuery({
    queryKey: ["case-contracts", dealerId],
    queryFn: async () =>
      api<CaseDoc[]>(`/dealer-os/dealers/${dealerId}/contracts`, {
        authToken: (await getToken()) ?? undefined,
      }),
  });
  const caseDoc = (caseDocs.data ?? []).find((d) => d.template_key === current?.key);

  const generate = useMutation({
    mutationFn: async () =>
      api<GenerateResult>(`/dealer-os/dealers/${dealerId}/contracts/${current?.key}/generate`, {
        method: "POST",
        authToken: (await getToken()) ?? undefined,
      }),
    onSuccess: (r) => {
      setGen(r);
      void qc.invalidateQueries({ queryKey: ["case-contracts", dealerId] });
    },
  });

  const sendForSignature = useMutation({
    mutationFn: async () =>
      api<{ emailed: boolean; texted: boolean; detail: string | null }>(
        `/dealer-os/dealers/${dealerId}/contracts/${current?.key}/send-signature`,
        { method: "POST", body: JSON.stringify({ channel: "email" }), authToken: (await getToken()) ?? undefined },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["case-contracts", dealerId] });
    },
  });

  const preview = useMutation({
    mutationFn: async () =>
      api<{ url: string }>(`/dealer-os/dealers/${dealerId}/contracts/${current?.key}/url`, {
        authToken: (await getToken()) ?? undefined,
      }),
    onSuccess: (r) => window.open(r.url, "_blank", "noopener"),
  });

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
            {pkg.map((t) => (
              <button
                key={t.key}
                type="button"
                className={current?.key === t.key ? "on" : undefined}
                onClick={() => setDoc(t.key)}
              >
                {t.title}
              </button>
            ))}
            {pkg.length === 0 && !templates.isLoading && (
              <button type="button" className="on" disabled>
                No agreements uploaded yet
              </button>
            )}
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
          {current ? `${current.title} · r${current.revision}` : "Contract package"}
          {current && !current.has_acroform && (
            <span className="cellchip c-mut">Text document</span>
          )}
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
              padding: "clamp(18px, 3vw, 30px)",
            }}
          >
            {!current && (
              <span className="sub">
                The desk uploads the package on the dashboard under Settings, then it appears
                here on every case.
              </span>
            )}
            {current && (
              <>
                <div className="row" style={{ alignItems: "center", gap: 10 }}>
                  <b style={{ fontFamily: "var(--fh)", fontSize: 15 }}>
                    {caseDoc?.filled_sha256
                      ? "Prepopulated copy on file"
                      : "Not generated for this case yet"}
                  </b>
                  {caseDoc && (
                    <span
                      className={`cellchip ${
                        caseDoc.status === "executed"
                          ? "c-ok"
                          : caseDoc.status === "out_for_signature"
                            ? "c-acc"
                            : caseDoc.status === "ready"
                              ? "c-ok"
                              : "c-warn"
                      }`}
                    >
                      {caseDoc.status.replace(/_/g, " ")}
                    </span>
                  )}
                  <span style={{ flex: 1 }} />
                  <button
                    type="button"
                    className="btn pri"
                    disabled={generate.isPending || caseDoc?.status === "out_for_signature" || caseDoc?.status === "executed"}
                    onClick={() => generate.mutate()}
                  >
                    {generate.isPending
                      ? "Filling…"
                      : caseDoc?.filled_sha256
                        ? "Regenerate from the case"
                        : "Generate prepopulated agreement"}
                  </button>
                  {caseDoc?.filled_sha256 && (
                    <button
                      type="button"
                      className="btn"
                      disabled={preview.isPending}
                      onClick={() => preview.mutate()}
                    >
                      Preview PDF
                    </button>
                  )}
                  {caseDoc?.filled_sha256 && caseDoc.status !== "out_for_signature" && caseDoc.status !== "executed" && (
                    <button
                      type="button"
                      className="btn pri"
                      disabled={sendForSignature.isPending}
                      onClick={() => sendForSignature.mutate()}
                    >
                      {sendForSignature.isPending ? "Sending…" : "Send for signature"}
                    </button>
                  )}
                </div>
                <span className="sub" style={{ display: "block", marginTop: 8 }}>
                  Every field it can answer is filled from steps 1 through 4: the client entity,
                  the principal, the 3 percent commission, the use of funds sentence, and you on
                  the consultant line. What the case does not know is listed, never guessed.
                </span>

                {gen && gen.missing_data.length > 0 && (
                  <div className="warnline mt">
                    Still blank, because the case has not collected it:{" "}
                    {gen.missing_data.join(" · ")}
                  </div>
                )}
                {gen && gen.missing_data.length === 0 && (
                  <div className="note">
                    <div>
                      Every mapped field is filled ({Object.keys(gen.placed).length} placed).
                      Preview it, then send it for signature. Sending freezes the paper: the
                      client signs exactly what you previewed, on their own device.
                    </div>
                  </div>
                )}
                {sendForSignature.isSuccess && (
                  <div className="note">
                    <div>
                      Sent. The client signs in their secure room — signature box first, the
                      full agreement one toggle away. Their executed copy is emailed the moment
                      it lands, and the status here flips to executed.
                    </div>
                  </div>
                )}
                {sendForSignature.isError && (
                  <div className="note">
                    <div>
                      {sendForSignature.error instanceof Error
                        ? sendForSignature.error.message
                        : "That did not send."}
                    </div>
                  </div>
                )}
                {gen && gen.overlay_problems.length > 0 && (
                  <div className="note">
                    <div>
                      Template problem, tell the desk: {gen.overlay_problems.join(" · ")}
                    </div>
                  </div>
                )}
                {generate.isError && (
                  <div className="note">
                    <div>
                      {generate.error instanceof Error
                        ? generate.error.message
                        : "The fill did not run."}
                    </div>
                  </div>
                )}
              </>
            )}
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
