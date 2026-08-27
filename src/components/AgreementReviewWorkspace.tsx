"use client";

import { Copy, Download, ExternalLink, FileCheck2, FileSignature, Mail } from "lucide-react";
import Drawer from "./Drawer";

type SendResult = {
  url: string;
  passcode: string | null;
  delivered: boolean;
  emailed: boolean;
  detail: string | null;
};

export default function AgreementReviewWorkspace({
  url,
  sha256,
  outForSignature,
  sendResult,
  sendPending,
  canSend,
  error,
  copied,
  onSend,
  onCopy,
  onClose,
}: {
  url: string;
  sha256: string | null;
  outForSignature: boolean;
  sendResult: SendResult | null;
  sendPending: boolean;
  canSend: boolean;
  error: unknown;
  copied: string | null;
  onSend: () => void;
  onCopy: (key: string, value: string | null | undefined) => void;
  onClose: () => void;
}) {
  const invitationSent = outForSignature || Boolean(sendResult);

  return (
    <Drawer
      title="Review QC Business Financing Application"
      onClose={onClose}
      variant="workspace"
      dismissOnBackdrop={false}
      bodyClassName="agreementReviewBody"
    >
      <div className="agreementReviewWorkspace">
        <header className="agreementReviewToolbar">
          <div className="agreementReviewIdentity">
            <span className="agreementReviewIcon"><FileSignature size={21} /></span>
            <div>
              <span className="eyebrow">Signature copy</span>
              <b>Review the complete application with the client</b>
              <small>
                {invitationSent
                  ? "This exact PDF is frozen for signature. It cannot be regenerated while the request is active."
                  : "Confirm every page before sending. Sending freezes this exact populated PDF for the client."}
              </small>
            </div>
          </div>
          <div className="agreementReviewActions">
            <span className={`cellchip ${invitationSent ? "c-warn" : "c-acc"}`}>
              {invitationSent ? "Awaiting client signature" : "Ready for review"}
            </span>
            <a className="btn" href={url} target="_blank" rel="noreferrer">
              <ExternalLink size={16} /> Open PDF
            </a>
            <a className="btn" href={url} target="_blank" rel="noreferrer" download>
              <Download size={16} /> Download
            </a>
            <button type="button" className="btn pri" disabled={!canSend || sendPending} onClick={onSend}>
              <Mail size={16} />
              {sendPending ? "Sending..." : invitationSent ? "Resend signature request" : "Send signature request"}
            </button>
          </div>
        </header>

        <section className="agreementPdfStage" aria-label="Populated agreement preview">
          <iframe
            className="agreementPdfFrame"
            src={url}
            title="Populated QC Business Financing Application"
          />
          <div className="agreementPdfMobileFallback">
            <FileCheck2 size={30} />
            <b>The agreement is ready to review.</b>
            <span>Some mobile browsers open secure PDFs in their native viewer.</span>
            <a className="btn pri" href={url} target="_blank" rel="noreferrer">
              <ExternalLink size={16} /> Open populated PDF
            </a>
          </div>
        </section>

        <footer className="agreementReviewFooter">
          <div className="agreementReviewHash">
            <FileCheck2 size={17} />
            <span>
              <b>Document integrity</b>
              <small>{sha256 ? `SHA-256 ${sha256.slice(0, 20)}...` : "Hash is recorded when the PDF is generated."}</small>
            </span>
          </div>

          {sendResult ? (
            <div className="agreementDeliveryState">
              <div>
                <b>{sendResult.emailed ? "Signature invitation emailed" : "Secure signature room created"}</b>
                <small>{sendResult.detail || "Give the client the secure link and PIN if email delivery is unavailable."}</small>
              </div>
              <button type="button" className="btn sm" onClick={() => onCopy("room", sendResult.url)}>
                <Copy size={14} /> {copied === "room" ? "Link copied" : "Copy room link"}
              </button>
              {sendResult.passcode && (
                <button type="button" className="btn sm num" onClick={() => onCopy("pin", sendResult.passcode)}>
                  <Copy size={14} /> {copied === "pin" ? "PIN copied" : `PIN ${sendResult.passcode}`}
                </button>
              )}
            </div>
          ) : (
            <div className="agreementReviewInstruction">
              <Mail size={17} />
              <span><b>Send from this screen.</b> The client receives their secure room link and separate PIN.</span>
            </div>
          )}

          {Boolean(error) && (
            <div className="warnline agreementReviewError">
              {error instanceof Error ? error.message : "The signature request did not complete."}
            </div>
          )}
        </footer>
      </div>
    </Drawer>
  );
}
