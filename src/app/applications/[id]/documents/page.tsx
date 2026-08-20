"use client";

// Every document on the case, and what is still outstanding.
//
// Source matters as much as status. A statement retrieved through the bank
// connection carries its institution and cannot be edited; a PDF the applicant
// uploaded is their assertion. An underwriter reading the file needs to tell
// those apart at a glance, so Source is a column rather than a detail.

import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Doc = {
  id: string;
  filename: string;
  kind: string | null;
  status: string;
  source: string | null;
  page_count: number | null;
  created_at: string;
};

type DocRequest = {
  id: string;
  title: string;
  kind: string;
  status: string;
  due_on: string | null;
  note: string | null;
};

function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function DocumentsTab() {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();

  const docs = useQuery({
    queryKey: ["documents", id],
    queryFn: async () =>
      api<Doc[]>(`/dealer-os/dealers/${id}/documents`, {
        authToken: (await getToken()) ?? undefined,
      }),
  });

  const requests = useQuery({
    queryKey: ["doc-requests", id],
    queryFn: async () =>
      api<DocRequest[]>(`/dealer-os/dealers/${id}/doc-requests`, {
        authToken: (await getToken()) ?? undefined,
      }),
  });

  const received = docs.data ?? [];
  const open = (requests.data ?? []).filter((r) => r.status === "open");
  const total = received.length + open.length;

  return (
    <div className="cg">
      <div className="s8">
        <div className="panel">
          <div className="panel-h">
            Document file
            <span style={{ flex: 1 }} />
            <span className="sub num">
              {received.length} of {total || received.length} received
            </span>
            <Link className="btn sm pri" href={`/applications/${id}/messages`}>
              Request outstanding items
            </Link>
          </div>
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th className="r">Received</th>
                  <th className="r">Pages</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {received.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <b>{d.filename}</b>
                    </td>
                    <td className="sub">
                      {d.source === "plaid" ? "Bank connection" : d.source || "Uploaded"}
                    </td>
                    <td>
                      <span className={`cellchip ${d.status === "failed" ? "c-bad" : "c-ok"}`}>
                        {d.status === "failed"
                          ? "Could not read"
                          : d.source === "plaid"
                            ? "Auto-retrieved"
                            : "Received"}
                      </span>
                    </td>
                    <td className="r sub num">{when(d.created_at)}</td>
                    <td className="r num">{d.page_count ?? "—"}</td>
                    <td className="r" />
                  </tr>
                ))}
                {open.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <b>{r.title}</b>
                    </td>
                    <td className="sub">Requested from the applicant</td>
                    <td>
                      <span className="cellchip c-warn">Requested</span>
                    </td>
                    <td className="r sub">—</td>
                    <td className="r sub">—</td>
                    <td className="r">
                      <Link className="linky" href={`/applications/${id}/messages`}>
                        Chase
                      </Link>
                    </td>
                  </tr>
                ))}
                {total === 0 && !docs.isLoading && (
                  <tr>
                    <td colSpan={6} className="sub">
                      Nothing on the file yet. Statements arrive with the bank connection;
                      anything else is uploaded or requested.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="s4">
        <div className="panel">
          <div className="panel-h">Add to the file</div>
          <div className="panel-b">
            <div className="dropzone">
              <b>Drop a document here</b>
              <span className="sub" style={{ display: "block", marginTop: 6 }}>
                PDF, JPEG or PNG. Filed against the case and indexed for the underwriter.
              </span>
            </div>
            <span className="lbl mt" style={{ display: "block" }}>
              Or request it from the applicant
            </span>
            <div className="row mt">
              <Link className="btn pri" href={`/applications/${id}/messages`}>
                Compose a request
              </Link>
            </div>
          </div>
        </div>

        <div className="panel mt">
          <div className="panel-h">Retention</div>
          <div className="panel-b">
            <p className="sub" style={{ margin: 0, lineHeight: 1.6 }}>
              Documents retrieved through the bank connection carry their institution of origin
              and are not editable. Items uploaded by the applicant are held in the case for
              seven years from the decision date.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
