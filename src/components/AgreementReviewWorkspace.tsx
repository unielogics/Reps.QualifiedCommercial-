"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  FileCheck2,
  FileSignature,
  Mail,
  KeyRound,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import type { ContractEnvelope, EnvelopeDocument, RoomAccessResult } from "./ApplicationSigningPanel";
import Drawer from "./Drawer";
import Modal from "./Modal";

type SendResult = {
  url: string;
  passcode: string | null;
  delivered: boolean;
  emailed: boolean;
  detail: string | null;
};

function documentStatus(document: EnvelopeDocument): string {
  if (document.status === "executed") return "Signed";
  if (document.status === "out_for_signature") return "Sent";
  if (document.missing_data.length) return `${document.missing_data.length} missing`;
  return "Ready";
}

function sourceStep(item: string): 1 | 3 {
  return /annual sales|cash flow|dscr|monthly debt|debt schedule/i.test(item) ? 3 : 1;
}

function money(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? "Unavailable"
    : Number(value).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function ratio(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? "Unavailable"
    : `${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
}

function count(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? "Unavailable"
    : Number(value).toLocaleString();
}

export default function AgreementReviewWorkspace({
  envelope,
  roomAccess,
  roomAccessPending,
  roomAccessError,
  createPinPending,
  createPinError,
  sendResult,
  sendPending,
  refreshPending,
  copied,
  onSend,
  onCreatePin,
  onRefresh,
  onCopy,
  onClose,
}: {
  envelope: ContractEnvelope;
  roomAccess: RoomAccessResult | null;
  roomAccessPending: boolean;
  roomAccessError: string | null;
  createPinPending: boolean;
  createPinError: string | null;
  sendResult: SendResult | null;
  sendPending: boolean;
  refreshPending: boolean;
  copied: string | null;
  onSend: () => void;
  onCreatePin: () => Promise<void>;
  onRefresh: () => void;
  onCopy: (key: string, value: string | null | undefined) => void;
  onClose: () => void;
}) {
  const [activeId, setActiveId] = useState(envelope.documents[0]?.id ?? "");
  const [pinVisible, setPinVisible] = useState(true);
  const [replacePinOpen, setReplacePinOpen] = useState(false);
  useEffect(() => {
    if (!envelope.documents.some((document) => document.id === activeId)) {
      setActiveId(envelope.documents[0]?.id ?? "");
    }
  }, [activeId, envelope.documents]);
  const index = Math.max(0, envelope.documents.findIndex((document) => document.id === activeId));
  const active = envelope.documents[index] ?? envelope.documents[0];
  const ready = envelope.status === "ready" || envelope.status === "out_for_signature";
  const executed = envelope.status === "executed";
  const invitationSent = envelope.status === "out_for_signature" || Boolean(sendResult);
  const hasRoomPin = Boolean(roomAccess?.passcode);
  const allMissing = useMemo(
    () => Array.from(new Set(envelope.documents.flatMap((document) => document.missing_data))),
    [envelope.documents],
  );

  const move = (direction: -1 | 1) => {
    if (!envelope.documents.length) return;
    const next = (index + direction + envelope.documents.length) % envelope.documents.length;
    setActiveId(envelope.documents[next].id);
  };

  const replacePin = async () => {
    try {
      await onCreatePin();
      setPinVisible(true);
      setReplacePinOpen(false);
    } catch {
      // The mutation error stays in the confirmation dialog for a retry.
    }
  };

  return (
    <>
    <Drawer
      title={`${envelope.title} · v${envelope.package_version}`}
      onClose={onClose}
      variant="workspace"
      dismissOnBackdrop={false}
      bodyClassName="agreementReviewBody"
    >
      <div className="agreementReviewWorkspace packageReviewWorkspace">
        <header className="agreementReviewToolbar">
          <div className="agreementReviewIdentity">
            <span className="agreementReviewIcon"><FileSignature size={21} /></span>
            <div>
              <span className="eyebrow">Exact signing package</span>
              <b>{active?.title ?? envelope.title}</b>
              <small>
                {invitationSent
                  ? "This version is frozen. Void it before changing the program or source data."
                  : "Review the populated lender form before sending it to the client’s device."}
              </small>
            </div>
          </div>
          <div className="agreementReviewActions">
            <button type="button" className="iconBtn" onClick={onRefresh} disabled={refreshPending} title="Refresh package status" aria-label="Refresh package status">
              <RefreshCw size={17} className={refreshPending ? "spin" : undefined} />
            </button>
            <span className={`cellchip ${executed ? "c-ok" : invitationSent ? "c-warn" : ready ? "c-acc" : "c-bad"}`}>
              {executed ? "Executed" : invitationSent ? "Awaiting client" : ready ? "Ready to send" : "Source fields missing"}
            </span>
            {active?.preview_url && <a className="btn" href={active.preview_url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open PDF</a>}
            {(active?.download_url || active?.preview_url) && <a className="btn" href={active.download_url || active.preview_url || "#"} download><Download size={16} /> Download</a>}
            {!executed && <button type="button" className="btn pri" disabled={!ready || sendPending} onClick={onSend}><Mail size={16} />{sendPending ? "Sending..." : invitationSent ? "Resend" : "Send to client"}</button>}
            {executed && envelope.bundle_download_url && <a className="btn pri" href={envelope.bundle_download_url} download><Download size={16} /> Download package</a>}
          </div>
        </header>

        <div className="packageReviewMain">
          <aside className="packageDocumentRail" aria-label="Package documents">
            <div className="packageRailSummary">
              <span className="eyebrow">Package documents</span>
              <b>{envelope.documents.length} document{envelope.documents.length === 1 ? "" : "s"}</b>
              <small>One client signature applies only after every required document is reviewed and acknowledged.</small>
            </div>
            {envelope.funding_profile && Object.keys(envelope.funding_profile).length > 0 && (
              <section className="packageRailFunding" aria-label="Funding profile">
                <div className="row"><b>Funding profile</b><span className="sp" /><span className={`cellchip ${envelope.funding_profile.system_status === "blocked" ? "c-warn" : "c-ok"}`}>{envelope.funding_profile.system_status || "System route"}</span></div>
                <dl>
                  <div><dt>Original request</dt><dd>{money(envelope.funding_profile.original_requested_amount)}</dd></div>
                  <div><dt>Working goal</dt><dd>{money(envelope.funding_profile.working_funding_goal)}</dd></div>
                  <div><dt>Annual sales</dt><dd>{money(envelope.funding_profile.annual_sales)}</dd></div>
                  <div><dt>Cash flow</dt><dd>{money(envelope.funding_profile.annual_cash_flow_available_for_debt)}</dd></div>
                  <div><dt>Monthly debt</dt><dd>{money(envelope.funding_profile.monthly_debt_payments)}</dd></div>
                  <div><dt>DSCR</dt><dd>{ratio(envelope.funding_profile.dscr)}</dd></div>
                  <div><dt>ADB</dt><dd>{money(envelope.funding_profile.avg_daily_balance)}</dd></div>
                  <div><dt>Avg. deposits</dt><dd>{money(envelope.funding_profile.average_monthly_deposits)}</dd></div>
                  <div><dt>Annualized deposits</dt><dd>{money(envelope.funding_profile.annualized_deposits)}</dd></div>
                  <div><dt>Negative days / 90</dt><dd>{count(envelope.funding_profile.negative_balance_days_90)}</dd></div>
                  <div><dt>Returned items</dt><dd>{count(envelope.funding_profile.returned_items)}</dd></div>
                  <div><dt>Bank coverage</dt><dd>{envelope.funding_profile.verified_bank_months?.length ?? 0} / {envelope.funding_profile.bank_evidence_target ?? 6} months</dd></div>
                </dl>
                {(envelope.funding_profile.credit ?? []).map((credit, creditIndex) => (
                  <div className="packageRailCredit" key={`${credit.owner ?? "owner"}-${creditIndex}`}>
                    <span>{credit.owner || "Required owner"}</span>
                    <b>{credit.quality || credit.status || "Verification pending"}</b>
                  </div>
                ))}
                {(envelope.funding_profile.unresolved_conditions ?? []).length > 0 && <small>{envelope.funding_profile.unresolved_conditions?.length} condition{envelope.funding_profile.unresolved_conditions?.length === 1 ? "" : "s"} retained for underwriting.</small>}
              </section>
            )}
            <div className="packageRailList">
              {envelope.documents.map((document, documentIndex) => (
                <button type="button" key={document.id} className={document.id === active?.id ? "on" : ""} onClick={() => setActiveId(document.id)}>
                  <span>{documentIndex + 1}</span>
                  <span><b>{document.title}</b><small>{documentStatus(document)}{document.required ? " · Required" : " · Optional"}</small></span>
                  {document.status === "executed" ? <CheckCircle2 size={16} /> : document.missing_data.length ? <TriangleAlert size={16} /> : <FileCheck2 size={16} />}
                </button>
              ))}
            </div>
            {allMissing.length > 0 && (
              <div className="packageMissingPanel">
                <b>Complete source data</b>
                {allMissing.map((item) => (
                  <a key={item} href={`/applications/${envelope.dealer_id}?step=${sourceStep(item)}`}>
                    <TriangleAlert size={13} /><span>{item}</span><small>Edit Step {sourceStep(item)}</small>
                  </a>
                ))}
              </div>
            )}
            <div className="packageDeliveryHistory">
              <b>Delivery history</b>
              {(envelope.delivery_history ?? []).slice().reverse().map((delivery, deliveryIndex) => (
                <div key={`${delivery.at || "delivery"}-${deliveryIndex}`}>
                  <span className={`cellchip ${delivery.ok ? "c-ok" : "c-warn"}`}>{delivery.ok ? "Delivered" : "Needs attention"}</span>
                  <small>{delivery.at ? new Date(delivery.at).toLocaleString() : "Delivery attempt"}</small>
                </div>
              ))}
              {!envelope.delivery_history?.length && <small>No delivery attempts yet.</small>}
            </div>
          </aside>

          <section className="agreementPdfStage" aria-label="Populated application preview">
            {active?.preview_url ? <iframe className="agreementPdfFrame" src={active.preview_url} title={active.title} /> : (
              <div className="agreementPdfMobileFallback"><TriangleAlert size={30} /><b>Preview unavailable</b><span>Refresh the package after completing the missing source fields.</span></div>
            )}
            {envelope.documents.length > 1 && (
              <div className="packageDocumentPager">
                <button type="button" className="iconBtn" onClick={() => move(-1)} aria-label="Previous document"><ChevronLeft size={18} /></button>
                <span>{index + 1} of {envelope.documents.length}</span>
                <button type="button" className="iconBtn" onClick={() => move(1)} aria-label="Next document"><ChevronRight size={18} /></button>
              </div>
            )}
          </section>
        </div>

        <footer className="agreementReviewFooter">
          <div className="agreementReviewHash"><FileCheck2 size={17} /><span><b>Document integrity</b><small>{active?.filled_sha256 ? `SHA-256 ${active.filled_sha256.slice(0, 24)}...` : "Hash recorded when generated."}</small></span></div>
          <div className="agreementRoomPin" aria-label="Client room PIN">
            <KeyRound size={17} />
            <span><small>Client room PIN</small><b className="num">{roomAccessPending ? "Loading..." : roomAccess?.passcode ? (pinVisible ? roomAccess.passcode : "••••••") : "Not set up"}</b></span>
            {roomAccess?.passcode && <button type="button" className="iconBtn" onClick={() => setPinVisible((current) => !current)} title={pinVisible ? "Hide PIN" : "Show PIN"} aria-label={pinVisible ? "Hide PIN" : "Show PIN"}>{pinVisible ? <EyeOff size={16} /> : <Eye size={16} />}</button>}
            {roomAccess?.passcode && <button type="button" className="iconBtn" onClick={() => onCopy("room-pin", roomAccess.passcode)} title={copied === "room-pin" ? "PIN copied" : "Copy PIN"} aria-label={copied === "room-pin" ? "PIN copied" : "Copy PIN"}>{copied === "room-pin" ? <CheckCircle2 size={16} /> : <Copy size={16} />}</button>}
            {roomAccessError && <span className="agreementPinError" title={roomAccessError}>Needs attention</span>}
            <button type="button" className="btn sm" disabled={createPinPending || roomAccessPending} onClick={() => setReplacePinOpen(true)}><RefreshCw size={15} /> {hasRoomPin ? "Create new PIN" : "Set up PIN"}</button>
          </div>
          {sendResult ? (
            <div className="agreementDeliveryState">
              <div><b>{sendResult.emailed ? "Signature invitation emailed" : "Secure room created"}</b><small>{sendResult.detail || "Use the backup link and PIN only if needed."}</small></div>
              <button type="button" className="btn sm" onClick={() => onCopy("room", sendResult.url)}><Copy size={14} /> {copied === "room" ? "Link copied" : "Copy secure link"}</button>
              {sendResult.passcode && <button type="button" className="btn sm num" onClick={() => onCopy("pin", sendResult.passcode)}><Copy size={14} /> {copied === "pin" ? "PIN copied" : `PIN ${sendResult.passcode}`}</button>}
            </div>
          ) : <div className="agreementReviewInstruction"><Mail size={17} /><span><b>The rep reviews; the client signs.</b> The signing surface is available only in the client’s secure room.</span></div>}
        </footer>
      </div>
    </Drawer>
    {replacePinOpen && (
      <Modal title={hasRoomPin ? "Create a new client-room PIN?" : "Set up the client-room PIN?"} width={520} onClose={() => !createPinPending && setReplacePinOpen(false)}>
        <p style={{ marginTop: 0 }}>{hasRoomPin
          ? "The current PIN will stop working immediately. The new six-digit PIN will remain valid until it is replaced again."
          : "No recoverable PIN exists for this file. Create a six-digit PIN now; it will remain valid until a new PIN is generated."}</p>
        {createPinError && <div className="warnline mt">{createPinError}</div>}
        <div className="row mt" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" className="btn" disabled={createPinPending} onClick={() => setReplacePinOpen(false)}>{hasRoomPin ? "Keep current PIN" : "Cancel"}</button>
          <button type="button" className="btn pri" disabled={createPinPending} onClick={() => void replacePin()}>{createPinPending ? "Creating..." : hasRoomPin ? "Yes, create new PIN" : "Create PIN"}</button>
        </div>
      </Modal>
    )}
    </>
  );
}
