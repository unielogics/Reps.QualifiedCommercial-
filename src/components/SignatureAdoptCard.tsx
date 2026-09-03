"use client";

// "My signature" — the one signature on file a signed-in person adopts for
// use on their behalf on Qualified Commercial program agreements (a field
// rep named as relationship manager on a Production Package). Backed by
// GET/POST/DELETE /me/signature on the shared backend; the consent wording
// and version come from the server. Adopting again retires the previous
// signature; revoking never touches documents already sent.

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useMe } from "@/lib/useMe";

export type StoredSignature = {
  id: string;
  subject_type: string;
  subject_id: string | null;
  typed_name: string;
  title: string | null;
  source: string;
  adopted_at: string;
  adopted_by_user_id: string | null;
  consent_version: string | null;
  revoked_at: string | null;
  preview_url: string | null;
};

export type StoredSignatureState = {
  signature: StoredSignature | null;
  consent_text: string;
  consent_version: string;
};

const QUERY_KEY = ["me", "signature"] as const;

function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback;
  return error instanceof Error ? error.message : fallback;
}

function formatDate(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// A small landscape pad. The image is what gets placed on agreements, so the
// bitmap is drawn on a white ground in dark ink regardless of the page theme.
function Pad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [inked, setInked] = useState(false);
  const point = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const blank = () => {
    const c = canvasRef.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
  };
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = 900;
    c.height = 260;
    blank();
  }, []);
  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    drawing.current = true;
    last.current = point(e);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const g = e.currentTarget.getContext("2d");
    if (!g) return;
    const p = point(e);
    g.strokeStyle = "#0f1720";
    g.lineWidth = 3.2;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.beginPath();
    g.moveTo(last.current.x, last.current.y);
    g.lineTo(p.x, p.y);
    g.stroke();
    last.current = p;
    if (!inked) setInked(true);
  };
  const up = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    drawing.current = false;
    last.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (canvasRef.current && inked) onChange(canvasRef.current.toDataURL("image/png"));
  };
  const clear = () => {
    blank();
    setInked(false);
    onChange(null);
  };
  return (
    <div style={{ border: "1px dashed var(--line)", borderRadius: 10, background: "#fff", padding: 8 }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Signature pad"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
        style={{ width: "100%", height: 160, touchAction: "none", background: "#fff", borderRadius: 8, display: "block" }}
      />
      <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
        <span className="sub">Sign with your finger, stylus or mouse.</span>
        <button type="button" className="btn sm" onClick={clear}>Clear</button>
      </div>
    </div>
  );
}

export function SignatureAdoptCard() {
  const { getToken } = useAuth();
  const me = useMe();
  const queryClient = useQueryClient();
  const state = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => api<StoredSignatureState>("/me/signature", { authToken: (await getToken()) ?? undefined }),
    staleTime: 60_000,
    retry: false,
  });
  const [editing, setEditing] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [typedName, setTypedName] = useState("");
  const [title, setTitle] = useState("");
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const current = state.data?.signature ?? null;

  useEffect(() => {
    if (!editing) return;
    setTypedName(current?.typed_name || me.name || "");
    setTitle(current?.title || "");
    setConsent(false);
    setDataUrl(null);
    setMessage("");
  }, [editing, current?.typed_name, current?.title, me.name]);

  const adopt = useMutation<StoredSignatureState, Error>({
    mutationFn: async () => api<StoredSignatureState>("/me/signature", {
      method: "POST",
      authToken: (await getToken()) ?? undefined,
      body: JSON.stringify({ signature_data_url: dataUrl ?? "", typed_name: typedName.trim(), title: title.trim() || null, consent }),
    }),
    onSuccess: (next) => {
      queryClient.setQueryData(QUERY_KEY, next);
      setEditing(false);
      setMessage(current ? "Your signature was replaced. Agreements sent from now on carry the new one." : "Your signature is on file.");
    },
    onError: (error) => setMessage(errorText(error, "Your signature could not be adopted.")),
  });

  const revoke = useMutation<StoredSignatureState, Error>({
    mutationFn: async () => api<StoredSignatureState>("/me/signature", { method: "DELETE", authToken: (await getToken()) ?? undefined }),
    onSuccess: (next) => {
      queryClient.setQueryData(QUERY_KEY, next);
      setConfirmRevoke(false);
      setMessage("Your signature on file was revoked. Agreements already sent are unchanged.");
    },
    onError: (error) => { setConfirmRevoke(false); setMessage(errorText(error, "Your signature could not be revoked.")); },
  });

  const canAdopt = Boolean(dataUrl) && typedName.trim().length > 0 && consent && !adopt.isPending && Boolean(state.data);

  return (
    <section className="card">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div className="lbl">My signature</div>
          <p className="sub" style={{ marginTop: 4 }}>
            Placed on your behalf on program agreements where you are named as relationship manager. Adopt it once; the desk cannot send an agreement that names you until it is on file.
          </p>
        </div>
        {!editing ? (
          <button type="button" className={`btn${current ? "" : " pri"}`} onClick={() => setEditing(true)} disabled={state.isLoading}>
            {current ? "Replace" : "Adopt my signature"}
          </button>
        ) : null}
      </div>

      {state.isError ? <div className="warnline mt">{errorText(state.error, "Your signature on file could not be loaded.")}</div> : null}
      {message ? <div className="sub mt">{message}</div> : null}

      {!editing ? (
        current ? (
          <div className="mt" style={{ display: "grid", gridTemplateColumns: "minmax(0, 280px) 1fr", gap: 16, alignItems: "flex-start" }}>
            <div style={{ border: "1px dashed var(--line)", borderRadius: 10, background: "#fff", padding: 12, minHeight: 96, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {current.preview_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={current.preview_url} alt={`Signature of ${current.typed_name}`} style={{ maxWidth: 240, maxHeight: 90 }} />
                : <span className="sub">Preview unavailable</span>}
            </div>
            <div className="grid" style={{ gap: 8 }}>
              <div className="row">
                <span className="chip">On file</span>
                <span className="sub">Adopted {formatDate(current.adopted_at)}{current.consent_version ? ` · consent ${current.consent_version}` : ""}</span>
              </div>
              <div><strong>{current.typed_name}</strong>{current.title ? <span className="sub"> · {current.title}</span> : null}</div>
              <div className="sub">Each placement is recorded with this adoption date and consent version. Revoking stops future placements; agreements already sent are unchanged.</div>
              {confirmRevoke ? (
                <div className="row">
                  <span className="sub">Revoke your signature on file?</span>
                  <button type="button" className="btn sm danger" onClick={() => revoke.mutate()} disabled={revoke.isPending}>{revoke.isPending ? "Revoking…" : "Yes, revoke"}</button>
                  <button type="button" className="btn sm" onClick={() => setConfirmRevoke(false)} disabled={revoke.isPending}>Keep it</button>
                </div>
              ) : (
                <div className="row"><button type="button" className="btn sm danger" onClick={() => setConfirmRevoke(true)}>Revoke</button></div>
              )}
            </div>
          </div>
        ) : (
          <div className="sub mt">{state.isLoading ? "Loading your signature on file…" : "No signature on file yet."}</div>
        )
      ) : (
        <div className="grid mt">
          <Pad onChange={setDataUrl} />
          <div className="row">
            <label className="grid" style={{ gap: 4, flex: 1, minWidth: 200 }}>
              <span className="lbl">Name as it should appear</span>
              <input className="field" value={typedName} onChange={(e) => setTypedName(e.target.value)} placeholder={me.name || "Full name"} autoComplete="name" />
            </label>
            <label className="grid" style={{ gap: 4, flex: 1, minWidth: 200 }}>
              <span className="lbl">Title (optional)</span>
              <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Field Representative" />
            </label>
          </div>
          <label className="row" style={{ alignItems: "flex-start", gap: 8, fontSize: 12.5, cursor: "pointer" }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
            <span>{state.data?.consent_text || "Loading the adoption consent…"}</span>
          </label>
          <div className="row">
            <button type="button" className="btn pri" onClick={() => adopt.mutate()} disabled={!canAdopt}>{adopt.isPending ? "Adopting…" : current ? "Replace my signature" : "Adopt my signature"}</button>
            <button type="button" className="btn" onClick={() => setEditing(false)} disabled={adopt.isPending}>Cancel</button>
            {state.data?.consent_version ? <span className="sub">Consent version {state.data.consent_version}</span> : null}
          </div>
        </div>
      )}
    </section>
  );
}
