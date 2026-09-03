// MIRROR: keep identical to QCRep/src/production-package/*
// A client mirror of the server arithmetic, used only for provisional feedback
// while a save is in flight. The contract preview, the clears/does-not-clear
// verdict and the PDF always read the server's `computed`.
import { PRODUCTS } from "./options";
import { toNumber } from "./format";
import type { Arrangement, ProductKey } from "./types";

// JavaScript Math.round is what the server's jsround() reproduces.
const round = Math.round;

export type ProvisionalRow = {
  key: ProductKey; label: string; on: boolean; contracts: number; cur_contracts: number; gross: number; cur_gross: number;
  premium: number; cur_premium: number; repay: number; comm: number; admin: number; reserve: number;
  repay_m: number; comm_m: number; admin_m: number; reserve_m: number; uplift: number; d_contracts: number; d_gross: number; term: number;
};

export type Provisional = {
  units: number; rows: ProvisionalRow[]; contracts: number; cur_contracts: number; gross: number; cur_gross: number;
  d_gross: number; repay_m: number; comm_m: number; admin_m: number; reserve_m: number;
  lot_value: number; months_of_inventory: number | null; sell_through_pct: number | null;
  supported: number; advance: number; implied_rate: number; cost_rate: number; spread: number; clears: boolean; total_cost: number;
  funded_pct: number; out_of_pocket: number; loan_free: boolean; remittance_req: number; coverage_pct: number;
};

function pv(payment: number, annualPct: number, n: number): number {
  const r = annualPct / 100 / 12;
  if (r <= 0) return payment * n;
  return payment * ((1 - Math.pow(1 + r, -n)) / r);
}

function irr(pmt: number, n: number, present: number): number {
  if (pmt <= 0 || present <= 0 || pmt * n <= present) return 0;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    const val = mid === 0 ? pmt * n : pmt * ((1 - Math.pow(1 + mid, -n)) / mid);
    if (val > present) lo = mid; else hi = mid;
  }
  return ((lo + hi) / 2) * 12 * 100;
}

export function provisional(a: Partial<Arrangement>): Provisional {
  const units = toNumber(a.monthly_units);
  const products = (a.products ?? {}) as Arrangement["products"];
  const rows: ProvisionalRow[] = PRODUCTS.map((p) => {
    const v = products[p.key] ?? { on: false };
    const on = Boolean(v.on);
    const curContracts = on ? round((units * toNumber(v.cur_rate)) / 100) : 0;
    const contracts = on ? round((units * toNumber(v.rate)) / 100) : 0;
    const premium = toNumber(v.premium);
    const curPremium = toNumber(v.cur_premium);
    const repay = toNumber(v.repay);
    const comm = premium * (toNumber(v.comm) / 100);
    const admin = toNumber(v.admin);
    const reserve = Math.max(0, premium - repay - comm - admin) * (toNumber(v.retention) / 100);
    return {
      key: p.key, label: p.label, on, contracts, cur_contracts: curContracts, gross: contracts * premium,
      cur_gross: curContracts * curPremium, premium, cur_premium: curPremium, repay, comm, admin, reserve,
      repay_m: contracts * repay, comm_m: contracts * comm, admin_m: contracts * admin, reserve_m: contracts * reserve,
      uplift: premium - curPremium, d_contracts: contracts - curContracts, d_gross: contracts * premium - curContracts * curPremium,
      term: toNumber(v.term) || 12,
    };
  });
  const on = rows.filter((r) => r.on);
  const sum = (k: keyof ProvisionalRow) => on.reduce((acc, r) => acc + (r[k] as number), 0);
  const term = toNumber(a.term) || 1;
  const repayM = sum("repay_m");
  const requested = toNumber(a.requested);
  const dealerCof = toNumber(a.dealer_cof);
  const supported = pv(repayM, dealerCof, term);
  const sizing = a.sizing === "fixed" ? "fixed" : "backsolve";
  const advance = sizing === "backsolve" ? supported : requested;
  const implied = sizing === "backsolve" ? dealerCof : irr(repayM, term, requested);
  const bankCost = advance * (toNumber(a.bank_cof) / 100) * (term / 12);
  const totalCost = bankCost + toNumber(a.orig_cost) + toNumber(a.prof_fees) + toNumber(a.mgmt_fee) * term + advance * (toNumber(a.loss_prov) / 100);
  const costRate = advance > 0 ? (totalCost / advance) * (12 / term) * 100 : 0;
  const spread = implied - costRate;
  const ds = toNumber(a.debt_service);
  const fundedPct = ds > 0 ? (repayM / ds) * 100 : 0;
  const thr = (a.thresholds ?? {}) as Arrangement["thresholds"];
  const remittanceOverride = thr.remittance !== undefined && thr.remittance !== "" ? toNumber(thr.remittance) : round(ds * 1.25);
  const remittanceReq = Math.max(remittanceOverride, ds * 1.25);
  const lotUnits = toNumber(a.lot_units);
  return {
    units, rows, contracts: sum("contracts"), cur_contracts: sum("cur_contracts"), gross: sum("gross"), cur_gross: sum("cur_gross"),
    d_gross: sum("d_gross"), repay_m: repayM, comm_m: sum("comm_m"), admin_m: sum("admin_m"), reserve_m: sum("reserve_m"),
    lot_value: lotUnits * toNumber(a.avg_cost),
    months_of_inventory: lotUnits && units ? lotUnits / units : null,
    sell_through_pct: lotUnits ? (units / lotUnits) * 100 : null,
    supported, advance, implied_rate: implied, cost_rate: costRate, spread, clears: spread >= 3, total_cost: totalCost,
    funded_pct: fundedPct, out_of_pocket: Math.max(0, ds - repayM), loan_free: ds > 0 && repayM >= ds,
    remittance_req: remittanceReq, coverage_pct: remittanceReq > 0 ? (repayM / remittanceReq) * 100 : 0,
  };
}
