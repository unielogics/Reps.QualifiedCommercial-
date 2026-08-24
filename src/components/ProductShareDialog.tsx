"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Mail, MessageSquare, UserPlus, X } from "lucide-react";
import { api } from "@/lib/api";

type Contact = { id: string; name: string; company: string | null; email: string | null; phone?: string | null };
type ContactPage = { items: Contact[]; total: number };

export default function ProductShareDialog({
  open,
  onClose,
  programKeys,
  locale,
  sessionId,
}: {
  open: boolean;
  onClose: () => void;
  programKeys: string[];
  locale: "en" | "es";
  sessionId?: string | null;
}) {
  const { getToken } = useAuth();
  const [recipientMode, setRecipientMode] = useState<"existing" | "new">("existing");
  const [contactId, setContactId] = useState("");
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [recipient, setRecipient] = useState({ first_name: "", last_name: "", email: "", phone: "" });
  const [smsConsent, setSmsConsent] = useState(false);
  const [statusText, setStatusText] = useState("");

  const contacts = useQuery({
    queryKey: ["contacts", "product-sharing"],
    enabled: open,
    queryFn: async () => api<ContactPage>("/dealer-os/contacts?limit=100&offset=0", {
      authToken: (await getToken()) ?? undefined,
    }),
  });

  useEffect(() => {
    if (!open) return;
    setStatusText("");
    setSmsConsent(false);
  }, [open]);

  const selectedContact = useMemo(
    () => contacts.data?.items.find((contact) => contact.id === contactId),
    [contactId, contacts.data?.items],
  );
  const channelAvailable = recipientMode === "new"
    ? channel === "email" ? Boolean(recipient.email.trim()) : Boolean(recipient.phone.trim())
    : channel === "email" ? Boolean(selectedContact?.email) : Boolean(selectedContact?.phone);
  const newRecipientComplete = recipientMode === "existing" || Boolean(
    recipient.first_name.trim() && recipient.last_name.trim() && (recipient.email.trim() || recipient.phone.trim()),
  );
  const canSend = programKeys.length > 0
    && (recipientMode === "existing" ? Boolean(contactId) : newRecipientComplete)
    && channelAvailable
    && (channel !== "sms" || smsConsent);

  const send = useMutation({
    mutationFn: async () => api<{ delivery_status: string; delivery_detail?: string }>("/dealer-os/product-presentations", {
      method: "POST",
      authToken: (await getToken()) ?? undefined,
      body: JSON.stringify({
        ...(recipientMode === "existing" ? { contact_id: contactId } : recipient),
        session_id: sessionId || undefined,
        program_keys: programKeys,
        locale,
        channel,
        sms_transactional_consent: channel === "sms" && smsConsent,
      }),
    }),
    onSuccess: (result) => setStatusText(
      result.delivery_status === "sent"
        ? locale === "es" ? "Presentacion enviada." : "Presentation sent."
        : result.delivery_detail || result.delivery_status,
    ),
    onError: (error) => setStatusText(error instanceof Error ? error.message : "Delivery failed"),
  });

  if (!open) return null;
  return (
    <div className="modalOverlay" role="presentation">
      <section className="modalDialog productShareDialog" role="dialog" aria-modal="true" aria-labelledby="share-products-title">
        <header className="modalHead">
          <div><span className="eyebrow">Secure presentation</span><b id="share-products-title">Share funding PDF</b></div>
          <span className="sp" />
          <button type="button" className="modalClose" onClick={onClose} aria-label="Close sharing"><X size={18} /></button>
        </header>
        <div className="modalBody productShareBody">
          <div className="shareSummary"><Check size={18} /><span>{programKeys.length} selected program{programKeys.length === 1 ? "" : "s"} in {locale === "es" ? "Spanish" : "English"}</span></div>
          <div className="seg shareMode">
            <button type="button" className={recipientMode === "existing" ? "on" : ""} onClick={() => setRecipientMode("existing")}>Existing contact</button>
            <button type="button" className={recipientMode === "new" ? "on" : ""} onClick={() => setRecipientMode("new")}><UserPlus size={15} /> New contact</button>
          </div>
          {recipientMode === "existing" ? (
            <label><span>Contact</span><select className="field" value={contactId} onChange={(event) => setContactId(event.target.value)}><option value="">Select contact</option>{contacts.data?.items.map((contact) => <option value={contact.id} key={contact.id}>{contact.name}{contact.company ? ` - ${contact.company}` : ""}</option>)}</select></label>
          ) : (
            <div className="shareRecipientGrid">
              <label><span>First name</span><input className="field" value={recipient.first_name} onChange={(event) => setRecipient({ ...recipient, first_name: event.target.value })} /></label>
              <label><span>Last name</span><input className="field" value={recipient.last_name} onChange={(event) => setRecipient({ ...recipient, last_name: event.target.value })} /></label>
              <label><span>Email</span><input className="field" type="email" value={recipient.email} onChange={(event) => setRecipient({ ...recipient, email: event.target.value })} /></label>
              <label><span>Phone</span><input className="field" inputMode="tel" value={recipient.phone} onChange={(event) => setRecipient({ ...recipient, phone: event.target.value })} /></label>
            </div>
          )}
          <div className="shareChannels">
            <button type="button" className={channel === "email" ? "selected" : ""} onClick={() => setChannel("email")}><Mail size={18} /><span><b>Email PDF</b><small>Attached to a reusable Inbox thread</small></span></button>
            <button type="button" className={channel === "sms" ? "selected" : ""} onClick={() => setChannel("sms")}><MessageSquare size={18} /><span><b>Text secure link</b><small>Short-lived presentation download</small></span></button>
          </div>
          {channel === "sms" && <label className="smsConsent"><input type="checkbox" checked={smsConsent} onChange={(event) => setSmsConsent(event.target.checked)} /><span>I confirm this recipient gave affirmative consent to receive this transactional text message.</span></label>}
          {!channelAvailable && (contactId || recipientMode === "new") && <div className="validationBanner">Add or select a contact with a valid {channel === "email" ? "email address" : "phone number"}.</div>}
          {statusText && <div className="shareDeliveryStatus" role="status">{statusText}</div>}
        </div>
        <footer className="eligibilityFooter"><button type="button" className="btn" onClick={onClose}>Cancel</button><span className="sp" /><button type="button" className="btn pri" disabled={!canSend || send.isPending} onClick={() => send.mutate()}>{send.isPending ? "Sending..." : channel === "email" ? "Send PDF" : "Send secure link"}</button></footer>
      </section>
    </div>
  );
}
