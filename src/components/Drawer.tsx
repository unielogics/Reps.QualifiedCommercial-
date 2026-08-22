"use client";

import { useEffect, type CSSProperties, type ReactNode } from "react";

export default function Drawer({
  title,
  onClose,
  children,
  width = 960,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  useEffect(() => {
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
  }, [onClose]);

  return (
    <div
      className="modalOverlay"
      role="presentation"
      onClick={onClose}
      style={{
        "--modal-w": `${width}px`,
      } as CSSProperties}
    >
      <section
        className="modalDialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modalHead">
          <b>{title}</b>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn sm" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        <div className="modalBody">{children}</div>
      </section>
    </div>
  );
}
