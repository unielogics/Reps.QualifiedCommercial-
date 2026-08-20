"use client";

// The rep shell. Same design language as audit.qualifiedcommercial.com — the
// globals.css here is that app's file, vendored — so a rep who crosses into a
// client's full cockpit does not feel a seam. Only the lockup line differs, so
// it is obvious which surface you are on.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignedIn, UserButton, useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMe } from "@/lib/useMe";
import MfaBanner from "./MfaBanner";

const AUDIT_URL = process.env.NEXT_PUBLIC_AUDIT_URL ?? "https://audit.qualifiedcommercial.com";

type IconName = "home" | "plus" | "chart" | "chat";

// Same stroke-path idiom the audit app uses, so icons match weight for weight.
const ICON_PATHS: Record<IconName, string> = {
  home: "M3 11l9-8 9 8M5 10v9h5v-5h4v5h5v-9",
  plus: "M12 5v14M5 12h14",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  chat: "M21 12a8 8 0 01-8 8H4l2-3a8 8 0 1115-5z",
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

function Brand() {
  return (
    <div className="brand">
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
      <img
        src="/qc-icon.svg"
        alt="Qualified Commercial"
        className="mark"
        style={{ background: "none", objectFit: "contain" }}
      />
      <div>
        <b>Field Desk</b>
        <span>Qualified Commercial</span>
      </div>
    </div>
  );
}

const REP_NAV: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/", label: "Portfolio", icon: "home" },
  { href: "/new", label: "Open application", icon: "plus" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [rail, setRail] = useState(true);
  const { name, isRep, isTeam, isSuperAdmin, isResolving } = useMe();
  const { getToken } = useAuth();

  // One grouped query for every file, not the per-file endpoint in a loop: a
  // rep with forty files would otherwise fire forty requests to draw one
  // number. Polled rather than pushed, because a badge that is a minute stale
  // is fine and a websocket for this is not worth the operational weight.
  const unread = useQuery({
    queryKey: ["unread-summary"],
    queryFn: async () =>
      api<{ total: number; per_file: Record<string, number> }>("/dealer-os/unread-summary", {
        authToken: (await getToken()) ?? undefined,
      }),
    enabled: isRep || isTeam,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const unreadTotal = unread.data?.total ?? 0;

  useEffect(() => {
    try {
      if (window.localStorage.getItem("qc-nav") === "open") setRail(false);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleRail = () =>
    setRail((r) => {
      try {
        window.localStorage.setItem("qc-nav", r ? "open" : "rail");
      } catch {
        /* ignore */
      }
      return !r;
    });

  if (pathname.startsWith("/sign-in")) return <>{children}</>;

  // Role still resolving: never guess. Showing the rep console to someone who
  // turns out to have no access is worse than a moment of empty chrome.
  if (isResolving) {
    return (
      <div className={rail ? "app rail" : "app"}>
        <aside className="side">
          <Brand />
        </aside>
        <div style={{ minWidth: 0 }}>
          <div className="top" />
          <div className="content" />
        </div>
      </div>
    );
  }

  // A funding-system login, or a client. Same shape as the audit app's notice
  // so the two products fail identically rather than in two different voices.
  if (!isRep && !isTeam) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <div className="card hi" style={{ width: "min(460px, 100%)" }}>
          <Brand />
          <h2 style={{ fontSize: 18, marginTop: 4 }}>This login doesn&apos;t have field access</h2>
          <p className="sub mt">
            The Field Desk is for Qualified Commercial reps. If you are a client looking for
            your own file, that lives on Capital OS.
          </p>
          <div className="row mt" style={{ alignItems: "center", gap: 10 }}>
            <a className="btn pri" href={AUDIT_URL}>
              Go to Capital OS →
            </a>
            <SignedIn>
              <UserButton afterSignOutUrl="/sign-in" />
            </SignedIn>
          </div>
        </div>
      </div>
    );
  }

  const nav = [
    ...REP_NAV,
    // Production is the super admin's view of what the reps are bringing in.
    ...(isSuperAdmin ? [{ href: "/production", label: "Production", icon: "chart" as IconName }] : []),
  ];

  return (
    <div className={rail ? "app rail" : "app"}>
      <aside className="side">
        <Brand />
        <button
          type="button"
          className="navtoggle"
          title={rail ? "Expand menu" : "Collapse menu"}
          aria-label={rail ? "Expand menu" : "Collapse menu"}
          onClick={toggleRail}
        >
          {rail ? "»" : "«"}
        </button>

        <nav className="nav">
          <div className="grp">
            {nav.map((item) => {
              const on =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href} className={on ? "on" : undefined}>
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                  {item.href === "/" && unreadTotal > 0 && (
                    <span
                      className="navbadge"
                      title={`${unreadTotal} unread message${unreadTotal === 1 ? "" : "s"}`}
                    >
                      {unreadTotal > 99 ? "99+" : unreadTotal}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="foot">
          <SignedIn>
            <UserButton afterSignOutUrl="/sign-in" />
            <Link href="/account/security" className="footlink" title="Account and security">
              Security
            </Link>
          </SignedIn>
        </div>
      </aside>

      <div style={{ minWidth: 0 }}>
        <div className="top">
          <b>{isTeam && !isRep ? "Field Desk · team view" : "Field Desk"}</b>
          <div className="sp" />
          {name && <span className="chip">{name}</span>}
        </div>
        <div className={pathname.startsWith("/applications/") ? "content content--wide" : "content"}>
          {/* Above the page, not inside it: the prompt has to be visible
              wherever you land, not only on one screen you might not open. */}
          <MfaBanner />
          {children}
        </div>
      </div>
    </div>
  );
}
