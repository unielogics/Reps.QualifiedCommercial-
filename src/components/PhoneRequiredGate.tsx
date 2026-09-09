"use client";

// The one-time mobile number, rendered by Shell instead of the app for a rep
// (or a team member) whose user row has no phone. It is the number the desk
// reaches them on and the one printed as the relationship manager's phone on
// production agreements. Saving goes through the same PUT the Settings page
// uses, which writes the user row as well as the business card, and the
// /auth/me refetch lifts the gate.

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function PhoneRequiredGate({ brand }: { brand: React.ReactNode }) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  const save = useMutation<unknown, Error, string>({
    mutationFn: async (next) => api("/dealer-os/me/profile", { method: "PUT", authToken: (await getToken()) ?? undefined, body: JSON.stringify({ phone: next }) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await queryClient.invalidateQueries({ queryKey: ["field-desk-profile"] });
    },
    onError: (e) => setError(e.message || "The number could not be saved."),
  });

  const submit = () => {
    if (phone.replace(/\D/g, "").length < 10) { setError("Enter a mobile number with at least ten digits."); return; }
    setError("");
    save.mutate(phone.trim());
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card hi" style={{ width: "min(460px, 100%)" }}>
        {brand}
        <h2 style={{ fontSize: 18, marginTop: 4 }}>Your mobile number</h2>
        <p className="sub mt">
          Once. It is how the desk reaches you, and it prints as the relationship manager&apos;s phone on
          production agreements you are named on. You can change it later under Settings.
        </p>
        <label className="mt" style={{ display: "grid", gap: 6 }}>
          <span>Mobile number</span>
          <input className="field" inputMode="tel" autoComplete="tel" placeholder="(973) 555-0148" value={phone} autoFocus
            onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        </label>
        {error ? <p className="sub mt" role="alert" style={{ color: "var(--danger, #b42318)" }}>{error}</p> : null}
        <div className="row mt" style={{ justifyContent: "flex-end" }}>
          <button className="btn pri" type="button" disabled={save.isPending} onClick={submit}>
            {save.isPending ? "Saving…" : "Save and continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
