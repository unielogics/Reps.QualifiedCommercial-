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
import { useEffect, useRef, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Clipboard, FileText, Lock, LockOpen, MoreVertical, Send, ScrollText } from "lucide-react";
import { useCase } from "@/lib/useCase";
import { api } from "@/lib/api";
import { useMe } from "@/lib/useMe";
import Modal from "@/components/Modal";

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
  const router = useRouter();
  const search = useSearchParams();
  const step = Number(search.get("step") || "1");
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { isSuperAdmin } = useMe();
  const [assignOpen, setAssignOpen] = useState(false);
  const [deskNote, setDeskNote] = useState("");
  const [caseMenuOpen, setCaseMenuOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const caseMenuRef = useRef<HTMLDivElement | null>(null);

  const { dealer, verification } = useCase(id);
  useEffect(() => {
    if (!caseMenuOpen) return;
    const close = (event: PointerEvent) => {
      if (!caseMenuRef.current?.contains(event.target as Node)) setCaseMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [caseMenuOpen]);
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

  const assignToDesk = useMutation({
    mutationFn: async () => api(`/dealer-os/dealers/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({
        channel: "desk",
        body: deskNote.trim() || "This file has been assigned to the desk for review.",
      }),
      authToken: (await getToken()) ?? undefined,
    }),
    onSuccess: async () => {
      setAssignOpen(false);
      setDeskNote("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["messages", id, "desk"] }),
        queryClient.invalidateQueries({ queryKey: ["inbox-threads"] }),
        queryClient.invalidateQueries({ queryKey: ["unread-summary"] }),
      ]);
      router.push(`/applications/${id}/messages`);
    },
  });

  const copyCaseLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      window.prompt("Copy this case link", window.location.href);
    }
    setCaseMenuOpen(false);
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
          <button type="button" className="btn sm" onClick={() => setAssignOpen(true)}>
            <Send size={15} /> Assign to desk
          </button>
          <div className="popwrap" ref={caseMenuRef}>
            <button type="button" className="btn sm" aria-haspopup="menu" aria-expanded={caseMenuOpen} onClick={() => setCaseMenuOpen((open) => !open)}>
              <MoreVertical size={15} /> Case actions
            </button>
            {caseMenuOpen && <div className="popmenu caseActionMenu" role="menu">
              <Link className="mi" role="menuitem" href={`${base}/documents`} onClick={() => setCaseMenuOpen(false)}><FileText size={15} /> Documents</Link>
              <Link className="mi" role="menuitem" href={`${base}/audit`} onClick={() => setCaseMenuOpen(false)}><ScrollText size={15} /> Audit trail</Link>
              <button type="button" className="mi" role="menuitem" onClick={() => void copyCaseLink()}><Clipboard size={15} /> {linkCopied ? "Link copied" : "Copy case link"}</button>
            </div>}
          </div>
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
      {assignOpen && <Modal title="Assign file to desk" width={560} onClose={() => !assignToDesk.isPending && setAssignOpen(false)}>
        <p style={{ marginTop: 0 }}>Send an internal handoff to the underwriting desk. The client cannot see this note.</p>
        <label className="lbl" htmlFor="desk-handoff-note">Handoff note <span className="sub">Optional</span></label>
        <textarea id="desk-handoff-note" className="field" rows={4} value={deskNote} onChange={(event) => setDeskNote(event.target.value)} placeholder="What should the desk review?" autoFocus />
        {assignToDesk.isError && <div className="warnline mt">The handoff could not be sent. Try again.</div>}
        <div className="row mt" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" className="btn" disabled={assignToDesk.isPending} onClick={() => setAssignOpen(false)}>Cancel</button>
          <button type="button" className="btn pri" disabled={assignToDesk.isPending} onClick={() => assignToDesk.mutate()}><Send size={15} /> {assignToDesk.isPending ? "Assigning..." : "Assign to desk"}</button>
        </div>
      </Modal>}
    </>
  );
}
