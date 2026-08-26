"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ProgramPdfAttachment } from "@/lib/repWorkflows";
import Drawer from "./Drawer";

type FileRow = {
  id: string;
  name: string;
  case_ref: string | null;
  email?: string | null;
  phone?: string | null;
};

export default function ContactShareDrawer({
  onClose,
  initialDealerId,
  initialName,
  initialCompany,
  initialEmail,
  initialPhone,
}: {
  onClose: () => void;
  initialDealerId?: string | null;
  initialName?: string | null;
  initialCompany?: string | null;
  initialEmail?: string | null;
  initialPhone?: string | null;
}) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [dealerId, setDealerId] = useState(initialDealerId ?? "");
  const [name, setName] = useState(initialName ?? "");
  const [company, setCompany] = useState(initialCompany ?? "");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [sendEmail, setSendEmail] = useState(true);
  const [sendSms, setSendSms] = useState(false);
  const [programPdfKeys, setProgramPdfKeys] = useState<string[]>([]);
  const [transactional, setTransactional] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [notes, setNotes] = useState("");

  const files = useQuery({
    queryKey: ["files"],
    queryFn: async () => api<FileRow[]>("/dealer-os/dealers", { authToken: (await getToken()) ?? undefined }),
  });
  const selected = useMemo(
    () => (files.data ?? []).find((f) => f.id === dealerId) ?? null,
    [files.data, dealerId],
  );
  const pdfs = useQuery({
    queryKey: ["program-pdfs"],
    queryFn: async () =>
      api<ProgramPdfAttachment[]>("/dealer-os/contact-shares/program-pdfs", {
        authToken: (await getToken()) ?? undefined,
      }),
  });
  const channel = sendEmail && sendSms ? "email_sms" : sendSms ? "sms" : "email";
  const wantsSms = sendSms;
  const togglePdf = (key: string) =>
    setProgramPdfKeys((prev) =>
      prev.includes(key) ? prev.filter((value) => value !== key) : [...prev, key],
    );
  const share = useMutation({
    mutationFn: async () =>
      api("/dealer-os/contact-shares", {
        method: "POST",
        body: JSON.stringify({
          dealer_id: dealerId || null,
          recipient_name: name.trim(),
          company: company.trim() || selected?.name || null,
          recipient_email: email.trim() || null,
          recipient_phone: phone.trim() || null,
          channel,
          transactional_sms_consent: transactional,
          marketing_sms_consent: marketing,
          consent_method: "rep_attested",
          program_pdf_keys: programPdfKeys,
          notes: notes.trim() || null,
        }),
        authToken: (await getToken()) ?? undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["inbox-threads"] });
      onClose();
    },
  });
  const canSend = Boolean(
    name.trim() &&
      ((sendEmail && email.trim()) || (sendSms && phone.trim())) &&
      (sendEmail || sendSms) &&
      (!wantsSms || transactional || marketing),
  );

  return (
    <Drawer
      title="Share contact information"
      width={980}
      onClose={onClose}
      variant="workspace"
      dismissOnBackdrop={false}
    >
      <div className="panel">
        <div className="panel-h">Recipient</div>
        <div className="panel-b" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label className="lbl">Related file</label>
            <select className="field" value={dealerId} onChange={(e) => setDealerId(e.target.value)}>
              <option value="">No file yet</option>
              {(files.data ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}{f.case_ref ? ` · ${f.case_ref}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <div>
              <label className="lbl">Name</label>
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="lbl">Company</label>
              <input className="field" value={company} onChange={(e) => setCompany(e.target.value)} placeholder={selected?.name ?? ""} />
            </div>
            <div>
              <label className="lbl">Email</label>
              <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={selected?.email ?? ""} />
            </div>
            <div>
              <label className="lbl">Mobile</label>
              <input className="field" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={selected?.phone ?? ""} />
            </div>
          </div>

          <div>
            <label className="lbl">Send by</label>
            <div className="row" style={{ gap: 8 }}>
              <label className={`consent${sendEmail ? " on" : ""}`} style={{ margin: 0, flex: 1, display: "flex", gap: 10, alignItems: "flex-start" }}>
                <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
                <span className="ctext">
                  <span className="ctitle">Email</span>
                  Send the card, company intro, links, and selected PDFs.
                </span>
              </label>
              <label className={`consent${sendSms ? " on" : ""}`} style={{ margin: 0, flex: 1, display: "flex", gap: 10, alignItems: "flex-start" }}>
                <input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} />
                <span className="ctext">
                  <span className="ctitle">SMS</span>
                  Send a short contact-card link.
                </span>
              </label>
            </div>
          </div>

          <div>
            <label className="lbl">Program PDFs</label>
            <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
              {pdfs.isLoading && <span className="sub">Loading program PDFs...</span>}
              {(pdfs.data ?? []).map((pdf) => (
                <label key={pdf.key} className={`consent${programPdfKeys.includes(pdf.key) ? " on" : ""}`} style={{ margin: 0, display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <input
                    type="checkbox"
                    checked={programPdfKeys.includes(pdf.key)}
                    onChange={() => togglePdf(pdf.key)}
                    disabled={!sendEmail}
                  />
                  <span className="ctext">
                    <span className="ctitle">{pdf.title}</span>
                    {pdf.description}
                  </span>
                </label>
              ))}
              {!sendEmail && <span className="sub">PDFs are email attachments and card-page downloads, not SMS attachments.</span>}
            </div>
          </div>

          {wantsSms && (
            <div className="note" style={{ marginTop: 0 }}>
              <div>
                SMS requires consent first. Record only what the person agreed to receive.
                A STOP reply will opt the number out automatically.
                <div className={`consent${transactional ? " on" : ""}`} style={{ marginTop: 10 }}>
                  <label>
                    <input type="checkbox" checked={transactional} onChange={(e) => setTransactional(e.target.checked)} />
                    <span className="ctext">
                      <span className="ctitle">Account and application texts</span>
                      They agreed to receive texts about their application and appointments.
                    </span>
                  </label>
                </div>
                <div className={`consent${marketing ? " on" : ""}`} style={{ marginTop: 8 }}>
                  <label>
                    <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
                    <span className="ctext">
                      <span className="ctitle">Program and company texts</span>
                      They agreed to receive program introductions and company information.
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="lbl">Personal note</label>
            <textarea className="field" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional context to include below the company intro." />
          </div>

          {share.isError && <div className="note">{share.error instanceof Error ? share.error.message : "That contact card could not be sent."}</div>}

          <button type="button" className="btn pri" disabled={!canSend || share.isPending} onClick={() => share.mutate()}>
            {share.isPending ? "Sending..." : "Review and send"}
          </button>
        </div>
      </div>
    </Drawer>
  );
}
