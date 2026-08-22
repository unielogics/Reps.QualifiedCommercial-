"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
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
}: {
  onClose: () => void;
  initialDealerId?: string | null;
}) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [dealerId, setDealerId] = useState(initialDealerId ?? "");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState<"email" | "sms" | "email_sms">("email");
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
  const wantsSms = channel === "sms" || channel === "email_sms";
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
          notes: notes.trim() || null,
        }),
        authToken: (await getToken()) ?? undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["inbox-threads"] });
      onClose();
    },
  });
  const canSend = Boolean(name.trim() && (email.trim() || phone.trim()) && (!wantsSms || transactional || marketing));

  return (
    <Drawer title="Share contact information" width={720} onClose={onClose}>
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
            <div className="seg">
              <button type="button" className={channel === "email" ? "on" : undefined} onClick={() => setChannel("email")}>Email</button>
              <button type="button" className={channel === "sms" ? "on" : undefined} onClick={() => setChannel("sms")}>SMS</button>
              <button type="button" className={channel === "email_sms" ? "on" : undefined} onClick={() => setChannel("email_sms")}>Email + SMS</button>
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
