"use client";

// The platform-documents acknowledgment, rendered by Shell instead of the app
// for a team login whose acknowledgment is missing or out of date. Every
// Qualified Commercial console works under the same company-wide documents,
// so the backend decides (needs_acknowledgment on /auth/me) and this only
// renders. Continuing posts the current versions to /legal/accept, and the
// /auth/me refetch lifts the gate. There is no skip for anyone; the sign-out
// control stays visible even when the read fails so no session is trapped.

import { useState } from "react";
import { SignedIn, UserButton, useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

type AcknowledgmentRead = {
  status: "current" | "out_of_date" | "missing" | "not_asked";
  current: { terms_version: string; privacy_version: string; disclosure_version: string };
  documents: Array<{ key: string; title: string; version: string; url: string }>;
  latest: { created_at: string; terms_version: string; privacy_version: string; disclosure_version: string } | null;
  // signed_at is null when the agreement row has no signing date on file.
  company_agreement: { company_name: string; title: string; contract_number: string; signed_at: string | null } | null;
};

// A YYYY-MM-DD version is a calendar date, not an instant: read it at noon UTC
// so no timezone shows the day before or after.
function asDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + "T12:00:00Z") : new Date(value);
}

// "August 25, 2026" — an effective date, or the day a company agreement was signed.
function formatEffective(value: string) {
  return asDate(value).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// "Sep 9, 2026" — when this person last acknowledged.
function formatAcknowledged(value: string) {
  return asDate(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AcknowledgmentGate({ brand }: { brand: React.ReactNode }) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");

  const read = useQuery({
    queryKey: ["acknowledgment"],
    queryFn: async () => api<AcknowledgmentRead>("/legal/acknowledgment", { authToken: (await getToken()) ?? undefined }),
  });

  const accept = useMutation<unknown, Error, AcknowledgmentRead["current"]>({
    mutationFn: async (current) => api("/legal/accept", { method: "POST", authToken: (await getToken()) ?? undefined, body: JSON.stringify(current) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await queryClient.invalidateQueries({ queryKey: ["acknowledgment"] });
    },
    onError: (e) => setError(e.message || "The acknowledgment could not be recorded."),
  });

  const submit = () => {
    if (!read.data) return;
    setError("");
    accept.mutate(read.data.current);
  };

  // Always on screen, whatever the read did: the way out that is not "continue".
  const signOut = (
    <SignedIn>
      <UserButton afterSignOutUrl="/sign-in" />
    </SignedIn>
  );

  let body: React.ReactNode;
  if (read.isLoading) {
    body = (
      <>
        <p className="sub mt">Loading…</p>
        <div className="row mt" style={{ alignItems: "center", gap: 10 }}>{signOut}</div>
      </>
    );
  } else if (read.isError || !read.data) {
    body = (
      <>
        <p className="sub mt" role="alert" style={{ color: "var(--danger, #b42318)" }}>
          {read.error?.message || "The platform documents could not be loaded."}
        </p>
        <div className="row mt" style={{ alignItems: "center", gap: 10 }}>
          <button className="btn pri" type="button" disabled={read.isFetching} onClick={() => void read.refetch()}>
            {read.isFetching ? "Loading…" : "Try again"}
          </button>
          {signOut}
        </div>
      </>
    );
  } else {
    const data = read.data;
    body = (
      <>
        <p className="sub mt">
          {data.latest
            ? `The platform documents changed since you acknowledged them on ${formatAcknowledged(data.latest.created_at)}. Read the current versions, then continue.`
            : "Every Qualified Commercial login — Funding, Field Desk and Audit — works under the same company-wide platform documents. Read them once, then continue. You will only be asked again if they change."}
        </p>
        <ul className="mt" style={{ display: "grid", gap: 8, paddingLeft: 18 }}>
          {data.documents.map((d) => (
            <li key={d.key}>
              <a href={d.url} target="_blank" rel="noopener">
                {d.title} — effective {formatEffective(d.version)}
              </a>
            </li>
          ))}
        </ul>
        {data.company_agreement ? (
          <p className="sub mt">
            Your company&apos;s agreement is on file. {data.company_agreement.company_name} signed the{" "}
            {data.company_agreement.title} (No. {data.company_agreement.contract_number})
            {data.company_agreement.signed_at !== null ? ` on ${formatEffective(data.company_agreement.signed_at)}` : ""}.
          </p>
        ) : null}
        {error ? <p className="sub mt" role="alert" style={{ color: "var(--danger, #b42318)" }}>{error}</p> : null}
        <div className="row mt" style={{ alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          {signOut}
          <button className="btn pri" type="button" disabled={accept.isPending} onClick={submit}>
            {accept.isPending ? "Recording…" : "I have read them — continue"}
          </button>
        </div>
        <p className="sub mt" style={{ fontSize: 12 }}>
          This records an acknowledgment — the time, your IP address, your browser and the document versions.
          It is not an electronic signature and no certificate is issued.
        </p>
      </>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card hi" style={{ width: "min(460px, 100%)" }}>
        {brand}
        <h2 style={{ fontSize: 18, marginTop: 4 }}>Before you continue</h2>
        {body}
      </div>
    </div>
  );
}
