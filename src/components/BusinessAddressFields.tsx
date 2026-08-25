"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { ApiError, api } from "@/lib/api";

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
  onResolved,
  manualFallback = "always",
  searchLabel = "Search business address (optional)",
  searchPlaceholder = "Start typing a business address",
  helperText = "Address is optional. Select a verified result or enter it manually.",
}: {
  value: Parts;
  onChange: (next: Parts) => void;
  onBlur?: (field: keyof Parts) => void;
  onResolved?: (next: Parts) => void;
  manualFallback?: "always" | "when-needed";
  searchLabel?: string;
  searchPlaceholder?: string;
  helperText?: string;
}) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [token, setToken] = useState(sessionToken);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [manualVisible, setManualVisible] = useState(manualFallback === "always");
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (query || !Object.values(value).some(Boolean)) return;
    setQuery([
      value.address,
      [value.city, value.state, value.zip].filter(Boolean).join(" "),
    ].filter(Boolean).join(", "));
  }, [query, value]);

  useEffect(() => {
    if (!open || query.trim().length < 2 || !isLoaded || !isSignedIn) {
      setSuggestions([]);
      setSearchMessage(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchMessage(null);
      try {
        const request = async (fresh = false) => api<Suggestion[]>("/property-intelligence/address/autocomplete", {
            method: "POST",
            body: JSON.stringify({ input: query.trim(), session_token: token }),
            authToken: (await getToken(fresh ? { skipCache: true } : undefined)) ?? undefined,
          });
        let rows: Suggestion[];
        try {
          rows = await request();
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 401) throw error;
          rows = await request(true);
        }
        setSuggestions(rows);
        if (!rows.length) {
          setSearchMessage("No address matches found. Complete the address manually below.");
          if (manualFallback === "when-needed") setManualVisible(true);
        }
      } catch (error) {
        setSuggestions([]);
        setSearchMessage(error instanceof ApiError && error.status === 401
          ? "Your session expired. Refresh before using address search."
          : "Address search is temporarily unavailable. Manual entry still works.");
        if (manualFallback === "when-needed") setManualVisible(true);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [getToken, isLoaded, isSignedIn, open, query, token]);

  const choose = async (suggestion: Suggestion) => {
    setResolving(true);
    setSearchMessage(null);
    try {
      const request = async (fresh = false) => api<ResolveResult>("/property-intelligence/address/resolve", {
          method: "POST",
          body: JSON.stringify({ place_id: suggestion.place_id, address: suggestion.text, session_token: token }),
          authToken: (await getToken(fresh ? { skipCache: true } : undefined)) ?? undefined,
        });
      let resolved: ResolveResult;
      try {
        resolved = await request();
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        resolved = await request(true);
      }
      const next = {
        address: resolved.address.street ?? "",
        city: resolved.address.city ?? "",
        state: resolved.address.state ?? "",
        zip: resolved.address.zip ?? "",
      };
      onChange(next);
      onResolved?.(next);
      setVerified(true);
      setQuery(suggestion.text);
      setSuggestions([]);
      setOpen(false);
      setManualVisible(false);
      setToken(sessionToken());
    } catch (error) {
      setOpen(true);
      setSearchMessage(error instanceof ApiError && error.status === 401
        ? "Your session expired. Refresh before selecting an address."
        : "That address could not be resolved. Choose another result or enter it manually.");
      if (manualFallback === "when-needed") setManualVisible(true);
    } finally {
      setResolving(false);
    }
  };

  const update = (key: keyof Parts, next: string) => {
    setVerified(false);
    onChange({ ...value, [key]: next });
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ position: "relative" }}>
        <label className="lbl">{searchLabel}</label>
        <input
          className="field"
          value={query}
          placeholder={searchPlaceholder}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 160)}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        />
        {(resolving || searching) && <span className="sub" style={{ position: "absolute", right: 12, top: 34 }}>{resolving ? "Resolving…" : "Searching…"}</span>}
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
        {open && searchMessage && query.trim().length >= 2 && (
          <div className="addressSearchMessage">{searchMessage}</div>
        )}
      </div>
      {manualFallback === "when-needed" && !manualVisible ? (
        <button type="button" className="btn" style={{ justifySelf: "start" }} onClick={() => setManualVisible(true)}>
          Enter address manually
        </button>
      ) : null}
      {manualVisible ? <div className="addressGrid">
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
      </div> : null}
      <span className="sub">{verified ? "Verified address" : "Manual · Unverified"} · {helperText}</span>
    </div>
  );
}
