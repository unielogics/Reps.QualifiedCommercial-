"use client";

// The case's own history, exactly as recorded.
//
// Nothing is summarised or reworded here: this is what a credit review or a
// carrier complaint gets answered with, so the value is that it is the raw
// trail rather than a friendly retelling of it.

import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type AuditRow = {
  id: string;
  actor_name: string;
  action: string;
  entity_kind: string;
  after: Record<string, unknown> | null;
  created_at: string;
};

// The trail stores machine actions; a person reading it wants the event.
const LABELS: Record<string, string> = {
  "client_request.bank_connect": "Bank link sent",
  "client_request.document": "Document requested",
  "client_request.signature": "Signature requested",
  "owner.credit_invite": "Credit authorization sent",
  "owner.soft_pull": "Credit authorization completed",
  "plaid.connect": "Bank connection completed",
  "plaid.connect.client": "Bank connection completed by the applicant",
  "sms_consent.granted": "SMS consent captured",
  "sms_consent.revoked": "SMS consent revoked",
  "session.create": "Meeting booked",
  "doc_request.create": "Document request opened",
};

function label(action: string): string {
  return LABELS[action] ?? action.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function detail(r: AuditRow): string {
  const a = r.after ?? {};
  const bits: string[] = [];
  if (typeof a.purpose === "string") bits.push(a.purpose);
  if (typeof a.recipient === "string" && a.recipient) bits.push(a.recipient);
  if (typeof a.institution === "string" && a.institution) bits.push(a.institution);
  if (Array.isArray(a.kinds)) bits.push((a.kinds as string[]).join(", "));
  if (typeof a.version === "string") bits.push(`disclosure ${a.version}`);
  if (typeof a.title === "string") bits.push(a.title);
  return bits.join(" · ") || r.entity_kind;
}

export default function AuditTab() {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();

  const q = useQuery({
    queryKey: ["audit", id],
    queryFn: async () =>
      api<AuditRow[]>(`/dealer-os/dealers/${id}/audit?limit=200`, {
        authToken: (await getToken()) ?? undefined,
      }),
  });

  return (
    <div className="panel">
      <div className="panel-h">
        Audit trail
        <span style={{ flex: 1 }} />
        <span className="sub">Immutable · exportable for credit review</span>
      </div>
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th className="r">Timestamp</th>
              <th>Event</th>
              <th>Actor</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((r) => (
              <tr key={r.id}>
                <td className="r sub num">
                  {new Date(r.created_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </td>
                <td>
                  <b>{label(r.action)}</b>
                </td>
                <td className="sub">{r.actor_name}</td>
                <td className="sub">{detail(r)}</td>
              </tr>
            ))}
            {q.data?.length === 0 && (
              <tr>
                <td colSpan={4} className="sub">
                  Nothing recorded on this case yet.
                </td>
              </tr>
            )}
            {q.isLoading && (
              <tr>
                <td colSpan={4} className="sub">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
