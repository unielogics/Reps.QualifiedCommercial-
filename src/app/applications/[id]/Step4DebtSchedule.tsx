"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Plus, Sparkles, Trash2 } from "lucide-react";
import { api } from "@/lib/api";

type Debt = {
  id: string;
  lender: string;
  category: string;
  balance: number | null;
  payment_amount: number | null;
  payment_frequency: string | null;
  monthly_payment: number | null;
  rate: number | null;
  factor_rate: number | null;
  maturity_on: string | null;
  payoff_amount: number | null;
  collateral: string | null;
  count_in_dscr: boolean;
  origin: string;
  status: string;
};

type DebtDraft = Omit<Debt, "id" | "origin" | "status">;

type DebtConfirmation = {
  status: "schedule_confirmed" | "no_business_debt" | null;
  confirmed: boolean;
  stale: boolean;
  confirmed_at: string | null;
  note: string | null;
};

const EMPTY: DebtDraft = {
  lender: "",
  category: "loan",
  balance: null,
  payment_amount: null,
  payment_frequency: "monthly",
  monthly_payment: null,
  rate: null,
  factor_rate: null,
  maturity_on: null,
  payoff_amount: null,
  collateral: "",
  count_in_dscr: true,
};

const NUMERIC_FIELDS = new Set([
  "balance", "payment_amount", "monthly_payment", "rate", "factor_rate", "payoff_amount",
]);

function inputValue(value: unknown): string | number {
  return value === null || value === undefined ? "" : String(value);
}

function parseValue(field: keyof DebtDraft, value: string | boolean): unknown {
  if (typeof value === "boolean") return value;
  if (NUMERIC_FIELDS.has(field)) return value.trim() === "" ? null : Number(value);
  return value.trim() === "" ? null : value;
}

export default function Step4DebtSchedule({ dealerId }: { dealerId: string }) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [rows, setRows] = useState<Debt[]>([]);
  const [newRows, setNewRows] = useState<Array<DebtDraft & { localId: string }>>([]);

  const debts = useQuery({
    queryKey: ["dealer-debts", dealerId],
    queryFn: async () => api<Debt[]>(`/dealer-os/dealers/${dealerId}/debts`, {
      authToken: (await getToken()) ?? undefined,
    }),
  });
  const confirmation = useQuery({
    queryKey: ["debt-confirmation", dealerId],
    queryFn: async () => api<DebtConfirmation>(`/dealer-os/dealers/${dealerId}/debts/confirmation`, {
      authToken: (await getToken()) ?? undefined,
    }),
  });
  useEffect(() => setRows(debts.data ?? []), [debts.data]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["dealer-debts", dealerId] });
    void qc.invalidateQueries({ queryKey: ["underwriting-resolution", dealerId] });
    void qc.invalidateQueries({ queryKey: ["application-profile", dealerId] });
    void qc.invalidateQueries({ queryKey: ["submission-readiness", dealerId] });
    void qc.invalidateQueries({ queryKey: ["debt-confirmation", dealerId] });
    void qc.invalidateQueries({ queryKey: ["decision", dealerId] });
  };

  const patchDebt = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => api<Debt>(
      `/dealer-os/dealers/${dealerId}/debts/${id}`,
      { method: "PATCH", body: JSON.stringify(body), authToken: (await getToken()) ?? undefined },
    ),
    onSuccess: refresh,
  });
  const createDebt = useMutation({
    mutationFn: async ({ localId, body }: { localId: string; body: DebtDraft }) => ({
      localId,
      debt: await api<Debt>(`/dealer-os/dealers/${dealerId}/debts`, {
        method: "POST", body: JSON.stringify(body), authToken: (await getToken()) ?? undefined,
      }),
    }),
    onSuccess: ({ localId }) => {
      setNewRows((current) => current.filter((row) => row.localId !== localId));
      refresh();
    },
  });
  const removeDebt = useMutation({
    mutationFn: async (id: string) => api(`/dealer-os/dealers/${dealerId}/debts/${id}`, {
      method: "DELETE", authToken: (await getToken()) ?? undefined,
    }),
    onSuccess: refresh,
  });
  const draftFromEvidence = useMutation({
    mutationFn: async () => api(`/dealer-os/dealers/${dealerId}/debts/draft`, {
      method: "POST", authToken: (await getToken()) ?? undefined,
    }),
    onSuccess: refresh,
  });
  const confirmSchedule = useMutation({
    mutationFn: async (status: "schedule_confirmed" | "no_business_debt") => api<DebtConfirmation>(
      `/dealer-os/dealers/${dealerId}/debts/confirmation`,
      {
        method: "PUT",
        body: JSON.stringify({ status }),
        authToken: (await getToken()) ?? undefined,
      },
    ),
    onSuccess: (saved) => {
      qc.setQueryData(["debt-confirmation", dealerId], saved);
      void qc.invalidateQueries({ queryKey: ["decision", dealerId] });
      void qc.invalidateQueries({ queryKey: ["underwriting-resolution", dealerId] });
    },
  });

  const updateLocal = (id: string, field: keyof DebtDraft, value: unknown) => {
    setRows((current) => current.map((row) => row.id === id ? { ...row, [field]: value } : row));
  };
  const saveExisting = (id: string, field: keyof DebtDraft, raw: string | boolean) => {
    const value = parseValue(field, raw);
    updateLocal(id, field, value);
    patchDebt.mutate({ id, body: { [field]: value } });
  };

  const renderFields = (
    row: Debt | (DebtDraft & { localId: string }),
    update: (field: keyof DebtDraft, raw: string | boolean) => void,
  ) => (
    <div className="debtFieldGrid">
      <label><span className="lbl">Lender</span><input className={`field${row.lender.trim() ? "" : " field-invalid"}`} value={row.lender} onChange={(event) => update("lender", event.target.value)} /></label>
      <label><span className="lbl">Debt type</span><select className="field" value={row.category} onChange={(event) => update("category", event.target.value)}><option value="loan">Term loan</option><option value="line_of_credit">Line of credit</option><option value="equipment">Equipment note</option><option value="sba">SBA loan</option><option value="mca">MCA</option><option value="mortgage">Mortgage</option><option value="other">Other</option></select></label>
      <label><span className="lbl">Current balance</span><input className="field" type="number" min="0" inputMode="decimal" value={inputValue(row.balance)} onChange={(event) => update("balance", event.target.value)} /></label>
      <label><span className="lbl">Payment amount</span><input className="field" type="number" min="0" inputMode="decimal" value={inputValue(row.payment_amount)} onChange={(event) => update("payment_amount", event.target.value)} /></label>
      <label><span className="lbl">Payment cadence</span><select className="field" value={row.payment_frequency ?? "monthly"} onChange={(event) => update("payment_frequency", event.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="monthly">Monthly</option></select></label>
      <label><span className="lbl">Monthly payment</span><input className="field" type="number" min="0" inputMode="decimal" value={inputValue(row.monthly_payment)} onChange={(event) => update("monthly_payment", event.target.value)} /></label>
      <label><span className="lbl">Interest rate %</span><input className="field" type="number" min="0" step="0.01" inputMode="decimal" value={inputValue(row.rate)} onChange={(event) => update("rate", event.target.value)} /></label>
      <label><span className="lbl">Factor rate</span><input className="field" type="number" min="0" step="0.01" inputMode="decimal" value={inputValue(row.factor_rate)} onChange={(event) => update("factor_rate", event.target.value)} /></label>
      <label><span className="lbl">Maturity</span><input className="field" type="date" value={row.maturity_on ?? ""} onChange={(event) => update("maturity_on", event.target.value)} /></label>
      <label><span className="lbl">Payoff amount</span><input className="field" type="number" min="0" inputMode="decimal" value={inputValue(row.payoff_amount)} onChange={(event) => update("payoff_amount", event.target.value)} /></label>
      <label className="debtCollateral"><span className="lbl">Collateral</span><input className="field" value={row.collateral ?? ""} onChange={(event) => update("collateral", event.target.value)} /></label>
      <label className="debtDscrToggle"><input type="checkbox" checked={row.count_in_dscr} onChange={(event) => update("count_in_dscr", event.target.checked)} /><span><b>Include in DSCR</b><small>Count this monthly obligation in debt-service coverage.</small></span></label>
    </div>
  );

  return (
    <div className="panel">
      <div className="panel-h">
        Debt schedule
        <span className="sp" />
        <span className={`cellchip ${confirmation.data?.confirmed ? "c-ok" : confirmation.data?.stale ? "c-warn" : "c-mut"}`}>
          {confirmation.data?.confirmed ? "Confirmed" : confirmation.data?.stale ? "Reconfirmation required" : "Not confirmed"}
        </span>
        <button type="button" className="btn sm" onClick={() => draftFromEvidence.mutate()} disabled={draftFromEvidence.isPending}><Sparkles size={16} /> Draft from evidence</button>
        <button type="button" className="btn sm pri" onClick={() => setNewRows((current) => [...current, { ...EMPTY, localId: crypto.randomUUID() }])}><Plus size={16} /> Add debt</button>
      </div>
      <div className="panel-b debtSchedule">
        <p className="sub" style={{ marginTop: 0 }}>Statement-extracted obligations are suggestions until an agent confirms or edits them. Editing a row protects it from later automatic replacement.</p>
        {rows.map((row) => (
          <article key={row.id} className="debtRowCard">
            <div className="row">
              <div><b>{row.lender}</b><span className="sub" style={{ display: "block" }}>{row.origin === "admin" ? "Agent confirmed" : "Extracted suggestion"}</span></div>
              <span className="sp" />
              <span className={`cellchip ${row.origin === "admin" ? "c-ok" : "c-warn"}`}>{row.origin === "admin" ? "Confirmed" : "Review"}</span>
              <button type="button" className="iconAction danger" title="Remove debt" aria-label={`Remove ${row.lender}`} onClick={() => removeDebt.mutate(row.id)}><Trash2 size={17} /></button>
            </div>
            {renderFields(row, (field, raw) => saveExisting(row.id, field, raw))}
          </article>
        ))}
        {newRows.map((row) => (
          <article key={row.localId} className="debtRowCard new">
            <div className="row"><b>New obligation</b><span className="sp" /><button type="button" className="iconAction danger" title="Discard row" onClick={() => setNewRows((current) => current.filter((item) => item.localId !== row.localId))}><Trash2 size={17} /></button></div>
            {renderFields(row, (field, raw) => setNewRows((current) => current.map((item) => item.localId === row.localId ? { ...item, [field]: parseValue(field, raw) } : item)))}
            <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn pri" disabled={!row.lender.trim() || createDebt.isPending} onClick={() => createDebt.mutate({ localId: row.localId, body: row })}>Save debt row</button></div>
          </article>
        ))}
        {!debts.isLoading && rows.length === 0 && newRows.length === 0 && <div className="emptyStateCompact"><b>No obligations entered</b><span className="sub">Add each business debt, or draft suggestions from verified statements.</span></div>}
        <div className="row" style={{ justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          {rows.length > 0 ? (
            <button type="button" className="btn pri" disabled={newRows.length > 0 || confirmSchedule.isPending} onClick={() => confirmSchedule.mutate("schedule_confirmed")}><CheckCircle2 size={16} /> Confirm current schedule</button>
          ) : (
            <button type="button" className="btn pri" disabled={newRows.length > 0 || confirmSchedule.isPending || debts.isLoading} onClick={() => confirmSchedule.mutate("no_business_debt")}><CheckCircle2 size={16} /> Confirm no business debt</button>
          )}
        </div>
        {confirmation.data?.stale && <div className="warnline">The debt schedule changed after the last confirmation. Review the rows and confirm again.</div>}
        {(patchDebt.error || createDebt.error || removeDebt.error || draftFromEvidence.error || confirmSchedule.error) && <div className="warnline">A debt change or confirmation could not be saved. Review the schedule and retry.</div>}
      </div>
    </div>
  );
}
