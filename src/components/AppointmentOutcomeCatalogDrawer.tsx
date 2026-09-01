"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Archive, Check, Plus, RotateCcw, Save } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import {
  appointmentCrmLabel,
  type AppointmentCrmStatus,
  type AppointmentOutcomeDefinition,
  type AppointmentOutcomeEffect,
} from "@/lib/appointments";
import Drawer from "./Drawer";

type OutcomeColor = AppointmentOutcomeDefinition["color"];
type OutcomeDraft = {
  name: string;
  description: string;
  color: OutcomeColor;
  target_crm_status: AppointmentCrmStatus;
  effects: AppointmentOutcomeEffect[];
  active: boolean;
  sort_order: number;
};

const COLORS: Array<{ value: OutcomeColor; label: string }> = [
  { value: "blue", label: "Blue" },
  { value: "green", label: "Green" },
  { value: "amber", label: "Amber" },
  { value: "red", label: "Red" },
  { value: "violet", label: "Violet" },
  { value: "gray", label: "Gray" },
];

const STATUSES: AppointmentCrmStatus[] = [
  "scheduled",
  "confirmed",
  "completed",
  "follow_up",
  "no_show",
  "not_qualified",
  "converted",
  "cancelled",
];

const EFFECTS: Array<{ value: AppointmentOutcomeEffect; label: string; detail: string }> = [
  { value: "log_activity", label: "Log activity", detail: "Always records an immutable appointment event." },
  { value: "file_action", label: "File action", detail: "Link, update, or create the selected file." },
  { value: "schedule_follow_up", label: "Schedule follow-up", detail: "Requires a reviewed follow-up time." },
  { value: "request_documents", label: "Request documents", detail: "Sends the selected secure document request." },
  { value: "send_no_show_rebooking", label: "Send rebooking link", detail: "Offers the client another appointment after a no-show." },
  { value: "close_enquiry", label: "Close enquiry", detail: "Records a reviewed terminal disposition." },
];

const EMPTY_DRAFT: OutcomeDraft = {
  name: "",
  description: "",
  color: "blue",
  target_crm_status: "completed",
  effects: ["log_activity"],
  active: true,
  sort_order: 0,
};

function toDraft(row: AppointmentOutcomeDefinition): OutcomeDraft {
  return {
    name: row.name,
    description: row.description ?? "",
    color: row.color,
    target_crm_status: row.target_crm_status,
    effects: row.effects,
    active: row.active,
    sort_order: row.sort_order,
  };
}

function errorText(error: unknown): string {
  if (error instanceof ApiError && error.body && typeof error.body === "object" && "detail" in error.body) {
    const detail = (error.body as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return error instanceof Error ? error.message : "The outcome catalog could not be updated.";
}

export default function AppointmentOutcomeCatalogDrawer({ onClose }: { onClose: () => void }) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<OutcomeDraft>(EMPTY_DRAFT);

  const callApi = async <T,>(path: string, init: RequestInit = {}) => api<T>(path, {
    ...init,
    authToken: (await getToken()) ?? undefined,
  });
  const outcomes = useQuery({
    queryKey: ["shared-appointment-outcomes", "all"],
    queryFn: () => callApi<AppointmentOutcomeDefinition[]>("/calendar/outcomes?include_inactive=true"),
  });
  const rows = useMemo(
    () => [...(outcomes.data ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [outcomes.data],
  );
  const selected = selectedId && selectedId !== "new" ? rows.find((row) => row.id === selectedId) ?? null : null;

  useEffect(() => {
    if (selectedId === "new") {
      setDraft({ ...EMPTY_DRAFT, sort_order: rows.length ? Math.max(...rows.map((row) => row.sort_order)) + 10 : 0 });
      return;
    }
    if (selected) setDraft(toDraft(selected));
  }, [rows.length, selected, selectedId]);

  useEffect(() => {
    if (!selectedId && rows.length) setSelectedId(rows[0].id);
  }, [rows, selectedId]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["shared-appointment-outcomes"] }),
      queryClient.invalidateQueries({ queryKey: ["calendar-v2-workspace"] }),
    ]);
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...draft,
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        effects: Array.from(new Set(["log_activity" as const, ...draft.effects])),
      };
      if (selectedId === "new") {
        return callApi<AppointmentOutcomeDefinition>("/calendar/outcomes", { method: "POST", body: JSON.stringify(payload) });
      }
      if (!selectedId) throw new Error("Choose an outcome first.");
      return callApi<AppointmentOutcomeDefinition>(`/calendar/outcomes/${selectedId}`, { method: "PATCH", body: JSON.stringify(payload) });
    },
    onSuccess: async (row) => {
      setSelectedId(row.id);
      await refresh();
    },
  });

  const retire = useMutation({
    mutationFn: async (row: AppointmentOutcomeDefinition) => {
      if (row.active) {
        return callApi<void>(`/calendar/outcomes/${row.id}`, { method: "DELETE" });
      }
      return callApi<AppointmentOutcomeDefinition>(`/calendar/outcomes/${row.id}`, { method: "PATCH", body: JSON.stringify({ active: true }) });
    },
    onSuccess: refresh,
  });

  const reorder = useMutation({
    mutationFn: async ({ row, direction }: { row: AppointmentOutcomeDefinition; direction: -1 | 1 }) => {
      const index = rows.findIndex((item) => item.id === row.id);
      const other = rows[index + direction];
      if (!other) return [];
      const currentOrder = row.sort_order;
      const otherOrder = other.sort_order;
      const rowOrder = currentOrder === otherOrder ? index + direction : otherOrder;
      const otherNextOrder = currentOrder === otherOrder ? index : currentOrder;
      return Promise.all([
        callApi<AppointmentOutcomeDefinition>(`/calendar/outcomes/${row.id}`, { method: "PATCH", body: JSON.stringify({ sort_order: rowOrder }) }),
        callApi<AppointmentOutcomeDefinition>(`/calendar/outcomes/${other.id}`, { method: "PATCH", body: JSON.stringify({ sort_order: otherNextOrder }) }),
      ]);
    },
    onSuccess: refresh,
  });

  const toggleEffect = (effect: AppointmentOutcomeEffect) => {
    if (effect === "log_activity") return;
    setDraft((current) => ({
      ...current,
      effects: current.effects.includes(effect)
        ? current.effects.filter((item) => item !== effect)
        : [...current.effects, effect],
    }));
  };

  return (
    <Drawer title="Shared appointment outcomes" width={1500} variant="workspace" dismissOnBackdrop={false} bodyClassName="outcomeCatalogModalBody" onClose={onClose}>
      <div className="outcomeCatalogWorkspace">
        <aside className="outcomeCatalogRail">
          <header>
            <div><span className="lbl">Shared catalog</span><b>{rows.length} outcomes</b></div>
            <button className="iconBtn" type="button" title="Create outcome" aria-label="Create outcome" onClick={() => setSelectedId("new")}><Plus size={18} /></button>
          </header>
          {outcomes.isLoading ? <p className="sub">Loading outcomes...</p> : null}
          <div className="outcomeCatalogList">
            {rows.map((row, index) => (
              <div key={row.id} className={!row.active ? "retired" : undefined}>
                <button type="button" className={selectedId === row.id ? "on" : undefined} onClick={() => setSelectedId(row.id)}>
                  <span className={`outcomeSwatch ${row.color}`} aria-hidden />
                  <span><b>{row.name}</b><small>{appointmentCrmLabel(row.target_crm_status)}{row.active ? "" : " · Retired"}</small></span>
                </button>
                <span className="outcomeCatalogOrder">
                  <button type="button" aria-label={`Move ${row.name} up`} title="Move up" disabled={index === 0 || reorder.isPending} onClick={() => reorder.mutate({ row, direction: -1 })}><ArrowUp size={15} /></button>
                  <button type="button" aria-label={`Move ${row.name} down`} title="Move down" disabled={index === rows.length - 1 || reorder.isPending} onClick={() => reorder.mutate({ row, direction: 1 })}><ArrowDown size={15} /></button>
                </span>
              </div>
            ))}
          </div>
        </aside>

        <main className="outcomeCatalogEditor">
          <header>
            <div>
              <span className="lbl">{selectedId === "new" ? "New shared outcome" : "Outcome configuration"}</span>
              <h3>{selectedId === "new" ? "Create outcome" : selected?.name ?? "Choose an outcome"}</h3>
              <p className="sub">These definitions are shared by Funding and Field Desk. Historical appointments retain the exact outcome and effect snapshot used at the time.</p>
            </div>
            {selected ? <button className="btn" type="button" disabled={retire.isPending} onClick={() => retire.mutate(selected)}>{selected.active ? <Archive size={16} /> : <RotateCcw size={16} />}{selected.active ? "Retire" : "Restore"}</button> : null}
          </header>

          {selectedId ? (
            <div className="outcomeCatalogForm">
              <section className="panel">
                <div className="panel-h"><b>Identity and state</b></div>
                <div className="panel-b outcomeCatalogFields">
                  <label><span className="lbl">Outcome name</span><input className="field" value={draft.name} maxLength={120} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
                  <label><span className="lbl">Resulting CRM status</span><select className="field" value={draft.target_crm_status} onChange={(event) => setDraft((current) => ({ ...current, target_crm_status: event.target.value as AppointmentCrmStatus }))}>{STATUSES.map((status) => <option key={status} value={status}>{appointmentCrmLabel(status)}</option>)}</select></label>
                  <label className="wide"><span className="lbl">Internal description</span><textarea className="field" rows={3} maxLength={500} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>
                  <fieldset className="wide outcomeColorField"><legend className="lbl">Calendar color</legend><div>{COLORS.map((color) => <button key={color.value} type="button" className={draft.color === color.value ? "on" : undefined} onClick={() => setDraft((current) => ({ ...current, color: color.value }))}><span className={`outcomeSwatch ${color.value}`} />{color.label}{draft.color === color.value ? <Check size={15} /> : null}</button>)}</div></fieldset>
                </div>
              </section>

              <section className="panel">
                <div className="panel-h"><b>Workflow effects</b></div>
                <div className="panel-b outcomeEffectList">
                  {EFFECTS.map((effect) => <label key={effect.value} className={effect.value === "log_activity" ? "required" : undefined}><input type="checkbox" checked={draft.effects.includes(effect.value)} disabled={effect.value === "log_activity"} onChange={() => toggleEffect(effect.value)} /><span><b>{effect.label}</b><small>{effect.detail}</small></span></label>)}
                </div>
              </section>

              <footer className="outcomeCatalogActions">
                <span className="sub">Only active shared outcomes are available for new appointment decisions.</span>
                {save.isError ? <span className="appointmentCrmInlineError">{errorText(save.error)}</span> : null}
                <button className="btn pri" type="button" disabled={!draft.name.trim() || save.isPending} onClick={() => save.mutate()}><Save size={17} />{save.isPending ? "Saving..." : selectedId === "new" ? "Create outcome" : "Save changes"}</button>
              </footer>
            </div>
          ) : <div className="appointmentCrmEmpty">Choose an outcome or create a new one.</div>}
        </main>
      </div>
    </Drawer>
  );
}
