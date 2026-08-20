"use client";

// My files. For a rep this is their whole book; for the team it is everyone's.
// The filtering happens on the server (GET /dealer-os/dealers scopes a
// field_rep to owner_user_id), so this renders whatever it is given.

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMe } from "@/lib/useMe";

type FileRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  industry: string | null;
  score: number | null;
  created_at: string;
};

const AUDIT_URL = process.env.NEXT_PUBLIC_AUDIT_URL ?? "https://audit.qualifiedcommercial.com";

function scoreTone(score: number | null): string {
  if (score === null) return "c-mut";
  if (score >= 80) return "c-ok";
  if (score >= 60) return "c-warn";
  return "c-bad";
}

export default function MyFiles() {
  const { getToken } = useAuth();
  const { isRep, isTeam } = useMe();

  const q = useQuery({
    queryKey: ["files"],
    queryFn: async () =>
      api<FileRow[]>("/dealer-os/dealers", { authToken: (await getToken()) ?? undefined }),
    enabled: isRep || isTeam,
  });

  const rows = q.data ?? [];

  return (
    <>
      <div className="hd">
        <h2>{isRep ? "My files" : "All files"}</h2>
        <p className="lede">
          {isRep
            ? "Every business you have opened a file on. Open one to request documents, run the numbers and work it to a decision."
            : "Every file the field team is working."}
        </p>
      </div>

      <div className="row mt" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="sub">
          {q.isLoading ? "Loading…" : `${rows.length} file${rows.length === 1 ? "" : "s"}`}
        </span>
        <Link href="/new" className="btn pri">
          + New file
        </Link>
      </div>

      {q.isError && (
        <div className="note mt">
          Could not load your files. Refresh, and if it keeps happening tell the desk.
        </div>
      )}

      {!q.isLoading && rows.length === 0 && (
        <div className="card mt">
          <b>No files yet</b>
          <p className="sub mt">
            Open one while you are standing in the business. You only need a name and a way
            to reach them; everything else can follow.
          </p>
          <Link href="/new" className="btn pri mt">
            Open your first file
          </Link>
        </div>
      )}

      {rows.length > 0 && (
        <div className="panel mt">
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Where</th>
                  <th>Industry</th>
                  <th className="r">Score</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <b>{r.name}</b>
                    </td>
                    <td className="sub">
                      {[r.city, r.state].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="sub">{r.industry ?? "—"}</td>
                    <td className="r">
                      <span className={`cellchip ${scoreTone(r.score)}`}>
                        {r.score === null ? "no data" : Math.round(r.score)}
                      </span>
                    </td>
                    <td className="r">
                      {/* The full cockpit lives on Capital OS; this app opens
                          into it rather than reimplementing every module. */}
                      <a
                        className="linky"
                        href={`${AUDIT_URL}/dealers/${r.id}`}
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
        </div>
      )}
    </>
  );
}
