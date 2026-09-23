"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Check, ChevronDown, Clipboard, Phone } from "lucide-react";
import { api } from "@/lib/api";

type CallMethod = "google_voice" | "device_dialer";

function e164(value?: string | null): string | null {
  if (!value) return null;
  const compact = value.trim();
  const digits = compact.replace(/\D/g, "");
  if (compact.startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

export default function ProspectCallAction({ phone, prospectId, compact = false, disabled = false, onInitiated }: { phone?: string | null; prospectId?: string; compact?: boolean; disabled?: boolean; onInitiated?: () => void }) {
  const { getToken } = useAuth();
  const rootRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [coarsePointer, setCoarsePointer] = useState(false);
  const [loggingMethod, setLoggingMethod] = useState<CallMethod | null>(null);
  const [callIssue, setCallIssue] = useState<{ method: CallMethod; recorded: boolean; idempotencyKey: string; message: string } | null>(null);
  const normalized = e164(phone);

  useEffect(() => {
    const media = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarsePointer(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenu(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menu]);

  const callTarget = (method: CallMethod) => method === "device_dialer"
    ? `tel:${normalized}`
    : `https://voice.google.com/u/0/calls?a=nc,%2B${normalized?.slice(1)}`;

  const openCall = (method: CallMethod, preparedWindow?: Window | null): boolean => {
    if (!normalized) return false;
    const target = callTarget(method);
    if (method === "device_dialer") {
      window.location.href = target;
      return true;
    }
    if (preparedWindow && !preparedWindow.closed) {
      preparedWindow.location.href = target;
      return true;
    }
    return Boolean(window.open(target, "_blank", "noopener,noreferrer"));
  };

  const logAndOpen = async (method: CallMethod, idempotencyKey = crypto.randomUUID()) => {
    if (!normalized || disabled || loggingMethod) return;
    setMenu(false);
    setCallIssue(null);
    if (!prospectId) {
      openCall(method);
      return;
    }

    // A blank tab must be opened during the original click so browsers do not
    // treat the eventual Google Voice navigation as an unsolicited popup. It
    // stays blank until the Marketing activity is durably recorded.
    const preparedWindow = method === "google_voice" ? window.open("about:blank", "_blank") : null;
    if (preparedWindow) preparedWindow.opener = null;
    setLoggingMethod(method);
    try {
      const timeoutSignal = typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(12_000) : undefined;
      await api(`/dealer-os/prospects/${prospectId}/call-attempts`, {
          method: "POST",
          body: JSON.stringify({ method, idempotency_key: idempotencyKey }),
          authToken: (await getToken()) ?? undefined,
          signal: timeoutSignal,
      });
      onInitiated?.();
      const opened = openCall(method, preparedWindow);
      if (!opened) {
        setCallIssue({
          method,
          recorded: true,
          idempotencyKey,
          message: "Call initiated was saved, but the browser blocked Google Voice. Allow popups, then open it again.",
        });
      }
    } catch (error) {
      preparedWindow?.close();
      setCallIssue({
        method,
        recorded: false,
        idempotencyKey,
        message: error instanceof Error
          ? `The call was not opened because its Marketing activity could not be saved: ${error.message}`
          : "The call was not opened because its Marketing activity could not be saved.",
      });
    } finally {
      setLoggingMethod(null);
    }
  };

  const primary: CallMethod = coarsePointer ? "device_dialer" : "google_voice";
  const alternate: CallMethod = primary === "google_voice" ? "device_dialer" : "google_voice";
  const primaryLabel = primary === "google_voice" ? "Call with Google Voice" : "Call";
  const alternateLabel = alternate === "google_voice" ? "Open Google Voice" : "Use device dialer";

  const copy = async () => {
    if (!normalized) return;
    try {
      await navigator.clipboard.writeText(normalized);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard is optional */ }
  };

  return <div ref={rootRef} className={`prospectCallAction${compact ? " compact" : ""}`}>
    <button type="button" className="btn pri prospectCallPrimary" disabled={!normalized || disabled || Boolean(loggingMethod)} title={disabled ? "Calling is disabled for this do-not-contact prospect." : undefined} onClick={() => void logAndOpen(primary)}><Phone size={16} /> {loggingMethod ? "Recording…" : compact ? "Call" : primaryLabel}</button>
    <button type="button" className="btn pri prospectCallMenuButton" disabled={!normalized || disabled || Boolean(loggingMethod)} aria-haspopup="menu" aria-expanded={menu} aria-label="More calling options" onClick={() => setMenu((value) => !value)}><ChevronDown size={15} /></button>
    {menu && <div className="prospectCallMenu" role="menu">
      <button type="button" role="menuitem" onClick={() => void logAndOpen(alternate)}><Phone size={16} /><span>{alternateLabel}</span></button>
      <button type="button" role="menuitem" onClick={() => void copy()}>{copied ? <Check size={16} /> : <Clipboard size={16} />}<span>{copied ? "Copied" : "Copy number"}</span></button>
    </div>}
    {callIssue && <div className="prospectCallAuditError" role="alert"><span>{callIssue.message}</span><div><button type="button" className="btn sm" onClick={() => { setCallIssue(null); if (callIssue.recorded) openCall(callIssue.method); else void logAndOpen(callIssue.method, callIssue.idempotencyKey); }}>{callIssue.recorded ? "Open again" : "Retry & call"}</button><button type="button" className="btn sm" onClick={() => setCallIssue(null)}>Dismiss</button></div></div>}
  </div>;
}
