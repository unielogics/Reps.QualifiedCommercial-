"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ComposeChannel, InboxComposeRequest } from "@/lib/repWorkflows";
import Drawer from "./Drawer";

type ThreadSeed = {
  dealer_id?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  company?: string | null;
};

type ComposeResult = {
  threads: Array<{ id: string; channel: ComposeChannel }>;
  messages: Array<{ id: string }>;
};

export default function InboxComposeModal({
  onClose,
  seed,
  onSent,
}: {
  onClose: () => void;
  seed?: ThreadSeed | null;
  onSent?: (threadId: string | null) => void;
}) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState(seed?.contact_name ?? "");
  const [company, setCompany] = useState(seed?.company ?? "");
  const [email, setEmail] = useState(seed?.contact_email ?? "");
  const [phone, setPhone] = useState(seed?.contact_phone ?? "");
  const [sendEmail, setSendEmail] = useState(Boolean(seed?.contact_email ?? true));
  const [sendSms, setSendSms] = useState(false);
  const [subject, setSubject] = useState("Qualified Commercial");
  const [body, setBody] = useState("");
  const [transactional, setTransactional] = useState(false);
  const [marketing, setMarketing] = useState(false);

  const channels: ComposeChannel[] = [
    ...(sendEmail ? (["email"] as const) : []),
    ...(sendSms ? (["sms"] as const) : []),
  ];
  const canSend = Boolean(
    name.trim() &&
      body.trim() &&
      (!sendEmail || subject.trim()) &&
      ((sendEmail && email.trim()) || (sendSms && phone.trim())) &&
      channels.length > 0 &&
      (!sendSms || transactional || marketing),
  );

  const send = useMutation({
    mutationFn: async () => {
      const payload: InboxComposeRequest = {
        dealer_id: seed?.dealer_id ?? null,
        recipient_name: name.trim(),
        company: company.trim() || null,
        recipient_email: email.trim() || null,
        recipient_phone: phone.trim() || null,
        channels,
        subject: subject.trim(),
        body: body.trim(),
        transactional_sms_consent: transactional,
        marketing_sms_consent: marketing,
        consent_method: "rep_attested",
      };
      return api<ComposeResult>("/dealer-os/inbox/threads", {
        method: "POST",
        body: JSON.stringify(payload),
        authToken: (await getToken()) ?? undefined,
      });
    },
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["inbox-threads"] });
      onSent?.(result.threads[0]?.id ?? null);
      onClose();
    },
  });

  return (
    <Drawer title="New message" width={820} onClose={onClose}>
      <div className="panel">
        <div className="panel-h">Contact details</div>
        <div className="panel-b" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <div>
              <label className="lbl">Name</label>
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="lbl">Company</label>
              <input className="field" value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
            <div>
              <label className="lbl">Email</label>
              <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="lbl">Mobile</label>
              <input className="field" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="lbl">Send by</label>
            <div className="row" style={{ gap: 8 }}>
              <label className={`consent${sendEmail ? " on" : ""}`} style={{ margin: 0, flex: 1, display: "flex", gap: 10, alignItems: "flex-start" }}>
                <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
                <span className="ctext">
                  <span className="ctitle">Email</span>
                  Send to the email address above.
                </span>
              </label>
              <label className={`consent${sendSms ? " on" : ""}`} style={{ margin: 0, flex: 1, display: "flex", gap: 10, alignItems: "flex-start" }}>
                <input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} />
                <span className="ctext">
                  <span className="ctitle">SMS</span>
                  Send to the mobile number above.
                </span>
              </label>
            </div>
          </div>

          {sendSms && (
            <div className="note" style={{ marginTop: 0 }}>
              <div>
                SMS requires consent first.
                <div className={`consent${transactional ? " on" : ""}`} style={{ marginTop: 10 }}>
                  <label>
                    <input type="checkbox" checked={transactional} onChange={(e) => setTransactional(e.target.checked)} />
                    <span className="ctext">
                      <span className="ctitle">Account and appointment texts</span>
                      They agreed to receive texts about their application and appointments.
                    </span>
                  </label>
                </div>
                <div className={`consent${marketing ? " on" : ""}`} style={{ marginTop: 8 }}>
                  <label>
                    <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
                    <span className="ctext">
                      <span className="ctitle">Program texts</span>
                      They agreed to receive program introductions and company information.
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {sendEmail && (
            <div>
              <label className="lbl">Subject</label>
              <input className="field" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
          )}
          <div>
            <label className="lbl">{sendEmail ? "Message" : "Text message"}</label>
            <textarea className="field" rows={7} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>

          {send.isError && <div className="note">{send.error instanceof Error ? send.error.message : "That message did not send."}</div>}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="button" className="btn pri" disabled={!canSend || send.isPending} onClick={() => send.mutate()}>
              {send.isPending ? "Sending..." : "Review and send"}
            </button>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
