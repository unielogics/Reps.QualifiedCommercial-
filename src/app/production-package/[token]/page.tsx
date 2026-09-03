"use client";

// A package the desk shared with this rep. Clerk sign-in is required (this
// route is not in the public matcher), and the backend only honours the link
// for the rep it was issued to.

import { useAuth } from "@clerk/nextjs";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useMe } from "@/lib/useMe";
import { createShareClient } from "@/production-package/client";
import { ProductionPackageWorkspace } from "@/production-package/ProductionPackageWorkspace";
import type { ApiCall, ProductionPackage } from "@/production-package/types";

type Fail = { status: number | null; message: string };

export default function SharedProductionPackagePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const { getToken } = useAuth();
  const me = useMe();
  const call = useMemo<ApiCall>(() => async (path, init) => {
    const authToken = (await getToken()) ?? undefined;
    return api(path, {
      method: init?.method,
      body: typeof init?.body === "string" ? init.body : init?.body === undefined ? undefined : JSON.stringify(init.body),
      headers: init?.headers,
      authToken,
    });
  }, [getToken]);
  const [pkg, setPkg] = useState<ProductionPackage | null>(null);
  const [fail, setFail] = useState<Fail | null>(null);
  const client = useMemo(() => createShareClient(call, token), [call, token]);

  const load = useCallback(async () => {
    setFail(null);
    try {
      setPkg(await client.load());
    } catch (err) {
      const status = err instanceof ApiError ? err.status : null;
      setFail({ status, message: err instanceof Error ? err.message : "This link could not be opened." });
    }
  }, [client]);

  useEffect(() => { if (token) load().catch(() => undefined); }, [token, load]);

  if (fail) {
    const title = fail.status === 410 ? "This link is no longer active" : fail.status === 404 ? "Link not found" : fail.status === 403 ? "Not available for this account" : "Something went wrong";
    const body = fail.status === 410 ? fail.message
      : fail.status === 404 ? "The link may have been mistyped, or it was issued to a different representative. Ask the desk for a new one."
        : fail.status === 403 ? "Shared production packages open for field representatives only."
          : fail.message;
    return (
      <main className="pp-root" style={{ padding: 24 }}>
        <div className="pp-panel"><div className="pp-panel-b">
          <div className="pp-eyebrow">Production package</div>
          <h1 className="pp-title">{title}</h1>
          <p className="pp-sub">{body}</p>
          <div className="pp-row" style={{ marginTop: 12 }}><button type="button" className="pp-btn" onClick={load}>Try again</button></div>
        </div></div>
      </main>
    );
  }
  if (!pkg) return <main className="pp-root" style={{ padding: 24 }}><div className="pp-notice t-mut">Opening the shared package…</div></main>;
  return (
    <main style={{ padding: "16px 20px 40px" }}>
      <div className="pp-eyebrow" style={{ marginBottom: 8 }}>Production package · shared with {me.name ?? "you"}</div>
      <ProductionPackageWorkspace client={client} initial={pkg} />
    </main>
  );
}
