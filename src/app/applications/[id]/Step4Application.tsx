"use client";

import { useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, ExternalLink, FileCheck2, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useCase } from "@/lib/useCase";
import ApplicationSigningPanel, { type MasterApplicationStatus } from "@/components/ApplicationSigningPanel";
import BookingDrawer from "@/components/BookingDrawer";
import { type SubmissionReadiness } from "@/lib/applicationReadiness";
import Step4Resolution, { type UnderwritingResolution } from "./Step4Resolution";

type SummaryState = {
  id: string | null;
  exists: boolean;
  status: string;
  revision: number;
  generated_at: string | null;
  sha256: string | null;
  source_sha256: string | null;
  stale: boolean;
  missing_data: string[];
  pdf_url: string | null;
  email_prompt: boolean;
  action: "created" | "updated" | "unchanged" | "not_generated";
};

const STATUS: Record<string, { label: string; cls: string }> = {
  complete: { label: "Complete", cls: "c-ok" },
  missing: { label: "Missing", cls: "c-warn" },
  supplemental: { label: "Supplemental only", cls: "c-warn" },
  not_applicable: { label: "Not applicable", cls: "c-mut" },
};

function summaryPage(dealerId: string, emailPrompt = false): string {
  return `/applications/${dealerId}/summary${emailPrompt ? "?emailPrompt=1" : ""}`;
}

export default function Step4Application({ dealerId }: { dealerId: string }) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const { workflow } = useCase(dealerId);
  const [applicationStatus, setApplicationStatus] = useState<MasterApplicationStatus>("not_generated");
  const [bookingOpen, setBookingOpen] = useState(false);
  const summaryWindow = useRef<Window | null>(null);
  const authenticated = async <T,>(path: string, init?: RequestInit) => api<T>(path, {
    ...init,
    authToken: (await getToken()) ?? undefined,
  });

  const readiness = useQuery({
    queryKey: ["submission-readiness", dealerId],
    queryFn: () => authenticated<SubmissionReadiness>(`/dealer-os/dealers/${dealerId}/submission-readiness`),
  });
  const resolution = useQuery({
    queryKey: ["underwriting-resolution", dealerId],
    queryFn: () => authenticated<UnderwritingResolution>(`/dealer-os/dealers/${dealerId}/underwriting-resolution`),
  });
  const summary = useQuery({
    queryKey: ["underwriting-summary", dealerId],
    queryFn: () => authenticated<SummaryState>(`/dealer-os/dealers/${dealerId}/underwriting-summary`),
  });
  const generateSummary = useMutation({
    mutationFn: () => authenticated<SummaryState>(`/dealer-os/dealers/${dealerId}/underwriting-summary`, { method: "POST" }),
    onSuccess: (saved) => {
      qc.setQueryData(["underwriting-summary", dealerId], saved);
      void qc.invalidateQueries({ queryKey: ["decision", dealerId] });
      const target = summaryWindow.current;
      if (target && !target.closed) target.location.replace(summaryPage(dealerId, saved.email_prompt));
      else window.open(summaryPage(dealerId, saved.email_prompt), "_blank", "noopener,noreferrer");
      summaryWindow.current = null;
    },
    onError: () => {
      summaryWindow.current?.close();
      summaryWindow.current = null;
    },
  });

  if (readiness.isLoading || resolution.isLoading || summary.isLoading) {
    return <div className="panel"><div className="panel-b sub">Loading routing and execution…</div></div>;
  }
  const route = resolution.data;
  const data = readiness.data;
  if (!route || !data) return <div className="warnline">The routing workspace could not be loaded. Refresh the file and try again.</div>;
  const packageItems = data.items.filter((item) => item.requirement !== "Human-reviewed fundable path");
  const openItems = packageItems.filter((item) => item.status === "missing" || item.status === "supplemental");
  const summaryState = summary.data;
  const workflowComplete = workflow.step_4.complete || applicationStatus === "executed";
  const packageWorkspace = (
    <ApplicationSigningPanel
      dealerId={dealerId}
      packageReady={data.package_ready}
      blockers={openItems.map((item) => item.requirement)}
      routeKey={route.program_selection.effective_program_key || data.route_key}
      onStatusChange={(status) => {
        setApplicationStatus(status);
        if (status === "executed") void qc.invalidateQueries({ queryKey: ["decision", dealerId] });
      }}
    />
  );

  return (
    <>
      <div className="panel">
        <div className="panel-h">
          Step 4 · Routing and execution
          <span className="sp" />
          <span className={`cellchip ${route.signing_mode === "program_package" ? "c-ok" : "c-warn"}`}>
            {route.signing_mode === "program_package" ? "Program package path" : "Review and booking path"}
          </span>
        </div>
        <div className="panel-b">
          <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
            <FileCheck2 size={22} />
            <div>
              <b>{data.route_label || "Funding route is being resolved"}</b>
              <p className="sub" style={{ margin: "5px 0 0", lineHeight: 1.55 }}>
                Review the system route, acknowledge any working-structure changes, select the effective submission path, and finish the rep workflow with package signing or a required review booking.
              </p>
            </div>
          </div>
        </div>
      </div>

      <Step4Resolution dealerId={dealerId} data={route} packageWorkspace={packageWorkspace} />

      <div className="panel">
        <div className="panel-h">Route-specific evidence<span className="sp" /><span className="sub">{data.rules_version}</span></div>
        <div className="panel-b" style={{ padding: 0 }}>
          <div className="tblwrap"><table className="tbl" style={{ minWidth: 720 }}><thead><tr><th>Requirement</th><th>Status</th><th>Evidence</th><th>Source</th></tr></thead><tbody>{packageItems.map((item) => { const state = STATUS[item.status] ?? STATUS.missing; return <tr key={`${item.route}:${item.requirement}`}><td><b>{item.requirement}</b><span className="sub" style={{ display: "block" }}>{item.route === "all" ? "All routes" : item.route}</span></td><td><span className={`cellchip ${state.cls}`}>{state.label}</span></td><td>{item.evidence}</td><td className="sub">{item.source || "Application record"}</td></tr>; })}</tbody></table></div>
        </div>
      </div>

      <div className={`panel${summaryState?.stale ? " panel-invalid" : ""}`}>
        <div className="panel-h">
          Persistent QC underwriting summary
          <span className="sp" />
          <span className={`cellchip ${summaryState?.exists && !summaryState.stale ? "c-ok" : "c-warn"}`}>
            {!summaryState?.exists ? "Not generated" : summaryState.stale ? "Update available" : `Current · revision ${summaryState.revision}`}
          </span>
        </div>
        <div className="panel-b">
          <p className="sub" style={{ marginTop: 0 }}>
            The saved PDF includes the funding profile, evidence, system results, and an audit of every bank or program override. Opening it never regenerates it.
          </p>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {summaryState?.exists && <button type="button" className="btn pri" onClick={() => window.open(summaryPage(dealerId), "_blank", "noopener,noreferrer")}><ExternalLink size={16} /> Open summary</button>}
            <button type="button" className="btn" disabled={generateSummary.isPending || Boolean(summaryState?.exists && !summaryState.stale)} onClick={() => {
              const target = window.open("about:blank", "_blank");
              if (target) target.opener = null;
              summaryWindow.current = target;
              generateSummary.mutate();
            }}>
              {summaryState?.exists ? <RefreshCw size={16} /> : <FileCheck2 size={16} />}
              {generateSummary.isPending ? "Building PDF…" : summaryState?.exists ? "Update summary" : "Generate summary"}
            </button>
            {route.signing_mode === "qc_summary_booking" && <button type="button" className="btn" onClick={() => setBookingOpen(true)}><CalendarClock size={16} /> Book required review</button>}
          </div>
          {summaryState?.generated_at && <span className="sub" style={{ display: "block", marginTop: 10 }}>Saved {new Date(summaryState.generated_at).toLocaleString()} · PDF hash {summaryState.sha256?.slice(0, 12)}…</span>}
          {summaryState?.missing_data.length ? <div className="warnline mt">Saved with unresolved fields: {summaryState.missing_data.join(", ")}</div> : null}
          {generateSummary.error && <div className="warnline mt">{generateSummary.error instanceof Error ? generateSummary.error.message : "The summary PDF could not be generated."}</div>}
        </div>
      </div>

      <div className={workflowComplete ? "note" : "warnline"}>
        <div className="row" style={{ gap: 8 }}>
          {workflowComplete && <CheckCircle2 size={18} />}
          <b>{workflowComplete ? "Agent workflow complete" : route.signing_mode === "program_package" ? "Client signature is the final agent checkpoint" : "Summary and booking complete the review path"}</b>
        </div>
        <p className="sub" style={{ marginBottom: 0 }}>Step 5 contains super-admin exception approvals, final decisions, status, migration, bucket, and funding controls.</p>
      </div>

      {bookingOpen && <BookingDrawer initialDealerId={dealerId} initialKind="underwriting_review" onClose={() => { setBookingOpen(false); void qc.invalidateQueries({ queryKey: ["decision", dealerId] }); }} />}
    </>
  );
}
