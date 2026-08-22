"use client";

import { useEffect, type ReactNode } from "react";

export default function Drawer({
  title,
  onClose,
  children,
  width = 860,
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
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(15,23,32,.38)",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: `min(${width}px, 100vw)`,
          height: "100vh",
          overflowY: "auto",
          background: "var(--surface)",
          borderLeft: "1px solid var(--line)",
          boxShadow: "var(--sh2)",
        }}
      >
        <div className="panel-h" style={{ position: "sticky", top: 0, zIndex: 1, background: "var(--surface)" }}>
          <b style={{ fontFamily: "var(--fh)", fontSize: 15 }}>{title}</b>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn sm" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        <div style={{ padding: 16 }}>{children}</div>
      </section>
    </div>
  );
}
