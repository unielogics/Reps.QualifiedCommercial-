"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle2, LoaderCircle, RefreshCw, XCircle } from "lucide-react";
import { api } from "@/lib/api";

type ProviderStatus = {
  configured: boolean;
  environment: string;
  endpoint: string | null;
  detail: string;
};

type IntegrationStatus = {
  isoftpull: ProviderStatus;
  plaid: ProviderStatus;
  sms: ProviderStatus;
  messaging: ProviderStatus;
  address: ProviderStatus;
};

type StatusItem = ProviderStatus & {
  key: keyof IntegrationStatus;
  label: string;
  ready: boolean;
};

export default function SystemStatusMenu() {
  const { getToken } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const status = useQuery({
    queryKey: ["dealer-integrations-status"],
    queryFn: async () => api<IntegrationStatus>("/dealer-os/integrations/status", {
      authToken: (await getToken()) ?? undefined,
    }),
    staleTime: 60_000,
    refetchInterval: open ? 60_000 : false,
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const items = useMemo<StatusItem[]>(() => {
    if (!status.data) return [];
    return [
      { key: "isoftpull", label: "iSoftPull", ...status.data.isoftpull, ready: status.data.isoftpull.configured },
      {
        key: "plaid",
        label: "Plaid",
        ...status.data.plaid,
        ready: status.data.plaid.configured && status.data.plaid.environment === "production",
      },
      { key: "sms", label: "SMS", ...status.data.sms, ready: status.data.sms.configured },
      { key: "messaging", label: "Message sync", ...status.data.messaging, ready: status.data.messaging.configured },
      { key: "address", label: "Address", ...status.data.address, ready: status.data.address.configured },
    ];
  }, [status.data]);

  const blockedCount = items.filter((item) => !item.ready).length;
  const summary = status.isLoading
    ? "Checking system status"
    : status.isError
      ? "System status unavailable"
      : blockedCount > 0
        ? `${blockedCount} integration${blockedCount === 1 ? "" : "s"} need attention`
        : "All integrations ready";

  return (
    <div className="popwrap" ref={rootRef}>
      <button
        type="button"
        className="btn sm systemStatusTrigger"
        aria-label={summary}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={summary}
        onClick={() => setOpen((value) => !value)}
      >
        <Activity aria-hidden />
        <span
          className={`systemStatusIndicator ${status.isError || blockedCount > 0 ? "attention" : status.isLoading ? "checking" : "ready"}`}
          aria-hidden
        />
      </button>

      {open && (
        <section className="popmenu systemStatusMenu" role="dialog" aria-label="System status">
          <header className="systemStatusHead">
            <div>
              <b>System status</b>
              <small>{summary}</small>
            </div>
            <button
              type="button"
              className="systemStatusRefresh"
              aria-label="Refresh system status"
              title="Refresh status"
              disabled={status.isFetching}
              onClick={() => void status.refetch()}
            >
              <RefreshCw className={status.isFetching ? "systemStatusSpin" : undefined} aria-hidden />
            </button>
          </header>

          {status.isLoading && (
            <div className="systemStatusState"><LoaderCircle className="systemStatusSpin" aria-hidden /> Checking integrations...</div>
          )}
          {status.isError && (
            <div className="systemStatusState error"><AlertTriangle aria-hidden /> Status could not be loaded. Refresh to try again.</div>
          )}
          {items.map((item) => (
            <div className="systemStatusRow" key={item.key}>
              <span className={`systemStatusIcon ${item.ready ? "ready" : "blocked"}`}>
                {item.ready ? <CheckCircle2 aria-hidden /> : <XCircle aria-hidden />}
              </span>
              <div>
                <span className="systemStatusName"><b>{item.label}</b><em>{item.environment || "Not configured"}</em></span>
                <small>{item.detail}</small>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
