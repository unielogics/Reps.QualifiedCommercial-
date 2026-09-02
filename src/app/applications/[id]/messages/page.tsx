"use client";

// Writing to the applicant.
//
// Deliberately separate from the desk thread in the right rail of the wizard.
// That separation is the single most important thing in this product's
// messaging: a remark meant for the underwriter landing in front of a borrower
// is the failure that costs a relationship. So the client thread has its own
// route, its own ground, and a composer that names the recipient.

import { useParams } from "next/navigation";
import { CheckCircle2, Mail, MessageSquareText, Phone } from "lucide-react";
import { useMe } from "@/lib/useMe";
import { useCase } from "@/lib/useCase";
import CaseMessagingWorkspace from "@/components/CaseMessagingWorkspace";
import RequestPanel from "@/components/RequestPanel";

type Consent = {
  consent_kind: string;
  granted: boolean;
  revoked_at: string | null;
  phone_e164: string;
  created_at: string;
};

function phoneE164(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits.length >= 11 ? `+${digits}` : null;
}

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

  const currentPhone = phoneE164(dealer?.phone);
  const grants = (consent.data ?? []).filter(
    (c) => c.granted && !c.revoked_at && Boolean(currentPhone) && c.phone_e164 === currentPhone,
  );
  const txn = grants.find((c) => c.consent_kind === "transactional");
  const mkt = grants.find((c) => c.consent_kind === "marketing");

  return (
    <div className="caseMessagingLayout">
      <div className="caseMessagingMain">
        {dealer ? <CaseMessagingWorkspace dealerId={id} meId={meId} canText={Boolean(txn)} dealer={{ name: dealer.name, case_ref: dealer.case_ref, email: dealer.email, phone: dealer.phone }} /> : <div className="panel panel-b">Loading client communications...</div>}
      </div>

      <aside className="caseMessagingAside">
        <div className="panel">
          <div className="panel-h"><b>Contact and consent</b></div>
          <div className="panel-b caseContactPanel">
            <div className="caseContactRow">
              <span className="caseContactIcon"><Mail size={17} /></span>
              <span><small>Application email</small><b>{dealer?.email || "Not provided"}</b></span>
            </div>
            <div className="caseContactRow">
              <span className="caseContactIcon"><Phone size={17} /></span>
              <span><small>Mobile</small><b className="num">{dealer?.phone || "Not provided"}</b></span>
            </div>
            <div className="caseConsentRow">
              <MessageSquareText size={17} />
              <span><b>Application texts</b><small>{txn ? `Authorized ${new Date(txn.created_at).toLocaleDateString()}` : "Consent not recorded"}</small></span>
              <span className={`cellchip ${txn ? "c-ok" : "c-warn"}`}>{txn ? "Active" : "Unavailable"}</span>
            </div>
            <div className="caseConsentRow">
              <CheckCircle2 size={17} />
              <span><b>Program texts</b><small>{mkt ? "Marketing consent recorded" : "Not authorized"}</small></span>
              <span className={`cellchip ${mkt ? "c-ok" : "c-mut"}`}>{mkt ? "Active" : "Off"}</span>
            </div>
          </div>
        </div>

        <div className="mt">
          <RequestPanel dealerId={id} canText={Boolean(txn)} />
        </div>
      </aside>
    </div>
  );
}
