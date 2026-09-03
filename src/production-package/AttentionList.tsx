// MIRROR: keep identical to QCRep/src/production-package/*
import { stepsFor } from "./schema";
import { IconChevron, IconFlag } from "./icons";
import type { AttentionItem, StepKey } from "./types";

export function AttentionList({ items, onJump, stage, id, panel, onClose }: {
  items: AttentionItem[]; onJump: (item: AttentionItem) => void; stage?: number;
  /** Set when the list is the panel revealed by the container's flag. */
  id?: string; panel?: boolean; onClose?: () => void;
}) {
  const steps = stepsFor(stage);
  const known = new Set(steps.map((s) => s.key));
  const groups = steps.map((s) => ({ key: s.key as string, label: s.label, items: items.filter((i) => i.step === s.key) })).filter((g) => g.items.length);
  const stray = items.filter((i) => !known.has(i.step));
  if (stray.length) groups.push({ key: "other", label: "Other", items: stray });
  return (
    <section className={`pp-att${panel ? " pp-att-panel" : ""}`} id={id} aria-label="Needs attention">
      <header className="pp-att-h">
        <IconFlag /><b>{items.length} item{items.length === 1 ? "" : "s"} need attention</b>
        {onClose ? <button type="button" className="pp-att-x" onClick={onClose} aria-label="Hide the open items" title="Hide the open items">Hide</button> : null}
        <span className="pp-sub">Sending is blocked until the list is empty. Pick an item to jump to its step.</span>
      </header>
      {groups.map((g) => (
        <div key={g.key} className="pp-att-g">
          <div className="pp-att-step">{g.label}</div>
          {g.items.map((item) => (
            <button key={`${item.step}:${item.key}:${item.title}`} type="button" className="pp-att-row" onClick={() => onJump(item)}>
              <span><b>{item.title}</b><small>{item.detail}</small></span><IconChevron />
            </button>
          ))}
        </div>
      ))}
    </section>
  );
}

export function attentionForStep(items: AttentionItem[], step: StepKey): AttentionItem[] {
  return items.filter((i) => i.step === step);
}
