"use client";
// MIRROR: keep identical to QCRep/src/production-package/*
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PackageClient } from "./client";
import { provisional as computeProvisional } from "./compute";
import { debounce, errorDetail, errorMessage, errorStatus, openSignedUrl } from "./format";
import { STEPS } from "./schema";
import { AttentionList } from "./AttentionList";
import { AllClearSummary } from "./AllClearSummary";
import { PackageTopBar } from "./PackageTopBar";
import { ShareDrawer } from "./ShareDrawer";
import { Step1Parties } from "./steps/Step1Parties";
import { Step2Lot } from "./steps/Step2Lot";
import { Step3Products } from "./steps/Step3Products";
import { Step4Advance } from "./steps/Step4Advance";
import { Step5Buildout } from "./steps/Step5Buildout";
import { Step6Thresholds } from "./steps/Step6Thresholds";
import { Step7Shortfall } from "./steps/Step7Shortfall";
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
};

type Notice = { message: string; tone: Tone } | null;

function shallowDiff(before: Arrangement, after: Arrangement): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  keys.forEach((k) => {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) out[k] = after[k];
  });
  return out;
}

export function ProductionPackageWorkspace({ client, initial, onPackage, headerRight, shareOpen, onShareClose }: WorkspaceProps) {
  const [pkg, setPkg] = useState<ProductionPackage>(initial);
  const [draft, setDraft] = useState<Arrangement>(initial.arrangement);
  const [step, setStep] = useState<StepKey>(initial.status === "draft" ? "parties" : "send");
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sponsors, setSponsors] = useState<SponsorOption[]>([]);
  const [team, setTeam] = useState<Array<{ id: string; name: string; email: string; role: string }>>([]);
  const savedRef = useRef<Arrangement>(initial.arrangement);
  const versionRef = useRef<number>(initial.version);
  const draftRef = useRef<Arrangement>(initial.arrangement);
  draftRef.current = draft;

  const adopt = useCallback((next: ProductionPackage, keepDraft = false) => {
    setPkg(next);
    versionRef.current = next.version;
    savedRef.current = next.arrangement;
    if (!keepDraft) setDraft(next.arrangement);
    onPackage?.(next);
  }, [onPackage]);

  useEffect(() => {
    if (client.mode !== "operator") return;
    client.sponsors?.().then(setSponsors).catch(() => undefined);
    client.team?.().then((rows) => setTeam(rows.filter((r) => ["super_admin", "loan_exec", "field_rep"].includes(r.role)))).catch(() => undefined);
  }, [client]);

  // Poll while a signature is outstanding so the signatory rows move on their own.
  useEffect(() => {
    if (pkg.status !== "out_for_signature") return;
    const timer = window.setInterval(() => {
      client.load().then((next) => { if (next.version !== versionRef.current || next.status !== pkg.status) adopt(next); }).catch(() => undefined);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [client, pkg.status, adopt]);

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

  const set = useCallback((key: string, value: unknown) => {
    if (readOnly) return;
    setDraft((d) => ({ ...d, [key]: value }));
    scheduleSave();
  }, [readOnly, scheduleSave]);

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

  const prov = useMemo(() => computeProvisional(draft), [draft]);
  const dirty = useMemo(() => Object.keys(shallowDiff(savedRef.current, draft)).length > 0, [draft, pkg.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const ctx: StepCtx = {
    pkg, draft, computed: pkg.computed, prov, provenance: pkg.prefill_provenance, saving: saving || dirty, readOnly,
    mode: client.mode, focusKey, set, setProduct, setThreshold, confirm, go, notify, teamOptions: team,
  };

  const reload = useCallback(async () => {
    setBusy("reload");
    try { adopt(await client.load()); setConflict(null); } catch (err) { notify(errorMessage(err), "bad"); } finally { setBusy(null); }
  }, [client, adopt, notify]);

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
  const active = STEPS.find((s) => s.key === step) ?? STEPS[0];

  const jumpTo = (item: { step: StepKey; key: string }) => { setStep(item.step); setFocusKey(item.key); };

  return (
    <div className={`pp-root${readOnly ? " locked" : ""}`}>
      <PackageTopBar
        pkg={pkg} step={step} attention={attention} saving={saving} dirty={dirty} busy={busy}
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
          {pkg.status === "draft" ? (
            attention.length ? <AttentionList items={attention} onJump={jumpTo} /> : <AllClearSummary pkg={pkg} />
          ) : (
            <AllClearSummary pkg={pkg} />
          )}
        </aside>
        <main className="pp-main">
          <header className="pp-step-h">
            <div className="pp-eyebrow">Step {STEPS.findIndex((s) => s.key === step) + 1} of {STEPS.length}</div>
            <h2 className="pp-title">{active.title}</h2>
            <p className="pp-sub">{active.sub}</p>
          </header>
          {step === "parties" ? <Step1Parties ctx={ctx} sponsors={sponsors} /> : null}
          {step === "lot" ? <Step2Lot ctx={ctx} /> : null}
          {step === "products" ? <Step3Products ctx={ctx} /> : null}
          {step === "advance" ? <Step4Advance ctx={ctx} /> : null}
          {step === "buildout" ? <Step5Buildout ctx={ctx} /> : null}
          {step === "thresholds" ? <Step6Thresholds ctx={ctx} /> : null}
          {step === "shortfall" ? <Step7Shortfall ctx={ctx} /> : null}
          {step === "projection" ? <Step8Projection ctx={ctx} /> : null}
          {step === "preview" ? <Step9Preview ctx={ctx} client={client} /> : null}
          {step === "send" ? <Step10Send ctx={ctx} client={client} onPackage={(next) => adopt(next)} onPresentation={generatePresentation} /> : null}
          <footer className="pp-step-f">
            {STEPS.findIndex((s) => s.key === step) > 0 ? <PBtn onClick={() => go(STEPS[STEPS.findIndex((s) => s.key === step) - 1].key)}>Back</PBtn> : <span />}
            {STEPS.findIndex((s) => s.key === step) < STEPS.length - 1 ? <PBtn variant="pri" onClick={() => go(STEPS[STEPS.findIndex((s) => s.key === step) + 1].key)}>Next: {STEPS[STEPS.findIndex((s) => s.key === step) + 1].label}</PBtn> : null}
          </footer>
        </main>
      </div>
      {client.mode === "operator" && shareOpen ? (
        <ShareDrawer client={client} pkg={pkg} team={team} open={Boolean(shareOpen)} onClose={() => onShareClose?.()} onPackage={(next) => adopt(next, true)} />
      ) : null}
    </div>
  );
}
