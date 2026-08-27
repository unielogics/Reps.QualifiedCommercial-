"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, Download, FileSignature } from "lucide-react";
import { api } from "@/lib/api";
import AgreementReviewWorkspace from "./AgreementReviewWorkspace";

export const MASTER_APPLICATION_KEY = "qc_business_financing_application";

export type MasterApplicationStatus =
  | "not_generated"
  | "draft"
  | "ready"
  | "out_for_signature"
  | "executed";

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

type Template = { key: string; title: string; revision: number; active: boolean };
type GenerateResult = {
  status: string;
  missing_data: string[];
  sha256: string;
  download_url: string | null;
};
type SendResult = {
  url: string;
  passcode: string | null;
  delivered: boolean;
  emailed: boolean;
  detail: string | null;
};

function when(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusLabel(status: MasterApplicationStatus): string {
  if (status === "executed") return "Executed";
  if (status === "out_for_signature") return "Awaiting signature";
  if (status === "ready") return "Ready to send";
  if (status === "draft") return "Draft - conditions remain";
  return "Not generated";
}

export default function ApplicationSigningPanel({
  dealerId,
  packageReady,
  blockers = [],
  onStatusChange,
}: {
  dealerId: string;
  packageReady: boolean;
  blockers?: string[];
  onStatusChange?: (status: MasterApplicationStatus) => void;
}) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [generated, setGenerated] = useState<GenerateResult | null>(null);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [reviewSha256, setReviewSha256] = useState<string | null>(null);

  const authenticated = async <T,>(path: string, init?: RequestInit) =>
    api<T>(path, { ...init, authToken: (await getToken()) ?? undefined });

  const templates = useQuery({
    queryKey: ["contract-templates"],
    queryFn: () => authenticated<Template[]>("/dealer-os/contract-templates"),
  });
  const caseDocs = useQuery({
    queryKey: ["case-contracts", dealerId],
    queryFn: () => authenticated<CaseDoc[]>(`/dealer-os/dealers/${dealerId}/contracts`),
    refetchInterval: 15_000,
  });
  const template = templates.data?.find(
    (item) => item.key === MASTER_APPLICATION_KEY && item.active,
  );
  const caseDoc = caseDocs.data?.find(
    (item) => item.template_key === MASTER_APPLICATION_KEY,
  );
  const status = (caseDoc?.status as MasterApplicationStatus | undefined) ?? "not_generated";
  const executed = status === "executed";
  const outForSignature = status === "out_for_signature";
  const canPrepare = packageReady && Boolean(template);

  useEffect(() => onStatusChange?.(status), [onStatusChange, status]);

  const generate = useMutation({
    mutationFn: () => authenticated<GenerateResult>(
      `/dealer-os/dealers/${dealerId}/contracts/${MASTER_APPLICATION_KEY}/generate`,
      { method: "POST" },
    ),
    onSuccess: (result) => {
      setGenerated(result);
      void qc.invalidateQueries({ queryKey: ["case-contracts", dealerId] });
      if (result.download_url) {
        setReviewUrl(result.download_url);
        setReviewSha256(result.sha256);
      }
    },
  });
  const send = useMutation({
    mutationFn: () => authenticated<SendResult>(
      `/dealer-os/dealers/${dealerId}/contracts/${MASTER_APPLICATION_KEY}/send-signature`,
      { method: "POST", body: JSON.stringify({ channel: "email" }) },
    ),
    onSuccess: (result) => {
      setSendResult(result);
      void qc.invalidateQueries({ queryKey: ["case-contracts", dealerId] });
    },
  });
  const preview = useMutation({
    mutationFn: () => authenticated<{ url: string; sha256: string | null; status: string }>(
      `/dealer-os/dealers/${dealerId}/contracts/${MASTER_APPLICATION_KEY}/url`,
    ),
    onSuccess: (result) => {
      if (executed) {
        window.open(result.url, "_blank", "noopener,noreferrer");
        return;
      }
      setReviewUrl(result.url);
      setReviewSha256(result.sha256);
    },
  });

  const copy = async (key: string, value: string | null | undefined) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied((current) => current === key ? null : current), 1800);
  };
  const error = generate.error ?? send.error ?? preview.error;

  return (
    <div className={`panel${!packageReady && !executed ? " panel-invalid" : ""}`}>
      <div className="panel-h">
        <FileSignature size={17} /> QC Business Financing Application
        <span className="sp" />
        <span className={`cellchip ${executed ? "c-ok" : outForSignature ? "c-warn" : canPrepare ? "c-acc" : "c-mut"}`}>
          {statusLabel(status)}
        </span>
      </div>
      <div className="panel-b">
        <p className="sub" style={{ marginTop: 0, lineHeight: 1.55 }}>
          This is the signature checkpoint between Steps 4 and 5. The primary owner or authorized
          representative reviews and signs the populated lender-neutral application in the secure
          client room. The executed PDF is sealed, emailed to the signer, and retained with the file.
        </p>
        {!packageReady && !executed && (
          <div className="warnline">
            Complete the Step 4 package before generating the signing copy.
            {blockers.length > 0 && ` Open: ${blockers.slice(0, 3).join("; ")}.`}
          </div>
        )}
        {!template && !templates.isLoading && (
          <div className="warnline">The QC master application template is not active. Ask a super admin to enable it.</div>
        )}
        <div className="row mt" style={{ gap: 8, flexWrap: "wrap" }}>
          {!outForSignature && !executed && (
            <button type="button" className="btn pri" disabled={!canPrepare || generate.isPending} onClick={() => generate.mutate()}>
              <FileSignature size={16} /> {generate.isPending ? "Generating PDF..." : caseDoc?.filled_sha256 ? "Regenerate application" : "Generate application"}
            </button>
          )}
          {caseDoc?.filled_sha256 && (
            <button type="button" className={executed ? "btn" : "btn pri"} disabled={preview.isPending} onClick={() => preview.mutate()}>
              <Download size={16} /> {preview.isPending ? "Opening..." : executed ? "Download executed PDF" : outForSignature ? "Review sent application" : "Review and send"}
            </button>
          )}
        </div>
        {generated && (
          <div className="note mt">
            <b>Populated PDF generated.</b> SHA-256 <span className="num">{generated.sha256.slice(0, 16)}...</span>
          </div>
        )}
        {sendResult && (
          <div className="note mt">
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <b>{sendResult.emailed ? "Signature invitation emailed." : "Secure signature room created."}</b>
              <span className="sp" />
              <button type="button" className="btn sm" onClick={() => void copy("room", sendResult.url)}>
                <Copy size={14} /> {copied === "room" ? "Link copied" : "Copy room link"}
              </button>
              {sendResult.passcode && (
                <button type="button" className="btn sm num" onClick={() => void copy("pin", sendResult.passcode)}>
                  <Copy size={14} /> {copied === "pin" ? "PIN copied" : `PIN ${sendResult.passcode}`}
                </button>
              )}
            </div>
            {sendResult.detail && <div className="sub mt">{sendResult.detail}</div>}
          </div>
        )}
        {executed && (
          <div className="note mt">
            <div className="row" style={{ gap: 8 }}><CheckCircle2 size={18} /><b>Application executed</b></div>
            <div className="sub mt">
              Signed by {caseDoc?.signer_name || "the authorized representative"}
              {caseDoc?.signer_title ? `, ${caseDoc.signer_title}` : ""} on {when(caseDoc?.signed_at)}.
            </div>
          </div>
        )}
        {error && (
          <div className="warnline mt">{error instanceof Error ? error.message : "The application action did not complete."}</div>
        )}
      </div>
      {reviewUrl && !executed && (
        <AgreementReviewWorkspace
          url={reviewUrl}
          sha256={reviewSha256 ?? caseDoc?.filled_sha256 ?? null}
          outForSignature={outForSignature}
          sendResult={sendResult}
          sendPending={send.isPending}
          canSend={canPrepare}
          error={send.error}
          copied={copied}
          onSend={() => send.mutate()}
          onCopy={(key, value) => void copy(key, value)}
          onClose={() => setReviewUrl(null)}
        />
      )}
    </div>
  );
}
