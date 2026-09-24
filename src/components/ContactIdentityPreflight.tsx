"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  DealerProspect,
  ProspectDuplicateCheck,
  ProspectReassignmentReceipt,
  ProspectReassignmentRequest,
} from "@/lib/prospects";

type Options = {
  email: string;
  phone: string;
  enabled?: boolean;
  contactId?: string | null;
  reason: string;
};

export function useContactIdentityPreflight({ email, phone, enabled = true, contactId, reason }: Options) {
  const { getToken } = useAuth();
  const [identity, setIdentity] = useState({ email: email.trim(), phone: phone.trim() });
  const reassignmentKey = useRef("");

  useEffect(() => {
    const timer = window.setTimeout(() => setIdentity({ email: email.trim(), phone: phone.trim() }), 350);
    return () => window.clearTimeout(timer);
  }, [email, phone]);

  const hasIdentity = Boolean(email.trim() || phone.trim());
  const identityIsCurrent = identity.email === email.trim() && identity.phone === phone.trim();
  const query = useQuery({
    queryKey: ["prospect-duplicate-check", "shared-contact-preflight", identity.email.toLowerCase(), identity.phone, contactId ?? null],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (identity.email) params.set("email", identity.email);
      if (identity.phone) params.set("phone", identity.phone);
      if (contactId) params.set("contact_id", contactId);
      return api<ProspectDuplicateCheck>(`/dealer-os/prospects/duplicate-check?${params}`, {
        authToken: (await getToken()) ?? undefined,
      });
    },
    enabled: enabled && Boolean(identity.email || identity.phone),
    staleTime: 15_000,
  });

  const restore = useMutation({
    mutationFn: async ({ prospectId, version }: { prospectId: string; version: number }) => api<DealerProspect>(`/dealer-os/prospects/${prospectId}/restore`, {
      method: "POST",
      body: JSON.stringify({ expected_version: version }),
      authToken: (await getToken()) ?? undefined,
    }),
  });

  const restoreContact = useMutation({
    mutationFn: async (restoreContactId: string) => api<{ restored: boolean; contact_id: string }>(`/dealer-os/contacts/${restoreContactId}/restore`, {
      method: "POST",
      authToken: (await getToken()) ?? undefined,
    }),
  });

  const requestReassignment = useMutation({
    mutationFn: async () => {
      if (!reassignmentKey.current) reassignmentKey.current = crypto.randomUUID();
      const request: ProspectReassignmentRequest = {
        email: email.trim() || null,
        phone: phone.trim() || null,
        idempotency_key: reassignmentKey.current,
        reason,
      };
      return api<ProspectReassignmentReceipt>("/dealer-os/prospects/reassignment-requests", {
        method: "POST",
        body: JSON.stringify(request),
        authToken: (await getToken()) ?? undefined,
      });
    },
  });

  useEffect(() => {
    reassignmentKey.current = "";
    requestReassignment.reset();
    restore.reset();
    restoreContact.reset();
    // A changed identity is a new decision; mutation reset functions are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, phone]);

  const pending = enabled && hasIdentity && (!identityIsCurrent || query.isFetching);
  const blocked = enabled && identityIsCurrent && query.data?.blocked === true;
  return { query, restore, restoreContact, requestReassignment, identityIsCurrent, pending, blocked };
}

type State = ReturnType<typeof useContactIdentityPreflight>;

export function ContactIdentityPreflight({
  state,
  onOpenProspect,
  onOpenContact,
}: {
  state: State;
  onOpenProspect: (prospectId: string) => void;
  onOpenContact: (contactId: string) => void;
}) {
  const { query, restore, restoreContact, requestReassignment, identityIsCurrent } = state;
  if (query.isFetching && identityIsCurrent) {
    return <div className="prospectDuplicatePreflight" role="status">Checking email and phone for an existing contact…</div>;
  }
  if (query.isError && identityIsCurrent) {
    return <div className="note" role="status">Live duplicate preview is temporarily unavailable. The server will still perform its authoritative identity check.</div>;
  }
  if (!identityIsCurrent || !query.data?.blocked) return null;

  const result = query.data;
  return <div className="prospectDuplicateWarning" role="alert">
    <b>{result.state === "identity_conflict"
      ? "Email and phone belong to different contacts."
      : result.state === "archived_match"
        ? "An archived contact already uses these details."
        : result.state === "hidden_match"
          ? "This contact is assigned elsewhere."
          : "This contact already exists."}</b>
    <span>{result.message || "Open the existing record, or change the conflicting email or phone before continuing."}</span>
    {result.visible_matches.map((candidate) => {
      const key = `${candidate.prospect_id || candidate.contact_id}:${candidate.matched_on.join("-")}`;
      if (candidate.prospect_id && candidate.archived && candidate.version != null) {
        return candidate.can_restore
          ? <button type="button" className="btn" key={key} disabled={restore.isPending} onClick={() => restore.mutate({ prospectId: candidate.prospect_id!, version: candidate.version! }, { onSuccess: (prospect) => onOpenProspect(prospect.id) })}>{restore.isPending ? "Restoring…" : "Restore & open prospect"}</button>
          : <small key={key}>Ask the prospect owner or a team administrator to restore this record.</small>;
      }
      if (candidate.prospect_id) return <button type="button" className="btn" key={key} onClick={() => onOpenProspect(candidate.prospect_id!)}>Open active prospect</button>;
      if (candidate.contact_id && candidate.archived) {
        return candidate.can_restore
          ? <button type="button" className="btn" key={key} disabled={restoreContact.isPending} onClick={() => restoreContact.mutate(candidate.contact_id!, { onSuccess: () => onOpenContact(candidate.contact_id!) })}>{restoreContact.isPending ? "Restoring…" : "Restore & open contact"}</button>
          : <small key={key}>Ask the contact owner or a team administrator to restore this record.</small>;
      }
      if (candidate.contact_id) return <button type="button" className="btn" key={key} onClick={() => onOpenContact(candidate.contact_id!)}>Open existing contact</button>;
      return null;
    })}
    {restore.isError && <small>The archived prospect could not be restored. {restore.error instanceof Error ? restore.error.message : "Refresh and try again."}</small>}
    {restoreContact.isError && <small>The archived contact could not be restored. {restoreContact.error instanceof Error ? restoreContact.error.message : "Refresh and try again."}</small>}
    {result.assignment_required && !requestReassignment.isSuccess && <><small>A matching contact is assigned elsewhere. Private details remain hidden.</small><button type="button" className="btn" disabled={requestReassignment.isPending} onClick={() => requestReassignment.mutate()}>{requestReassignment.isPending ? "Sending request…" : "Request reassignment"}</button></>}
    {requestReassignment.isSuccess && <small role="status">Reassignment requested. A Super Admin can review it without creating a duplicate.</small>}
    {requestReassignment.isError && <small>The reassignment request could not be sent. {requestReassignment.error instanceof Error ? requestReassignment.error.message : "Try again."}</small>}
  </div>;
}
