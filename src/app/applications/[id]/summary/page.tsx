"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Mail, Printer, RefreshCw } from "lucide-react";
import { api, apiBlob } from "@/lib/api";
import Modal from "@/components/Modal";

type SummaryState = {
  exists: boolean;
  revision: number;
  generated_at: string | null;
  sha256: string | null;
  stale: boolean;
  missing_data: string[];
  email_prompt: boolean;
};
type Owner = { id: string; full_name: string; email: string | null; ownership_pct: number | null };
type Dealer = { name?: string | null; legal_name?: string | null; case_ref?: string | null; email?: string | null };
type EmailResult = { sent: boolean; recipient_email: string; revision: number; detail: string | null };

export default function UnderwritingSummaryPage() {
  const params = useParams<{ id: string }>();
  const dealerId = params.id;
  const router = useRouter();
  const search = useSearchParams();
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const frame = useRef<HTMLIFrameElement | null>(null);
  const pdfUrlRef = useRef<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(search.get("emailPrompt") === "1");
  const [recipientMode, setRecipientMode] = useState<"application" | "owner" | "manual">("application");
  const [ownerId, setOwnerId] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [emailResult, setEmailResult] = useState<EmailResult | null>(null);
  const authenticated = async <T,>(path: string, init?: RequestInit) => api<T>(path, { ...init, authToken: (await getToken()) ?? undefined });

  const summary = useQuery({ queryKey: ["underwriting-summary", dealerId], queryFn: () => authenticated<SummaryState>(`/dealer-os/dealers/${dealerId}/underwriting-summary`) });
  const dealer = useQuery({ queryKey: ["dealer", dealerId], queryFn: () => authenticated<Dealer>(`/dealer-os/dealers/${dealerId}`) });
  const owners = useQuery({ queryKey: ["owners", dealerId], queryFn: () => authenticated<Owner[]>(`/dealer-os/dealers/${dealerId}/owners`) });

  const loadPdf = async () => {
    setPdfError(null);
    try {
      const blob = await apiBlob(`/dealer-os/dealers/${dealerId}/underwriting-summary/pdf`, { authToken: (await getToken()) ?? undefined });
      const next = URL.createObjectURL(blob);
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
      pdfUrlRef.current = next;
      setPdfUrl(next);
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : "The saved PDF could not be loaded.");
    }
  };
  useEffect(() => {
    if (summary.data?.exists) void loadPdf();
    return () => {
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
      pdfUrlRef.current = null;
    };
    // loadPdf is scoped to this authenticated file and revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.data?.exists, summary.data?.revision]);

  const update = useMutation({
    mutationFn: () => authenticated<SummaryState>(`/dealer-os/dealers/${dealerId}/underwriting-summary`, { method: "POST" }),
    onSuccess: (saved) => {
      qc.setQueryData(["underwriting-summary", dealerId], saved);
      setEmailOpen(saved.email_prompt);
    },
  });
  const sendEmail = useMutation({
    mutationFn: () => authenticated<EmailResult>(`/dealer-os/dealers/${dealerId}/underwriting-summary/email`, {
      method: "POST",
      body: JSON.stringify({
        recipient_mode: recipientMode,
        owner_id: recipientMode === "owner" ? ownerId : null,
        recipient_email: recipientMode === "manual" ? manualEmail.trim() : null,
      }),
    }),
    onSuccess: (result) => { setEmailResult(result); if (result.sent) setEmailOpen(false); },
  });
  const download = async () => {
    const blob = await apiBlob(`/dealer-os/dealers/${dealerId}/underwriting-summary/pdf?download=true`, { authToken: (await getToken()) ?? undefined });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${dealer.data?.case_ref || "QC"}-underwriting-summary-r${summary.data?.revision || 1}.pdf`;
    link.click();
    URL.revokeObjectURL(href);
  };

  return (
    <div className="summaryWorkspace">
      <header className="summaryToolbar">
        <button type="button" className="iconAction" aria-label="Return to application" title="Return to application" onClick={() => router.push(`/applications/${dealerId}?step=4`)}><ArrowLeft size={19} /></button>
        <div><span className="lbl">QC underwriting summary</span><b>{dealer.data?.name || dealer.data?.legal_name || "Application"}</b><small>{summary.data?.exists ? `Revision ${summary.data.revision} · ${summary.data.stale ? "Update available" : "Current"}` : "Not generated"}</small></div>
        <span className="sp" />
        {summary.data?.exists && <button type="button" className="iconAction" aria-label="Print summary" title="Print summary" onClick={() => frame.current?.contentWindow?.print()}><Printer size={18} /></button>}
        {summary.data?.exists && <button type="button" className="iconAction" aria-label="Download summary" title="Download summary" onClick={() => void download()}><Download size={18} /></button>}
        {summary.data?.exists && <button type="button" className="iconAction" aria-label="Email summary" title="Email summary" disabled={summary.data.stale} onClick={() => setEmailOpen(true)}><Mail size={18} /></button>}
        <button type="button" className="btn pri" disabled={update.isPending || Boolean(summary.data?.exists && !summary.data.stale)} onClick={() => update.mutate()}><RefreshCw size={16} />{update.isPending ? "Building PDF…" : summary.data?.exists ? "Update summary" : "Generate summary"}</button>
      </header>

      {summary.data?.stale && <div className="warnline summaryNotice">Application data changed after this revision. Update the summary before emailing it.</div>}
      {summary.data?.missing_data.length ? <div className="warnline summaryNotice">Unresolved fields: {summary.data.missing_data.join(", ")}</div> : null}
      {emailResult && <div className={`${emailResult.sent ? "note" : "warnline"} summaryNotice`}>{emailResult.sent ? `Revision ${emailResult.revision} emailed to ${emailResult.recipient_email}.` : emailResult.detail || "Email delivery failed. Review the recipient and retry."}</div>}
      {(update.error || pdfError) && <div className="warnline summaryNotice">{update.error instanceof Error ? update.error.message : pdfError}</div>}

      <main className="summaryCanvas">
        {pdfUrl ? <iframe ref={frame} title="QC underwriting summary PDF" src={pdfUrl} /> : <div className="summaryEmpty"><FileState loading={summary.isLoading || update.isPending} exists={Boolean(summary.data?.exists)} /></div>}
      </main>

      {emailOpen && (
        <Modal title="Email this summary to the client?" onClose={() => !sendEmail.isPending && setEmailOpen(false)}>
          <p className="sub" style={{ marginTop: 0 }}>The saved revision is attached exactly as shown. Email delivery never regenerates the PDF.</p>
          <label style={{ display: "block" }}><span className="lbl">Recipient</span><select className="field" value={recipientMode} onChange={(event) => setRecipientMode(event.target.value as typeof recipientMode)}><option value="application">Application email{dealer.data?.email ? ` · ${dealer.data.email}` : ""}</option><option value="owner">Choose an owner</option><option value="manual">Manual email</option></select></label>
          {recipientMode === "owner" && <label style={{ display: "block", marginTop: 12 }}><span className="lbl">Owner</span><select className="field" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}><option value="">Select owner</option>{(owners.data ?? []).map((owner) => <option key={owner.id} value={owner.id} disabled={!owner.email}>{owner.full_name} · {owner.email || "Email missing"}</option>)}</select></label>}
          {recipientMode === "manual" && <label style={{ display: "block", marginTop: 12 }}><span className="lbl">Email</span><input className="field" type="email" value={manualEmail} onChange={(event) => setManualEmail(event.target.value)} /></label>}
          {sendEmail.error && <div className="warnline mt">{sendEmail.error instanceof Error ? sendEmail.error.message : "Email delivery failed."}</div>}
          {emailResult && !emailResult.sent && <div className="warnline mt">{emailResult.detail || "Email delivery failed and can be retried."}</div>}
          <div className="row mt" style={{ justifyContent: "flex-end" }}><button type="button" className="btn" disabled={sendEmail.isPending} onClick={() => setEmailOpen(false)}>No, not now</button><button type="button" className="btn pri" disabled={sendEmail.isPending || (recipientMode === "owner" && !ownerId) || (recipientMode === "manual" && !manualEmail.trim())} onClick={() => sendEmail.mutate()}>{sendEmail.isPending ? "Sending…" : "Yes, email PDF"}</button></div>
        </Modal>
      )}
    </div>
  );
}

function FileState({ loading, exists }: { loading: boolean; exists: boolean }) {
  return <><b>{loading ? "Preparing summary…" : exists ? "Loading saved PDF…" : "No summary has been generated"}</b><span className="sub">{exists ? "The authenticated viewer will appear here." : "Generate the first persistent revision from this page."}</span></>;
}
