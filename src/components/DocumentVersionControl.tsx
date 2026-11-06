"use client";

import { useEffect, useRef, useState } from "react";
import { History } from "lucide-react";
import Drawer from "@/components/Drawer";
import { ApiError } from "@/lib/api";
import { versionLabel, versionNumber, type DealerDocumentHistory, type DealerDocumentVersion, type DocumentVersionMetadata } from "@/lib/documentVersions";
import styles from "./DocumentVersionControl.module.css";

export default function DocumentVersionControl({ document, load, upload, openVersion, onChanged }: {
  document: DocumentVersionMetadata & { id: string; filename: string };
  load: () => Promise<DealerDocumentHistory>;
  upload: (file: File, previous: DealerDocumentVersion, idempotencyKey: string) => Promise<unknown>;
  openVersion: (file: DealerDocumentVersion, download: boolean) => Promise<unknown>;
  onChanged: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false), [history, setHistory] = useState<DealerDocumentHistory | null>(null);
  const [file, setFile] = useState<File | null>(null), [busy, setBusy] = useState(false), [closing, setClosing] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [conflict, setConflict] = useState(false);
  const retry = useRef<{ fingerprint: string; key: string; previous: DealerDocumentVersion } | null>(null);
  const picker = useRef<HTMLInputElement>(null), loadRef = useRef(load); loadRef.current = load;
  async function reload(reset = false) {
    setBusy(true); setError("");
    try { setHistory(await loadRef.current()); setConflict(false); if (reset) retry.current = null; }
    catch (reason) { setError(reason instanceof Error ? reason.message : "History could not be loaded."); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (open) { setFile(null); setMessage(""); setClosing(false); retry.current = null; void reload(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, document.id]);
  const latest = history?.versions.find((item) => item.id === history.latest_file_id) || history?.versions[0];
  function close() { if (!busy) { if (file) setClosing(true); else setOpen(false); } }
  async function submit() {
    if (!file || !latest || busy || conflict || !history?.can_upload_new_version) return;
    const previous = retry.current?.previous || latest;
    const fingerprint = `${file.name}:${file.size}:${file.lastModified}:${previous.id}:${versionNumber(previous)}`;
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID(), previous };
    setBusy(true); setError(""); setMessage("");
    try {
      const receipt = await upload(file, previous, retry.current.key);
      setFile(null); retry.current = null; if (picker.current) picker.current.value = "";
      const duplicate = Boolean(receipt && typeof receipt === "object" && "document_version_status" in receipt && receipt.document_version_status === "duplicate");
      setMessage(duplicate ? "This file matches an existing version; no additional evidence is counted." : "New version received. The system will analyze the latest document; financial changes still require the applicable review.");
      const refreshed = await Promise.allSettled([loadRef.current(), onChanged()]);
      if (refreshed[0].status === "fulfilled") setHistory(refreshed[0].value);
      if (refreshed.some((result) => result.status === "rejected")) setMessage("Version received. Refresh the file to see its latest status.");
    } catch (reason) {
      const stale = reason instanceof ApiError && reason.status === 409;
      setConflict(stale); setError(stale ? "A newer version was uploaded in another session. Your file is retained; reload history before choosing the next version." : reason instanceof Error ? reason.message : "Upload failed. Your selected file is retained for retry.");
    } finally { setBusy(false); }
  }
  async function preview(version: DealerDocumentVersion, download: boolean) {
    setError("");
    try { await openVersion(version, download); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The selected version could not be opened."); }
  }
  return <><button type="button" className="iconBtn" title={`Versions of ${document.filename}`} aria-label={`Versions of ${document.filename}`} onClick={() => setOpen(true)}><History size={16} /></button>{open ? <Drawer title="Document versions" onClose={close} dismissOnBackdrop={false} width={900}>
    <div className={styles.layout}>
      <strong>{document.filename}</strong>
      <p className={styles.intro}>Upload a newer copy of this same document. Keep different loans, accounts and reporting periods as separate documents. Original uploads remain in history.</p>
      {closing ? <div className={styles.notice}><p>The selected upload has not finished.</p><button className="btn" onClick={() => setClosing(false)}>Keep editing</button><button className="btn" onClick={() => { setFile(null); retry.current = null; setOpen(false); }}>Close without retrying</button></div> : null}
      {error ? <div className={`${styles.notice} ${styles.warning}`}><span role="alert">{error}</span><button className="btn" disabled={busy} onClick={() => void reload(conflict)}>Reload history</button></div> : null}
      {message ? <div className={styles.notice} role="status">{message}</div> : null}
      {latest && ["pending", "failed", "rejected"].includes(latest.document_version_status || "") ? <div className={`${styles.notice} ${styles.warning}`}>The latest version {latest.document_version_status === "pending" ? "is being checked" : "could not be used"}. Earlier versions remain in history and are not treated as the latest evidence.</div> : null}
      {history ? <div className={styles.list} aria-label="Dated document versions">{[...history.versions].sort((left, right) => versionNumber(right) - versionNumber(left)).map((version) => <article key={version.id} className={styles.version}><div className={styles.copy}><b>{versionLabel(version)}</b><span>{version.file_name}</span><small>{version.created_at ? new Date(version.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Date not recorded"}</small><small>{version.analysis_status ? `Analysis: ${version.analysis_status.replaceAll("_", " ")}` : "Analysis status unavailable"}</small>{version.analysis_reason_code === "document_identity_mismatch" ? <small>This replacement identifies a different owner, account, period or loan. Upload it separately or ask the file team to review its association.</small> : null}</div><div className={styles.actions}>{version.can_preview !== false ? <button className="btn" onClick={() => void preview(version, false)}>View v{versionNumber(version)}</button> : null}{version.can_download !== false ? <button className="btn" onClick={() => void preview(version, true)}>Download</button> : null}</div></article>)}</div> : busy ? <p className="sub">Loading history…</p> : null}
      {history?.can_upload_new_version && latest ? <fieldset className={styles.upload} disabled={busy || conflict}><label>Upload v{versionNumber(retry.current?.previous || latest) + 1}<input ref={picker} aria-label="New document version" type="file" onChange={(event) => { setFile(event.target.files?.[0] || null); retry.current = null; setError(""); setMessage(""); setClosing(false); }} /></label><button className="btn pri" disabled={!file || busy || conflict} onClick={() => void submit()}>{busy ? "Uploading…" : "Upload new version"}</button></fieldset> : history ? <p className="sub">{document.filename.toLowerCase().endsWith(".zip") ? "Upload new versions of the individual documents inside this archive." : "Version history is read only for this document."}</p> : null}
      <div className={styles.close}><button className="btn" disabled={busy} onClick={close}>Close</button></div>
    </div>
  </Drawer> : null}</>;
}
