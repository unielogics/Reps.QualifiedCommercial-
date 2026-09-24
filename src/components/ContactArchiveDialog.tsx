"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation } from "@tanstack/react-query";
import { Archive, CircleAlert } from "lucide-react";
import { api } from "@/lib/api";
import Modal from "./Modal";

type ArchiveResult = {
  archived: boolean;
  contact_id: string;
  archived_prospect_ids: string[];
};

export default function ContactArchiveDialog({
  contact,
  onClose,
  onArchived,
}: {
  contact: { id: string; name: string };
  onClose: () => void;
  onArchived: (result: ArchiveResult) => void;
}) {
  const { getToken } = useAuth();
  const archive = useMutation({
    mutationFn: async () => api<ArchiveResult>(`/dealer-os/contacts/${contact.id}`, {
      method: "DELETE",
      authToken: (await getToken()) ?? undefined,
    }),
    onSuccess: onArchived,
  });

  return <Modal title={`Delete ${contact.name}?`} width={560} onClose={onClose}>
    <div className="contactArchiveDialog">
      <div className="contactArchiveWarning"><CircleAlert size={22} /><span><b>This removes the contact from active Marketing work.</b><small>If this contact has an active pipeline prospect, that prospect is archived and its follow-up clock is cleared at the same time.</small></span></div>
      <p>Funding files, appointments, sent emails, conversations, and audit history are retained. An authorized user can restore the contact later.</p>
      {archive.isError && <div className="note" role="alert">{archive.error instanceof Error ? archive.error.message : "The contact could not be deleted."}</div>}
      <div className="prospectDialogActions"><button type="button" className="btn" disabled={archive.isPending} onClick={onClose}>Cancel</button><button type="button" className="btn danger" disabled={archive.isPending} onClick={() => archive.mutate()}><Archive size={16} /> {archive.isPending ? "Deleting…" : "Delete contact"}</button></div>
    </div>
  </Modal>;
}
