"use client";

// Who is looking. This app is for field reps, but the team opens it too — an
// underwriter following a rep's file, or the super admin looking at production.
//
// The backend is the only thing that enforces any of this: a rep is confined to
// files where owner_user_id matches them, by resolve_dealer_scope and by the
// single list filter on GET /dealers. This hook only decides what to render.

import { useAuth, useUser } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type Me = { id: string; email: string; name: string; role: string };

export function useMe() {
  const { getToken, isSignedIn } = useAuth();
  const { isLoaded } = useUser();

  const q = useQuery({
    queryKey: ["me"],
    queryFn: async () => api<Me>("/auth/me", { authToken: (await getToken()) ?? undefined }),
    enabled: isSignedIn === true,
    staleTime: 60_000,
  });

  const role = q.data?.role;
  return {
    id: q.data?.id,
    name: q.data?.name,
    email: q.data?.email,
    role,
    isRep: role === "field_rep",
    isSuperAdmin: role === "super_admin",
    // Underwriters and super admins. They see every rep's files here, which is
    // the point of them being in this app at all.
    isTeam: role === "super_admin" || role === "loan_exec",
    // Deliberately not "not loading": role stays undefined until /auth/me
    // answers, and rendering a rep view to someone who turns out to have no
    // access is worse than a beat of skeleton.
    isResolving: !isLoaded || (isSignedIn === true && q.isLoading),
  };
}
