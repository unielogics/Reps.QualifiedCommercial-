"use client";

import { useState } from "react";
import ApplicationWizardDrawer from "./ApplicationWizardDrawer";
import BookingDrawer from "./BookingDrawer";
import ContactShareDrawer from "./ContactShareDrawer";

type DrawerKey = "application" | "booking" | "share" | null;

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export default function ActionHub() {
  const [open, setOpen] = useState(false);
  const [drawer, setDrawer] = useState<DrawerKey>(null);
  const [applicationMinimized, setApplicationMinimized] = useState(false);
  const closeDrawer = () => {
    setDrawer(null);
    setApplicationMinimized(false);
  };
  return (
    <>
      <div className="popwrap">
        <button
          type="button"
          className="btn pri sm"
          title="Create or send"
          aria-label="Create or send"
          onClick={() => setOpen((v) => !v)}
          style={{ width: 44, padding: 0, justifyContent: "center" }}
        >
          <PlusIcon />
        </button>
        {open && (
          <div className="popmenu">
            <button type="button" className="mi" onClick={() => { setOpen(false); setApplicationMinimized(false); setDrawer("application"); }}>
              Open application
              <small>Start the guided five-step file flow.</small>
            </button>
            <button type="button" className="mi" onClick={() => { setOpen(false); setDrawer("booking"); }}>
              Book appointment
              <small>Schedule a callback, intro, or underwriting review.</small>
            </button>
            <button type="button" className="mi" onClick={() => { setOpen(false); setDrawer("share"); }}>
              Share contact card
              <small>Send your contact details by email or consented SMS.</small>
            </button>
          </div>
        )}
      </div>
      {drawer === "application" && (
        <ApplicationWizardDrawer
          onClose={closeDrawer}
          onMinimize={() => setApplicationMinimized(true)}
          minimized={applicationMinimized}
        />
      )}
      {drawer === "booking" && <BookingDrawer onClose={closeDrawer} />}
      {drawer === "share" && <ContactShareDrawer onClose={closeDrawer} />}
      {drawer === "application" && applicationMinimized && (
        <div className="draftDockTab">
          <button type="button" onClick={() => setApplicationMinimized(false)}>New application</button>
          <button type="button" aria-label="Close new application" title="Close" onClick={closeDrawer}>×</button>
        </div>
      )}
    </>
  );
}
