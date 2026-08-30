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

type TrainingLiveAction = {
  code: "training_live_action_confirmation_required";
  action?: string;
  provider?: string;
  recipient?: string | null;
  effect?: string;
};

async function trainingLiveAction(res: Response): Promise<TrainingLiveAction | null> {
  if (res.status !== 409 || typeof window === "undefined") return null;
  try {
    const body = await res.clone().json() as { detail?: unknown };
    const detail = body.detail;
    if (!detail || typeof detail !== "object") return null;
    const action = detail as Partial<TrainingLiveAction>;
    return action.code === "training_live_action_confirmation_required"
      ? action as TrainingLiveAction
      : null;
  } catch {
    return null;
  }
}

function confirmTrainingLiveAction(detail: TrainingLiveAction): boolean {
  const lines = [
    detail.action || "Run live action",
    "",
    detail.provider ? `Provider: ${detail.provider}` : null,
    detail.recipient ? `Recipient: ${detail.recipient}` : null,
    detail.effect ? `Effect: ${detail.effect}` : null,
    "",
    "This is a Training file. Continue with the real external action?",
  ].filter((line): line is string => line !== null);
  return window.confirm(lines.join("\n"));
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
  const requestHeaders = {
    "Content-Type": "application/json",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(init.headers ?? {}),
  };
  let res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: requestHeaders,
  });
  const liveAction = await trainingLiveAction(res);
  if (liveAction && confirmTrainingLiveAction(liveAction)) {
    res = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: { ...requestHeaders, "X-QC-Training-Live-Action": "confirmed" },
    });
  }
  return unwrap<T>(res);
}

// Multipart upload — no Content-Type header so the browser sets the multipart
// boundary itself (the JSON helper above would force application/json).
export async function apiUpload<T>(path: string, form: FormData, opts: { authToken?: string } = {}): Promise<T> {
  const requestHeaders: Record<string, string> = {};
  if (opts.authToken) requestHeaders.Authorization = `Bearer ${opts.authToken}`;
  let res = await fetch(`${apiBase}${path}`, {
    method: "POST",
    body: form,
    headers: requestHeaders,
  });
  const liveAction = await trainingLiveAction(res);
  if (liveAction && confirmTrainingLiveAction(liveAction)) {
    res = await fetch(`${apiBase}${path}`, {
      method: "POST",
      body: form,
      headers: { ...requestHeaders, "X-QC-Training-Live-Action": "confirmed" },
    });
  }
  return unwrap<T>(res);
}
