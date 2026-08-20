"use client";

// Asking the client for something.
//
// Three things a rep asks for, all landing in the same room the owner already
// has a link to: send statements, send a document, sign something. The
// backend guarantees an email on every one of them and adds a text on top when
// the owner has opted in, so the choice here is "also text them", not "email
// or text". That is worth being explicit about on screen, because a rep who
// believes they picked SMS instead of email will not understand why the owner
// says they got an email.

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Result = {
  url: string;
  passcode: string | null;
  delivered: boolean;
  emailed: boolean;
  texted: boolean;
  detail: string | null;
};

type Kind = "bank" | "document" | "signature";

const KINDS: Array<{ key: Kind; label: string; blurb: string }> = [
  // Deliberately NOT "connect bank". Plaid is team-only today: there is no
  // unauthenticated link-token endpoint, so a client opening this room can
  // upload statements and nothing else. Calling it a bank connection would
  // promise the owner something the room cannot do.
  { key: "bank", label: "Send their room", blurb: "Emails them their secure upload room, where they can send statements." },
  { key: "document", label: "Request a document", blurb: "Adds it to their checklist and tells them it is there." },
  { key: "signature", label: "Request a signature", blurb: "Lands on the same checklist as their documents." },
];

export default function RequestPanel({
  dealerId,
  canText,
}: {
  dealerId: string;
  canText: boolean;
}) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [kind, setKind] = useState<Kind>("bank");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [alsoText, setAlsoText] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const send = useMutation({
    mutationFn: async () => {
      const token = (await getToken()) ?? undefined;
      const channel = alsoText && canText ? "sms" : "email";
      if (kind === "bank") {
        return api<Result>(`/dealer-os/dealers/${dealerId}/bank-connect-invite`, {
          method: "POST",
          body: JSON.stringify({ channel }),
          authToken: token,
        });
      }
      if (kind === "signature") {
        return api<Result>(`/dealer-os/dealers/${dealerId}/signature-request`, {
          method: "POST",
          body: JSON.stringify({ channel, title: title.trim(), note: note.trim() || null }),
          authToken: token,
        });
      }
      // A document request returns the request row, not a delivery result, so
      // report what we know rather than inventing fields the server did not send.
      await api(`/dealer-os/dealers/${dealerId}/doc-requests`, {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          kind: "other",
          note: note.trim() || null,
          notify: channel,
        }),
        authToken: token,
      });
      return {
        url: "",
        passcode: null,
        delivered: true,
        emailed: true,
        texted: channel === "sms",
        detail: null,
      } as Result;
    },
    onSuccess: (r) => {
      setResult(r);
      setTitle("");
      setNote("");
      void qc.invalidateQueries({ queryKey: ["dealer", dealerId] });
    },
  });

  const needsTitle = kind !== "bank";
  const canSend = (!needsTitle || title.trim().length > 0) && !send.isPending;

  return (
    <div className="panel">
      <div className="panel-h">Ask the client for something</div>
      <div className="panel-b">
        <div className="seg">
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              className={kind === k.key ? "on" : undefined}
              onClick={() => {
                setKind(k.key);
                setResult(null);
              }}
            >
              {k.label}
            </button>
          ))}
        </div>
        <span className="sub">{KINDS.find((k) => k.key === kind)?.blurb}</span>

        {needsTitle && (
          <>
            <label className="lbl mt">
              {kind === "signature" ? "What are they signing" : "What do you need"}
            </label>
            <input
              className="field"
              placeholder={
                kind === "signature"
                  ? "Funding application"
                  : "Last three months of bank statements"
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <label className="lbl mt">Anything to add</label>
            <textarea
              className="field"
              rows={2}
              placeholder="Optional. Shown to the client alongside the request."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </>
        )}

        <div className="composer-row mt">
          <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: canText ? "pointer" : "not-allowed" }}>
            <input
              type="checkbox"
              checked={alsoText && canText}
              disabled={!canText}
              onChange={(e) => setAlsoText(e.target.checked)}
            />
            <span className="sub">Text them as well</span>
          </label>
        </div>
        <span className="sub">
          {canText
            ? "The email goes either way. A text is a nudge toward it."
            : "This owner has not opted in to texts, so this goes by email."}
        </span>

        <button
          type="button"
          className="btn pri mt"
          style={{ width: "100%" }}
          disabled={!canSend}
          onClick={() => send.mutate()}
        >
          {send.isPending ? "Sending…" : "Send it"}
        </button>

        {send.isError && (
          <div className="note">
            {send.error instanceof Error ? send.error.message : "That did not send."}
          </div>
        )}

        {result && (
          <div className="note">
            <div>
              <b>
                {result.emailed && result.texted
                  ? "Emailed and texted."
                  : result.emailed
                    ? "Emailed."
                    : result.texted
                      ? "Texted."
                      : "Not sent."}
              </b>
              {result.detail && !result.emailed && <div className="sub">{result.detail}</div>}
              {result.passcode && (
                <div className="sub">
                  Their access code is <b>{result.passcode}</b>. Read it to them now, it is not
                  shown again.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
