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
        <h2>{isRep ? "Portfolio" : "All applications"}</h2>
        <p className="lede">
          {isRep
            ? "Every application you have opened, and what each one is waiting on."
            : "Every application the field team is working."}
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
                      {/* Opens the file's own page, where the conversation
                          lives. The heavy analysis stays on Capital OS and is
                          one link away from there rather than duplicated. */}
                      <Link className="linky" href={`/applications/${r.id}`}>
                        Open →
                      </Link>
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
