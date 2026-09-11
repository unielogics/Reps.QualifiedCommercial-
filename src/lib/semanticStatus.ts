export type SemanticStatusTone = "gathering" | "processing" | "approved" | "denied" | "neutral";

const STATUS_TONES: Record<SemanticStatusTone, Set<string>> = {
  gathering: new Set(["new", "open", "proposed", "missing", "requested", "submitted", "scheduled", "collecting_docs", "not_started", "not_ready", "awaiting", "awaiting_applicant", "awaiting_response", "not_enough_evidence_yet"]),
  processing: new Set(["confirmed", "follow_up", "queued", "uploading", "analyzing", "reviewing", "received_unverified", "stale", "processing", "pending", "potential", "advisory", "in_progress", "qualifying", "in_underwriting", "needs_attention", "term_sheet_provided", "promising"]),
  approved: new Set(["active", "recommended", "indexed", "extracted", "prequalified", "verified", "waived", "not_applicable", "approved", "reviewed", "converted", "closed_won", "complete", "completed", "done", "ready", "ready_for_funding", "funded", "sent", "delivered"]),
  denied: new Set(["error", "undelivered", "blocked", "no_show", "not_qualified", "failed", "failed_review", "denied", "closed_lost", "rejected"]),
  neutral: new Set(["cancelled", "canceled", "expired", "disabled", "draft"]),
};

export function semanticStatusTone(status: string | null | undefined): SemanticStatusTone | null {
  const normalized = String(status || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  for (const [tone, values] of Object.entries(STATUS_TONES) as Array<[SemanticStatusTone, Set<string>]>) {
    if (values.has(normalized)) return tone;
  }
  if (/(^|_)(failed|denied|rejected|blocked|error|poor)(_|$)/.test(normalized)) return "denied";
  if (/(^|_)(new|missing|requested|submitted|awaiting|collecting)(_|$)/.test(normalized)) return "gathering";
  if (/(^|_)(pending|processing|reviewing|analyzing|underwriting|qualifying|promising|follow_up|needs_attention)(_|$)/.test(normalized)) return "processing";
  if (/(^|_)(verified|complete|completed|ready|approved|funded|delivered|sent|recommended|indexed|extracted)(_|$)/.test(normalized)) return "approved";
  return null;
}

export function semanticStatusClass(status: string | null | undefined): string {
  return `semantic-status semantic-status-${semanticStatusTone(status) ?? "neutral"}`;
}
