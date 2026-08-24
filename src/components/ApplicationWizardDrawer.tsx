"use client";

import { useRouter } from "next/navigation";
import Drawer from "./Drawer";
import NewApplicationForm from "./NewApplicationForm";

const STEPS = [
  ["1", "Applicant intake", "Open the file, capture consent, request amount and use."],
  ["2", "Verification", "Send bank and credit authorization from the new case."],
  ["3", "Financial profile", "Unlocked only after bank and credit return."],
  ["4", "Credit application", "Persist the remaining submission fields."],
  ["5", "Contracts and execution", "Generate forms, send signature, collect review times."],
];

export default function ApplicationWizardDrawer({ onClose, onMinimize, minimized = false }: { onClose: () => void; onMinimize?: () => void; minimized?: boolean }) {
  const router = useRouter();
  return (
    <Drawer title="Open application" width={1360} onClose={onClose} onMinimize={onMinimize} minimized={minimized}>
      <div className="wizardModalGrid">
        <div className="wizardRail">
          <div className="panel">
            <div className="panel-h">Guided application</div>
            <div className="panel-b" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {STEPS.map(([n, title, blurb], i) => (
                <div key={n} className={`rung${i === 0 ? " cur" : ""}`} style={{ alignItems: "flex-start" }}>
                  <span
                    className="n"
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 8,
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 800,
                      fontSize: 13,
                      background: i === 0 ? "var(--accent)" : "var(--sunken)",
                      color: i === 0 ? "#fff" : "var(--muted)",
                      flexShrink: 0,
                    }}
                  >
                    {n}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <b style={{ display: "block", fontFamily: "var(--fh)", fontSize: 13.5 }}>{title}</b>
                    <span className="sub">{blurb}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="note">
            Step 1 creates the file and collects the complete ownership schedule. Step 2 unlocks
            after ownership totals 100% and every 20%+ owner has personal contact information.
          </div>
        </div>
        <div>
          <NewApplicationForm
            variant="modal"
            onCancel={onClose}
            onCreated={(id) => {
              onClose();
              router.push(`/applications/${id}?step=1`);
            }}
          />
        </div>
      </div>
    </Drawer>
  );
}
