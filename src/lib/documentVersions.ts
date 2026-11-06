export type DocumentVersionMetadata = {
  document_family_id?: string | null;
  document_version_number?: number;
  document_version_status?: string;
  is_current_document_version?: boolean;
};
export type DealerDocumentVersion = DocumentVersionMetadata & {
  id: string;
  file_name: string;
  filename?: string;
  content_type?: string;
  created_at: string;
  analysis_status?: string | null;
  analysis_reason_code?: string | null;
  can_preview?: boolean;
  can_download?: boolean;
};
export type DealerDocumentHistory = {
  document_family_id: string;
  current_file_id: string | null;
  latest_file_id: string | null;
  can_upload_new_version: boolean;
  versions: DealerDocumentVersion[];
};
export function versionNumber(file: DocumentVersionMetadata): number {
  return Number.isInteger(file.document_version_number) && (file.document_version_number || 0) > 0 ? file.document_version_number! : 1;
}
export function versionLabel(file: DocumentVersionMetadata): string {
  const labels: Record<string, string> = { current: "Current", pending: "Being checked", superseded: "Historical", failed: "Analysis failed", rejected: "Needs another version", duplicate: "Duplicate upload" };
  const state = file.document_version_status || (file.is_current_document_version ? "current" : "");
  return `v${versionNumber(file)}${state ? ` · ${labels[state] || state.replaceAll("_", " ")}` : ""}`;
}
/** Server families identify replacements; identical names never combine periods or accounts. */
export function latestDealerDocuments<T extends DocumentVersionMetadata & { id: string }>(files: T[]): T[] {
  const families = new Map<string, T>();
  for (const file of files) {
    const key = file.document_family_id || file.id, current = families.get(key);
    if (!current || versionNumber(file) > versionNumber(current)) families.set(key, file);
  }
  return [...families.values()];
}
