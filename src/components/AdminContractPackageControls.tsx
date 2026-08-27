"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCog, RefreshCw, Settings2, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { ContractEnvelope } from "./ApplicationSigningPanel";

type DecisionProgram = { program_key?: string; key?: string; status?: string };
type Decision = { programs?: DecisionProgram[] };

const PROGRAMS = [
  { key: "term_loan_3_5_year", label: "EZ Term" },
  { key: "term_loan_10_year", label: "MicroCap" },
] as const;

export default function AdminContractPackageControls({
  dealerId,
  routeKey,
}: {
  dealerId: string;
  routeKey?: string | null;
}) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [programKey, setProgramKey] = useState(routeKey || PROGRAMS[0].key);
  const [overrideReason, setOverrideReason] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [showVoid, setShowVoid] = useState(false);
  const [message, setMessage] = useState("");

  const authenticated = async <T,>(path: string, init?: RequestInit) => api<T>(path, {
    ...init,
    authToken: (await getToken()) ?? undefined,
  });
  const envelopes = useQuery({
    queryKey: ["contract-envelopes", dealerId],
    queryFn: () => authenticated<ContractEnvelope[]>(
      `/dealer-os/dealers/${dealerId}/contract-envelopes`,
    ),
  });
  const decision = useQuery({
    queryKey: ["decision", dealerId],
    queryFn: () => authenticated<Decision>(`/dealer-os/dealers/${dealerId}/decision`),
  });
  const activeEnvelope = envelopes.data?.find((item) => item.status !== "void") ?? null;
  const decisionByKey = useMemo(
    () => new Map((decision.data?.programs ?? []).map((item) => [
      item.program_key || item.key || "",
      item,
    ])),
    [decision.data?.programs],
  );
  const selectedViable = ["recommended", "potential"].includes(
    decisionByKey.get(programKey)?.status ?? (routeKey === programKey ? "recommended" : "blocked"),
  );
  const immutable = Boolean(
    activeEnvelope && ["out_for_signature", "executed"].includes(activeEnvelope.status),
  );

  useEffect(() => {
    if (activeEnvelope) setProgramKey(activeEnvelope.program_key);
    else if (routeKey) setProgramKey(routeKey);
  }, [activeEnvelope?.id, activeEnvelope?.program_key, routeKey]);

  const refreshQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["contract-envelopes", dealerId] }),
      queryClient.invalidateQueries({ queryKey: ["application-profile", dealerId] }),
      queryClient.invalidateQueries({ queryKey: ["submission-readiness", dealerId] }),
      queryClient.invalidateQueries({ queryKey: ["decision", dealerId] }),
    ]);
  };
  const generate = useMutation({
    mutationFn: () => authenticated<ContractEnvelope>(
      `/dealer-os/dealers/${dealerId}/contract-envelopes/generate`,
      {
        method: "POST",
        body: JSON.stringify({
          program_key: programKey,
          override_reason: selectedViable ? null : overrideReason.trim(),
        }),
      },
    ),
    onSuccess: async (result) => {
      setMessage(`${result.title} was generated for Step 4. The rep can now review it with the client.`);
      setOverrideReason("");
      await refreshQueries();
    },
  });
  const voidEnvelope = useMutation({
    mutationFn: () => {
      if (!activeEnvelope) throw new Error("There is no active package to void.");
      return authenticated<ContractEnvelope>(
        `/dealer-os/dealers/${dealerId}/contract-envelopes/${activeEnvelope.id}/void`,
        {
          method: "POST",
          body: JSON.stringify({ reason: voidReason.trim() }),
        },
      );
    },
    onSuccess: async () => {
      setMessage("The package was voided. Its audit history remains available.");
      setVoidReason("");
      setShowVoid(false);
      await refreshQueries();
    },
  });

  const error = generate.error ?? voidEnvelope.error;
  const buttonLabel = activeEnvelope
    ? activeEnvelope.program_key === programKey ? "Refresh package" : "Switch package"
    : "Generate package";

  return (
    <div className="panel">
      <div className="panel-h">
        <ShieldCheck size={17} /> Program package administration
        <span className="sp" />
        <span className="cellchip c-acc">Super admin only</span>
      </div>
      <div className="panel-b">
        <p className="sub" style={{ marginTop: 0, lineHeight: 1.55 }}>
          Step 4 is the rep-and-client execution workspace. Use this Step 5 control only to
          document a blocked-route exception, replace an unsent package, or void an active
          package. The rep then returns to Step 4 to review and send the exact forms.
        </p>
        <div className="contractProgramBar">
          <label className="grow">
            <span className="lbl">Program package</span>
            <select
              className="field"
              value={programKey}
              disabled={immutable}
              onChange={(event) => {
                setProgramKey(event.target.value);
                setMessage("");
              }}
            >
              {PROGRAMS.map((program) => {
                const viable = ["recommended", "potential"].includes(
                  decisionByKey.get(program.key)?.status
                    ?? (routeKey === program.key ? "recommended" : "blocked"),
                );
                return <option key={program.key} value={program.key}>
                  {program.label}{viable ? " · viable" : " · blocked"}
                </option>;
              })}
            </select>
          </label>
          {!selectedViable && !immutable && (
            <label className="grow">
              <span className="lbl">Required override reason</span>
              <input
                className="field"
                value={overrideReason}
                onChange={(event) => setOverrideReason(event.target.value)}
                placeholder="Document why this blocked route should proceed"
              />
            </label>
          )}
          <button
            type="button"
            className="btn pri"
            disabled={immutable || generate.isPending || (!selectedViable && overrideReason.trim().length < 5)}
            onClick={() => generate.mutate()}
          >
            {activeEnvelope ? <RefreshCw size={16} /> : <FileCog size={16} />}
            {generate.isPending ? "Building package..." : buttonLabel}
          </button>
        </div>
        <div className="row mt" style={{ gap: 8, flexWrap: "wrap" }}>
          <a className="btn" href="/settings/forms"><Settings2 size={16} /> Configure Forms and Packages</a>
          {activeEnvelope && <span className={`cellchip ${activeEnvelope.status === "executed" ? "c-ok" : "c-warn"}`}>
            {activeEnvelope.title} · {activeEnvelope.status.replace(/_/g, " ")}
          </span>}
          <span className="sp" />
          {activeEnvelope && !["executed", "void"].includes(activeEnvelope.status) && (
            <button type="button" className="btn danger" onClick={() => setShowVoid((current) => !current)}>
              <Trash2 size={15} /> Void active package
            </button>
          )}
        </div>
        {activeEnvelope?.status === "out_for_signature" && (
          <div className="warnline mt">This package has already been sent. Void it before changing programs or regenerating documents.</div>
        )}
        {activeEnvelope?.status === "executed" && (
          <div className="note mt">Executed packages are immutable. A new package cannot replace the signed record.</div>
        )}
        {showVoid && activeEnvelope && !["executed", "void"].includes(activeEnvelope.status) && (
          <div className="contractVoidPanel mt">
            <div><b>Void this package</b><span>The signing link stops working; documents and audit history remain preserved.</span></div>
            <label className="grow"><span className="lbl">Required reason</span><input className="field" value={voidReason} onChange={(event) => setVoidReason(event.target.value)} placeholder="Why this package must be replaced" /></label>
            <button type="button" className="btn danger" disabled={voidReason.trim().length < 5 || voidEnvelope.isPending} onClick={() => voidEnvelope.mutate()}>{voidEnvelope.isPending ? "Voiding..." : "Confirm void"}</button>
          </div>
        )}
        {message && <div className="note mt" role="status">{message}</div>}
        {error && <div className="warnline mt">{error instanceof Error ? error.message : "The package action did not complete."}</div>}
      </div>
    </div>
  );
}
