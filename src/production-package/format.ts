// MIRROR: keep identical to QCRep/src/production-package/*
export function money(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function signedMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  return (v >= 0 ? "+" : "-") + money(Math.abs(v));
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return `${Number(n).toFixed(digits)}%`;
}

export function num(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function signedNum(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  return (v >= 0 ? "+" : "") + num(v);
}

export function dateLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function whenLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function toNumber(value: unknown): number {
  if (value === "" || value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function openSignedUrl(url: string | null | undefined): void {
  if (!url || typeof window === "undefined") return;
  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (w) w.opener = null;
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): ((...args: A) => void) & { flush: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: A | null = null;
  const wrapped = ((...args: A) => {
    pending = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const a = pending;
      pending = null;
      if (a) fn(...a);
    }, ms);
  }) as ((...args: A) => void) & { flush: () => void; cancel: () => void };
  wrapped.flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const a = pending;
    pending = null;
    if (a) fn(...a);
  };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
  };
  return wrapped;
}

export function errorMessage(err: unknown, fallback = "Something went wrong."): string {
  if (err && typeof err === "object" && "message" in err && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message || fallback;
  }
  return fallback;
}

export function errorDetail(err: unknown): Record<string, unknown> | null {
  const body = err && typeof err === "object" && "body" in err ? (err as { body?: unknown }).body : null;
  const detail = body && typeof body === "object" && "detail" in body ? (body as { detail?: unknown }).detail : null;
  return detail && typeof detail === "object" ? (detail as Record<string, unknown>) : null;
}

export function errorStatus(err: unknown): number | null {
  return err && typeof err === "object" && "status" in err && typeof (err as { status?: unknown }).status === "number"
    ? (err as { status: number }).status
    : null;
}
