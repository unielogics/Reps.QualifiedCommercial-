"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const GENERAL_PROGRAM_KEY = "general_funding_discussion";
export const GENERAL_PROGRAM_NAME = "General funding discussion / Not decided yet";

type CatalogItem = { program_key: string; name: string };
type CatalogResponse = { items: CatalogItem[] };

export type ProgramSelection = { key: string; name: string };

export default function ProgramSelect({
  programKey,
  programName,
  onChange,
  id,
  className = "field",
}: {
  programKey: string | null | undefined;
  programName: string | null | undefined;
  onChange: (selection: ProgramSelection) => void;
  id?: string;
  className?: string;
}) {
  const { getToken } = useAuth();
  const catalog = useQuery({
    queryKey: ["appointment-program-catalog"],
    queryFn: async () => api<CatalogResponse>("/dealer-os/products?locale=en", {
      authToken: (await getToken()) ?? undefined,
    }),
    staleTime: 5 * 60_000,
  });
  const items = catalog.data?.items ?? [];
  const selectedKey = programKey || GENERAL_PROGRAM_KEY;
  const historical = Boolean(
    programKey
      && programKey !== GENERAL_PROGRAM_KEY
      && !items.some((item) => item.program_key === programKey),
  );

  return (
    <select
      id={id}
      className={className}
      value={selectedKey}
      disabled={catalog.isLoading}
      onChange={(event) => {
        const key = event.target.value;
        if (key === GENERAL_PROGRAM_KEY) {
          onChange({ key, name: GENERAL_PROGRAM_NAME });
          return;
        }
        const item = items.find((candidate) => candidate.program_key === key);
        if (item) onChange({ key: item.program_key, name: item.name });
      }}
    >
      <option value={GENERAL_PROGRAM_KEY}>{GENERAL_PROGRAM_NAME}</option>
      {historical && programKey ? (
        <option value={programKey}>{programName || programKey.replaceAll("_", " ")} (historical)</option>
      ) : null}
      {items.map((item) => (
        <option key={item.program_key} value={item.program_key}>{item.name}</option>
      ))}
    </select>
  );
}
