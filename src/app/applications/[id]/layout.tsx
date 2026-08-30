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
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, LockOpen } from "lucide-react";
import { useCase } from "@/lib/useCase";
import { api } from "@/lib/api";
import { useMe } from "@/lib/useMe";

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
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { isSuperAdmin } = useMe();

  const { dealer, verification } = useCase(id);
  const workflowSettings = useMutation({
    mutationFn: async (workflow_ungated: boolean) => api(
      `/dealer-os/dealers/${id}/workflow-settings`,
      {
        method: "PATCH",
        body: JSON.stringify({ workflow_ungated }),
        authToken: (await getToken()) ?? undefined,
      },
    ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dealer", id] }),
        queryClient.invalidateQueries({ queryKey: ["portfolio"] }),
      ]);
    },
  });
  const toggleWorkflowGate = () => {
    if (!dealer || dealer.is_training || workflowSettings.isPending) return;
    const next = !dealer.workflow_ungated;
    const prompt = next
      ? "Ungate Steps 1-4 for every authorized staff member on this file?"
      : "Restore the normal progression gates for every authorized staff member on this file?";
    if (window.confirm(prompt)) workflowSettings.mutate(next);
  };

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
          {dealer?.is_training && <span className="cellchip c-gold">Training</span>}
          {dealer?.workflow_ungated && <span className="cellchip c-acc">Ungated</span>}
          <span className="cellchip c-acc">{stageLabel(verification.stage)}</span>
          <span className={`cellchip ${verification.unlocked ? "c-ok" : "c-warn"}`}>
            {verification.reason}
          </span>
          <span style={{ flex: 1 }} />
          {dealer && <span className="sub">Opened {fmtDate(dealer.created_at)}</span>}
          {isSuperAdmin && dealer && (
            <button
              type="button"
              className="iconAction"
              onClick={toggleWorkflowGate}
              disabled={workflowSettings.isPending || dealer.is_training}
              title={dealer.is_training ? "Training files are always ungated" : dealer.workflow_ungated ? "Gate workflow" : "Ungate workflow"}
              aria-label={dealer.is_training ? "Training files are always ungated" : dealer.workflow_ungated ? "Gate workflow" : "Ungate workflow"}
            >
              {dealer.workflow_ungated ? <LockOpen size={18} /> : <Lock size={18} />}
            </button>
          )}
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
