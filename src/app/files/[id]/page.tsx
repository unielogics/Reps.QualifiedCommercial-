"use client";

// One file, open.
//
// Conversation on the left because that is where the work happens, and what
// the numbers currently say on the right, so a rep answering the underwriter
// does not have to leave the thread to check a figure.
//
// The right column deliberately shows very little. This app is for collecting
// and working a file, not for analysing one; the full cockpit lives in Capital
// OS and there is a link to it. Duplicating that here would mean two places
// where the same number is computed, and eventually two places where it
// disagrees.

import { use } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMe } from "@/lib/useMe";
import Conversation from "@/components/Conversation";
import RequestPanel from "@/components/RequestPanel";
import Decision from "@/components/Decision";
import Meetings from "@/components/Meetings";

const AUDIT_URL = process.env.NEXT_PUBLIC_AUDIT_URL ?? "https://audit.qualifiedcommercial.com";

type Dealer = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  industry: string;
  status: string;
  phone: string | null;
  email: string | null;
  funding_goal: number | null;
  funding_purpose: string | null;
  created_at: string;
};

type Consent = {
  id: string;
  phone_e164: string;
  consent_kind: string;
  granted: boolean;
  created_at: string;
  revoked_at: string | null;
  consenter_name: string | null;
};

function money(n: number | null): string {
  if (n === null) return "not set";
  return "$" + Math.round(n).toLocaleString();
}

export default function FilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { getToken } = useAuth();
  const { id: meId, isRep, isTeam, isResolving } = useMe();

  const dealer = useQuery({
    queryKey: ["dealer", id],
    queryFn: async () =>
      api<Dealer>(`/dealer-os/dealers/${id}`, { authToken: (await getToken()) ?? undefined }),
    enabled: isRep || isTeam,
  });

  const consent = useQuery({
    queryKey: ["consent", id],
    queryFn: async () =>
      api<Consent[]>(`/dealer-os/dealers/${id}/sms-consent`, {
        authToken: (await getToken()) ?? undefined,
      }),
    enabled: isRep || isTeam,
  });

  if (isResolving) return null;

  if (dealer.isError) {
    return (
      <div className="card">
        <b>Not your file</b>
        <p className="sub mt">
          This file either does not exist or belongs to another rep. <Link href="/">Back to my files</Link>.
        </p>
      </div>
    );
  }

  const d = dealer.data;
  const grants = (consent.data ?? []).filter((c) => c.granted && !c.revoked_at);
  const textable = grants.some((c) => c.consent_kind === "transactional");

  return (
    <>
      <div className="hd">
        <h2>{d?.name ?? "Loading…"}</h2>
        <p className="lede">
          {d
            ? [d.city, d.state].filter(Boolean).join(", ") || "Location not recorded yet"
            : " "}
        </p>
      </div>

      <div className="cg mt">
        <div className="s8" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Decision dealerId={id} />
          <Conversation dealerId={id} meId={meId} />
        </div>

        <div className="s4">
          <div className="panel">
            <div className="panel-h">The file</div>
            <div className="panel-b">
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <span className="cellchip c-acc">{d?.status ?? "…"}</span>
                {d?.industry && <span className="cellchip c-mut">{d.industry.replace(/_/g, " ")}</span>}
              </div>

              <label className="lbl mt">Looking for</label>
              <div>{d ? money(d.funding_goal) : "…"}</div>
              {d?.funding_purpose && (
                <span className="sub">{d.funding_purpose.replace(/_/g, " ")}</span>
              )}

              <label className="lbl mt">Reach them</label>
              <div className="sub">{d?.phone || "no phone"}</div>
              <div className="sub">{d?.email || "no email"}</div>

              <a
                className="btn mt"
                style={{ width: "100%", textAlign: "center" }}
                href={`${AUDIT_URL}/dealers/${id}`}
                target="_blank"
                rel="noreferrer"
              >
                Open the full analysis
              </a>
              <span className="sub">
                Documents, bank connection, DSCR and the capital paths all live in Capital OS.
              </span>
            </div>
          </div>

          <div className="mt">
            <RequestPanel dealerId={id} canText={textable} />
          </div>

          <div className="mt">
            <Meetings dealerId={id} />
          </div>

          <div className="panel mt">
            <div className="panel-h">Texting</div>
            <div className="panel-b">
              {consent.isLoading && <span className="sub">Checking…</span>}
              {!consent.isLoading && textable && (
                <>
                  <span className="cellchip c-ok">Opted in</span>
                  <p className="sub mt">
                    {grants[0]?.phone_e164} agreed to account messages
                    {grants.some((c) => c.consent_kind === "marketing") ? " and promotional messages" : ""}
                    {grants[0]?.consenter_name ? `, given by ${grants[0].consenter_name}` : ""}.
                  </p>
                </>
              )}
              {!consent.isLoading && !textable && (
                <>
                  <span className="cellchip c-warn">Not opted in</span>
                  <p className="sub mt">
                    Secure links go by email until the owner opts in. You can capture it next
                    time you are with them.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
