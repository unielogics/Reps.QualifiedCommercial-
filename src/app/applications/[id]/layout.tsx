"use client";

// The case header and its tabs.
//
// Ported from Capital OS's dealers/[id]/layout.tsx, which solved this already:
// a sticky bar under the app topbar carrying identity and state, pulled to the
// content edges with negative margins so it reads as its own bar rather than as
// a card. `.ckhead` and `.cktabs` are already in the stylesheet.
//
// Two of the five tabs are the same route. "Application" is the wizard, and
// "Financial profile" is that wizard at step 3 — which is how the design draws
// it, because the profile is a step in the sequence and also the thing a rep
// jumps straight to once a file is verified. Keeping them as one route with a
// ?step= parameter means the step survives a refresh and both tabs are real,
// linkable URLs.

import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { useCase } from "@/lib/useCase";

function fmtDate(iso: string | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function stageLabel(stage: string): string {
  if (stage === "underwriting") return "Verified · underwriting";
  if (stage === "verification") return "In verification";
  return "Intake";
}

export default function CaseLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const pathname = usePathname();
  const search = useSearchParams();
  const step = Number(search.get("step") || "1");

  const { dealer, verification } = useCase(id);

  const base = `/applications/${id}`;
  const onWizard = pathname === base;
  const tabs = [
    { href: `${base}?step=1`, label: "Application", on: onWizard && step !== 3 },
    { href: `${base}?step=3`, label: "Financial profile", on: onWizard && step === 3 },
    { href: `${base}/documents`, label: "Documents", on: pathname.startsWith(`${base}/documents`) },
    { href: `${base}/messages`, label: "Messages", on: pathname.startsWith(`${base}/messages`) },
    { href: `${base}/audit`, label: "Audit trail", on: pathname.startsWith(`${base}/audit`) },
  ];

  return (
    <>
      <div className="ckhead">
        <div className="ckrow">
          <h2>{dealer?.name ?? "…"}</h2>
          {dealer?.case_ref && <span className="cellchip c-mut num">{dealer.case_ref}</span>}
          <span className="cellchip c-acc">{stageLabel(verification.stage)}</span>
          <span className={`cellchip ${verification.unlocked ? "c-ok" : "c-warn"}`}>
            {verification.reason}
          </span>
          <span style={{ flex: 1 }} />
          {dealer && <span className="sub">Opened {fmtDate(dealer.created_at)}</span>}
          <button type="button" className="btn sm">
            Assign to desk
          </button>
          <button type="button" className="btn sm">
            Case actions
          </button>
        </div>
        <div className="cktabs">
          {tabs.map((t) => (
            <Link key={t.label} href={t.href} className={t.on ? "on" : undefined}>
              {t.label}
            </Link>
          ))}
        </div>
      </div>
      {children}
    </>
  );
}
