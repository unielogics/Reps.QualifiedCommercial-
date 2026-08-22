"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ProgramPdfAttachment } from "@/lib/repWorkflows";

type Card = {
  recipient_name: string;
  company: string | null;
  rep_name: string;
  rep_email: string | null;
  subject: string;
  body: string;
  booking_url: string;
  application_url: string;
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
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, background: "var(--sunken)" }}>
      <div className="card hi" style={{ width: "min(680px, 100%)" }}>
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
            <h1 style={{ fontFamily: "var(--fh)", fontSize: 28, margin: "22px 0 8px" }}>{card.rep_name}</h1>
            <p className="lede" style={{ whiteSpace: "pre-line" }}>{card.body}</p>
            <div className="row mt" style={{ gap: 10, flexWrap: "wrap" }}>
              <a className="btn pri" href={card.booking_url}>Book a time</a>
              <a className="btn" href={card.application_url}>Open application</a>
              {card.rep_email && <a className="btn" href={`mailto:${card.rep_email}`}>Email</a>}
            </div>
            {(card.program_pdfs ?? []).length > 0 && (
              <div className="panel mt">
                <div className="panel-h">Program PDFs</div>
                <div className="panel-b" style={{ display: "grid", gap: 8 }}>
                  {(card.program_pdfs ?? []).map((pdf) => (
                    <a key={pdf.key} className="linky" href={pdf.download_url} target="_blank" rel="noreferrer">
                      {pdf.title}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
