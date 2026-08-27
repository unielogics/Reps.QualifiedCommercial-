"use client";

import { useEffect, type CSSProperties, type ReactNode } from "react";

export default function Drawer({
  title,
  onClose,
  children,
  width = 960,
  onMinimize,
  minimized = false,
  variant = "modal",
  dismissOnBackdrop = true,
  bodyClassName,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  onMinimize?: () => void;
  minimized?: boolean;
  variant?: "modal" | "workspace";
  dismissOnBackdrop?: boolean;
  bodyClassName?: string;
}) {
  useEffect(() => {
    if (minimized) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [minimized, onClose]);

  return (
    <div
      className={`modalOverlay${variant === "workspace" ? " modalWorkspace" : ""}${minimized ? " minimized" : ""}`}
      role="presentation"
      onClick={dismissOnBackdrop ? onClose : undefined}
      style={{
        "--modal-w": `${width}px`,
      } as CSSProperties}
    >
      <section
        className="modalDialog"
        role="dialog"
        aria-modal={variant === "modal"}
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modalHead">
          <b>{title}</b>
          <span style={{ flex: 1 }} />
          {onMinimize && (
            <button type="button" className="modalClose" onClick={onMinimize} aria-label="Minimize" title="Minimize">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                <path d="M5 12h14" />
              </svg>
            </button>
          )}
          <button type="button" className="modalClose" onClick={onClose} aria-label="Close" title="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className={`modalBody${bodyClassName ? ` ${bodyClassName}` : ""}`}>{children}</div>
      </section>
    </div>
  );
}
