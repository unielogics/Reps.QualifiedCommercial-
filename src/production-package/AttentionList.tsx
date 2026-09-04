// MIRROR: keep identical to QCRep/src/production-package/*
import { stepsFor } from "./schema";
import { IconChevron, IconFlag } from "./icons";
import type { AttentionItem, StepKey } from "./types";

export function AttentionList({ items, onJump, stage, id, panel, onClose, mode }: {
  items: AttentionItem[]; onJump: (item: AttentionItem) => void; stage?: number;
  /** Set when the list is the panel revealed by the container's flag. */
  id?: string; panel?: boolean; onClose?: () => void;
  /** An agent cannot clear a desk-owned item; splitting them out is what stops
   *  the list reading as a wall of things they are failing to do. */
  mode?: string;
}) {
  const agent = mode !== undefined && mode !== "operator";
  const waiting = agent ? items.filter((i) => i.owner === "desk") : [];
  const mine = agent ? items.filter((i) => i.owner !== "desk") : items;
  const steps = stepsFor(stage);
  const known = new Set(steps.map((s) => s.key));
  const groups = steps.map((s) => ({ key: s.key as string, label: s.label, items: mine.filter((i) => i.step === s.key) })).filter((g) => g.items.length);
  const stray = mine.filter((i) => !known.has(i.step));
  if (stray.length) groups.push({ key: "other", label: "Other", items: stray });
  return (
    <section className={`pp-att${panel ? " pp-att-panel" : ""}`} id={id} aria-label="Needs attention">
      <header className="pp-att-h">
        <IconFlag /><b>{mine.length} item{mine.length === 1 ? "" : "s"} need attention</b>
        {onClose ? <button type="button" className="pp-att-x" onClick={onClose} aria-label="Hide the open items" title="Hide the open items">Hide</button> : null}
        <span className="pp-sub">
          Sending is blocked until the list is empty. Pick an item to jump to its step.
          {waiting.length ? ` ${waiting.length} more ${waiting.length === 1 ? "is" : "are"} with the desk.` : ""}
        </span>
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
      {waiting.length ? (
        <div className="pp-att-g">
          <div className="pp-att-step">Waiting on the desk</div>
          {waiting.map((item) => (
            <div key={`${item.step}:${item.key}`} className="pp-att-row is-waiting">
              <span><b>{item.title}</b><small>An admin or underwriter sets this. {item.detail}</small></span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function attentionForStep(items: AttentionItem[], step: StepKey): AttentionItem[] {
  return items.filter((i) => i.step === step);
}
