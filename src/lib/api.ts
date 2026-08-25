// Same backend contract as QCDashboard: bearer Clerk token against
// NEXT_PUBLIC_API_URL/api/v1. Dealer OS endpoints live under /dealer-os/*.

export const apiBase = `${process.env.NEXT_PUBLIC_API_URL ?? "https://api.qualifiedcommercial.com"}/api/v1`;

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error body */
    }
    const detail = (body as { detail?: unknown } | null)?.detail;
    let message = `Request failed (${res.status})`;
    if (typeof detail === "string") {
      message = detail;
    } else if (Array.isArray(detail)) {
      const issues = detail
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const issue = item as { loc?: unknown; msg?: unknown };
          const location = Array.isArray(issue.loc)
            ? issue.loc.filter((part) => part !== "body").join(".")
            : "";
          const problem = typeof issue.msg === "string" ? issue.msg : "Invalid value";
          return location ? `${location}: ${problem}` : problem;
        })
        .filter((item): item is string => Boolean(item));
      if (issues.length) message = issues.join("; ");
    }
    throw new ApiError(res.status, message, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function api<T>(path: string, opts: RequestInit & { authToken?: string } = {}): Promise<T> {
  const { authToken, ...init } = opts;
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  return unwrap<T>(res);
}

// Multipart upload — no Content-Type header so the browser sets the multipart
// boundary itself (the JSON helper above would force application/json).
export async function apiUpload<T>(path: string, form: FormData, opts: { authToken?: string } = {}): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    method: "POST",
    body: form,
    headers: opts.authToken ? { Authorization: `Bearer ${opts.authToken}` } : {},
  });
  return unwrap<T>(res);
}
