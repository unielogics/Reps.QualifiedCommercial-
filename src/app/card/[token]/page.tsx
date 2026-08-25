"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  CalendarDays,
  Download,
  FileText,
  Mail,
  Phone,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { api, apiBase } from "@/lib/api";
import type { ProgramPdfAttachment } from "@/lib/repWorkflows";

type Card = {
  recipient_name: string;
  company: string | null;
  rep_name: string;
  rep_email: string | null;
  rep_title: string | null;
  rep_phone: string | null;
  rep_bio: string | null;
  rep_locale: "en" | "es";
  headshot_url: string | null;
  subject: string;
  body: string;
  message?: string;
  booking_url: string;
  application_url: string;
  vcard_url?: string;
  program_pdfs: ProgramPdfAttachment[];
};

export default function ContactCardPage() {
  const { token } = useParams<{ token: string }>();
  const q = useQuery({
    queryKey: ["contact-card", token],
    queryFn: async () => api<Card>(`/dealer-os/contact-shares/card/${token}`),
  });
  const card = q.data;
  return (
    <main className="publicCardPage">
      <div className="publicBusinessCard">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
          <img src="/qc-icon.svg" alt="Qualified Commercial" className="mark" style={{ background: "none", objectFit: "contain" }} />
          <div>
            <b>Qualified Commercial</b>
            <span>{card?.company ?? "Funding programs"}</span>
          </div>
        </div>
        {q.isLoading && <p className="sub mt">Loading contact card...</p>}
        {q.isError && <p className="sub mt">This contact card could not be found.</p>}
        {card && (
          <>
            <div className="publicCardContext"><ShieldCheck size={15} /><span>Secure introduction shared with <b>{card.recipient_name}</b></span></div>
            <section className="publicCardIdentity">
              {card.headshot_url ? <img src={card.headshot_url} alt={card.rep_name} /> : <span>{card.rep_name.slice(0, 1)}</span>}
              <div><h1>{card.rep_name}</h1><p>{card.rep_title || "Commercial Funding Advisor"}</p></div>
            </section>
            {card.rep_bio && <p className="publicCardBio">{card.rep_bio}</p>}
            {(card.message || card.body) && <div className="publicCardNote"><span>Personal note</span><p>{card.message || card.body}</p></div>}
            <div className="publicCardPrimaryActions">
              <a className="btn pri" href={card.booking_url}><CalendarDays size={18} /> Book a time</a>
              <a className="btn" href={card.application_url}><BriefcaseBusiness size={18} /> Start an application</a>
              <a className="btn publicCardSave" href={card.vcard_url || `${apiBase}/dealer-os/contact-shares/card/${token}/vcard`} download><UserPlus size={18} /> Save to contacts</a>
            </div>
            <div className="publicCardContactActions">
              {card.rep_email && <a className="publicCardContactButton" href={`mailto:${card.rep_email}`}><Mail size={18} /><span><small>Email</small>{card.rep_email}</span></a>}
              {card.rep_phone && <a className="publicCardContactButton" href={`tel:${card.rep_phone}`}><Phone size={18} /><span><small>Call</small>{card.rep_phone}</span></a>}
            </div>
            {(card.program_pdfs ?? []).length > 0 && (
              <section className="publicCardPrograms">
                <header><div><span>Shared resources</span><h2>Funding program guides</h2></div><FileText size={22} /></header>
                <div>
                  {(card.program_pdfs ?? []).map((pdf) => (
                    <a key={pdf.key} className="publicCardProgramButton" href={pdf.download_url} target="_blank" rel="noreferrer">
                      <span><FileText size={18} />{pdf.title}</span><Download size={17} />
                    </a>
                  ))}
                </div>
              </section>
            )}
            <footer className="publicCardFooter"><img src="/qc-icon.svg" alt="" /><span>Qualified Commercial LLC</span><small>Commercial funding guidance and secure client intake</small></footer>
          </>
        )}
      </div>
    </main>
  );
}
