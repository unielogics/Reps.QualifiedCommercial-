"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Detail = {
  id: string; name: string; company: string | null; email: string | null; phone: string | null;
  applications: Array<{ id: string; name: string; case_ref: string; lifecycle: string; status: string; funding_goal: number; updated_at: string }>;
  sessions: Array<{ id: string; status: string; result: { verification?: string; recommended_amount?: number } | null; updated_at: string }>;
  presentations: Array<{ id: string; program_keys: string[]; locale: string; channel: string; status: string; created_at: string }>;
  threads: Array<{ id: string; subject: string; channel: string; unread_count: number; updated_at: string }>;
};

function money(value: number | undefined) { return value ? `$${Math.round(value).toLocaleString()}` : "—"; }

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const detail = useQuery({ queryKey: ["crm-contact", id], queryFn: async () => api<Detail>(`/dealer-os/contacts/${id}`, { authToken: (await getToken()) ?? undefined }) });
  const row = detail.data;
  if (detail.isLoading) return <div className="empty">Loading contact…</div>;
  if (!row) return <div className="empty">Contact unavailable.</div>;
  return <div className="contactDetail">
    <header className="contactHero"><Link href="/contacts" className="backLink">← Contacts</Link><div className="contactIdentity"><div className="contactAvatar large">{row.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</div><div><span className="eyebrow">CRM contact</span><h2>{row.name}</h2><p>{row.company || "Independent contact"}</p></div></div><div className="contactQuick"><a className="btn" href={row.email ? `mailto:${row.email}` : undefined} aria-disabled={!row.email}>Email</a><a className="btn pri" href={row.phone ? `tel:${row.phone}` : undefined} aria-disabled={!row.phone}>Call</a></div></header>
    <div className="contactColumns mt"><main>
      <section className="panel contactSection"><div className="panelTitle"><h3>Funding files</h3><span>{row.applications.length}</span></div>{row.applications.map((application) => <Link className="timelineRow" href={`/applications/${application.id}`} key={application.id}><div><b>{application.name}</b><span>{application.case_ref} · {application.lifecycle}</span></div><strong>{money(application.funding_goal)}</strong></Link>)}{!row.applications.length && <div className="empty compact">No funding files yet.</div>}</section>
      <section className="panel contactSection mt"><div className="panelTitle"><h3>Product Finder</h3><span>{row.sessions.length}</span></div>{row.sessions.map((session) => <div className="timelineRow" key={session.id}><div><b>{session.status}</b><span>{new Date(session.updated_at).toLocaleString()} · {session.result?.verification || "Not screened"}</span></div><strong>{money(session.result?.recommended_amount)}</strong></div>)}{!row.sessions.length && <div className="empty compact">No screening history.</div>}</section>
    </main><aside>
      <section className="panel contactSection"><div className="panelTitle"><h3>Conversation history</h3><span>{row.threads.length}</span></div>{row.threads.map((thread) => <Link className="timelineRow" href={`/inbox?thread=${thread.id}`} key={thread.id}><div><b>{thread.subject}</b><span>{thread.channel} · {new Date(thread.updated_at).toLocaleDateString()}</span></div>{thread.unread_count > 0 && <span className="cellchip c-acc">{thread.unread_count}</span>}</Link>)}{!row.threads.length && <div className="empty compact">No open conversations.</div>}</section>
      <section className="panel contactSection mt"><div className="panelTitle"><h3>Products presented</h3><span>{row.presentations.length}</span></div>{row.presentations.map((item) => <div className="presentationRow" key={item.id}><b>{item.program_keys.join(", ").replaceAll("_", " ")}</b><span>{item.channel} · {item.status} · {item.locale.toUpperCase()}</span></div>)}{!row.presentations.length && <div className="empty compact">No products presented yet.</div>}</section>
    </aside></div>
  </div>;
}
