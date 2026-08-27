"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { FileUp, LoaderCircle, RotateCcw, X } from "lucide-react";
import { ApiError, apiUpload } from "@/lib/api";

export type ManagedUploadStatus =
  | "queued"
  | "uploading"
  | "extracting"
  | "complete"
  | "failed";

export type ManagedUpload = {
  id: string;
  dealerId: string;
  dealerName?: string;
  filename: string;
  status: ManagedUploadStatus;
  error?: string;
  createdAt: number;
  completedAt?: number;
};

type QueuedUpload = ManagedUpload & { file: File };

type UploadManagerValue = {
  uploads: ManagedUpload[];
  enqueueStatements: (dealerId: string, files: File[], dealerName?: string) => void;
  retry: (id: string) => void;
  dismiss: (id: string) => void;
};

const UploadManagerContext = createContext<UploadManagerValue | null>(null);

const INVALIDATION_KEYS = [
  "bank-evidence",
  "delivery-log",
  "decision",
  "documents",
  "periods",
  "health",
  "coverage",
  "verification",
  "pre-screen",
  "underwriting-resolution",
] as const;

function publicUpload(item: QueuedUpload): ManagedUpload {
  const { file: _file, ...rest } = item;
  return rest;
}

export function UploadManagerProvider({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<QueuedUpload[]>([]);
  const running = useRef(new Set<string>());

  const update = useCallback((id: string, patch: Partial<QueuedUpload>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const invalidateDealer = useCallback(
    async (dealerId: string) => {
      await Promise.all(
        INVALIDATION_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: [key, dealerId] })),
      );
    },
    [queryClient],
  );

  const processUpload = useCallback(
    async (item: QueuedUpload) => {
      if (running.current.has(item.id)) return;
      running.current.add(item.id);
      update(item.id, { status: "uploading", error: undefined });

      const extractionTimer = window.setTimeout(() => {
        update(item.id, { status: "extracting" });
      }, 900);

      try {
        const form = new FormData();
        form.append("file", item.file);
        form.append("kind", "statement");
        let token = (await getToken()) ?? undefined;
        try {
          await apiUpload(`/dealer-os/dealers/${item.dealerId}/documents`, form, {
            authToken: token,
          });
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 401) throw error;
          token = (await getToken({ skipCache: true })) ?? undefined;
          await apiUpload(`/dealer-os/dealers/${item.dealerId}/documents`, form, {
            authToken: token,
          });
        }
        window.clearTimeout(extractionTimer);
        update(item.id, { status: "complete", completedAt: Date.now() });
        await invalidateDealer(item.dealerId);
      } catch (error) {
        window.clearTimeout(extractionTimer);
        update(item.id, {
          status: "failed",
          error: error instanceof Error ? error.message : "Upload failed",
          completedAt: Date.now(),
        });
      } finally {
        running.current.delete(item.id);
      }
    },
    [getToken, invalidateDealer, update],
  );

  const enqueueStatements = useCallback(
    (dealerId: string, files: File[], dealerName?: string) => {
      const valid = files.filter((file) => file.size > 0);
      if (!valid.length) return;
      const created = valid.map<QueuedUpload>((file, index) => ({
        id: `${Date.now()}-${index}-${file.name}-${file.size}`,
        dealerId,
        dealerName,
        filename: file.name,
        file,
        status: "queued",
        createdAt: Date.now(),
      }));
      setItems((current) => [...created, ...current].slice(0, 60));
      created.forEach((item) => void processUpload(item));
    },
    [processUpload],
  );

  const retry = useCallback(
    (id: string) => {
      const item = items.find((candidate) => candidate.id === id);
      if (!item || item.status !== "failed") return;
      update(id, { status: "queued", error: undefined, completedAt: undefined });
      void processUpload(item);
    },
    [items, processUpload, update],
  );

  const dismiss = useCallback((id: string) => {
    if (running.current.has(id)) return;
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const value = useMemo<UploadManagerValue>(
    () => ({ uploads: items.map(publicUpload), enqueueStatements, retry, dismiss }),
    [dismiss, enqueueStatements, items, retry],
  );

  return <UploadManagerContext.Provider value={value}>{children}</UploadManagerContext.Provider>;
}

export function useUploadManager(): UploadManagerValue {
  const value = useContext(UploadManagerContext);
  if (!value) throw new Error("useUploadManager must be used inside UploadManagerProvider");
  return value;
}

export function UploadStatusMenu() {
  const { uploads, retry, dismiss } = useUploadManager();
  const [open, setOpen] = useState(false);
  const active = uploads.filter((item) => ["queued", "uploading", "extracting"].includes(item.status));
  const failed = uploads.filter((item) => item.status === "failed");
  const recent = uploads.slice(0, 10);
  const attention = failed.length > 0;

  if (!uploads.length) return null;

  return (
    <div className="popwrap">
      <button
        type="button"
        className="btn sm uploadStatusTrigger"
        aria-label={`${active.length} uploads processing, ${failed.length} failed`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {active.length ? <LoaderCircle className="systemStatusSpin" aria-hidden /> : <FileUp aria-hidden />}
        <span className={`uploadStatusIndicator ${attention ? "attention" : active.length ? "working" : "ready"}`} />
        {(active.length || failed.length) > 0 && <span className="navbadge">{active.length + failed.length}</span>}
      </button>
      {open && (
        <section className="popmenu uploadStatusMenu" role="dialog" aria-label="File upload status">
          <header className="systemStatusHead">
            <div>
              <b>File processing</b>
              <small>Uploads continue while you work in this browser tab.</small>
            </div>
          </header>
          {recent.map((item) => (
            <div className={`uploadStatusRow ${item.status}`} key={item.id}>
              <span className="uploadState" aria-hidden />
              <div>
                <b>{item.filename}</b>
                <small>{item.dealerName || "Application"} · {item.status === "extracting" ? "Extracting financial data" : item.status}</small>
                {item.error && <small className="dangerText">{item.error}</small>}
              </div>
              {item.status === "failed" ? (
                <button type="button" className="iconButton" title="Retry upload" onClick={() => retry(item.id)}>
                  <RotateCcw aria-hidden />
                </button>
              ) : !active.some((candidate) => candidate.id === item.id) ? (
                <button type="button" className="iconButton" title="Dismiss" onClick={() => dismiss(item.id)}>
                  <X aria-hidden />
                </button>
              ) : null}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
