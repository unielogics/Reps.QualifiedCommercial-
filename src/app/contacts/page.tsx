"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Contact = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  updated_at: string;
};
type Page = { items: Contact[]; total: number; limit: number; offset: number };

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?";
}

function sourceLabel(source: string) {
  return source.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function ContactsPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const contacts = useQuery({
    queryKey: ["crm-contacts", query, page],
    queryFn: async () => api<Page>(
      `/dealer-os/contacts?q=${encodeURIComponent(query)}&limit=10&offset=${page * 10}`,
      { authToken: (await getToken()) ?? undefined },
    ),
  });
  const rows = contacts.data?.items ?? [];
  const total = contacts.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 10));

  return <div className="contactsPage">
    <header className="hd portfolioHeading">
      <div>
        <span className="eyebrow">Relationship workspace</span>
        <h2>Contacts</h2>
        <p className="lede">Companies, people, conversations, product presentations, and funding files in one history.</p>
      </div>
      <Link href="/products" className="btn pri">Start Product Finder</Link>
    </header>

    <div className="contactPortfolioControls mt">
      <input
        className="field contactSearchField"
        type="search"
        placeholder="Search person, company, email, or phone"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <span className="sub contactCount">{total} contact{total === 1 ? "" : "s"}</span>
    </div>

    <div className="panel mt">
      <div className="tblwrap">
        <table className="tbl portfolioTable contactTable">
          <thead>
            <tr><th>Contact</th><th>Company</th><th>Email</th><th>Mobile</th><th>Source</th><th>Updated</th></tr>
          </thead>
          <tbody>
            {rows.map((contact) => <tr
              key={contact.id}
              role="link"
              tabIndex={0}
              aria-label={`Open ${contact.name}`}
              onClick={() => router.push(`/contacts/${contact.id}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  router.push(`/contacts/${contact.id}`);
                }
              }}
            >
              <td>
                <span className="contactTableIdentity">
                  <span className="contactAvatar compact">{initials(contact.name)}</span>
                  <b>{contact.name}</b>
                </span>
              </td>
              <td>{contact.company || <span className="sub">Independent contact</span>}</td>
              <td className="sub">{contact.email || "-"}</td>
              <td className="sub num">{contact.phone || "-"}</td>
              <td><span className="cellchip c-mut">{sourceLabel(contact.source)}</span></td>
              <td className="sub num">{new Date(contact.updated_at).toLocaleDateString()}</td>
            </tr>)}
            {contacts.isLoading && <tr><td colSpan={6}><div className="empty">Loading contacts...</div></td></tr>}
            {!contacts.isLoading && rows.length === 0 && <tr><td colSpan={6}><div className="empty">No contacts match this search. Start Product Finder to create the first prospect.</div></td></tr>}
          </tbody>
        </table>
      </div>
      <div className="paginationRow">
        <span className="sub">{total ? `${page * 10 + 1}-${Math.min((page + 1) * 10, total)} of ${total}` : "0 contacts"}</span>
        <div className="row">
          <button type="button" className="btn sm" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button>
          <span className="sub num">{page + 1} / {pageCount}</span>
          <button type="button" className="btn sm" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</button>
        </div>
      </div>
    </div>
  </div>;
}
