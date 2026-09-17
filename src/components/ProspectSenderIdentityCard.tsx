"use client";

import { Mail, Reply, UserRound } from "lucide-react";
import type { ProspectSenderIdentity } from "@/lib/prospects";

export default function ProspectSenderIdentityCard({
  identity,
  fallbackName,
  fallbackEmail,
}: {
  identity?: ProspectSenderIdentity | null;
  fallbackName?: string | null;
  fallbackEmail?: string | null;
}) {
  const hasStructuredIdentity = identity != null;
  const name = hasStructuredIdentity ? identity.sender_display_name || "Sender identity locked in email" : fallbackName || "Signed-in agent";
  const displayEmail = hasStructuredIdentity ? identity.sender_display_email : fallbackEmail;
  const signatureParts = [identity?.sender_title, identity?.sender_phone, displayEmail].filter(Boolean);

  return <section className="prospectSenderCard" aria-label="Email sender and agent branding">
    <div className="prospectSenderHeading"><UserRound size={18} /><span><b>Sender preview</b><small>The triggering agent&apos;s verified QC account identity creates the visible signature.</small></span></div>
    <div className="prospectSenderGrid">
      <div><span className="prospectSenderIcon"><UserRound size={15} /></span><span><small>Signed by</small><b>{name}</b>{signatureParts.length ? <em>{signatureParts.join(" · ")}</em> : <em>{hasStructuredIdentity ? "The full locked signature is preserved in the message body." : "Your verified QC account supplies the sender name and email."}</em>}</span></div>
      <div><span className="prospectSenderIcon"><Mail size={15} /></span><span><small>From</small><b>{identity?.sender_from_name || "Qualified Commercial Dealer Desk"}{identity?.envelope_from_email ? ` <${identity.envelope_from_email}>` : " · centralized no-reply"}</b><em>The technical sender stays consistent for deliverability.</em></span></div>
      <div><span className="prospectSenderIcon"><Reply size={15} /></span><span><small>Dealer replies go to</small><b>{identity?.reply_contact_email || "QC's monitored support inbox"}</b>{identity?.alternate_contact_email && <em>Alternate contact: {identity.alternate_contact_email}</em>}</span></div>
    </div>
  </section>;
}
