"use client";

// The one modal.
//
// Neither this app nor Capital OS had a generic one: every overlay across both
// repos is the same hand-rolled `position:fixed; inset:0; background:
// rgba(15,23,32,.38)` copied into a component. There are five of those. This is
// the sixth written once instead.
//
// Behaviour a hand-rolled overlay usually forgets, and the reason it is worth
// extracting: Escape closes it, a click on the backdrop closes it but a click
// inside does not, and the page behind does not scroll while it is open.

import { useEffect, type ReactNode } from "react";

export default function Modal({
  title,
  onClose,
  children,
  width = 760,
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
    // Freeze the page behind. Without this the backdrop scrolls under the
    // dialog on a phone, which is exactly where a rep will use it.
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
        background: "rgba(15,23,32,.38)",
        zIndex: 50,
        display: "grid",
        placeItems: "center",
        padding: 20,
        overflowY: "auto",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="card hi"
        onClick={(e) => e.stopPropagation()}
        style={{ width: `min(${width}px, 100%)`, padding: 0, maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="panel-h" style={{ borderBottom: "1px solid var(--line)" }}>
          <b style={{ fontFamily: "var(--fh)", fontSize: 15 }}>{title}</b>
          <span style={{ flex: 1 }} />
          <button type="button" className="linky" onClick={onClose}>
            Close
          </button>
        </div>
        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>
  );
}
