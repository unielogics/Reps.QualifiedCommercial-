"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { DealerProspect } from "@/lib/prospects";
import Modal from "./Modal";

export default function ProspectQuickAddModal({
  onClose,
  onCreated,
  onOpenExisting,
  initialValues,
}: {
  onClose: () => void;
  onCreated: (prospect: DealerProspect) => void;
  onOpenExisting: (prospectId: string) => void;
  initialValues?: { contact_id?: string | null; name?: string | null; dealer_name?: string | null; email?: string | null; phone?: string | null };
}) {
  const { getToken } = useAuth();
  const [name, setName] = useState(initialValues?.name ?? "");
  const [dealerName, setDealerName] = useState(initialValues?.dealer_name ?? "");
  const [email, setEmail] = useState(initialValues?.email ?? "");
  const [phone, setPhone] = useState(initialValues?.phone ?? "");

  const create = useMutation({
    mutationFn: async () => api<DealerProspect>("/dealer-os/prospects", {
      method: "POST",
      body: JSON.stringify({
        name: name.trim(),
        dealer_name: dealerName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        contact_id: initialValues?.contact_id ?? null,
      }),
      authToken: (await getToken()) ?? undefined,
    }),
    onSuccess: onCreated,
  });

  const canCreate = Boolean(name.trim() && dealerName.trim() && email.trim() && phone.trim());
  const duplicateDetail = create.error instanceof ApiError && create.error.status === 409
    ? (create.error.body as { detail?: { code?: string; candidates?: Array<{ prospect_id?: string }>; assignment_required?: boolean } } | null)?.detail
    : null;
  const duplicates = duplicateDetail?.code === "duplicate_prospect" ? duplicateDetail.candidates ?? [] : [];

  return <Modal title="Add dealer prospect" width={680} onClose={onClose}>
    <form className="prospectQuickAdd" onSubmit={(event) => { event.preventDefault(); if (canCreate) create.mutate(); }}>
      <p className="sub">Start with the four details collected during the call. Possible duplicates are checked before a record is created.</p>
      <div className="prospectFieldGrid">
        <label><span className="lbl">Contact name</span><input className="field" autoFocus autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label><span className="lbl">Dealer name</span><input className="field" autoComplete="organization" required value={dealerName} onChange={(event) => setDealerName(event.target.value)} /></label>
        <label><span className="lbl">Email</span><input className="field" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label><span className="lbl">Phone number</span><input className="field" type="tel" autoComplete="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
      </div>
      {duplicates.length > 0 && <div className="prospectDuplicateWarning" role="alert"><b>This dealer/contact already exists.</b><span>Open the existing prospect instead of creating a duplicate.</span>{duplicates.map((candidate) => candidate.prospect_id && <button type="button" className="btn" key={candidate.prospect_id} onClick={() => onOpenExisting(candidate.prospect_id!)}>Open existing prospect</button>)}</div>}
      {duplicateDetail?.assignment_required && <div className="note" role="alert">A matching prospect belongs to another agent. Ask a team administrator to assign it to you.</div>}
      {create.isError && !duplicateDetail && <div className="note" role="alert">{create.error instanceof Error ? create.error.message : "The prospect could not be created."}</div>}
      <div className="prospectDialogActions">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn pri" disabled={!canCreate || create.isPending}>{create.isPending ? "Checking…" : "Add prospect"}</button>
      </div>
    </form>
  </Modal>;
}
