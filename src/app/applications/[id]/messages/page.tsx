"use client";

// Writing to the applicant.
//
// Deliberately separate from the desk thread in the right rail of the wizard.
// That separation is the single most important thing in this product's
// messaging: a remark meant for the underwriter landing in front of a borrower
// is the failure that costs a relationship. So the client thread has its own
// route, its own ground, and a composer that names the recipient.

import { useParams } from "next/navigation";
import { useMe } from "@/lib/useMe";
import { useCase } from "@/lib/useCase";
import Conversation from "@/components/Conversation";
import RequestPanel from "@/components/RequestPanel";

type Consent = {
  consent_kind: string;
  granted: boolean;
  revoked_at: string | null;
  phone_e164: string;
  created_at: string;
};

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function MessagesTab() {
  const { id } = useParams<{ id: string }>();
  const { id: meId } = useMe();
  const { dealer } = useCase(id);
  const { getToken } = useAuth();

  const consent = useQuery({
    queryKey: ["consent", id],
    queryFn: async () =>
      api<Consent[]>(`/dealer-os/dealers/${id}/sms-consent`, {
        authToken: (await getToken()) ?? undefined,
      }),
  });

  const grants = (consent.data ?? []).filter((c) => c.granted && !c.revoked_at);
  const txn = grants.find((c) => c.consent_kind === "transactional");
  const mkt = grants.find((c) => c.consent_kind === "marketing");

  return (
    <div className="cg">
      <div className="s8">
        <Conversation dealerId={id} meId={meId} />
      </div>

      <div className="s4">
        <div className="panel">
          <div className="panel-h">Contact and consent</div>
          <div className="panel-b">
            <div className="kv">
              <span>Email</span>
              <b>{dealer?.email || "none on file"}</b>
            </div>
            <div className="kv">
              <span>Mobile</span>
              <b className="num">{dealer?.phone || "none on file"}</b>
            </div>
            <div className="kv">
              <span>Account and application SMS</span>
              <span className={`cellchip ${txn ? "c-ok" : "c-mut"}`}>
                {txn ? "Authorized" : "Not given"}
              </span>
            </div>
            <div className="kv">
              <span>Promotional SMS</span>
              <span className={`cellchip ${mkt ? "c-ok" : "c-mut"}`}>
                {mkt ? "Authorized" : "Declined"}
              </span>
            </div>
            <div className="kv">
              <span>Captured</span>
              <span className="sub num">
                {txn
                  ? new Date(txn.created_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : "—"}
              </span>
            </div>
          </div>
        </div>

        <div className="mt">
          <RequestPanel dealerId={id} canText={Boolean(txn)} />
        </div>
      </div>
    </div>
  );
}
