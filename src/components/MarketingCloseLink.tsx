"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";

export function safeMarketingReturn(value: string | null): string {
  if (!value) return "/marketing";
  if (value !== "/marketing" && !value.startsWith("/marketing?")) return "/marketing";
  return value;
}

export default function MarketingCloseLink({ label = "Close and return to Marketing" }: { label?: string }) {
  const params = useSearchParams();
  const href = safeMarketingReturn(params.get("returnTo"));
  return <Link className="marketingPageClose" href={href} aria-label={label} title={label}><X size={21} /></Link>;
}

export function marketingDetailHref(path: string, returnTo: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(safeMarketingReturn(returnTo))}`;
}
