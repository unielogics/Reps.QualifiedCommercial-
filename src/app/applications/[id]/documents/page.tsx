"use client";

import { useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, apiUpload } from "@/lib/api";
import { useCase } from "@/lib/useCase";

type Doc = {
  id: string;
  filename: string;
  kind: string | null;
  status: string;
  source: string | null;
  page_count: number | null;
  created_at: string;
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

function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function uploadId(file: File, index: number): string {
  return `${file.name}-${file.size}-${file.lastModified}-${index}`;
}

export default function DocumentsTab() {
  const { id } = useParams<{ id: string }>();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [kind, setKind] = useState("other");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const { decision } = useCase(id);

  const authReady = isLoaded && Boolean(isSignedIn);
  const authenticatedGet = async <T,>(path: string): Promise<T> => {
    try {
      return await api<T>(path, { authToken: (await getToken()) ?? undefined });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      return api<T>(path, { authToken: (await getToken({ skipCache: true })) ?? undefined });
    }
  };
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
  const screeningNeeds = Array.from(new Set(
    (decision?.programs ?? [])
      .filter((program) => program.eligible || program.blocked_by.length === 0)
      .flatMap((program) => program.needs)
      .map((need) => need.trim())
      .filter((need) => need && !requestedLabels.has(need.toLowerCase())),
  ));
  const total = received.length + open.length;
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
            <tr><th>Document</th><th>Classification</th><th>Source</th><th>Status</th><th className="r">Received</th><th className="r">Pages</th></tr>
          </thead>
          <tbody>
            {received.map((document) => (
              <tr key={document.id}>
                <td><b>{document.filename}</b></td>
                <td className="sub">{document.kind?.replaceAll("_", " ") || "Classifying"}</td>
                <td className="sub">{document.source === "plaid" ? "Bank connection" : document.source || "Uploaded"}</td>
                <td><span className={`cellchip ${document.status === "failed" ? "c-bad" : document.status === "extracted" ? "c-ok" : "c-acc"}`}>{document.status === "failed" ? "Could not read" : document.status === "extracted" ? "Indexed" : "Processing"}</span></td>
                <td className="r sub num">{when(document.created_at)}</td>
                <td className="r num">{document.page_count ?? "—"}</td>
              </tr>
            ))}
            {total === 0 && !docs.isLoading && !authError && (
              <tr><td colSpan={6} className="documentEmpty"><b>No evidence on this file yet</b><span>Upload documents above or request them from the applicant. Bank-connected statements appear here automatically.</span></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
