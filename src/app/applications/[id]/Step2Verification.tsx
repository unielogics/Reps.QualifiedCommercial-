"use client";

// Step 2 — the two authorizations, and the gate.
//
// This is the step the whole product turns on, so it is worth being precise
// about what a rep can and cannot do here. They can SEND both requests and
// chase them. They cannot complete either: the bank connection happens in the
// applicant's own browser against their own bank, and the credit inquiry is
// run from the applicant's consent page. A rep who could tick these off
// themselves would be a rep who could unlock an underwriting profile with a
// keystroke, which is precisely what the gate exists to stop.
//
// The delivery log underneath is not decoration. "Sent, unopened, two days" is
// a different conversation from "opened but abandoned", and a rep who cannot
// tell them apart chases the wrong way.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useCase } from "@/lib/useCase";
import type { BankEvidenceRead, BankUploadRequestResult } from "@/lib/repWorkflows";
import Modal from "@/components/Modal";
import StepActions from "@/components/StepActions";
import { useUploadManager } from "@/components/UploadManager";

type PlaidItem = {
  id: string;
  institution_name: string | null;
  accounts_label: string | null;
  status: string;
  error: string | null;
  last_pulled_at: string | null;
  is_primary_operating: boolean;
  statement_months: string[];
};
type PlaidState = { enabled: boolean; environment: string; items: PlaidItem[] };

type Owner = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  ownership_pct: number | null;
  is_primary: boolean;
  credit_score: number | null;
  credit_tier: string | null;
  credit_pulled_at: string | null;
  invite_sent_at: string | null;
  invite_opened_at: string | null;
  credit_required: boolean;
  credit_complete: boolean;
  credit_contact_complete: boolean;
  credit_workflow_status: string | null;
  credit_delivery_detail: string | null;
  credit_provider_error_category: string | null;
};

type CreditInviteResult = {
  owner_id?: string;
  owner_name?: string;
  path?: string | null;
  detail?: string | null;
  delivered?: boolean;
};

type DeliveryRow = {
  kind: string;
  request: string;
  channel: string;
  recipient: string;
  status: string;
  at: string;
  detail: string;
};

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function validPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function maskEmail(value: string | null): string {
  if (!value || !value.includes("@")) return "Email missing";
  const [name, domain] = value.split("@");
  return `${name.slice(0, 2)}${"•".repeat(Math.max(2, Math.min(6, name.length - 2)))}@${domain}`;
}

function maskPhone(value: string | null): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? `••• ••• ${digits.slice(-4)}` : "Phone missing";
}

function statusTone(s: string): string {
  if (s === "Completed") return "c-ok";
  if (s === "Opened") return "c-acc";
  if (s === "Failed") return "c-bad";
  return "c-mut";
}

/** A score band rather than the exact figure, which is what a soft inquiry returns. */
function band(score: number | null): string {
  if (score === null) return "Pending";
  const lo = Math.floor(score / 30) * 30;
  return `${lo}–${lo + 29}`;
}

function IconTile({ tone, children }: { tone: "ok" | "warn"; children: React.ReactNode }) {
  const map = {
    ok: ["var(--ok-tint)", "var(--ok)"],
    warn: ["var(--warn-tint)", "var(--warn)"],
  } as const;
  const [bg, color] = map[tone];
  return (
    <span
      style={{
        width: 26,
        height: 26,
        borderRadius: 8,
        background: bg,
        color,
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

export default function Step2Verification({ dealerId }: { dealerId: string }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const { dealer, verification } = useCase(dealerId);
  const { uploads, enqueueStatements } = useUploadManager();
  const uploadInput = useRef<HTMLInputElement | null>(null);
  const [modal, setModal] = useState<null | "bank" | "upload" | "credit">(null);
  const [creditOwnerId, setCreditOwnerId] = useState<string | null>(null);
  const [alsoText, setAlsoText] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [creditLinks, setCreditLinks] = useState<Record<string, string>>({});
  const [deliveryEmail, setDeliveryEmail] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const authReady = isLoaded && Boolean(isSignedIn);
  const statementUploads = uploads.filter((item) => item.dealerId === dealerId);

  // Rotation, not retrieval: the stored code is a hash and can never be shown
  // again, so "show me the code" always means "mint a new one". The old code
  // stops working the moment this returns — which is also the recovery when a
  // code has leaked.
  const rotateCode = useMutation({
    mutationFn: async () =>
      api<{ passcode: string | null }>(`/dealer-os/dealers/${dealerId}/room/access-code`, {
        method: "POST",
        authToken: (await getToken()) ?? undefined,
      }),
    onSuccess: (r) => setAccessCode(r.passcode ?? null),
  });

  const plaid = useQuery({
    queryKey: ["plaid", dealerId],
    enabled: authReady,
    queryFn: async () =>
      api<PlaidState>(`/dealer-os/dealers/${dealerId}/plaid`, {
        authToken: (await getToken()) ?? undefined,
      }),
  });

  const evidence = useQuery({
    queryKey: ["bank-evidence", dealerId],
    enabled: authReady,
    queryFn: async () =>
      api<BankEvidenceRead>(`/dealer-os/dealers/${dealerId}/bank-evidence`, {
        authToken: (await getToken()) ?? undefined,
      }),
  });

  const owners = useQuery({
    queryKey: ["owners", dealerId],
    enabled: authReady,
    queryFn: async () =>
      api<Owner[]>(`/dealer-os/dealers/${dealerId}/owners`, {
        authToken: (await getToken()) ?? undefined,
      }),
  });

  const log = useQuery({
    queryKey: ["delivery-log", dealerId],
    enabled: authReady,
    queryFn: async () =>
      api<DeliveryRow[]>(`/dealer-os/dealers/${dealerId}/delivery-log`, {
        authToken: (await getToken()) ?? undefined,
      }),
  });

  const ownerRows = owners.data ?? [];
  const requiredOwners = ownerRows.filter((owner) => owner.credit_required);
  const creditOwner = ownerRows.find((owner) => owner.id === creditOwnerId) ?? null;
  const activeBanks = (plaid.data?.items ?? []).filter((item) => item.status !== "removed");

  useEffect(() => {
    if (!modal) return;
    if (modal === "credit") {
      setDeliveryEmail(creditOwner?.email ?? "");
      setDeliveryPhone(creditOwner?.phone ?? "");
    } else {
      setDeliveryEmail(dealer?.email ?? "");
      setDeliveryPhone(dealer?.phone ?? "");
    }
    setDeliveryError(null);
  }, [creditOwner, dealer?.email, dealer?.phone, modal]);

  const persistDeliveryContact = async (ownerId?: string) => {
    const email = deliveryEmail.trim().toLowerCase();
    const phone = deliveryPhone.trim();
    if (!validEmail(email)) throw new Error("Enter a valid personal email address before sending.");
    if (ownerId && !validPhone(phone)) throw new Error("Enter a valid personal mobile number before sending.");
    const token = (await getToken()) ?? undefined;
    if (ownerId) {
      await api(`/dealer-os/dealers/${dealerId}/owners/${ownerId}`, {
        method: "PATCH",
        body: JSON.stringify({ email, phone }),
        authToken: token,
      });
      await qc.invalidateQueries({ queryKey: ["owners", dealerId] });
      return;
    }
    await api(`/dealer-os/dealers/${dealerId}`, {
      method: "PATCH",
      body: JSON.stringify({ email, phone: phone || null }),
      authToken: token,
    });
    await qc.invalidateQueries({ queryKey: ["dealer", dealerId] });
  };

  const send = useMutation({
    mutationFn: async (request: { kind: "bank" } | { kind: "credit"; ownerId: string }) => {
      await persistDeliveryContact(request.kind === "credit" ? request.ownerId : undefined);
      const token = (await getToken()) ?? undefined;
      const channel = alsoText ? "sms" : "email";
      if (request.kind === "bank") {
        return api<{ detail: string | null; emailed: boolean; texted: boolean }>(
          `/dealer-os/dealers/${dealerId}/bank-connect-invite`,
          { method: "POST", body: JSON.stringify({ channel }), authToken: token },
        );
      }
      return api<CreditInviteResult>(
        `/dealer-os/dealers/${dealerId}/owners/${request.ownerId}/credit-invite`,
        { method: "POST", body: JSON.stringify({ channel: alsoText ? "sms" : "email" }), authToken: token },
      );
    },
    onSuccess: (r, request) => {
      setDeliveryError(null);
      setModal(null);
      setSent((r as { detail?: string | null })?.detail ?? "Sent.");
      if (request.kind === "credit" && (r as CreditInviteResult).path) {
        setCreditLinks((current) => ({ ...current, [request.ownerId]: (r as CreditInviteResult).path! }));
      }
      const code = (r as { passcode?: string | null })?.passcode;
      if (code) setAccessCode(code);
      void qc.invalidateQueries({ queryKey: ["delivery-log", dealerId] });
      void qc.invalidateQueries({ queryKey: ["owners", dealerId] });
      void qc.invalidateQueries({ queryKey: ["bank-evidence", dealerId] });
    },
    onError: (error) => setDeliveryError(error instanceof Error ? error.message : "That authorization could not be sent."),
  });

  const sendAllCredit = useMutation({
    mutationFn: async () =>
      api<{ items: CreditInviteResult[] }>(
        `/dealer-os/dealers/${dealerId}/owners/credit-invites`,
        {
          method: "POST",
          body: JSON.stringify({ channel: alsoText ? "sms" : "email" }),
          authToken: (await getToken()) ?? undefined,
        },
      ),
    onSuccess: (result) => {
      const links: Record<string, string> = {};
      result.items.forEach((item) => {
        if (item.owner_id && item.path) links[item.owner_id] = item.path;
      });
      setCreditLinks((current) => ({ ...current, ...links }));
      setSent(`${result.items.filter((item) => item.delivered).length} authorization email(s) sent.`);
      void qc.invalidateQueries({ queryKey: ["owners", dealerId] });
      void qc.invalidateQueries({ queryKey: ["delivery-log", dealerId] });
    },
  });

  const setPrimaryBank = useMutation({
    mutationFn: async (itemId: string) =>
      api(`/dealer-os/dealers/${dealerId}/plaid/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ is_primary_operating: true }),
        authToken: (await getToken()) ?? undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["plaid", dealerId] });
      void qc.invalidateQueries({ queryKey: ["decision", dealerId] });
    },
  });

  const requestUpload = useMutation({
    mutationFn: async () => {
      await persistDeliveryContact();
      return api<BankUploadRequestResult>(`/dealer-os/dealers/${dealerId}/bank-upload-request`, {
        method: "POST",
        body: JSON.stringify({ channel: alsoText ? "sms" : "email" }),
        authToken: (await getToken()) ?? undefined,
      });
    },
    onSuccess: (r) => {
      setModal(null);
      setSent(r.detail ?? "Statement upload request sent.");
      if (r.passcode) setAccessCode(r.passcode);
      void qc.invalidateQueries({ queryKey: ["delivery-log", dealerId] });
      void qc.invalidateQueries({ queryKey: ["bank-evidence", dealerId] });
    },
    onError: (error) => setDeliveryError(error instanceof Error ? error.message : "The upload request could not be sent."),
  });

  const evidenceData = evidence.data;
  const bankSource = evidenceData?.bank_source ?? verification.bank_source;
  const statementMonths = evidenceData?.statement_months ?? verification.statement_months;
  const missingStatementMonths =
    evidenceData?.missing_statement_months ?? verification.missing_statement_months;
  const bankLinked = evidenceData?.bank_linked ?? verification.bank_linked;
  const handleFiles = (list: FileList | File[]) => {
    const files = Array.from(list).filter((file) => file.size > 0);
    if (!files.length) return;
    enqueueStatements(dealerId, files, dealer?.legal_name ?? undefined);
    setSent(`${files.length} file${files.length === 1 ? "" : "s"} queued. You can continue while extraction runs.`);
  };

  const bankTone = bankLinked ? "c-ok" : "c-warn";
  const creditTone = verification.credit_returned ? "c-ok" : "c-warn";
  const kv: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 12,
  };
  const modalError = modal === "upload" ? requestUpload.error : send.error;
  const modalIsError = modal === "upload" ? requestUpload.isError : send.isError;
  const modalPending = modal === "upload" ? requestUpload.isPending : send.isPending;

  return (
    <>
      <div className="panel">
        <div className="panel-h">
          Step 2 · Verification
          <span style={{ flex: 1 }} />
          <span className={`cellchip ${verification.unlocked ? "c-ok" : "c-warn"}`}>
            {verification.reason}
          </span>
        </div>
        <div className="panel-b">
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            Two authorizations are required before the credit application opens: bank evidence
            through Plaid or uploaded statements, and a soft credit inquiry. Each client request
            is sent from this screen, by email or SMS, and returns to this case automatically.
          </p>
          <span className="sub" style={{ display: "block", marginTop: 8 }}>
            A soft inquiry does not affect the applicant&apos;s credit score. Delivery, opening
            and completion are timestamped in the audit trail.
          </span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          Room access code
          <span style={{ flex: 1 }} />
          <span className="sub">One code for everything the client does</span>
        </div>
        <div className="panel-b">
          <div className="row" style={{ alignItems: "center", gap: 12 }}>
            {accessCode ? (
              <b
                className="num"
                style={{
                  fontFamily: "var(--fh)",
                  fontSize: 22,
                  letterSpacing: "0.08em",
                  color: "var(--accent)",
                }}
              >
                {accessCode}
              </b>
            ) : (
              <span className="sub">
                The code is stored only as a hash and cannot be looked up. Mint one and read it
                to the client; it opens their room, the bank connection, the credit
                authorization and signing.
              </span>
            )}
            <span style={{ flex: 1 }} />
            <button
              type="button"
              className="btn sm"
              disabled={rotateCode.isPending}
              onClick={() => rotateCode.mutate()}
            >
              {rotateCode.isPending ? "Minting…" : accessCode ? "New code" : "Show a new access code"}
            </button>
          </div>
          {accessCode && (
            <span className="sub" style={{ display: "block", marginTop: 8 }}>
              Read it to the client now. Minting a new code invalidates this one, and it is not
              shown again after you leave this screen.
            </span>
          )}
          {rotateCode.isError && (
            <div className="note">
              <div>Could not mint a code. Try again.</div>
            </div>
          )}
        </div>
      </div>

      <div className={`panel${verification.bank_linked ? "" : " panel-invalid"}`}>
        <div className="panel-h">
          <IconTile tone={verification.bank_linked ? "ok" : "warn"}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 10l9-6 9 6M5 10v9h14v-9M9 19v-6h6v6" />
            </svg>
          </IconTile>
          Bank evidence
          <span style={{ flex: 1 }} />
          <span className={`cellchip ${bankTone}`}>
            {bankLinked
              ? bankSource === "upload"
                ? "Uploaded statements"
                : "Connected"
              : "Awaiting applicant"}
          </span>
        </div>
        <div className="panel-b">
          <div style={kv}>
            <div>
              <span className="lbl">Connected institutions</span>
              <b className="num" style={{ display: "block" }}>{activeBanks.length}</b>
            </div>
            <div>
              <span className="lbl">Evidence source</span>
              <b className="num" style={{ display: "block" }}>
                {bankSource === "upload" ? "Upload" : bankSource === "plaid" ? "Plaid" : "—"}
              </b>
            </div>
            <div>
              <span className="lbl">Statement coverage</span>
              <b className="num" style={{ display: "block" }}>
                {statementMonths.length
                  ? `${statementMonths.length} month${statementMonths.length === 1 ? "" : "s"}`
                  : "—"}
              </b>
            </div>
          </div>
          {activeBanks.length > 0 && (
            <div style={{ display: "grid", gap: 9, marginTop: 14 }}>
              {activeBanks.map((bank) => (
                <div
                  key={bank.id}
                  className="row"
                  style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12, alignItems: "center" }}
                >
                  <div>
                    <b>{bank.institution_name || "Connected institution"}</b>
                    <span className="sub" style={{ display: "block", marginTop: 3 }}>
                      {bank.accounts_label || "Account labels syncing"} · {bank.statement_months.length} statement month{bank.statement_months.length === 1 ? "" : "s"}
                    </span>
                    {bank.error && <span className="sub" style={{ color: "var(--bad)", display: "block" }}>{bank.error}</span>}
                  </div>
                  <span style={{ flex: 1 }} />
                  <span className={`cellchip ${bank.status === "active" ? "c-ok" : "c-warn"}`}>{bank.status}</span>
                  {bank.is_primary_operating ? (
                    <span className="cellchip c-acc">Main operating bank</span>
                  ) : (
                    <button type="button" className="btn" disabled={setPrimaryBank.isPending} onClick={() => setPrimaryBank.mutate(bank.id)}>
                      Set as main
                    </button>
                  )}
                  <span className="sub">{when(bank.last_pulled_at)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="row mt">
            <button type="button" className="btn pri" onClick={() => setModal("bank")}>
              {activeBanks.length ? "Connect another bank" : "Send bank connection request"}
            </button>
            <button type="button" className="btn" onClick={() => setModal("upload")}>
              Request statement upload
            </button>
            <button
              type="button"
              className="btn"
              disabled={send.isPending}
              onClick={() => send.mutate({ kind: "bank" })}
            >
              Resend Plaid
            </button>
          </div>
          <div
            className={`dropzone mt${dragging ? " drag" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => uploadInput.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") uploadInput.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFiles(e.dataTransfer.files);
            }}
            style={{ padding: 22 }}
          >
            <input
              ref={uploadInput}
              type="file"
              multiple
              accept=".pdf,.csv,.xlsx,.xls,image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />
            <b>Drop bank statements here</b>
            <span className="sub" style={{ display: "block", marginTop: 5 }}>
              PDF, CSV, or spreadsheet. Upload begins immediately and each file is tracked below.
            </span>
          </div>
          {statementUploads.length > 0 && (
            <div className="uploadTray mt" aria-live="polite">
              {statementUploads.map((item) => (
                <div className={`uploadTrayRow ${item.status}`} key={item.id} title={item.error}>
                  <span className="uploadState" aria-hidden />
                  <b>{item.filename}</b>
                  <span>
                    {item.status === "uploading"
                      ? "Uploading"
                      : item.status === "extracting"
                        ? "Extracting"
                      : item.status === "complete"
                        ? "Added to file"
                        : item.status === "failed"
                          ? item.error || "Failed"
                          : "Queued"}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="row mt" style={{ gap: 8 }}>
            {statementMonths.slice(-6).map((month) => (
              <span key={month} className="cellchip c-ok">
                {month}
              </span>
            ))}
            {missingStatementMonths.map((month) => (
              <span key={month} className="cellchip c-warn">
                Missing {month}
              </span>
            ))}
            {!statementMonths.length && !missingStatementMonths.length && (
              <span className="sub">No uploaded statement coverage has been extracted yet.</span>
            )}
          </div>
          {evidenceData?.upload_url && (
            <span className="sub" style={{ display: "block", marginTop: 8 }}>
              Client room:{" "}
              <a href={evidenceData.upload_url} target="_blank" rel="noreferrer">
                open upload room
              </a>
            </span>
          )}
          {requestUpload.isError && (
            <div className="note">
              <div>
                {requestUpload.error instanceof Error
                  ? requestUpload.error.message
                  : "Could not send the upload request."}
              </div>
            </div>
          )}
          {plaid.data && !plaid.data.enabled && (
            <span className="sub" style={{ display: "block", marginTop: 8 }}>
              Plaid connections are not switched on yet. Use statement upload in the meantime;
              the upload path satisfies the same bank gate once six current months extract.
            </span>
          )}
        </div>
      </div>

      <div className={`panel${verification.credit_returned ? "" : " panel-invalid"}`}>
        <div className="panel-h">
          <IconTile tone={verification.credit_returned ? "ok" : "warn"}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 7h18v10H3zM3 11h18M7 15h4" />
            </svg>
          </IconTile>
          Credit authorization · soft inquiry
          <span style={{ flex: 1 }} />
          <span className={`cellchip ${creditTone}`}>
            {verification.credit_returned ? "Returned" : "Awaiting applicant"}
          </span>
        </div>
        <div className="panel-b">
          <div className="row" style={{ alignItems: "center" }}>
            <div>
              <b className="num">
                {verification.completed_credit_owner_count} of {verification.required_credit_owner_count} required owners completed
              </b>
              <span className="sub" style={{ display: "block", marginTop: 3 }}>
                Ownership: {verification.ownership_total.toFixed(2)}% {verification.ownership_complete ? "allocated" : "· complete Step 1 before sending"}
              </span>
            </div>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              className="btn pri"
              disabled={!verification.ownership_complete || !verification.owner_contact_complete || !requiredOwners.length || !verification.credit_enabled || sendAllCredit.isPending}
              onClick={() => sendAllCredit.mutate()}
            >
              Send all pending authorizations
            </button>
          </div>
          <div style={{ display: "grid", gap: 9, marginTop: 14 }}>
            {requiredOwners.map((owner) => {
              const workflowStatus = owner.credit_workflow_status ?? "";
              const failureStatus = ["delivery_failed", "provider_unavailable", "declined", "failed"].includes(workflowStatus);
              const state = owner.credit_complete
                ? `Completed ${when(owner.credit_pulled_at)}`
                : workflowStatus === "provider_unavailable"
                  ? "Provider unavailable"
                  : workflowStatus === "delivery_failed"
                    ? "Delivery failed"
                    : workflowStatus === "declined"
                      ? "Declined"
                      : workflowStatus === "failed"
                        ? "Failed"
                        : owner.invite_opened_at
                          ? `Opened ${when(owner.invite_opened_at)}`
                          : owner.invite_sent_at
                            ? `Sent ${when(owner.invite_sent_at)}`
                            : workflowStatus === "link_created"
                              ? "Link created"
                              : "Not sent";
              const path = creditLinks[owner.id];
              return (
                <div key={owner.id} className={`row requirement-row${owner.credit_complete ? "" : " invalid"}`} style={{ alignItems: "center" }}>
                  <div>
                    <b>{owner.full_name}</b>
                    <span className="sub" style={{ display: "block", marginTop: 3 }}>
                      {Number(owner.ownership_pct ?? 0).toFixed(2)}% owner
                    </span>
                    <span className="sub" style={{ display: "block", marginTop: 3 }}>
                      {maskEmail(owner.email)} · {maskPhone(owner.phone)}
                    </span>
                    {failureStatus && owner.credit_delivery_detail && (
                      <span className="validation-hint" style={{ display: "block", marginTop: 5 }}>
                        {owner.credit_delivery_detail}
                      </span>
                    )}
                  </div>
                  <span style={{ flex: 1 }} />
                  <span className={`cellchip ${owner.credit_complete ? "c-ok" : "c-warn"}`}>iSoftPull required</span>
                  <span className={`cellchip ${owner.credit_complete ? "c-ok" : failureStatus ? "c-bad" : "c-warn"}`}>{state}</span>
                  {!owner.credit_complete && (
                    <button type="button" className="btn" disabled={!verification.ownership_complete || !owner.credit_contact_complete || send.isPending} onClick={() => { setCreditOwnerId(owner.id); setModal("credit"); }}>
                      {owner.invite_sent_at ? "Resend" : "Send"}
                    </button>
                  )}
                  {path && (
                    <button type="button" className="btn" onClick={() => void navigator.clipboard.writeText(`https://audit.qualifiedcommercial.com${path}`)}>
                      Copy secure link
                    </button>
                  )}
                  {owner.credit_complete && <b className="num">{band(owner.credit_score)}</b>}
                </div>
              );
            })}
          </div>
          {!requiredOwners.length && (
            <span className="sub" style={{ display: "block", marginTop: 8 }}>
              No 20%+ owners are ready for credit. Complete the ownership schedule in Step 1.
            </span>
          )}
          {sendAllCredit.isError && <div className="note"><div>{sendAllCredit.error instanceof Error ? sendAllCredit.error.message : "The authorizations could not be sent."}</div></div>}
          {!verification.credit_enabled && (
            <div className="note">
              <div>
                <b>Credit pulls are not switched on yet.</b> The bureau connection has no
                credentials, so an authorization sent now would fail for the applicant after
                they had already entered their details and consented. Everything else on this
                file works; this one is waiting on configuration.
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">Delivery log</div>
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Request</th>
                <th>Channel</th>
                <th>Recipient</th>
                <th>Status</th>
                <th className="r">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {(log.data ?? []).map((r, i) => (
                <tr key={`${r.kind}-${r.at}-${i}`}>
                  <td>
                    <b>{r.request}</b>
                  </td>
                  <td className="sub">{r.channel}</td>
                  <td className="sub">{r.recipient}</td>
                  <td>
                    <span className={`cellchip ${statusTone(r.status)}`}>{r.status}</span>
                  </td>
                  <td className="r sub num">{when(r.at)}</td>
                </tr>
              ))}
              {log.data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="sub">
                    Nothing has been sent to this applicant yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {sent && (
        <div className="note">
          <div>{sent}</div>
        </div>
      )}

      <StepActions
        ready={verification.unlocked}
        message={
          !verification.bank_linked
            ? "Bank evidence is still required. Connect a bank or upload six complete statement months."
            : !verification.credit_returned
              ? `${verification.completed_credit_owner_count} of ${verification.required_credit_owner_count} required owners completed their iSoftPull.`
              : "Verification is complete. Continue to the financial profile."
        }
        buttonLabel="Continue to Step 3"
        onContinue={() => router.push(`/applications/${dealerId}?step=3`)}
      />

      {modal && (
        <Modal
          title={
            modal === "bank"
              ? "Send Plaid connection request"
              : modal === "upload"
                ? "Request statement upload"
                : "Send credit authorization"
          }
          onClose={() => setModal(null)}
        >
          <p className="sub" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
            {modal === "bank"
              ? "The applicant opens a Plaid connection and grants read-only access to the operating account. No credentials pass through Qualified Commercial."
              : modal === "upload"
                ? "The applicant opens the secure room and uploads the last six completed months of business bank statements to the linked bucket."
              : "The applicant authorizes a soft credit inquiry. It does not affect their score and returns a band rather than an exact figure."}
          </p>

          <div className="deliveryEditor mt">
            <label>
              <span className="lbl">{modal === "credit" ? "Personal email" : "Applicant email"}</span>
              <input
                className={`field${deliveryEmail && !validEmail(deliveryEmail) ? " invalid" : ""}`}
                type="email"
                value={deliveryEmail}
                autoComplete="email"
                onChange={(event) => { setDeliveryEmail(event.target.value); setDeliveryError(null); }}
              />
            </label>
            <label>
              <span className="lbl">{modal === "credit" ? "Personal mobile" : "Applicant mobile"}</span>
              <input
                className={`field${modal === "credit" && deliveryPhone && !validPhone(deliveryPhone) ? " invalid" : ""}`}
                type="tel"
                value={deliveryPhone}
                autoComplete="tel"
                onChange={(event) => { setDeliveryPhone(event.target.value); setDeliveryError(null); }}
              />
            </label>
          </div>
          <span className="sub" style={{ display: "block", marginTop: 6 }}>
            Corrections save to this {modal === "credit" ? "owner" : "application"} before the secure link is sent.
          </span>

          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={alsoText} onChange={(e) => setAlsoText(e.target.checked)} />
            <span className="sub">Also text the secure link when this number has consented</span>
          </label>
          <span className="sub" style={{ display: "block", marginTop: 4 }}>
            The email is always sent. SMS is added only when the exact personal number has active transactional consent.
          </span>

          <div className="note">
            <div>
              {modal === "bank"
                ? "Delivery and completion are timestamped in the audit trail. The link can be reissued from this panel at any time."
                : modal === "upload"
                  ? "A checklist item is added to the client room. Uploaded files are mirrored into the bucket and ingested into the same financial pipeline."
                : "The disclosure text shown to the applicant is served and stored by the system, so the record matches exactly what they saw."}
            </div>
          </div>

          {modalIsError && (
            <div className="note">
              <div>
                {modalError instanceof Error
                  ? modalError.message
                  : "That did not send."}
              </div>
            </div>
          )}
          {deliveryError && !modalIsError && (
            <div className="documentError" style={{ margin: "12px 0 0" }}>{deliveryError}</div>
          )}

          <div className="row mt" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn pri"
              disabled={modalPending || !validEmail(deliveryEmail) || (modal === "credit" && !validPhone(deliveryPhone))}
              onClick={() => {
                if (modal === "upload") requestUpload.mutate();
                else if (modal === "bank") send.mutate({ kind: "bank" });
                else if (modal === "credit" && creditOwner) send.mutate({ kind: "credit", ownerId: creditOwner.id });
              }}
            >
              {modalPending
                ? "Sending…"
                : modal === "bank"
                  ? "Send Plaid link"
                  : modal === "upload"
                    ? "Send upload request"
                    : "Send authorization"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
