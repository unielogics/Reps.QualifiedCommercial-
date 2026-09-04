// MIRROR: keep identical to QCRep/src/production-package/*
// Transport is injected: the dashboard passes its authed fetcher and a package id,
// the rep app passes its authed fetcher and the share token. The workspace never
// knows which app it is in; the package's capabilities decide what renders.
import type {
  ApiCall, ApiInit, Arrangement, Comparison, Computed, AttentionItem, HistoryEvent, ProductionPackage, SendRequest, SendResult,
  ShareLink, Signature, SmsConsent, SponsorOption, StoredSignatureRead, TeamMember, TermSheetBody, TermSheetResult, TermSheetState,
} from "./types";

export type SponsorCompanyFields = {
  entity_type: string; state_of_formation: string; principal_address: string;
  notice_email: string; notice_attention: string; notice_address: string;
  platform_name: string; signatory_name: string; signatory_title: string; phone: string;
};

export type PrefillResult = {
  values: Record<string, unknown>;
  provenance: Record<string, { source: string; label: string; confirmed: boolean }>;
  applied: string[];
  skipped: string[];
  missing: string[];
};

export type ComputeResult = { computed: Computed; attention: AttentionItem[]; attention_presentation: AttentionItem[] };

// Fallback only: a party with no signature on file (SUPER_ADMIN).
export type ManualSignatureBody = {
  party: "qc" | "sponsor" | "rm";
  initials?: string;
  signer_name: string;
  signer_title: string;
  signed_on: string;
  attestation: boolean;
  note?: string;
  override_reason?: string;
  scan_file_name?: string;
  scan_content_type?: string;
};

export type ManualSignatureResult = {
  signature: Signature;
  package: ProductionPackage;
  scan_upload: { signature_id: string; key: string; url?: string; headers?: Record<string, string>; method?: string } | null;
};

export interface PackageClient {
  // The transport: the dashboard's operator routes or the rep's share-link routes.
  // Rendering is decided by `pkg.capabilities` / `pkg.mode`, never by this.
  readonly mode: "operator" | "rep";
  load(): Promise<ProductionPackage>;
  patch(version: number, changes: Record<string, unknown>, confirm?: string[]): Promise<ProductionPackage>;
  prefill(opts?: { force?: boolean; fields?: string[]; apply?: boolean }): Promise<PrefillResult>;
  compute(arrangement: Partial<Arrangement>, stage?: number): Promise<ComputeResult>;
  presentation(): Promise<ProductionPackage>;
  // Stage-one agents (a rep via their link, a partner on their own lead) may send and remind — `caps.can_send` / `caps.can_remind` decide.
  send?(body: SendRequest): Promise<SendResult>;
  remind?(body: { channel: "sms" | "email" }): Promise<SendResult>;
  // operator only — absent on the share client
  sponsors?(): Promise<SponsorOption[]>;
  /** Correct the sponsor company itself. The desk owns it; packages copy from it. */
  updateSponsor?(companyId: string, changes: Partial<SponsorCompanyFields>): Promise<SponsorOption>;
  team?(): Promise<TeamMember[]>;
  reopen?(reason: string): Promise<ProductionPackage>;
  voidPackage?(reason: string): Promise<ProductionPackage>;
  recordManual?(body: ManualSignatureBody): Promise<ManualSignatureResult>;
  scanComplete?(signatureId: string, sha256: string): Promise<ProductionPackage>;
  /** Retry the executed bundle after the dealer signed but the assembly failed (`pkg.execution_pending`). */
  execute?(): Promise<ProductionPackage>;
  /** Draft the final (stage two) from this executed stage-one package; returns the child. */
  draftFinal?(): Promise<ProductionPackage>;
  /** Original vs final rows for this package (parent or child id). */
  comparison?(): Promise<Comparison>;
  /** Authorize the sponsor's agreement signature for use on production agreements (SUPER_ADMIN). */
  adoptSponsorSignature?(reason: string): Promise<StoredSignatureRead>;
  // term sheet — keyed on the profile, not the package
  termSheet?(profileId: string): Promise<TermSheetState>;
  saveTermSheet?(profileId: string, body: TermSheetBody): Promise<TermSheetResult>;
  withdrawTermSheet?(profileId: string, reason: string): Promise<TermSheetState>;
  createShareLink?(body: { rep_user_id: string; label?: string; expires_in_days: number; outside_book?: boolean }): Promise<{ link: ShareLink; url: string; expires_at: string }>;
  revokeShareLink?(linkId: string): Promise<void>;
  history?(): Promise<{ events: HistoryEvent[] }>;
  captureSmsConsent?(body: { phone: string; consenter_name: string; method: string }): Promise<SmsConsent>;
  revisionDocument?(revisionId: string, phase: "unsigned" | "current" | "executed"): Promise<{ url: string | null; sha256: string | null; phase: string }>;
}

const json = (body: unknown, method = "POST"): ApiInit => ({ method, body: JSON.stringify(body) });

/** Resolve (or create) the stage-one package on a profile. */
export async function resolvePackage(call: ApiCall, profileId: string): Promise<ProductionPackage> {
  return call<ProductionPackage>("/production-packages/resolve", json({ profile_id: profileId }));
}

/** Load any package by id — the final (`final_package_id`) or the parent (`parent_package_id`). */
export async function loadPackage(call: ApiCall, packageId: string): Promise<ProductionPackage> {
  return call<ProductionPackage>(`/production-packages/${packageId}`);
}

export function createOperatorClient(call: ApiCall, packageId: string): PackageClient {
  const base = `/production-packages/${packageId}`;
  return {
    mode: "operator",
    load: () => call<ProductionPackage>(base),
    patch: (version, changes, confirm = []) => call<ProductionPackage>(base, json({ version, changes, confirm }, "PATCH")),
    prefill: (opts = {}) => call<PrefillResult>(`${base}/prefill`, json({ force: false, apply: true, ...opts })),
    compute: (arrangement, stage) => call<ComputeResult>(`${base}/compute`, json(stage ? { arrangement, stage } : { arrangement })),
    presentation: () => call<ProductionPackage>(`${base}/presentation`, json({})),
    sponsors: () => call<SponsorOption[]>("/production-packages/sponsors"),
    updateSponsor: (companyId, changes) => call<SponsorOption>(`/production-packages/sponsors/${companyId}`, json(changes, "PATCH")),
    team: () => call<TeamMember[]>("/users"),
    send: (body) => call<SendResult>(`${base}/send`, json(body)),
    remind: (body) => call<SendResult>(`${base}/remind`, json(body)),
    reopen: (reason) => call<ProductionPackage>(`${base}/reopen`, json({ reason })),
    voidPackage: (reason) => call<ProductionPackage>(`${base}/void`, json({ reason })),
    recordManual: (body) => call<ManualSignatureResult>(`${base}/signatures/manual`, json(body)),
    scanComplete: (signatureId, sha256) => call<ProductionPackage>(`${base}/signatures/${signatureId}/scan-complete`, json({ sha256 })),
    execute: () => call<ProductionPackage>(`${base}/execute`, json({})),
    draftFinal: () => call<ProductionPackage>(`${base}/final`, json({})),
    comparison: () => call<Comparison>(`${base}/comparison`),
    adoptSponsorSignature: (reason) => call<StoredSignatureRead>(`${base}/sponsor-signature/adopt`, json({ reason })),
    termSheet: (profileId) => call<TermSheetState>(`/production-packages/term-sheets/${profileId}`),
    saveTermSheet: (profileId, body) => call<TermSheetResult>(`/production-packages/term-sheets/${profileId}`, json(body)),
    withdrawTermSheet: (profileId, reason) => call<TermSheetState>(`/production-packages/term-sheets/${profileId}/withdraw`, json({ reason })),
    createShareLink: (body) => call(`${base}/share-links`, json(body)),
    revokeShareLink: (linkId) => call<void>(`${base}/share-links/${linkId}`, { method: "DELETE" }),
    history: () => call<{ events: HistoryEvent[] }>(`${base}/history`),
    captureSmsConsent: (body) => call<SmsConsent>(`${base}/sms-consent`, json(body)),
    revisionDocument: (revisionId, phase) => call(`${base}/revisions/${revisionId}/document?phase=${phase}`),
  };
}

export function createShareClient(call: ApiCall, token: string): PackageClient {
  const base = `/production-packages/shares/${encodeURIComponent(token)}`;
  return {
    mode: "rep",
    load: () => call<ProductionPackage>(base),
    patch: (version, changes, confirm = []) => call<ProductionPackage>(base, json({ version, changes, confirm }, "PATCH")),
    prefill: (opts = {}) => call<PrefillResult>(`${base}/prefill`, json({ force: false, apply: true, ...opts })),
    // The share routes are stage one by construction; the server ignores any stage.
    compute: (arrangement) => call<ComputeResult>(`${base}/compute`, json({ arrangement })),
    presentation: () => call<ProductionPackage>(`${base}/presentation`, json({})),
    send: (body) => call<SendResult>(`${base}/send`, json({ channel: body.channel })),
    remind: (body) => call<SendResult>(`${base}/remind`, json(body)),
  };
}
