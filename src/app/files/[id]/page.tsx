"use client";

// The file cockpit moved to /applications/[id] when the workflow replaced it.
// Kept as a redirect rather than deleted: links to a case live in a rep's
// browser history, in emails to the desk, and in anything already shared.

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function LegacyFileRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/applications/${id}`);
  }, [router, id]);
  return null;
}
