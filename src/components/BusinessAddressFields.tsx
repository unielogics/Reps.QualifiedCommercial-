"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@/lib/api";

const STATES = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" ");

type Parts = { address: string; city: string; state: string; zip: string };
type Suggestion = { place_id: string; text: string; secondary_text?: string | null };
type ResolveResult = {
  address: { street?: string | null; city?: string | null; state?: string | null; zip?: string | null };
};

function sessionToken() {
  return `qc-rep-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function BusinessAddressFields({
  value,
  onChange,
  onBlur,
}: {
  value: Parts;
  onChange: (next: Parts) => void;
  onBlur?: (field: keyof Parts) => void;
}) {
  const { getToken } = useAuth();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [token, setToken] = useState(sessionToken);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const rows = await api<Suggestion[]>("/property-intelligence/address/autocomplete", {
          method: "POST",
          body: JSON.stringify({ input: query.trim(), session_token: token }),
          authToken: (await getToken()) ?? undefined,
        });
        setSuggestions(rows);
      } catch {
        setSuggestions([]);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [getToken, open, query, token]);

  const choose = async (suggestion: Suggestion) => {
    setResolving(true);
    try {
      const resolved = await api<ResolveResult>("/property-intelligence/address/resolve", {
        method: "POST",
        body: JSON.stringify({ place_id: suggestion.place_id, session_token: token }),
        authToken: (await getToken()) ?? undefined,
      });
      onChange({
        address: resolved.address.street ?? "",
        city: resolved.address.city ?? "",
        state: resolved.address.state ?? "",
        zip: resolved.address.zip ?? "",
      });
      setQuery(suggestion.text);
      setSuggestions([]);
      setOpen(false);
      setToken(sessionToken());
    } finally {
      setResolving(false);
    }
  };

  const update = (key: keyof Parts, next: string) => onChange({ ...value, [key]: next });

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ position: "relative" }}>
        <label className="lbl">Search Google address (optional)</label>
        <input
          className="field"
          value={query}
          placeholder="Start typing a business address"
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 160)}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        />
        {resolving && <span className="sub" style={{ position: "absolute", right: 12, top: 34 }}>Resolving…</span>}
        {open && suggestions.length > 0 && (
          <div className="popmenu addressSuggestions">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.place_id}
                className="mi"
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void choose(suggestion)}
              >
                <b>{suggestion.text}</b>
                {suggestion.secondary_text && <small>{suggestion.secondary_text}</small>}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="addressGrid">
        <div>
          <label className="lbl">Street</label>
          <input className="field" value={value.address} onChange={(e) => update("address", e.target.value)} onBlur={() => onBlur?.("address")} />
        </div>
        <div>
          <label className="lbl">City</label>
          <input className="field" value={value.city} onChange={(e) => update("city", e.target.value)} onBlur={() => onBlur?.("city")} />
        </div>
        <div>
          <label className="lbl">State</label>
          <select className="field" value={value.state} onChange={(e) => update("state", e.target.value)} onBlur={() => onBlur?.("state")}>
            <option value="">—</option>
            {STATES.map((state) => <option key={state} value={state}>{state}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl">ZIP</label>
          <input className="field" inputMode="numeric" value={value.zip} onChange={(e) => update("zip", e.target.value)} onBlur={() => onBlur?.("zip")} />
        </div>
      </div>
      <span className="sub">Address is optional. Select a Google result or enter it manually.</span>
    </div>
  );
}
