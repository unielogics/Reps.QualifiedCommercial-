"use client";

// What the field team is bringing in. Super-admin only, enforced server-side.
//
// The headline number is deliberately NOT files opened. A rep can open twenty
// files in an afternoon and none of them are worth anything until a client
// actually sends something, so leading with the count would reward exactly the
// wrong behaviour. "With documents" is the number that separates a visit from
// a file.

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMe } from "@/lib/useMe";

const AUDIT_URL = process.env.NEXT_PUBLIC_AUDIT_URL ?? "https://audit.qualifiedcommercial.com";

type FileRow = {
  dealer_id: string;
  name: string;
  city: string | null;
  state: string | null;
  industry: string | null;
  status: string | null;
  decision: string | null;
  score: number | null;
  documents: number;
  created_at: string;
  last_activity: string | null;
};

type Rep = {
  rep_user_id: string | null;
  rep_name: string;
  rep_email: string | null;
  files_opened: number;
  active: number;
  complete: number;
  declined: number;
  stalled: number;
  with_documents: number;
  fundable: number;
  avg_score: number | null;
  last_activity: string | null;
  files: FileRow[];
};

type Production = { since: string | null; totals: Rep; reps: Rep[] };

const WINDOWS = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
];

function ago(iso: string | null): string {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function statusTone(s: string | null): string {
  if (s === "complete") return "c-ok";
  if (s === "declined") return "c-bad";
  if (s === "stalled") return "c-warn";
  if (!s) return "c-mut";
  return "c-acc";
}

export default function ProductionPage() {
  const { getToken } = useAuth();
  const { isSuperAdmin, isResolving } = useMe();
  const [days, setDays] = useState(90);
  const [open, setOpen] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["production", days],
    queryFn: async () =>
      api<Production>(`/dealer-os/rep-production?days=${days}`, {
        authToken: (await getToken()) ?? undefined,
      }),
    enabled: isSuperAdmin,
  });

  if (isResolving) return null;
  if (!isSuperAdmin) {
    return (
      <div className="card">
        <b>Not available</b>
        <p className="sub mt">Production reporting is limited to super admins.</p>
      </div>
    );
  }

  const d = q.data;
  const t = d?.totals;

  return (
    <>
      <div className="hd">
        <h2>Production</h2>
        <p className="lede">What the field team has opened, and how much of it turned into a real file.</p>
      </div>

      <div className="row mt" style={{ gap: 8 }}>
        <div className="seg">
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              type="button"
              className={days === w.days ? "on" : undefined}
              onClick={() => setDays(w.days)}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {q.isLoading && <p className="sub mt">Loading…</p>}
      {q.isError && <div className="note mt">Could not load production.</div>}

      {t && (
        <div className="kpis mt">
          <div className="kpi">
            <span className="lbl">Files opened</span>
            <b className="knum">{t.files_opened}</b>
          </div>
          <div className="kpi">
            <span className="lbl">With documents</span>
            <b className="knum">{t.with_documents}</b>
            <span className="sub">
              {t.files_opened > 0
                ? `${Math.round((t.with_documents / t.files_opened) * 100)}% of files opened`
                : "—"}
            </span>
          </div>
          <div className="kpi">
            <span className="lbl">Still working</span>
            <b className="knum">{t.active}</b>
          </div>
          <div className="kpi">
            <span className="lbl">Avg score</span>
            <b className="knum">{t.avg_score ?? "—"}</b>
          </div>
        </div>
      )}

      {d && d.reps.length === 0 && (
        <div className="card mt">
          <b>No field files yet</b>
          <p className="sub mt">
            Once a rep opens their first file it appears here, along with whether the client
            has sent anything.
          </p>
        </div>
      )}

      {d?.reps.map((r) => {
        const isOpen = open === (r.rep_user_id ?? r.rep_name);
        const key = r.rep_user_id ?? r.rep_name;
        return (
          <div className="panel mt" key={key}>
            <div className="panel-h" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <b>{r.rep_name}</b>
              {r.rep_email && <span className="sub">{r.rep_email}</span>}
              <span style={{ flex: 1 }} />
              <span className="sub">last active {ago(r.last_activity)}</span>
              <button
                type="button"
                className="linky"
                onClick={() => setOpen(isOpen ? null : key)}
              >
                {isOpen ? "Hide files" : `${r.files_opened} file${r.files_opened === 1 ? "" : "s"} →`}
              </button>
            </div>
            <div className="panel-b">
              <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
                <span className="cellchip c-acc">{r.files_opened} opened</span>
                <span className="cellchip c-ok">{r.with_documents} with documents</span>
                <span className="cellchip c-mut">{r.active} working</span>
                {r.complete > 0 && <span className="cellchip c-ok">{r.complete} complete</span>}
                {r.stalled > 0 && <span className="cellchip c-warn">{r.stalled} stalled</span>}
                {r.declined > 0 && <span className="cellchip c-bad">{r.declined} declined</span>}
                {r.avg_score !== null && (
                  <span className="sub">avg score {r.avg_score}</span>
                )}
              </div>

              {isOpen && (
                <div className="tblwrap mt">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Business</th>
                        <th>Where</th>
                        <th>Status</th>
                        <th className="r">Docs</th>
                        <th className="r">Score</th>
                        <th className="r">Opened</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {r.files.map((f) => (
                        <tr key={f.dealer_id}>
                          <td>
                            <b>{f.name}</b>
                          </td>
                          <td className="sub">
                            {[f.city, f.state].filter(Boolean).join(", ") || "—"}
                          </td>
                          <td>
                            <span className={`cellchip ${statusTone(f.status)}`}>
                              {f.status ?? "no pipeline"}
                            </span>
                          </td>
                          <td className="r">
                            {f.documents === 0 ? (
                              <span className="cellchip c-warn">none</span>
                            ) : (
                              f.documents
                            )}
                          </td>
                          <td className="r">{f.score ?? "—"}</td>
                          <td className="r sub">{ago(f.created_at)}</td>
                          <td className="r">
                            <a
                              className="linky"
                              href={`${AUDIT_URL}/dealers/${f.dealer_id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open →
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {d?.since && (
        <p className="sub mt">
          Counting files opened since {new Date(d.since).toLocaleDateString()}. Files opened
          before the pipeline existed show as &ldquo;no pipeline&rdquo; and still count.
        </p>
      )}
    </>
  );
}
