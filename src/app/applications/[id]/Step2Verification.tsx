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

import { useRef, useState, type CSSProperties } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiUpload } from "@/lib/api";
import { useCase } from "@/lib/useCase";
import type { BankEvidenceRead, BankUploadRequestResult } from "@/lib/repWorkflows";
import Modal from "@/components/Modal";

type PlaidItem = {
  id: string;
  institution_name: string | null;
  status: string;
  last_synced_at: string | null;
};
type PlaidState = { enabled: boolean; environment: string; items: PlaidItem[] };

type Owner = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  credit_score: number | null;
  credit_tier: string | null;
  credit_pulled_at: string | null;
  invite_sent_at: string | null;
  invite_opened_at: string | null;
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

type DocumentRead = {
  id: string;
  filename: string;
  kind: string;
  status: string;
};

function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const { dealer, verification } = useCase(dealerId);
  const uploadInput = useRef<HTMLInputElement | null>(null);
  const [modal, setModal] = useState<null | "bank" | "upload" | "credit">(null);
  const [alsoText, setAlsoText] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

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
    queryFn: async () =>
      api<PlaidState>(`/dealer-os/dealers/${dealerId}/plaid`, {
        authToken: (await getToken()) ?? undefined,
      }),
  });

  const evidence = useQuery({
    queryKey: ["bank-evidence", dealerId],
    queryFn: async () =>
      api<BankEvidenceRead>(`/dealer-os/dealers/${dealerId}/bank-evidence`, {
        authToken: (await getToken()) ?? undefined,
      }),
  });

  const owners = useQuery({
    queryKey: ["owners", dealerId],
    queryFn: async () =>
      api<Owner[]>(`/dealer-os/dealers/${dealerId}/owners`, {
        authToken: (await getToken()) ?? undefined,
      }),
  });

  const log = useQuery({
    queryKey: ["delivery-log", dealerId],
    queryFn: async () =>
      api<DeliveryRow[]>(`/dealer-os/dealers/${dealerId}/delivery-log`, {
        authToken: (await getToken()) ?? undefined,
      }),
  });

  const owner = owners.data?.find((o) => o.is_primary) ?? owners.data?.[0];
  const item = plaid.data?.items.find((i) => i.status === "active") ?? plaid.data?.items[0];

  const send = useMutation({
    mutationFn: async (kind: "bank" | "credit") => {
      const token = (await getToken()) ?? undefined;
      const channel = alsoText ? "sms" : "email";
      if (kind === "bank") {
        return api<{ detail: string | null; emailed: boolean; texted: boolean }>(
          `/dealer-os/dealers/${dealerId}/bank-connect-invite`,
          { method: "POST", body: JSON.stringify({ channel }), authToken: token },
        );
      }
      if (!owner) throw new Error("No principal on the file to authorize a credit inquiry.");
      return api<{ detail?: string | null }>(
        `/dealer-os/dealers/${dealerId}/owners/${owner.id}/credit-invite`,
        { method: "POST", body: JSON.stringify({ channel }), authToken: token },
      );
    },
    onSuccess: (r) => {
      setModal(null);
      setSent((r as { detail?: string | null })?.detail ?? "Sent.");
      const code = (r as { passcode?: string | null })?.passcode;
      if (code) setAccessCode(code);
      void qc.invalidateQueries({ queryKey: ["delivery-log", dealerId] });
      void qc.invalidateQueries({ queryKey: ["owners", dealerId] });
      void qc.invalidateQueries({ queryKey: ["bank-evidence", dealerId] });
    },
  });

  const requestUpload = useMutation({
    mutationFn: async () =>
      api<BankUploadRequestResult>(`/dealer-os/dealers/${dealerId}/bank-upload-request`, {
        method: "POST",
        body: JSON.stringify({ channel: alsoText ? "sms" : "email" }),
        authToken: (await getToken()) ?? undefined,
      }),
    onSuccess: (r) => {
      setModal(null);
      setSent(r.detail ?? "Statement upload request sent.");
      if (r.passcode) setAccessCode(r.passcode);
      void qc.invalidateQueries({ queryKey: ["delivery-log", dealerId] });
      void qc.invalidateQueries({ queryKey: ["bank-evidence", dealerId] });
    },
  });

  const uploadStatements = useMutation({
    mutationFn: async (files: File[]) => {
      const token = (await getToken()) ?? undefined;
      const uploaded: DocumentRead[] = [];
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        form.append("kind", "statement");
        uploaded.push(
          await apiUpload<DocumentRead>(`/dealer-os/dealers/${dealerId}/documents`, form, {
            authToken: token,
          }),
        );
      }
      return uploaded;
    },
    onSuccess: (docs) => {
      setSent(
        docs.length === 1
          ? `${docs[0]?.filename ?? "Statement"} uploaded and sent to extraction.`
          : `${docs.length} statements uploaded and sent to extraction.`,
      );
      void qc.invalidateQueries({ queryKey: ["bank-evidence", dealerId] });
      void qc.invalidateQueries({ queryKey: ["delivery-log", dealerId] });
      void qc.invalidateQueries({ queryKey: ["decision", dealerId] });
    },
  });

  const evidenceData = evidence.data;
  const bankSource = evidenceData?.bank_source ?? verification.bank_source;
  const statementMonths = evidenceData?.statement_months ?? verification.statement_months;
  const missingStatementMonths =
    evidenceData?.missing_statement_months ?? verification.missing_statement_months;
  const bankLinked = evidenceData?.bank_linked ?? verification.bank_linked;
  const handleFiles = (list: FileList | File[]) => {
    const files = Array.from(list).filter((file) => file.size > 0);
    if (files.length) uploadStatements.mutate(files);
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

      <div className="panel">
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
              <span className="lbl">Plaid institution</span>
              <b style={{ display: "block" }}>{item?.institution_name ?? "—"}</b>
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
          <div className="row mt">
            <button type="button" className="btn pri" onClick={() => setModal("bank")}>
              Connect with Plaid
            </button>
            <button type="button" className="btn" onClick={() => setModal("upload")}>
              Request statement upload
            </button>
            <button
              type="button"
              className="btn"
              disabled={send.isPending}
              onClick={() => send.mutate("bank")}
            >
              Resend Plaid
            </button>
            <span style={{ flex: 1 }} />
            <span className="sub">{when(item?.last_synced_at)}</span>
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
              Agent uploads are stored on the file, mirrored into the linked bucket, and sent
              through extraction as statements.
            </span>
            {uploadStatements.isPending && (
              <span className="sub" style={{ display: "block", marginTop: 8 }}>
                Uploading and extracting statements…
              </span>
            )}
          </div>
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
          {uploadStatements.isError && (
            <div className="note">
              <div>
                {uploadStatements.error instanceof Error
                  ? uploadStatements.error.message
                  : "Could not upload those statements."}
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

      <div className="panel">
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
          <div style={kv}>
            <div>
              <span className="lbl">Bureau</span>
              <b style={{ display: "block" }}>{owner?.credit_pulled_at ? "Experian" : "—"}</b>
            </div>
            <div>
              <span className="lbl">Score band</span>
              <b className="num" style={{ display: "block" }}>{band(owner?.credit_score ?? null)}</b>
            </div>
            <div>
              <span className="lbl">Inquiry type</span>
              <b style={{ display: "block" }}>Soft</b>
            </div>
          </div>
          <div className="row mt">
            <button
              type="button"
              className="btn pri"
              disabled={!owner || !verification.credit_enabled}
              onClick={() => setModal("credit")}
            >
              Send credit authorization
            </button>
            <button
              type="button"
              className="btn"
              disabled={!owner || !verification.credit_enabled || send.isPending}
              onClick={() => send.mutate("credit")}
            >
              Resend
            </button>
            <span style={{ flex: 1 }} />
            <span className="sub">
              {owner?.credit_pulled_at
                ? `Returned ${when(owner.credit_pulled_at)}`
                : owner?.invite_opened_at
                  ? `Opened ${when(owner.invite_opened_at)}, not completed`
                  : owner?.invite_sent_at
                    ? `Sent ${when(owner.invite_sent_at)} · unopened`
                    : "Not sent"}
            </span>
          </div>
          {!owner && (
            <span className="sub" style={{ display: "block", marginTop: 8 }}>
              A credit inquiry is authorized by a named person, so add the principal in step 1
              first.
            </span>
          )}
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

          <span className="lbl mt" style={{ display: "block" }}>
            Send to
          </span>
          <div className="kv">
            <span>Email</span>
            <b>{owner?.email || dealer?.email || "none on file"}</b>
          </div>
          <div className="kv">
            <span>Mobile</span>
            <b className="num">{owner?.phone || dealer?.phone || "none on file"}</b>
          </div>

          <label
            style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={alsoText}
              onChange={(e) => setAlsoText(e.target.checked)}
            />
            <span className="sub">Text them as well</span>
          </label>
          <span className="sub" style={{ display: "block", marginTop: 4 }}>
            The email goes either way. A text only goes if this number has opted in.
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

          <div className="row mt" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn pri"
              disabled={modalPending}
              onClick={() => {
                if (modal === "upload") requestUpload.mutate();
                else if (modal === "bank" || modal === "credit") send.mutate(modal);
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
