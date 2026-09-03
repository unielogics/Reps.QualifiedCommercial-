"use client";
// MIRROR: keep identical to QCRep/src/production-package/*
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PackageClient } from "./client";
import { provisional as computeProvisional } from "./compute";
import { debounce, errorDetail, errorMessage, errorStatus, openSignedUrl } from "./format";
import { SPONSOR_KEYS, TERM_SHEET_KEYS, stepsFor } from "./schema";
import { AllClearSummary } from "./AllClearSummary";
import { PackageTopBar } from "./PackageTopBar";
import { ShareDrawer } from "./ShareDrawer";
import { TermSheetDrawer } from "./TermSheetDrawer";
import { Step1Parties } from "./steps/Step1Parties";
import { Step2Lot } from "./steps/Step2Lot";
import { Step3Products } from "./steps/Step3Products";
import { Step4Advance } from "./steps/Step4Advance";
import { Step5Buildout } from "./steps/Step5Buildout";
import { Step6Thresholds } from "./steps/Step6Thresholds";
import { Step7Shortfall } from "./steps/Step7Shortfall";
import { StepFunding } from "./steps/StepFunding";
import { StepDisclosures } from "./steps/StepDisclosures";
import { Step8Projection } from "./steps/Step8Projection";
import { Step9Preview } from "./steps/Step9Preview";
import { Step10Send } from "./steps/Step10Send";
import type { StepCtx, Tone } from "./ui";
import { PBtn } from "./ui";
import type { Arrangement, ProductKey, ProductionPackage, SponsorOption, StepKey, ThresholdKey } from "./types";

export type WorkspaceProps = {
  client: PackageClient;
  initial: ProductionPackage;
  onPackage?: (pkg: ProductionPackage) => void;
  headerRight?: ReactNode;
  shareOpen?: boolean;
  onShareClose?: () => void;
  /** The profile the term sheet lives on; defaults to the package's. */
  profileId?: string;
  /** Host-provided term-sheet surface; when absent the workspace opens its own drawer (operator transport only). */
  onOpenTermSheet?: () => void;
  /** Open the final (stage two) package by id — the host swaps the client. */
  onOpenFinal?: (finalPackageId: string) => void;
  /** Open the executed commitment (parent) by id. */
  onOpenOriginal?: (parentPackageId: string) => void;
};

type Notice = { message: string; tone: Tone } | null;

const ATTENTION_PANEL_ID = "pp-attention-panel";

function shallowDiff(before: Arrangement, after: Arrangement): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  keys.forEach((k) => {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) out[k] = after[k];
  });
  return out;
}

function initialStep(p: ProductionPackage): StepKey {
  if (p.status !== "draft") return "send";
  return p.stage === 2 ? "funding" : "parties";
}

// Keys the final does not edit on the form: loan terms live on the term sheet, the sponsor is carried from stage one.
function lockedOnFinal(key: string): boolean {
  return TERM_SHEET_KEYS.has(key) || SPONSOR_KEYS.has(key) || key === "sponsor_company_id";
}

export function ProductionPackageWorkspace({ client, initial, onPackage, headerRight, shareOpen, onShareClose, profileId, onOpenTermSheet, onOpenFinal, onOpenOriginal }: WorkspaceProps) {
  const [pkg, setPkg] = useState<ProductionPackage>(initial);
  const [draft, setDraft] = useState<Arrangement>(initial.arrangement);
  const [step, setStep] = useState<StepKey>(initialStep(initial));
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sponsors, setSponsors] = useState<SponsorOption[]>([]);
  const [team, setTeam] = useState<Array<{ id: string; name: string; email: string; role: string }>>([]);
  const [termsOpen, setTermsOpen] = useState(false);
  // The open-item list is hidden until the flag in the container is clicked.
  const [attentionOpen, setAttentionOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const savedRef = useRef<Arrangement>(initial.arrangement);
  const versionRef = useRef<number>(initial.version);
  const draftRef = useRef<Arrangement>(initial.arrangement);
  draftRef.current = draft;
  const steps = useMemo(() => stepsFor(pkg.stage), [pkg.stage]);

  const adopt = useCallback((next: ProductionPackage, keepDraft = false) => {
    setPkg(next);
    versionRef.current = next.version;
    savedRef.current = next.arrangement;
    if (!keepDraft) setDraft(next.arrangement);
    onPackage?.(next);
  }, [onPackage]);

  // Operator-only lookups: the transport must be the operator's and the role must be a team role
  // (a dealer partner rides the operator transport on their own lead but cannot pick the sponsor).
  useEffect(() => {
    if (client.mode !== "operator" || initial.mode !== "operator") return;
    client.sponsors?.().then(setSponsors).catch(() => undefined);
    client.team?.().then((rows) => setTeam(rows.filter((r) => ["super_admin", "loan_exec", "field_rep"].includes(r.role)))).catch(() => undefined);
  }, [client, initial.mode]);

  // Poll while a signature is outstanding so the signatory rows move on their own (and the auto-execute lands).
  useEffect(() => {
    if (pkg.status !== "out_for_signature") return;
    const timer = window.setInterval(() => {
      client.load().then((next) => { if (next.version !== versionRef.current || next.status !== pkg.status || next.execution_pending !== pkg.execution_pending) adopt(next); }).catch(() => undefined);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [client, pkg.status, pkg.execution_pending, adopt]);

  const notify = useCallback((message: string, tone: Tone = "acc") => setNotice({ message, tone }), []);

  const flushSave = useMemo(() => debounce(async (confirmKeys: string[]) => {
    const changes = shallowDiff(savedRef.current, draftRef.current);
    if (!Object.keys(changes).length && !confirmKeys.length) return;
    setSaving(true);
    try {
      const next = await client.patch(versionRef.current, changes, confirmKeys);
      const locallyEdited = shallowDiff(draftRef.current, next.arrangement);
      // Keep whatever the user typed while the save was in flight.
      adopt(next, Object.keys(locallyEdited).length > 0);
      setConflict(null);
    } catch (err) {
      const status = errorStatus(err);
      const detail = errorDetail(err);
      if (status === 409 && detail?.code === "stale_version") {
        setConflict("Someone else saved this package. Reload to pick up their changes.");
      } else if (status === 409 && detail?.code === "package_frozen") {
        setConflict("This package was sent for signature. Reload to continue.");
      } else if (status === 422 && (detail?.code === "maintained_by_term_sheet" || detail?.code === "maintained_by_desk")) {
        // Those keys are owned elsewhere: put the saved values back and say so.
        const fields = Array.isArray(detail.fields) ? (detail.fields as string[]) : [];
        setDraft((d) => { const next: Arrangement = { ...d }; fields.forEach((f) => { (next as Record<string, unknown>)[f] = savedRef.current[f]; }); return next; });
        setNotice({ message: String(detail.message ?? "Those fields are maintained elsewhere."), tone: "warn" });
      } else {
        setNotice({ message: errorMessage(err, "Your last change could not be saved."), tone: "bad" });
      }
    } finally {
      setSaving(false);
    }
  }, 600), [client, adopt]);

  const pendingConfirms = useRef<string[]>([]);
  const scheduleSave = useCallback(() => { flushSave(pendingConfirms.current.splice(0)); }, [flushSave]);

  useEffect(() => {
    const onUnload = () => flushSave.flush();
    window.addEventListener("beforeunload", onUnload);
    return () => { window.removeEventListener("beforeunload", onUnload); flushSave.flush(); };
  }, [flushSave]);

  const readOnly = pkg.status !== "draft" || !pkg.capabilities.can_edit || Boolean(conflict);
  const two = pkg.stage === 2;

  const set = useCallback((key: string, value: unknown) => {
    if (readOnly) return;
    if (two && lockedOnFinal(key)) { notify(TERM_SHEET_KEYS.has(key) ? "Loan terms are changed on the term sheet." : "The sponsor is carried from the executed commitment.", "warn"); return; }
    setDraft((d) => ({ ...d, [key]: value }));
    scheduleSave();
  }, [readOnly, two, notify, scheduleSave]);

  const setProduct = useCallback((key: ProductKey, field: string, value: unknown) => {
    if (readOnly) return;
    setDraft((d) => ({ ...d, products: { ...d.products, [key]: { ...d.products[key], [field]: value } } }));
    scheduleSave();
  }, [readOnly, scheduleSave]);

  const setThreshold = useCallback((key: ThresholdKey, value: unknown) => {
    if (readOnly) return;
    setDraft((d) => ({ ...d, thresholds: { ...d.thresholds, [key]: value as never } }));
    scheduleSave();
  }, [readOnly, scheduleSave]);

  const confirm = useCallback((key: string) => {
    if (pkg.status !== "draft") return;
    pendingConfirms.current.push(key);
    setPkg((p) => ({ ...p, prefill_provenance: { ...p.prefill_provenance, [key]: { ...(p.prefill_provenance[key] ?? { source: "user", label: "Edited" }), confirmed: true } } }));
    scheduleSave();
  }, [pkg.status, scheduleSave]);

  const go = useCallback((next: StepKey) => { setStep(next); flushSave.flush(); }, [flushSave]);

  const reload = useCallback(async () => {
    setBusy("reload");
    try { adopt(await client.load()); setConflict(null); } catch (err) { notify(errorMessage(err), "bad"); } finally { setBusy(null); }
  }, [client, adopt, notify]);

  // The term sheet: the host may own the surface; otherwise the workspace opens its own drawer over the operator transport.
  const hostsTerms = !onOpenTermSheet && Boolean(client.termSheet);
  const openTerms = useCallback(() => {
    if (onOpenTermSheet) onOpenTermSheet();
    else if (client.termSheet) setTermsOpen(true);
    else notify("The term sheet is recorded from the desk.", "mut");
  }, [onOpenTermSheet, client, notify]);
  const closeTerms = useCallback(() => {
    setTermsOpen(false);
    flushSave.flush();
    // Recording terms may re-apply them to a draft final or unlock "Draft final package" on the commitment.
    client.load().then((next) => adopt(next)).catch(() => undefined);
  }, [client, adopt, flushSave]);

  const prov = useMemo(() => computeProvisional(draft), [draft]);
  const dirty = useMemo(() => Object.keys(shallowDiff(savedRef.current, draft)).length > 0, [draft, pkg.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const ctx: StepCtx = {
    pkg, draft, computed: pkg.computed, prov, provenance: pkg.prefill_provenance, saving: saving || dirty, readOnly,
    mode: pkg.mode, profileId: profileId ?? pkg.profile_id, focusKey, set, setProduct, setThreshold, confirm, go, notify, teamOptions: team,
    onOpenTermSheet: openTerms, onOpenFinal, onOpenOriginal,
  };

  const generatePresentation = useCallback(async () => {
    flushSave.flush();
    setBusy("presentation");
    try {
      const next = await client.presentation();
      adopt(next, true);
      openSignedUrl(next.presentation.url);
      notify("Presentation PDF generated.", "ok");
    } catch (err) {
      const detail = errorDetail(err);
      if (detail?.code === "attention" && Array.isArray(detail.items) && detail.items.length) {
        const first = detail.items[0] as { step?: StepKey; key?: string };
        notify("Fill the presentation fields first — the first open item is highlighted.", "warn");
        if (first.step) setStep(first.step);
        if (first.key) setFocusKey(first.key);
      } else {
        notify(errorMessage(err, "The presentation could not be generated."), "bad");
      }
    } finally {
      setBusy(null);
    }
  }, [client, adopt, notify, flushSave]);

  const attention = pkg.status === "draft" ? pkg.computed.attention : [];
  const stepIndex = Math.max(0, steps.findIndex((s) => s.key === step));
  const active = steps[stepIndex] ?? steps[0];
  const current = active.key;

  // Jumping to an item behaves like clicking its step chip, and closes the list behind it.
  const jumpTo = (item: { step: StepKey; key: string }) => {
    setStep(item.step);
    setFocusKey(item.key);
    flushSave.flush();
    setAttentionOpen(false);
  };
  const showAttention = attentionOpen && attention.length > 0;

  useEffect(() => { if (!attention.length) setAttentionOpen(false); }, [attention.length]);

  useEffect(() => {
    const root = rootRef.current;
    const bar = barRef.current;
    if (!root || !bar || typeof ResizeObserver === "undefined") return;
    const apply = () => root.style.setProperty("--pp-stick", `${Math.round(bar.getBoundingClientRect().height) + 14}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  return (
    <div className={`pp-root${readOnly ? " locked" : ""}`} ref={rootRef}>
      <PackageTopBar
        pkg={pkg} step={current} attention={attention} saving={saving} dirty={dirty} busy={busy}
        attentionOpen={showAttention} onToggleAttention={() => setAttentionOpen((v) => !v)}
        onCloseAttention={() => setAttentionOpen(false)} onJump={jumpTo}
        attentionPanelId={ATTENTION_PANEL_ID} barRef={barRef}
        onStep={go} onPresentation={generatePresentation} onPreview={() => go("preview")} onSend={() => go("send")}
        right={headerRight}
      />
      {conflict ? (
        <div className="pp-conflict" role="alert">
          <span>{conflict}</span>
          <PBtn variant="pri" size="sm" onClick={reload} busy={busy === "reload"}>Reload</PBtn>
        </div>
      ) : null}
      {notice ? (
        <div className={`pp-notice t-${notice.tone}`} role="status">
          <span>{notice.message}</span>
          <button type="button" className="pp-btn v-link s-sm" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      ) : null}
      <div className="pp-body">
        <aside className="pp-rail">
          <AllClearSummary pkg={pkg} openItems={attention.length} />
        </aside>
        <main className="pp-main">
          <header className="pp-step-h">
            <div className="pp-eyebrow">Step {stepIndex + 1} of {steps.length}{two ? " · final" : ""}</div>
            <h2 className="pp-title">{active.title}</h2>
            <p className="pp-sub">{active.sub}</p>
          </header>
          {current === "parties" ? <Step1Parties ctx={ctx} sponsors={sponsors} client={client} onPackage={(next) => adopt(next, true)} /> : null}
          {current === "lot" ? <Step2Lot ctx={ctx} /> : null}
          {current === "products" ? <Step3Products ctx={ctx} /> : null}
          {current === "advance" ? <Step4Advance ctx={ctx} /> : null}
          {current === "buildout" ? <Step5Buildout ctx={ctx} /> : null}
          {current === "thresholds" ? <Step6Thresholds ctx={ctx} /> : null}
          {current === "shortfall" ? <Step7Shortfall ctx={ctx} /> : null}
          {current === "funding" ? <StepFunding ctx={ctx} /> : null}
          {current === "disclosures" ? <StepDisclosures ctx={ctx} /> : null}
          {current === "projection" ? <Step8Projection ctx={ctx} /> : null}
          {current === "preview" ? <Step9Preview ctx={ctx} client={client} /> : null}
          {current === "send" ? <Step10Send ctx={ctx} client={client} onPackage={(next) => adopt(next)} onPresentation={generatePresentation} /> : null}
          <footer className="pp-step-f">
            {stepIndex > 0 ? <PBtn onClick={() => go(steps[stepIndex - 1].key)}>Back</PBtn> : <span />}
            {stepIndex < steps.length - 1 ? <PBtn variant="pri" onClick={() => go(steps[stepIndex + 1].key)}>Next: {steps[stepIndex + 1].label}</PBtn> : null}
          </footer>
        </main>
      </div>
      {client.mode === "operator" && !two && shareOpen ? (
        <ShareDrawer client={client} pkg={pkg} team={team} open={Boolean(shareOpen)} onClose={() => onShareClose?.()} onPackage={(next) => adopt(next, true)} />
      ) : null}
      {hostsTerms && termsOpen ? (
        <TermSheetDrawer client={client} profileId={profileId ?? pkg.profile_id} open={termsOpen} onClose={closeTerms} pkg={pkg}
          onSaved={(result) => { if (result.final && result.final.id === pkg.id) adopt(result.final); }} />
      ) : null}
    </div>
  );
}
