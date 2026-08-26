"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileSignature, Mail, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import type { SubmissionReadiness } from "@/lib/applicationReadiness";

const MASTER_KEY = "qc_business_financing_application";

type CaseDoc = {
  id: string;
  template_key: string;
  status: string;
  filled_sha256: string | null;
  signed_at: string | null;
  signer_name: string | null;
  signer_title: string | null;
  signature_sha256: string | null;
};

type GenerateResult = {
  status: string;
  placed: Record<string, string>;
  missing_data: string[];
  overlay_problems: string[];
  sha256: string;
  download_url: string | null;
};

type Template = {
  key: string;
  title: string;
  revision: number;
  active: boolean;
  render_kind: "uploaded_pdf" | "generated_html";
};

type SendResult = {
  url: string;
  passcode: string | null;
  delivered: boolean;
  emailed: boolean;
  texted: boolean;
  detail: string | null;
};

export default function Step5Contracts({ dealerId }: { dealerId: string }) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [generated, setGenerated] = useState<GenerateResult | null>(null);

  const readiness = useQuery({
    queryKey: ["submission-readiness", dealerId],
    queryFn: async () => api<SubmissionReadiness>(
      `/dealer-os/dealers/${dealerId}/submission-readiness`,
      { authToken: (await getToken()) ?? undefined },
    ),
  });
  const templates = useQuery({
    queryKey: ["contract-templates"],
    queryFn: async () => api<Template[]>("/dealer-os/contract-templates", {
      authToken: (await getToken()) ?? undefined,
    }),
  });
  const template = templates.data?.find((item) => item.key === MASTER_KEY && item.active);
  const caseDocs = useQuery({
    queryKey: ["case-contracts", dealerId],
    queryFn: async () => api<CaseDoc[]>(`/dealer-os/dealers/${dealerId}/contracts`, {
      authToken: (await getToken()) ?? undefined,
    }),
  });
  const caseDoc = caseDocs.data?.find((item) => item.template_key === MASTER_KEY);

  const generate = useMutation({
    mutationFn: async () => api<GenerateResult>(
      `/dealer-os/dealers/${dealerId}/contracts/${MASTER_KEY}/generate`,
      { method: "POST", authToken: (await getToken()) ?? undefined },
    ),
    onSuccess: (result) => {
      setGenerated(result);
      void qc.invalidateQueries({ queryKey: ["case-contracts", dealerId] });
    },
  });
  const send = useMutation({
    mutationFn: async () => api<SendResult>(
      `/dealer-os/dealers/${dealerId}/contracts/${MASTER_KEY}/send-signature`,
      {
        method: "POST",
        body: JSON.stringify({ channel: "email" }),
        authToken: (await getToken()) ?? undefined,
      },
    ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["case-contracts", dealerId] }),
  });
  const download = useMutation({
    mutationFn: async () => api<{ url: string; status: string; sha256: string | null }>(
      `/dealer-os/dealers/${dealerId}/contracts/${MASTER_KEY}/url`,
      { authToken: (await getToken()) ?? undefined },
    ),
    onSuccess: (result) => window.open(result.url, "_blank", "noopener,noreferrer"),
  });

  useEffect(() => {
    if (generated?.download_url) window.open(generated.download_url, "_blank", "noopener,noreferrer");
  }, [generated?.download_url]);

  const releaseReady = Boolean(readiness.data?.ready && template);
  const executed = caseDoc?.status === "executed";
  const outForSignature = caseDoc?.status === "out_for_signature";

  return (
    <>
      <div className="panel">
        <div className="panel-h">
          Step 5 · QC master application
          <span className="sp" />
          <span className={`cellchip ${executed || releaseReady ? "c-ok" : "c-warn"}`}>
            {executed ? "Executed" : releaseReady ? "Ready to generate" : "Release gate closed"}
          </span>
        </div>
        <div className="panel-b">
          <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
            <FileSignature size={24} aria-hidden />
            <div>
              <b>Qualified Commercial Business Financing Application and Certifications</b>
              <p className="sub" style={{ margin: "5px 0 0", lineHeight: 1.55 }}>
                One lender-neutral application is generated from the verified case. It contains
                the canonical NAICS hierarchy, owner schedule, evidence summary, selected
                funding path, conditions, and certifications. It never includes an SSN, a raw
                credit score, or the identity of a downstream funding source.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          Application execution
          <span className="sp" />
          {caseDoc && <span className="sub">Updated status: {caseDoc.status.replace(/_/g, " ")}</span>}
        </div>
        <div className="panel-b">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
            <div className="note" style={{ margin: 0 }}>
              <div><ShieldCheck size={17} /><b>Designated signer only</b><br /><span className="sub">The primary owner or authorized representative certifies the business record. Every 20%+ owner still completes a separate iSoftPull.</span></div>
            </div>
            <div className="note" style={{ margin: 0 }}>
              <div><CheckCircle2 size={17} /><b>Immutable evidence</b><br /><span className="sub">The final PDF records the visible signature, title, time, IP, user agent, document hash, signature hash, and completion certificate.</span></div>
            </div>
            <div className="note" style={{ margin: 0 }}>
              <div><Mail size={17} /><b>Client delivery</b><br /><span className="sub">Execution triggers an automatic download and email. A secure download remains in the client room as a fallback.</span></div>
            </div>
          </div>

          {!releaseReady && !executed && (
            <div className="warnline mt">
              Complete every Step 4 source requirement and record a fundable human review
              before releasing the application.
            </div>
          )}

          <div className="row mt" style={{ gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn pri"
              disabled={!releaseReady || generate.isPending || outForSignature || executed}
              onClick={() => generate.mutate()}
            >
              <FileSignature size={16} />
              {generate.isPending ? "Generating complete PDF…" : caseDoc?.filled_sha256 ? "Regenerate master application" : "Generate master application"}
            </button>
            {caseDoc?.filled_sha256 && (
              <button type="button" className="btn" disabled={download.isPending} onClick={() => download.mutate()}>
                <Download size={16} /> {executed ? "Download executed PDF" : "Review populated PDF"}
              </button>
            )}
            {caseDoc?.filled_sha256 && !outForSignature && !executed && (
              <button type="button" className="btn pri" disabled={!releaseReady || send.isPending} onClick={() => send.mutate()}>
                <Mail size={16} /> {send.isPending ? "Sending…" : "Email primary signer"}
              </button>
            )}
          </div>

          {generated && (
            <div className="note mt">
              <div>
                <b>PDF generated.</b> {Object.keys(generated.placed).length} populated sections;
                SHA-256 <span className="num">{generated.sha256.slice(0, 16)}…</span>.
                {generated.missing_data.length > 0 && <> Awaiting: {generated.missing_data.join(" · ")}.</>}
              </div>
            </div>
          )}
          {send.isSuccess && (
            <div className="note mt">
              <div>
                <b>{send.data.emailed ? "Signature request emailed." : "Signature room created."}</b>{" "}
                The signer reviews the complete PDF before signing. The signed PDF and
                evidentiary certificate are delivered after execution.
                {send.data.detail ? ` ${send.data.detail}` : ""}
              </div>
            </div>
          )}
          {(generate.isError || send.isError || download.isError) && (
            <div className="note mt">
              {(generate.error ?? send.error ?? download.error) instanceof Error
                ? (generate.error ?? send.error ?? download.error)?.message
                : "The document action did not complete."}
            </div>
          )}
        </div>
      </div>

      {executed && (
        <div className="panel">
          <div className="panel-h">Execution record</div>
          <div className="panel-b">
            <div className="kv"><span>Signer</span><b>{caseDoc.signer_name || "Primary authorized representative"}</b></div>
            <div className="kv"><span>Title</span><b>{caseDoc.signer_title || "Recorded in certificate"}</b></div>
            <div className="kv"><span>Signed</span><b>{caseDoc.signed_at ? new Date(caseDoc.signed_at).toLocaleString() : "Complete"}</b></div>
            <div className="kv"><span>Signature hash</span><b className="num">{caseDoc.signature_sha256 ? `${caseDoc.signature_sha256.slice(0, 16)}…` : "Stored in PDF certificate"}</b></div>
          </div>
        </div>
      )}
    </>
  );
}
