"use client";

import { useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, Download, ExternalLink, Eye, FileText, FolderSync, RefreshCw, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { ApiError, api, apiUpload } from "@/lib/api";
import { useCase } from "@/lib/useCase";
import { useMe } from "@/lib/useMe";
import Drawer from "@/components/Drawer";

type Doc = {
  id: string;
  filename: string;
  content_type: string;
  kind: string | null;
  status: string;
  source: string | null;
  page_count: number | null;
  created_at: string;
};

type DocumentUrl = {
  url: string;
  expires_in: number;
  filename: string;
  content_type: string;
};

type BucketSync = {
  bucket_id: string | null;
  bucket_name: string | null;
  bucket_status: string | null;
  active_bucket_files: number;
  tracked_documents: number;
  pending_documents: number;
  tracked_document_ids: string[];
  last_synced_at: string | null;
  application_submitted: boolean;
  package_evidence_exists: boolean;
  can_delete_documents: boolean;
  can_open_bucket: boolean;
};

type DocRequest = {
  id: string;
  title: string;
  kind: string;
  status: string;
  due_on: string | null;
  note: string | null;
};

type UploadItem = {
  id: string;
  filename: string;
  status: "queued" | "uploading" | "complete" | "failed";
  error?: string;
};

const DOCUMENT_KINDS = [
  ["other", "Let the system classify"],
  ["statement", "Bank statement"],
  ["tax", "Tax return"],
  ["pl", "Profit and loss"],
  ["debt_schedule", "Debt schedule"],
  ["loan_agreement", "Loan agreement"],
] as const;

const FUNDING_URL = process.env.NEXT_PUBLIC_FUNDING_URL ?? "https://app.qualifiedcommercial.com";

function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function uploadId(file: File, index: number): string {
  return `${file.name}-${file.size}-${file.lastModified}-${index}`;
}

function isPdf(document: Doc): boolean {
  return (document.content_type || "").toLowerCase().includes("pdf") || document.filename.toLowerCase().endsWith(".pdf");
}

export default function DocumentsTab() {
  const { id } = useParams<{ id: string }>();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [kind, setKind] = useState("other");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [previewDocument, setPreviewDocument] = useState<Doc | null>(null);
  const [deleteDocument, setDeleteDocument] = useState<Doc | null>(null);
  const { dealer, decision } = useCase(id);
  const { isSuperAdmin } = useMe();

  const authReady = isLoaded && Boolean(isSignedIn);
  const authenticatedRequest = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    try {
      return await api<T>(path, { ...init, authToken: (await getToken()) ?? undefined });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      return api<T>(path, { ...init, authToken: (await getToken({ skipCache: true })) ?? undefined });
    }
  };
  const authenticatedGet = <T,>(path: string) => authenticatedRequest<T>(path);
  const docs = useQuery({
    queryKey: ["documents", id],
    enabled: authReady,
    queryFn: () => authenticatedGet<Doc[]>(`/dealer-os/dealers/${id}/documents`),
  });

  const requests = useQuery({
    queryKey: ["doc-requests", id],
    enabled: authReady,
    queryFn: () => authenticatedGet<DocRequest[]>(`/dealer-os/dealers/${id}/doc-requests`),
  });

  const bucketSync = useQuery({
    queryKey: ["document-bucket-sync", id],
    enabled: authReady,
    queryFn: () => authenticatedGet<BucketSync>(`/dealer-os/dealers/${id}/documents/bucket-status`),
    refetchOnWindowFocus: "always",
  });

  const preview = useQuery({
    queryKey: ["document-preview-url", id, previewDocument?.id],
    enabled: authReady && Boolean(previewDocument),
    staleTime: 10 * 60 * 1000,
    queryFn: () => authenticatedGet<DocumentUrl>(`/dealer-os/dealers/${id}/documents/${previewDocument?.id}/url`),
  });

  const download = useMutation({
    mutationFn: (document: Doc) => authenticatedGet<DocumentUrl>(`/dealer-os/dealers/${id}/documents/${document.id}/url?download=true`),
    onSuccess: (result) => {
      const link = window.document.createElement("a");
      link.href = result.url;
      link.download = result.filename;
      link.rel = "noreferrer";
      window.document.body.appendChild(link);
      link.click();
      link.remove();
    },
  });

  const syncBucket = useMutation({
    mutationFn: () => authenticatedRequest<BucketSync>(`/dealer-os/dealers/${id}/documents/bucket-sync`, { method: "POST" }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["document-bucket-sync", id] }),
        queryClient.invalidateQueries({ queryKey: ["dealer", id] }),
      ]);
    },
  });

  const removeDocument = useMutation({
    mutationFn: (document: Doc) => authenticatedRequest<void>(`/dealer-os/dealers/${id}/documents/${document.id}`, { method: "DELETE" }),
    onSuccess: async (_, document) => {
      if (previewDocument?.id === document.id) closePreview();
      setDeleteDocument(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["documents", id] }),
        queryClient.invalidateQueries({ queryKey: ["document-bucket-sync", id] }),
        queryClient.invalidateQueries({ queryKey: ["doc-requests", id] }),
        queryClient.invalidateQueries({ queryKey: ["decision", id] }),
        queryClient.invalidateQueries({ queryKey: ["document-coverage", id] }),
        queryClient.invalidateQueries({ queryKey: ["pipeline-status", id] }),
      ]);
    },
  });

  const openPreview = (document: Doc) => {
    download.reset();
    setPreviewDocument(document);
  };

  const closePreview = () => {
    download.reset();
    setPreviewDocument(null);
  };

  const upload = useMutation({
    mutationFn: async ({ files, selectedKind }: { files: Array<{ id: string; file: File }>; selectedKind: string }) => {
      for (const item of files) {
        setUploads((current) => current.map((row) => row.id === item.id ? { ...row, status: "uploading", error: undefined } : row));
        const form = new FormData();
        form.append("file", item.file);
        form.append("kind", selectedKind);
        try {
          let token = (await getToken()) ?? undefined;
          try {
            await apiUpload<Doc>(`/dealer-os/dealers/${id}/documents`, form, { authToken: token });
          } catch (error) {
            if (!(error instanceof ApiError) || error.status !== 401) throw error;
            token = (await getToken({ skipCache: true })) ?? undefined;
            await apiUpload<Doc>(`/dealer-os/dealers/${id}/documents`, form, { authToken: token });
          }
          setUploads((current) => current.map((row) => row.id === item.id ? { ...row, status: "complete" } : row));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Upload failed";
          setUploads((current) => current.map((row) => row.id === item.id ? { ...row, status: "failed", error: message } : row));
        }
      }
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["documents", id] }),
        queryClient.invalidateQueries({ queryKey: ["doc-requests", id] }),
        queryClient.invalidateQueries({ queryKey: ["decision", id] }),
        queryClient.invalidateQueries({ queryKey: ["document-bucket-sync", id] }),
      ]);
    },
  });

  const queueFiles = (list: FileList | File[]) => {
    const raw = Array.from(list).filter((file) => file.size > 0);
    if (!raw.length) return;
    const timestamp = Date.now();
    const files = raw.map((file, index) => ({ id: `${timestamp}-${uploadId(file, index)}`, file }));
    setUploads((current) => [
      ...files.map((item) => ({ id: item.id, filename: item.file.name, status: "queued" as const })),
      ...current.filter((item) => item.status !== "complete"),
    ]);
    upload.mutate({ files, selectedKind: kind });
  };

  const received = docs.data ?? [];
  const open = (requests.data ?? []).filter((request) => request.status === "open");
  const requestedLabels = new Set(open.map((request) => request.title.trim().toLowerCase()));
  const bankEvidenceAccepted = Boolean(
    decision?.verification.bank_exception_active
      || (
        decision?.verification.statement_months.length
        && decision.verification.statement_months.length >= decision.verification.statement_target
      ),
  );
  const isUnresolvedSixMonthStandard = (need: string) => (
    /six current (verified bank|bank-produced statement) months|six current bank-produced statements/i.test(need)
  );
  const screeningNeeds = Array.from(new Set(
    (decision?.programs ?? [])
      .filter((program) => program.eligible || program.blocked_by.length === 0)
      .flatMap((program) => program.needs)
      .map((need) => need.trim())
      .filter((need) => (
        need
        && !requestedLabels.has(need.toLowerCase())
        && !(bankEvidenceAccepted && isUnresolvedSixMonthStandard(need))
      )),
  ));
  const total = received.length + open.length;
  const trackedDocumentIds = new Set(bucketSync.data?.tracked_document_ids ?? []);
  const authError = [docs.error, requests.error].find((error) => error instanceof ApiError && error.status === 401);

  return (
    <div className="panel documentWorkspace">
      <div className="panel-h documentWorkspaceHead">
        <div>
          <b>Documents and outstanding evidence</b>
          <span className="sub">One place to upload, track, and request what the file still needs.</span>
        </div>
        <span style={{ flex: 1 }} />
        <span className="cellchip c-acc">{received.length} received</span>
        <span className={`cellchip ${open.length ? "c-warn" : "c-ok"}`}>{open.length} outstanding</span>
        <Link className="btn sm" href={`/applications/${id}/messages`}>Request documents</Link>
      </div>

      <section className="documentBucketBar" aria-label="Connected bucket status">
        <div className="documentBucketIdentity">
          <span className="documentBucketIcon"><Database size={18} /></span>
          <span>
            <small>Connected bucket</small>
            <b>{bucketSync.isLoading ? "Checking connection…" : bucketSync.data?.bucket_name || dealer?.name || "Not linked"}</b>
          </span>
        </div>
        <div className="documentBucketStats">
          <span><b>{bucketSync.data?.tracked_documents ?? 0}</b> of {received.length} tracked</span>
          <span><b>{bucketSync.data?.active_bucket_files ?? 0}</b> bucket files</span>
          <span className={bucketSync.data?.pending_documents ? "warn" : "ok"}>
            {bucketSync.data?.pending_documents ? `${bucketSync.data.pending_documents} pending sync` : "In sync"}
          </span>
        </div>
        <div className="documentBucketActions">
          <button
            type="button"
            className="iconBtn"
            onClick={() => syncBucket.mutate()}
            disabled={syncBucket.isPending}
            title="Repair document and bucket sync"
            aria-label="Repair document and bucket sync"
          >
            <FolderSync size={17} className={syncBucket.isPending ? "spin" : undefined} />
          </button>
          {(bucketSync.data?.can_open_bucket || isSuperAdmin) && bucketSync.data?.bucket_id && (
            <button
              type="button"
              className="btn sm"
              onClick={() => window.open(`${FUNDING_URL}/admin/buckets?bucket=${bucketSync.data?.bucket_id}`, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink size={15} /> Open bucket
            </button>
          )}
        </div>
        {syncBucket.error && <p className="documentBucketError">{syncBucket.error instanceof Error ? syncBucket.error.message : "Bucket sync failed."}</p>}
      </section>

      <div className="documentIntakeBar">
        <div
          className={`documentDrop${dragging ? " drag" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
          }}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            queueFiles(event.dataTransfer.files);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.csv,.xlsx,.xls,.zip,.txt,image/*"
            hidden
            onChange={(event) => {
              if (event.target.files) queueFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
          <span className="documentDropIcon" aria-hidden>+</span>
          <span><b>Add documents</b><small>Choose or drop files. Upload starts immediately.</small></span>
        </div>
        <label className="documentKind">
          <span className="lbl">Document type</span>
          <select className="field" value={kind} onChange={(event) => setKind(event.target.value)}>
            {DOCUMENT_KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {uploads.length > 0 && (
          <div className="uploadTray" aria-live="polite">
            {uploads.map((item) => (
              <div className={`uploadTrayRow ${item.status}`} key={item.id} title={item.error}>
                <span className="uploadState" aria-hidden />
                <b>{item.filename}</b>
                <span>{item.status === "uploading" ? "Uploading" : item.status === "complete" ? "Added" : item.status === "failed" ? item.error || "Failed" : "Queued"}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {authError && (
        <div className="documentError">Your Field Desk session expired. Refresh the page and sign in again before uploading documents.</div>
      )}

      {open.length > 0 && (
        <div className="documentNeeds">
          <span className="lbl">Outstanding from this file</span>
          <div>
            {open.map((request) => (
              <span className="documentNeed" key={request.id}>
                <i aria-hidden>!</i>
                <span><b>{request.title}</b>{request.note && <small>{request.note}</small>}</span>
                {request.due_on && <time>{when(request.due_on)}</time>}
              </span>
            ))}
          </div>
        </div>
      )}

      {screeningNeeds.length > 0 && (
        <div className="documentNeeds screeningNeeds">
          <span className="lbl">Screening-derived evidence gaps</span>
          <p className="sub">These needs update as bank, credit, and application facts are verified.</p>
          <div>
            {screeningNeeds.map((need) => (
              <span className="documentNeed" key={need}>
                <i aria-hidden>?</i>
                <span><b>{need}</b></span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="tblwrap">
        <table className="tbl documentTable">
          <thead>
            <tr><th>Document</th><th>Classification</th><th>Source</th><th>Status</th><th>Bucket</th><th className="r">Received</th><th className="r">Pages</th><th className="r">Actions</th></tr>
          </thead>
          <tbody>
            {received.map((document) => (
              <tr key={document.id}>
                <td>
                  {isPdf(document) ? (
                    <button type="button" className="documentNameButton" onClick={() => openPreview(document)} title={`Preview ${document.filename}`}>
                      <FileText size={16} /><b>{document.filename}</b>
                    </button>
                  ) : <b>{document.filename}</b>}
                </td>
                <td className="sub">{document.kind?.replaceAll("_", " ") || "Classifying"}</td>
                <td className="sub">{document.source === "plaid" ? "Bank connection" : document.source || "Uploaded"}</td>
                <td><span className={`cellchip ${document.status === "failed" ? "c-bad" : document.status === "extracted" ? "c-ok" : "c-acc"}`}>{document.status === "failed" ? "Could not read" : document.status === "extracted" ? "Indexed" : "Processing"}</span></td>
                <td>
                  <span className={`documentBucketState ${trackedDocumentIds.has(document.id) ? "synced" : "pending"}`}>
                    {trackedDocumentIds.has(document.id) ? <ShieldCheck size={14} /> : <FolderSync size={14} />}
                    {trackedDocumentIds.has(document.id) ? "Tracked" : "Pending"}
                  </span>
                </td>
                <td className="r sub num">{when(document.created_at)}</td>
                <td className="r num">{document.page_count ?? "—"}</td>
                <td className="r">
                  <span className="documentRowActions">
                    {isPdf(document) && (
                      <button type="button" className="iconBtn" onClick={() => openPreview(document)} title={`Preview ${document.filename}`} aria-label={`Preview ${document.filename}`}>
                        <Eye size={16} />
                      </button>
                    )}
                    {bucketSync.data?.can_delete_documents && (
                      <button type="button" className="iconBtn danger" onClick={() => { removeDocument.reset(); setDeleteDocument(document); }} title={`Delete ${document.filename}`} aria-label={`Delete ${document.filename}`}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
            {total === 0 && !docs.isLoading && !authError && (
              <tr><td colSpan={8} className="documentEmpty"><b>No evidence on this file yet</b><span>Upload documents above or request them from the applicant. Bank-connected statements appear here automatically.</span></td></tr>
            )}
          </tbody>
        </table>
      </div>
      {previewDocument && (
        <Drawer
          title={`Document preview · ${previewDocument.filename}`}
          onClose={closePreview}
          variant="workspace"
          dismissOnBackdrop={false}
          bodyClassName="documentPreviewBody"
        >
          <div className="documentPreviewWorkspace">
            <header className="documentPreviewToolbar">
              <div className="documentPreviewIdentity">
                <span><FileText size={21} /></span>
                <div>
                  <span className="eyebrow">Uploaded document</span>
                  <b>{previewDocument.filename}</b>
                  <small>{previewDocument.kind?.replaceAll("_", " ") || "Unclassified"} · {previewDocument.page_count ? `${previewDocument.page_count} pages` : "Page count unavailable"}</small>
                </div>
              </div>
              <div className="documentPreviewActions">
                <button type="button" className="iconBtn" onClick={() => void preview.refetch()} disabled={preview.isFetching} title="Refresh preview link" aria-label="Refresh preview link">
                  <RefreshCw size={17} className={preview.isFetching ? "spin" : undefined} />
                </button>
                {preview.data?.url && <a className="btn" href={preview.data.url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open PDF</a>}
                <button type="button" className="btn" disabled={download.isPending} onClick={() => download.mutate(previewDocument)}>
                  <Download size={16} /> {download.isPending ? "Preparing…" : "Download"}
                </button>
              </div>
            </header>
            <main className="documentPreviewStage">
              {preview.isLoading || preview.isFetching ? (
                <div className="documentPreviewState"><RefreshCw size={28} className="spin" /><b>Loading secure PDF…</b><span>The preview link is authorized for this file.</span></div>
              ) : preview.error ? (
                <div className="documentPreviewState error"><TriangleAlert size={30} /><b>Preview unavailable</b><span>{preview.error instanceof Error ? preview.error.message : "The PDF could not be loaded."}</span><button type="button" className="btn" onClick={() => void preview.refetch()}>Try again</button></div>
              ) : preview.data?.url ? (
                <iframe className="documentPreviewFrame" src={preview.data.url} title={`Preview of ${previewDocument.filename}`} />
              ) : (
                <div className="documentPreviewState"><TriangleAlert size={30} /><b>Preview unavailable</b><span>No archived PDF is available for this document.</span></div>
              )}
            </main>
            <footer className="documentPreviewFooter">
              <span><b>Secure preview</b> The file remains inside the authorized rep workspace.</span>
              <span>{preview.data?.expires_in ? `Link refreshes on demand · ${Math.round(preview.data.expires_in / 60)} minute access window` : "Short-lived access link"}</span>
            </footer>
            {download.error && <div className="documentPreviewDownloadError">{download.error instanceof Error ? download.error.message : "The PDF could not be downloaded."}</div>}
          </div>
        </Drawer>
      )}
      {deleteDocument && (
        <Drawer title="Remove document" onClose={() => !removeDocument.isPending && setDeleteDocument(null)} width={560} dismissOnBackdrop={false}>
          <div className="documentDeleteConfirm">
            <span className="documentDeleteIcon"><Trash2 size={22} /></span>
            <div>
              <b>{deleteDocument.filename}</b>
              <p>This removes the document from the active file and its connected bucket. The archived evidence and audit record are retained.</p>
            </div>
            {(bucketSync.data?.application_submitted || bucketSync.data?.package_evidence_exists) && (
              <div className="documentDeletePolicy"><ShieldCheck size={17} /><span><b>Submitted file</b> This action is restricted to a super admin and will be recorded.</span></div>
            )}
            {removeDocument.error && <div className="documentError">{removeDocument.error instanceof Error ? removeDocument.error.message : "The document could not be removed."}</div>}
            <div className="documentDeleteActions">
              <button type="button" className="btn" onClick={() => setDeleteDocument(null)} disabled={removeDocument.isPending}>Cancel</button>
              <button type="button" className="btn danger" onClick={() => removeDocument.mutate(deleteDocument)} disabled={removeDocument.isPending}>
                <Trash2 size={16} /> {removeDocument.isPending ? "Removing…" : "Remove document"}
              </button>
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}
