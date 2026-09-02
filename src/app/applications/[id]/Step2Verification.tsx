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
import { Check, Copy, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useCase } from "@/lib/useCase";
import { useMe } from "@/lib/useMe";
import type { BankEvidenceRead, BankUploadRequestResult } from "@/lib/repWorkflows";
import Modal from "@/components/Modal";
import StepActions from "@/components/StepActions";
import { useUploadManager } from "@/components/UploadManager";
import Step4BusinessQuestions, { type BusinessQuestionGroup } from "./Step4BusinessQuestions";

type PlaidItem = {
  id: string;
  institution_name: string | null;
  accounts_label: string | null;
  status: string;
  error: string | null;
  last_pulled_at: string | null;
  is_primary_operating: boolean;
  statement_months: string[];
  products: string[];
  consented_products: string[];
  billed_products: string[];
  unavailable_products: string[];
  pending_products: string[];
  authorization_state: string;
};
type PlaidAssetReport = {
  id: string;
  status: string;
  days_requested: number;
  error: string | null;
  ready_at: string | null;
  ingested_at: string | null;
  document_id: string | null;
  created_at: string;
};
type PlaidState = {
  enabled: boolean;
  environment: string;
  items: PlaidItem[];
  assets_enabled: boolean;
  statements_enabled: boolean;
  selected_products: string[];
  available_products: string[];
  connections_requiring_client_authorization: number;
  asset_reports: PlaidAssetReport[];
};

type PlaidPolicyChange = {
  assets_enabled: boolean;
  statements_enabled: boolean;
};

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
  credit_summary: { score_band?: string | null; quality_tier?: string | null } | null;
};

type PreScreen = {
  file_answers: Record<string, unknown>;
  applicable_business_questions: BusinessQuestionGroup[];
  business_questions_complete: boolean;
  business_question_blockers: string[];
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

async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    // Older tablet browsers may expose Clipboard but reject it. Keep a
    // selection-based fallback so the rep can still copy the secure URL.
  }
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("Clipboard access was denied");
}

const CREDIT_QUALITY_LABELS = new Set([
  "Excellent",
  "Good",
  "Average",
  "Below average",
  "Bad",
  "Not fundable",
]);

function qualityFromScore(score: number | null): { tier: string; range: string } | null {
  if (score === null || !Number.isFinite(score)) return null;
  if (score >= 760 && score <= 850) return { tier: "Excellent", range: "760–850" };
  if (score >= 720) return { tier: "Good", range: "720–759" };
  if (score >= 700) return { tier: "Average", range: "700–719" };
  if (score >= 680) return { tier: "Below average", range: "680–699" };
  if (score >= 660) return { tier: "Bad", range: "660–679" };
  if (score >= 300) return { tier: "Not fundable", range: "300–659" };
  return null;
}

/** Borrower-safe credit quality. A completed pull never falls back to Pending. */
function creditQuality(owner: Owner): string {
  const computed = qualityFromScore(owner.credit_score);
  if (computed) return `${computed.tier} · ${computed.range}`;
  const providerBand = owner.credit_summary?.score_band;
  const storedTier = owner.credit_summary?.quality_tier || owner.credit_tier;
  const tier = storedTier && CREDIT_QUALITY_LABELS.has(storedTier) ? storedTier : null;
  if (tier && providerBand) return `${tier} · ${providerBand}`;
  if (tier || providerBand) return tier || `Returned · ${providerBand}`;
  return owner.credit_complete
    ? "Returned · classification unavailable"
    : "Awaiting authorization";
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
  const { dealer, verification, workflow } = useCase(dealerId);
  const { isSuperAdmin } = useMe();
  const { uploads, enqueueStatements } = useUploadManager();
  const uploadInput = useRef<HTMLInputElement | null>(null);
  const [modal, setModal] = useState<null | "bank" | "upload" | "credit">(null);
  const [creditOwnerId, setCreditOwnerId] = useState<string | null>(null);
  const [alsoText, setAlsoText] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [roomCopyState, setRoomCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [replacePinOpen, setReplacePinOpen] = useState(false);
  const [bankExceptionOpen, setBankExceptionOpen] = useState(false);
  const [bankExceptionNote, setBankExceptionNote] = useState("");
  const [creditRefreshing, setCreditRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [creditLinks, setCreditLinks] = useState<Record<string, string>>({});
  const [deliveryEmail, setDeliveryEmail] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [deliverySource, setDeliverySource] = useState("application");
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [plaidPolicyChange, setPlaidPolicyChange] = useState<PlaidPolicyChange | null>(null);
  const [plaidPolicyNote, setPlaidPolicyNote] = useState("");
  const authReady = isLoaded && Boolean(isSignedIn);
  const statementUploads = uploads.filter((item) => item.dealerId === dealerId);

  // Rotation, not retrieval: the stored code is a hash and can never be shown
  // again, so "show me the code" always means "mint a new one". The old code
  // stops working the moment this returns — which is also the recovery when a
  // code has leaked.
  const rotateCode = useMutation({
    mutationFn: async () =>
      api<{ passcode: string | null; url: string }>(`/dealer-os/dealers/${dealerId}/room/access-code`, {
        method: "POST",
        authToken: (await getToken()) ?? undefined,
      }),
    onSuccess: (r) => {
      setAccessCode(r.passcode ?? null);
      setRoomUrl(r.url);
      setRoomCopyState("idle");
      setReplacePinOpen(false);
      qc.setQueryData(["client-room", dealerId], r);
    },
  });

  const room = useQuery({
    queryKey: ["client-room", dealerId],
    enabled: authReady,
    retry: false,
    queryFn: async () =>
      api<{ passcode: null; url: string }>(`/dealer-os/dealers/${dealerId}/room`, {
        authToken: (await getToken()) ?? undefined,
      }),
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
  const creditReturned = Boolean(
    verification.credit_returned ||
      (requiredOwners.length > 0 && requiredOwners.every((owner) => owner.credit_complete)),
  );
  const creditOwner = ownerRows.find((owner) => owner.id === creditOwnerId) ?? null;
  const primaryOwner = ownerRows.find((owner) => owner.is_primary) ?? requiredOwners[0] ?? ownerRows[0] ?? null;
  const activeBanks = (plaid.data?.items ?? []).filter((item) => item.status !== "removed");
  const latestAssetReport = plaid.data?.asset_reports?.[0] ?? null;

  const refetchBankStatus = async () => {
    await Promise.all([
      plaid.refetch(),
      evidence.refetch(),
      qc.refetchQueries({ queryKey: ["decision", dealerId] }),
      log.refetch(),
    ]);
  };

  const refreshCreditStatus = async () => {
    setCreditRefreshing(true);
    try {
      await Promise.all([
        owners.refetch(),
        qc.refetchQueries({ queryKey: ["decision", dealerId] }),
        log.refetch(),
      ]);
      setSent("Credit authorization status refreshed.");
    } finally {
      setCreditRefreshing(false);
    }
  };

  useEffect(() => {
    if (!modal) return;
    if (modal === "credit") {
      setDeliveryEmail(creditOwner?.email ?? "");
      setDeliveryPhone(creditOwner?.phone ?? "");
    } else if (deliverySource === "application") {
      setDeliveryEmail(dealer?.email ?? primaryOwner?.email ?? "");
      setDeliveryPhone(dealer?.phone ?? primaryOwner?.phone ?? "");
    } else if (deliverySource.startsWith("owner:")) {
      const selectedOwner = ownerRows.find((owner) => owner.id === deliverySource.slice(6));
      setDeliveryEmail(selectedOwner?.email ?? "");
      setDeliveryPhone(selectedOwner?.phone ?? "");
    }
    setDeliveryError(null);
  }, [creditOwner, dealer?.email, dealer?.phone, deliverySource, modal, owners.data, primaryOwner?.email, primaryOwner?.phone]);

  const persistDeliveryContact = async (ownerId?: string) => {
    const email = deliveryEmail.trim().toLowerCase();
    const phone = deliveryPhone.trim();
    if (!validEmail(email)) throw new Error("Enter a valid personal email address before sending.");
    if ((ownerId || alsoText) && !validPhone(phone)) throw new Error("Enter a valid personal mobile number before sending by text.");
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
    return;
  };

  const send = useMutation({
    mutationFn: async (request: { kind: "bank" } | { kind: "credit"; ownerId: string }) => {
      await persistDeliveryContact(request.kind === "credit" ? request.ownerId : undefined);
      const token = (await getToken()) ?? undefined;
      const channel = alsoText ? "sms" : "email";
      if (request.kind === "bank") {
        return api<{ detail: string | null; emailed: boolean; texted: boolean }>(
          `/dealer-os/dealers/${dealerId}/bank-connect-invite`,
          {
            method: "POST",
            body: JSON.stringify({
              channel,
              recipient_email: deliveryEmail.trim().toLowerCase(),
              recipient_phone: deliveryPhone.trim() || null,
            }),
            authToken: token,
          },
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
      const url = (r as { url?: string | null })?.url;
      if (url) setRoomUrl(url);
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
        body: JSON.stringify({
          channel: alsoText ? "sms" : "email",
          recipient_email: deliveryEmail.trim().toLowerCase(),
          recipient_phone: deliveryPhone.trim() || null,
        }),
        authToken: (await getToken()) ?? undefined,
      });
    },
    onSuccess: (r) => {
      setModal(null);
      setSent(r.detail ?? "Statement upload request sent.");
      if (r.passcode) setAccessCode(r.passcode);
      setRoomUrl(r.url);
      void qc.invalidateQueries({ queryKey: ["delivery-log", dealerId] });
      void qc.invalidateQueries({ queryKey: ["bank-evidence", dealerId] });
    },
    onError: (error) => setDeliveryError(error instanceof Error ? error.message : "The upload request could not be sent."),
  });

  const preScreen = useQuery({
    queryKey: ["application-pre-screen", dealerId],
    enabled: authReady,
    queryFn: async () => api<PreScreen>(`/dealer-os/dealers/${dealerId}/pre-screen`, {
      authToken: (await getToken()) ?? undefined,
    }),
  });

  const refreshBank = useMutation({
    mutationFn: async () => {
      if (!activeBanks.length) return { queued: 0 };
      return api<{ queued: number }>(`/dealer-os/dealers/${dealerId}/plaid/refresh`, {
        method: "POST",
        authToken: (await getToken()) ?? undefined,
      });
    },
    onSuccess: async (result) => {
      await refetchBankStatus();
      setSent(
        result.queued
          ? `Bank refresh queued for ${result.queued} connected institution${result.queued === 1 ? "" : "s"}.`
          : "Bank evidence status refreshed.",
      );
      window.setTimeout(() => void refetchBankStatus(), 4000);
    },
  });

  const updatePlaidPolicy = useMutation({
    mutationFn: async (next: PlaidPolicyChange) =>
      api<PlaidState>(`/dealer-os/dealers/${dealerId}/plaid/settings`, {
        method: "PATCH",
        body: JSON.stringify({
          ...next,
          acknowledged: true,
          note: plaidPolicyNote.trim() || null,
        }),
        authToken: (await getToken()) ?? undefined,
      }),
    onSuccess: async (next) => {
      qc.setQueryData(["plaid", dealerId], next);
      setPlaidPolicyChange(null);
      setPlaidPolicyNote("");
      setSent(
        next.connections_requiring_client_authorization
          ? "Plaid products updated. The client must authorize the new access on each connected bank."
          : "Plaid products updated. Collection has been queued for authorized banks.",
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["bank-evidence", dealerId] }),
        qc.invalidateQueries({ queryKey: ["decision", dealerId] }),
      ]);
    },
  });

  const acceptThreeMonthException = useMutation({
    mutationFn: async () =>
      api<BankEvidenceRead>(
        `/dealer-os/dealers/${dealerId}/bank-evidence/three-month-exception`,
        {
          method: "POST",
          body: JSON.stringify({ acknowledged: true, note: bankExceptionNote.trim() || null }),
          authToken: (await getToken()) ?? undefined,
        },
      ),
    onSuccess: async (result) => {
      qc.setQueryData(["bank-evidence", dealerId], result);
      setBankExceptionOpen(false);
      setBankExceptionNote("");
      await qc.refetchQueries({ queryKey: ["decision", dealerId] });
      router.push(`/applications/${dealerId}?step=3`);
    },
  });

  const evidenceData = evidence.data;
  const roomLink = roomUrl ?? room.data?.url ?? evidenceData?.upload_url ?? null;
  const bankSource = evidenceData?.bank_source ?? verification.bank_source;
  const statementMonths = evidenceData?.statement_months ?? verification.statement_months;
  const missingStatementMonths =
    evidenceData?.missing_statement_months ?? verification.missing_statement_months;
  const bankLinked = evidenceData?.bank_linked ?? verification.bank_linked;
  const belowStandardCoverage = statementMonths.length >= 3 && statementMonths.length < 6;
  const bankExceptionAvailable = Boolean(
    belowStandardCoverage
      && (evidenceData?.bank_exception_available ?? verification.bank_exception_available),
  );
  const bankExceptionActive = Boolean(
    statementMonths.length < 6
      && (evidenceData?.bank_exception_active ?? verification.bank_exception_active),
  );
  const canAcknowledgeBankException = Boolean(
    bankExceptionAvailable &&
      !bankExceptionActive &&
      creditReturned &&
      verification.ownership_complete &&
      verification.owner_contact_complete &&
      verification.pre_screen_complete &&
      Boolean(preScreen.data?.business_questions_complete),
  );
  const handleFiles = (list: FileList | File[]) => {
    const files = Array.from(list).filter((file) => file.size > 0);
    if (!files.length) return;
    enqueueStatements(dealerId, files, dealer?.legal_name ?? undefined);
    setSent(`${files.length} file${files.length === 1 ? "" : "s"} queued. You can continue while extraction runs.`);
  };

  const bankTone = bankLinked ? "c-ok" : "c-warn";
  const creditTone = creditReturned ? "c-ok" : "c-warn";
  const bankRefreshing = refreshBank.isPending || plaid.isFetching || evidence.isFetching;
  const selectedPlaidProducts = plaid.data?.selected_products ?? [];
  const availablePlaidProducts = plaid.data?.available_products ?? [];
  const requestPlaidProductChange = (product: "assets" | "statements") => {
    if (!plaid.data || !isSuperAdmin || updatePlaidPolicy.isPending) return;
    const next = {
      assets_enabled:
        product === "assets" ? !plaid.data.assets_enabled : plaid.data.assets_enabled,
      statements_enabled:
        product === "statements"
          ? !plaid.data.statements_enabled
          : plaid.data.statements_enabled,
    };
    if (!next.assets_enabled && !next.statements_enabled) return;
    setPlaidPolicyNote("");
    setPlaidPolicyChange(next);
  };
  const bankStatusLabel = bankExceptionActive
    ? "Bank-evidence exception accepted"
    : bankExceptionAvailable
      ? "3–5 month exception available"
      : bankLinked
        ? bankSource === "upload"
          ? "Uploaded statements"
          : bankSource === "assets"
            ? "Asset Report verified"
            : "Plaid statements verified"
        : "Awaiting applicant";
  const kv: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 12,
  };
  const modalError = modal === "upload" ? requestUpload.error : send.error;
  const modalIsError = modal === "upload" ? requestUpload.isError : send.isError;
  const modalPending = modal === "upload" ? requestUpload.isPending : send.isPending;
  const copyRoomLink = async () => {
    if (!roomLink) return;
    try {
      await copyText(roomLink);
      setRoomCopyState("copied");
      window.setTimeout(() => setRoomCopyState("idle"), 2400);
    } catch {
      setRoomCopyState("error");
    }
  };
  const stepReady = workflow.step_2.complete || canAcknowledgeBankException;
  const stepMessage = workflow.step_2.complete
    ? "Verification and the applicable business underwriting questions are complete. Continue to the financial profile."
    : bankExceptionAvailable && !creditReturned
      ? `A qualifying 3–5 month bank-evidence exception is available. ${verification.completed_credit_owner_count} of ${verification.required_credit_owner_count} required owners completed their iSoftPull.`
      : canAcknowledgeBankException
        ? "The latest three completed bank months are verified. Review the exception before continuing; the remaining standard months stay outstanding."
        : !verification.bank_linked
          ? "Bank evidence is still required. Connect another business bank or upload completed bank PDF months."
          : workflow.step_2.blockers[0] || `${verification.completed_credit_owner_count} of ${verification.required_credit_owner_count} required owners completed their iSoftPull.`;

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
            Two authorizations are required before the credit application opens: verified bank
            evidence through Plaid Assets or uploaded bank PDFs, and a soft credit inquiry. Each
            client request is sent from this screen and returns to this case automatically.
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
          <div className="row" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
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
                {roomLink
                  ? "The PIN chosen when this application was opened is active and does not expire. Authorized staff can view it from the agreement workspace."
                  : "This legacy file has no client room yet. Generate a new PIN to create one."}
              </span>
            )}
            <span style={{ flex: 1 }} />
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn sm"
                disabled={!roomLink}
                onClick={() => void copyRoomLink()}
                style={{ minHeight: 44 }}
                title={roomLink ? "Copy the secure client-room link" : "Generate a new PIN first"}
              >
                {roomCopyState === "copied" ? <Check size={16} /> : <Copy size={16} />}
                {roomCopyState === "copied" ? "Link copied" : "Copy room link"}
              </button>
              <button
                type="button"
                className="btn sm"
                disabled={rotateCode.isPending}
                onClick={() => setReplacePinOpen(true)}
                style={{ minHeight: 44 }}
              >
                Generate new
              </button>
            </div>
          </div>
          {accessCode && (
            <span className="sub" style={{ display: "block", marginTop: 8 }}>
              Read it to the client now. It remains valid until another replacement is generated
              and can be viewed later from the agreement workspace.
            </span>
          )}
          {rotateCode.isError && (
            <div className="note">
              <div>Could not mint a code. Try again.</div>
            </div>
          )}
          {roomCopyState === "error" && (
            <div className="note">
              <div>
                Could not copy automatically. Open the client-room link below and copy it from
                the browser.
              </div>
            </div>
          )}
        </div>
      </div>

      <div id="bank-evidence" className={`panel guided-target${bankLinked ? "" : " panel-invalid"}`} tabIndex={-1}>
        <div className="panel-h">
          <IconTile tone={bankLinked ? "ok" : "warn"}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 10l9-6 9 6M5 10v9h14v-9M9 19v-6h6v6" />
            </svg>
          </IconTile>
          Bank evidence
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="iconAction"
            style={{ width: 44, height: 44 }}
            onClick={() => refreshBank.mutate()}
            disabled={bankRefreshing}
            title="Refresh Plaid and bank evidence"
            aria-label="Refresh Plaid and bank evidence"
          >
            <RefreshCw
              size={16}
              className={bankRefreshing ? "systemStatusSpin" : undefined}
              aria-hidden
            />
          </button>
          <span className={`cellchip ${bankTone}`}>
            {bankStatusLabel}
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
                {bankSource === "assets"
                  ? "Plaid Assets"
                  : bankSource === "upload"
                    ? "Uploaded bank PDFs"
                    : bankSource === "plaid"
                      ? "Plaid Statements"
                      : "—"}
              </b>
            </div>
            <div>
              <span className="lbl">Verified coverage</span>
              <b className="num" style={{ display: "block" }}>
                {statementMonths.length
                  ? `${statementMonths.length} month${statementMonths.length === 1 ? "" : "s"}`
                  : "—"}
              </b>
            </div>
          </div>
          <div
            className="row"
            style={{
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 14,
              paddingTop: 14,
              borderTop: "1px solid var(--line)",
            }}
          >
            <div style={{ minWidth: 170, marginRight: "auto" }}>
              <b>Plaid evidence products</b>
              <span className="sub" style={{ display: "block", marginTop: 3 }}>
                Applies only to this file
              </span>
            </div>
            {([
              ["assets", "Assets", plaid.data?.assets_enabled ?? false],
              ["statements", "Statement PDFs", plaid.data?.statements_enabled ?? false],
            ] as const).map(([product, label, checked]) => {
              const available = availablePlaidProducts.includes(product);
              const isLastSelected = checked && selectedPlaidProducts.length === 1;
              return isSuperAdmin ? (
                <button
                  key={product}
                  type="button"
                  role="switch"
                  aria-checked={checked}
                  className={`btn sm${checked ? " pri" : ""}`}
                  style={{ minHeight: 44 }}
                  disabled={!plaid.data || !available || isLastSelected || updatePlaidPolicy.isPending}
                  title={
                    !available
                      ? `${label} is not available in this deployment`
                      : isLastSelected
                        ? "At least one Plaid product must remain enabled"
                        : `${checked ? "Disable" : "Enable"} ${label} for this file`
                  }
                  onClick={() => requestPlaidProductChange(product)}
                >
                  <span aria-hidden>{checked ? "On" : "Off"}</span>
                  {label}
                </button>
              ) : (
                <span key={product} className={`cellchip ${checked ? "c-ok" : ""}`}>
                  {label} {checked ? "on" : "off"}
                </span>
              );
            })}
          </div>
          {(plaid.data?.connections_requiring_client_authorization ?? 0) > 0 && (
            <div className="note" style={{ marginTop: 12 }}>
              <div>
                <b>Client authorization required.</b>{" "}
                {plaid.data?.connections_requiring_client_authorization} connected bank
                {plaid.data?.connections_requiring_client_authorization === 1 ? "" : "s"} must
                approve the selected products in the secure room.
              </div>
            </div>
          )}
          {plaid.data?.assets_enabled && activeBanks.length > 0 && (
            <div
              className="row"
              style={{
                border: "1px solid var(--line)",
                borderRadius: 8,
                padding: 12,
                alignItems: "center",
                marginTop: 14,
              }}
            >
              <div>
                <b>Plaid Asset Report</b>
                <span className="sub" style={{ display: "block", marginTop: 3 }}>
                  {latestAssetReport?.status === "ingested"
                    ? `Verified balances and transactions are in the financial profile · ${latestAssetReport.days_requested} days requested`
                    : latestAssetReport?.status === "ready"
                      ? "Report received and financial ingestion is starting"
                      : latestAssetReport?.status === "error" || latestAssetReport?.status === "ingest_error"
                        ? latestAssetReport.error || "The report needs attention"
                        : "Plaid is building the verified balance and transaction report"}
                </span>
              </div>
              <span style={{ flex: 1 }} />
              <span
                className={`cellchip ${
                  latestAssetReport?.status === "ingested"
                    ? "c-ok"
                    : latestAssetReport?.status === "error" || latestAssetReport?.status === "ingest_error"
                      ? "c-bad"
                      : "c-warn"
                }`}
              >
                {latestAssetReport?.status === "ingested"
                  ? "Verified"
                  : latestAssetReport?.status === "error" || latestAssetReport?.status === "ingest_error"
                    ? "Action required"
                    : "Processing"}
              </span>
            </div>
          )}
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
                      {bank.accounts_label || "Account labels syncing"} · {bank.statement_months.length} verified month{bank.statement_months.length === 1 ? "" : "s"}
                    </span>
                    {bank.error && <span className="sub" style={{ color: "var(--bad)", display: "block" }}>{bank.error}</span>}
                    {bank.unavailable_products.length > 0 ? (
                      <span className="validation-hint" style={{ display: "block", marginTop: 4 }}>
                        Statement PDFs are unavailable from this institution. Use the secure PDF upload fallback; Plaid Assets will continue when enabled.
                      </span>
                    ) : bank.pending_products.length > 0 && (
                      <span className="validation-hint" style={{ display: "block", marginTop: 4 }}>
                        Authorize {bank.pending_products.map((value) => value === "assets" ? "Assets" : "Statement PDFs").join(" and ")} in the client room.
                      </span>
                    )}
                  </div>
                  <span style={{ flex: 1 }} />
                  <span className={`cellchip ${bank.authorization_state === "authorized" ? "c-ok" : "c-warn"}`}>
                    {bank.authorization_state === "client_authorization_required"
                      ? "Authorization needed"
                      : bank.authorization_state === "fallback_required"
                        ? "PDF fallback"
                        : bank.status}
                  </span>
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
            <button type="button" className="btn pri" onClick={() => { setDeliverySource("application"); setModal("bank"); }}>
              {activeBanks.length ? "Connect another bank or account" : "Send bank connection request"}
            </button>
            <button type="button" className="btn" onClick={() => { setDeliverySource("application"); setModal("upload"); }}>
              Request statement upload
            </button>
            <button
              type="button"
              className="btn"
              disabled={send.isPending}
              onClick={() => { setDeliverySource("application"); setModal("bank"); }}
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
              <span className="sub">No verified bank-month coverage has been ingested yet.</span>
            )}
          </div>
          {bankExceptionAvailable && (
            <div className="note">
              <div>
                <b>
                  {bankExceptionActive
                    ? "Bank-evidence exception acknowledged."
                    : "Three-to-five-month exception available."}
                </b>{" "}
                {bankExceptionActive
                  ? "The financial profile is open, while the missing standard months remain outstanding for final underwriting."
                  : "Continue will ask for acknowledgment. You may instead connect another bank or account, or upload the missing bank PDFs."}
              </div>
            </div>
          )}
          {refreshBank.isError && (
            <div className="note">
              <div>
                {refreshBank.error instanceof Error
                  ? refreshBank.error.message
                  : "The Plaid refresh could not be queued."}
              </div>
            </div>
          )}
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
              Plaid connections are not switched on yet. Use bank PDF upload in the meantime;
              that path satisfies the same gate once six current months extract.
            </span>
          )}
        </div>
      </div>

      <div id="credit-authorization" className={`panel guided-target${creditReturned ? "" : " panel-invalid"}`} tabIndex={-1}>
        <div className="panel-h">
          <IconTile tone={creditReturned ? "ok" : "warn"}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 7h18v10H3zM3 11h18M7 15h4" />
            </svg>
          </IconTile>
          Credit authorization · soft inquiry
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="iconAction"
            style={{ width: 44, height: 44 }}
            onClick={() => void refreshCreditStatus()}
            disabled={creditRefreshing || owners.isFetching}
            title="Refresh iSoftPull status"
            aria-label="Refresh iSoftPull status"
          >
            <RefreshCw
              size={16}
              className={creditRefreshing || owners.isFetching ? "systemStatusSpin" : undefined}
              aria-hidden
            />
          </button>
          <span className={`cellchip ${creditTone}`}>
            {creditReturned ? "Returned" : "Awaiting applicant"}
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
              disabled={creditReturned || !verification.ownership_complete || !verification.owner_contact_complete || !requiredOwners.length || !verification.credit_enabled || sendAllCredit.isPending}
              onClick={() => sendAllCredit.mutate()}
            >
              {creditReturned ? "All authorizations returned" : "Send all pending authorizations"}
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
                  {owner.credit_complete && <b className="num">{creditQuality(owner)}</b>}
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

      <div id="business-underwriting" className={`panel guided-target${preScreen.data?.business_questions_complete ? "" : " panel-invalid"}`} tabIndex={-1}>
        <div className="panel-h">
          Business underwriting questions
          <span className="sp" />
          <span className={`cellchip ${preScreen.data?.business_questions_complete ? "c-ok" : "c-warn"}`}>
            {preScreen.data?.business_questions_complete ? "Complete" : `${preScreen.data?.business_question_blockers.length ?? 0} unanswered`}
          </span>
        </div>
        <div className="panel-b">
          <p className="sub" style={{ marginTop: 0 }}>
            These business-level questions adapt to the canonical NAICS and remaining program paths. Personal owner eligibility stays in Step 1.5.
          </p>
          <Step4BusinessQuestions
            dealerId={dealerId}
            groups={preScreen.data?.applicable_business_questions ?? []}
            initialAnswers={preScreen.data?.file_answers ?? {}}
          />
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
        ready={stepReady}
        message={stepMessage}
        buttonLabel={canAcknowledgeBankException ? "Review bank-evidence exception" : "Continue to Step 3"}
        onContinue={() => {
          if (workflow.step_2.complete) {
            router.push(`/applications/${dealerId}?step=3`);
          } else if (canAcknowledgeBankException) {
            setBankExceptionOpen(true);
          }
        }}
      />

      {bankExceptionOpen && (
        <Modal
          title={`Continue with ${statementMonths.length} verified bank months`}
          onClose={() => {
            if (!acceptThreeMonthException.isPending) setBankExceptionOpen(false);
          }}
        >
          <p className="sub" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
            The qualifying contiguous completed bank months are verified. A six-month history remains
            the standard evidence target, but you can open the financial profile now and keep
            collecting the outstanding months.
          </p>

          <div style={kv} className="mt">
            <div>
              <span className="lbl">Verified coverage</span>
              <b className="num" style={{ display: "block" }}>
                {statementMonths.length} month{statementMonths.length === 1 ? "" : "s"}
              </b>
            </div>
            <div>
              <span className="lbl">Standard target</span>
              <b className="num" style={{ display: "block" }}>6 months</b>
            </div>
            <div>
              <span className="lbl">Missing standard months</span>
              <b className="num" style={{ display: "block" }}>
                {missingStatementMonths.length ? missingStatementMonths.join(", ") : "None"}
              </b>
            </div>
          </div>

          <div className="note">
            <div>
              This acknowledgment opens Step 3 only. It does not waive final program rules,
              mark missing statements complete, or approve the application. The action is
              retained in the file audit trail.
            </div>
          </div>

          <label style={{ display: "block", marginTop: 12 }}>
            <span className="lbl">Acknowledgment note <span className="sub">Optional</span></span>
            <textarea className="field" rows={2} value={bankExceptionNote} onChange={(event) => setBankExceptionNote(event.target.value)} placeholder="Document why the file is proceeding before all six standard months are available." />
          </label>

          {acceptThreeMonthException.isError && (
            <div className="documentError" style={{ margin: "12px 0 0" }}>
              {acceptThreeMonthException.error instanceof Error
                ? acceptThreeMonthException.error.message
                : "The bank-evidence exception could not be recorded."}
            </div>
          )}

          <div className="row mt" style={{ justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn"
              disabled={acceptThreeMonthException.isPending}
              onClick={() => setBankExceptionOpen(false)}
            >
              Keep collecting statements
            </button>
            <button
              type="button"
              className="btn pri"
              disabled={acceptThreeMonthException.isPending}
              onClick={() => acceptThreeMonthException.mutate()}
            >
              {acceptThreeMonthException.isPending
                ? "Recording…"
                : "Acknowledge and continue"}
            </button>
          </div>
        </Modal>
      )}

      {plaidPolicyChange && plaid.data && (
        <Modal
          title="Confirm Plaid products for this file"
          onClose={() => {
            if (!updatePlaidPolicy.isPending) setPlaidPolicyChange(null);
          }}
        >
          <p style={{ marginTop: 0 }}>
            This file will collect{" "}
            <b>
              {plaidPolicyChange.assets_enabled && plaidPolicyChange.statements_enabled
                ? "Plaid Assets and bank-produced Statement PDFs"
                : plaidPolicyChange.assets_enabled
                  ? "Plaid Assets"
                  : "bank-produced Statement PDFs"}
            </b>.
          </p>
          <div className="note">
            <div>
              {activeBanks.length
                ? `${activeBanks.length} connected bank${activeBanks.length === 1 ? "" : "s"} will be checked against the new policy. Newly enabled products require the client's consent and may require authorization through Plaid Link.`
                : "The selected products will be requested when the client connects a bank."}
              {" "}Previously collected evidence remains attached. Enabling Assets can create a
              billable Asset Report after authorization.
            </div>
          </div>
          <label style={{ display: "block", marginTop: 14 }}>
            <span className="lbl">Audit note (optional)</span>
            <textarea
              className="field"
              rows={3}
              value={plaidPolicyNote}
              onChange={(event) => setPlaidPolicyNote(event.target.value)}
              placeholder="Why this file needs this evidence mix"
            />
          </label>
          {updatePlaidPolicy.isError && (
            <div className="note">
              <div>
                {updatePlaidPolicy.error instanceof Error
                  ? updatePlaidPolicy.error.message
                  : "The Plaid products could not be updated."}
              </div>
            </div>
          )}
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
            <button
              type="button"
              className="btn"
              style={{ minHeight: 44 }}
              disabled={updatePlaidPolicy.isPending}
              onClick={() => setPlaidPolicyChange(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn pri"
              style={{ minHeight: 44 }}
              disabled={updatePlaidPolicy.isPending}
              onClick={() => updatePlaidPolicy.mutate(plaidPolicyChange)}
            >
              {updatePlaidPolicy.isPending ? "Updating…" : "Confirm products"}
            </button>
          </div>
        </Modal>
      )}

      {modal && (
        <Modal
          title={
            modal === "bank"
              ? "Send secure bank connection request"
              : modal === "upload"
                ? "Request statement upload"
                : "Send credit authorization"
          }
          onClose={() => setModal(null)}
        >
          <p className="sub" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
            {modal === "bank"
              ? `${activeBanks.length ? "The applicant can connect another business account or institution" : "The applicant connects the business operating account"} with read-only access. ${plaid.data?.assets_enabled && plaid.data?.statements_enabled
                ? "Plaid returns verified balances and transactions plus available bank-produced Statement PDFs."
                : plaid.data?.statements_enabled
                  ? "Plaid retrieves available bank-produced Statement PDFs."
                  : "Plaid Assets returns verified balances and transactions."} No credentials pass through Qualified Commercial.`
              : modal === "upload"
                ? "The applicant opens the secure room and uploads the last six completed months of business bank statements to the linked bucket."
              : "The applicant authorizes a soft credit inquiry. It does not affect their score and returns a band rather than an exact figure."}
          </p>

          {modal !== "credit" && (
            <label className="mt" style={{ display: "block" }}>
              <span className="lbl">Send request to</span>
              <select
                className="field"
                value={deliverySource}
                onChange={(event) => setDeliverySource(event.target.value)}
              >
                <option value="application">Application contact (Step 1)</option>
                {ownerRows.map((owner) => (
                  <option key={owner.id} value={`owner:${owner.id}`}>
                    {owner.full_name}{owner.is_primary ? " · Primary owner" : " · Owner"}
                  </option>
                ))}
                <option value="manual">Manual override</option>
              </select>
            </label>
          )}

          <div className="deliveryEditor mt">
            <label>
              <span className="lbl">{modal === "credit" ? "Personal email" : "Applicant email"}</span>
              <input
                className={`field${deliveryEmail && !validEmail(deliveryEmail) ? " invalid" : ""}`}
                type="email"
                value={deliveryEmail}
                autoComplete="email"
                onChange={(event) => {
                  setDeliveryEmail(event.target.value);
                  if (modal !== "credit") setDeliverySource("manual");
                  setDeliveryError(null);
                }}
              />
            </label>
            <label>
              <span className="lbl">{modal === "credit" ? "Personal mobile" : "Applicant mobile"}</span>
              <input
                className={`field${modal === "credit" && deliveryPhone && !validPhone(deliveryPhone) ? " invalid" : ""}`}
                type="tel"
                value={deliveryPhone}
                autoComplete="tel"
                onChange={(event) => {
                  setDeliveryPhone(event.target.value);
                  if (modal !== "credit") setDeliverySource("manual");
                  setDeliveryError(null);
                }}
              />
            </label>
          </div>
          <span className="sub" style={{ display: "block", marginTop: 6 }}>
            {modal === "credit"
              ? "Corrections save to this owner before the secure link is sent."
              : "The selected contact is used for this delivery only. Manual overrides do not replace Step 1 details."}
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
                ? "Delivery, connection, report generation, and ingestion are timestamped. The link can be reissued from this panel at any time."
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
              disabled={modalPending || !validEmail(deliveryEmail) || ((modal === "credit" || alsoText) && !validPhone(deliveryPhone))}
              onClick={() => {
                if (modal === "upload") requestUpload.mutate();
                else if (modal === "bank") send.mutate({ kind: "bank" });
                else if (modal === "credit" && creditOwner) send.mutate({ kind: "credit", ownerId: creditOwner.id });
              }}
            >
              {modalPending
                ? "Sending…"
                : modal === "bank"
                  ? "Send secure bank link"
                  : modal === "upload"
                    ? "Send upload request"
                    : "Send authorization"}
            </button>
          </div>
        </Modal>
      )}
      {replacePinOpen && (
        <Modal title="Generate a new client-room PIN?" onClose={() => !rotateCode.isPending && setReplacePinOpen(false)}>
          <p style={{ marginTop: 0 }}>
            The current PIN will stop working immediately. The replacement will be six digits,
            will not expire, and remains available to authorized staff.
          </p>
          <div className="row mt" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" disabled={rotateCode.isPending} onClick={() => setReplacePinOpen(false)}>Keep current PIN</button>
            <button type="button" className="btn pri" disabled={rotateCode.isPending} onClick={() => rotateCode.mutate()}>
              {rotateCode.isPending ? "Generating…" : "Generate new PIN"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
