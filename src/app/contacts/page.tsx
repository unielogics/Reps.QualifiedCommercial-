"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Contact = { id: string; name: string; company: string | null; email: string | null; phone: string | null; source: string; updated_at: string };
type Page = { items: Contact[]; total: number; limit: number; offset: number };

export default function ContactsPage() {
  const { getToken } = useAuth();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => { const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(0); }, 250); return () => clearTimeout(timer); }, [search]);
  const contacts = useQuery({ queryKey: ["crm-contacts", query, page], queryFn: async () => api<Page>(`/dealer-os/contacts?q=${encodeURIComponent(query)}&limit=20&offset=${page * 20}`, { authToken: (await getToken()) ?? undefined }) });
  const total = contacts.data?.total ?? 0;
  return <div className="contactsPage">
    <header className="hd"><div><span className="eyebrow">Relationship workspace</span><h2>Contacts</h2><p className="lede">Companies, people, conversations, product presentations, and funding files in one history.</p></div><Link href="/products" className="btn pri">Start Product Finder</Link></header>
    <div className="contactSearch mt"><input className="field" type="search" placeholder="Search person, company, email, or phone" value={search} onChange={(event) => setSearch(event.target.value)} /><span className="sub">{total} contact{total === 1 ? "" : "s"}</span></div>
    <div className="contactGrid mt">{contacts.data?.items.map((contact) => <Link href={`/contacts/${contact.id}`} className="contactCard" key={contact.id}><div className="contactAvatar">{contact.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div><div><h3>{contact.name}</h3><b>{contact.company || "Independent contact"}</b><p>{contact.email || contact.phone || "No delivery details"}</p></div><span className="contactArrow">→</span></Link>)}
      {!contacts.isLoading && !contacts.data?.items.length && <div className="empty">No contacts match this search. Start Product Finder to create the first prospect.</div>}
    </div>
    <div className="paginationRow mt"><button className="btn sm" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous</button><span className="sub">Page {page + 1}</span><button className="btn sm" disabled={(page + 1) * 20 >= total} onClick={() => setPage((value) => value + 1)}>Next</button></div>
  </div>;
}
