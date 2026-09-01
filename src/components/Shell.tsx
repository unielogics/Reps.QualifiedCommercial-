"use client";

// The rep shell. Same design language as audit.qualifiedcommercial.com — the
// globals.css here is that app's file, vendored — so a rep who crosses into a
// client's full cockpit does not feel a seam. Only the lockup line differs, so
// it is obvious which surface you are on.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignedIn, UserButton, useAuth, useUser } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMe } from "@/lib/useMe";
import ActionHub from "./ActionHub";
import GlobalSearch from "./GlobalSearch";
import MfaBanner from "./MfaBanner";
import ApplicationWorkspaceDock from "./ApplicationWorkspaceDock";
import SystemStatusMenu from "./SystemStatusMenu";
import { UploadStatusMenu } from "./UploadManager";

const AUDIT_URL = process.env.NEXT_PUBLIC_AUDIT_URL ?? "https://audit.qualifiedcommercial.com";
const FUNDING_URL = process.env.NEXT_PUBLIC_FUNDING_URL ?? "https://app.qualifiedcommercial.com";

type IconName = "home" | "plus" | "chart" | "chat" | "calendar" | "contacts" | "products" | "bell" | "settings";

// Same stroke-path idiom the audit app uses, so icons match weight for weight.
const ICON_PATHS: Record<IconName, string> = {
  home: "M3 11l9-8 9 8M5 10v9h5v-5h4v5h5v-9",
  plus: "M12 5v14M5 12h14",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  chat: "M21 12a8 8 0 01-8 8H4l2-3a8 8 0 1115-5z",
  calendar: "M8 3v4M16 3v4M4 9h16M6 5h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z",
  contacts: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  products: "M4 5h16v14H4zM8 9h8M8 13h5M4 7l8-4 8 4",
  bell: "M18 8a6 6 0 00-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  settings: "M12 15.5A3.5 3.5 0 1012 8a3.5 3.5 0 000 7.5zM19.4 15a1.7 1.7 0 00.34 1.88l.06.06-2.1 3.64-.09-.03a1.7 1.7 0 00-1.8.36 1.7 1.7 0 01-2.81-1.1 1.7 1.7 0 00-1.66-1.06h-.08a1.7 1.7 0 00-1.66 1.06 1.7 1.7 0 01-2.81 1.1 1.7 1.7 0 00-1.8-.36l-.09.03-2.1-3.64.06-.06A1.7 1.7 0 003.6 15a1.7 1.7 0 01-1.15-2.77 1.7 1.7 0 000-1.96A1.7 1.7 0 013.6 7.5a1.7 1.7 0 00-.34-1.88l-.06-.06 2.1-3.64.09.03a1.7 1.7 0 001.8-.36A1.7 1.7 0 0110 2.7a1.7 1.7 0 001.66 1.05h.08A1.7 1.7 0 0013.4 2.7a1.7 1.7 0 012.81-1.1 1.7 1.7 0 001.8.36l.09-.03 2.1 3.64-.06.06A1.7 1.7 0 0020.4 7.5a1.7 1.7 0 011.15 2.77 1.7 1.7 0 000 1.96A1.7 1.7 0 0120.4 15z",
};

type NotificationRow = {
  id: string;
  title: string;
  body: string;
  deep_link: string | null;
  read_at: string | null;
  created_at: string;
};

type NotificationList = { unread_count: number; items: NotificationRow[] };

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
    <Link href="/" className="brand" aria-label="Go to Portfolio home">
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
    </Link>
  );
}

function formatTopDate(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(value);
}

function formatTopTime(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

const REP_NAV: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/", label: "Portfolio", icon: "home" },
  { href: "/contacts", label: "Contacts", icon: "contacts" },
  { href: "/products", label: "Products", icon: "products" },
  { href: "/inbox", label: "Inbox", icon: "chat" },
  { href: "/calendar", label: "Calendar", icon: "calendar" },
  { href: "/production", label: "Production", icon: "chart" },
];
const DESKTOP_NAV = [...REP_NAV, { href: "/settings", label: "Settings", icon: "settings" as IconName }];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isProductFocus = pathname.startsWith("/products/");
  const [rail, setRail] = useState(true);
  const [now, setNow] = useState<Date | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [clearingNotifications, setClearingNotifications] = useState(false);
  const { name, email, isRep, isTeam, isSuperAdmin, isResolving } = useMe();
  const { getToken } = useAuth();
  const { user } = useUser();

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
    enabled: (isRep || isTeam) && !isProductFocus,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const unreadTotal = unread.data?.total ?? 0;
  const notifications = useQuery({
    queryKey: ["field-notifications"],
    queryFn: async () => api<NotificationList>("/notifications?status=unread&limit=50", {
      authToken: (await getToken()) ?? undefined,
    }),
    enabled: (isRep || isTeam) && !isProductFocus,
    refetchInterval: 30_000,
  });

  const openNotification = async (row: NotificationRow) => {
    await api(`/notifications/${row.id}/read`, {
      method: "POST",
      authToken: (await getToken()) ?? undefined,
    });
    setNotificationsOpen(false);
    await notifications.refetch();
    if (row.deep_link) window.location.assign(row.deep_link);
  };

  const clearNotifications = async () => {
    setClearingNotifications(true);
    try {
      await api("/notifications/read-all", {
        method: "POST",
        authToken: (await getToken()) ?? undefined,
      });
      await notifications.refetch();
    } finally {
      setClearingNotifications(false);
    }
  };

  useEffect(() => {
    try {
      if (window.localStorage.getItem("qc-nav") === "open") setRail(false);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!notificationsOpen) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && !target.closest(".notificationWrap")) {
        setNotificationsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotificationsOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [notificationsOpen]);

  useEffect(() => setNotificationsOpen(false), [pathname]);

  const toggleRail = () =>
    setRail((r) => {
      try {
        window.localStorage.setItem("qc-nav", r ? "open" : "rail");
      } catch {
        /* ignore */
      }
      return !r;
    });

  if (pathname.startsWith("/sign-in") || pathname.startsWith("/card/") || pathname.startsWith("/book/")) return <>{children}</>;

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

  if (isProductFocus) {
    return <main className="productFocusShell">{children}</main>;
  }

  const nav = DESKTOP_NAV;
  const isActiveNavItem = (href: string) =>
    href === "/"
      ? pathname === "/" || pathname.startsWith("/applications/")
      : pathname.startsWith(href);
  const activeSection = pathname.startsWith("/applications/")
    ? "Application workspace"
    : nav.find((item) => isActiveNavItem(item.href))?.label ?? "Field Desk";
  const notificationCount = notifications.data?.unread_count ?? 0;
  const profileInitials = (name || email || "QC")
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const notificationControl = (placement: "sidebar" | "mobile") => (
    <div className={`popwrap notificationWrap ${placement}`}>
      <button
        type="button"
        className={placement === "sidebar" ? "sidebarNotificationButton" : "btn sm mobileNotificationButton"}
        aria-label={`${notificationCount} unread notifications`}
        aria-expanded={notificationsOpen}
        onClick={() => {
          setNotificationsOpen((value) => !value);
          if (!notificationsOpen) void notifications.refetch();
        }}
      >
        <Icon name="bell" />
        {placement === "sidebar" && <span className="sidebarUtilityLabel">Notifications</span>}
        {notificationCount > 0 && <span className="navbadge">{notificationCount > 99 ? "99+" : notificationCount}</span>}
      </button>
      {notificationsOpen && (
        <div className={`popmenu notificationMenu ${placement === "sidebar" ? "sidebarNotificationMenu" : ""}`}>
          <div className="notificationMenuHead">
            <div><b>Notifications</b><small>Unread messages and file activity</small></div>
            <button
              type="button"
              onClick={() => void clearNotifications()}
              disabled={clearingNotifications || notificationCount === 0}
            >
              {clearingNotifications ? "Clearing..." : "Clear notifications"}
            </button>
          </div>
          {(notifications.data?.items ?? []).map((row) => (
            <button key={row.id} type="button" className="mi notificationItem" onClick={() => void openNotification(row)}>
              <b>{row.title}</b>
              <small>{row.body}</small>
            </button>
          ))}
          {!notifications.isLoading && (notifications.data?.items.length ?? 0) === 0 && (
            <div className="notificationEmpty">You are caught up.</div>
          )}
        </div>
      )}
    </div>
  );

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
          {nav.map((item) => {
            const on = isActiveNavItem(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={on ? "on" : undefined}
                aria-current={on ? "page" : undefined}
              >
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
        </nav>

        <div className="sideUtilities">
          {notificationControl("sidebar")}
        </div>

        <div className="foot">
          <SignedIn>
            <Link href="/settings" className="railProfileLink" aria-label="Open profile settings" title="Profile settings">
              {/* eslint-disable-next-line @next/next/no-img-element -- Clerk supplies the signed-in user's avatar URL. */}
              {user?.imageUrl ? <img src={user.imageUrl} alt="" /> : <span>{profileInitials || "QC"}</span>}
            </Link>
            <div className="expandedProfileControl">
              <UserButton afterSignOutUrl="/sign-in">
                <UserButton.MenuItems>
                  <UserButton.Link label="Field Desk settings" labelIcon={<Icon name="settings" />} href="/settings" />
                </UserButton.MenuItems>
              </UserButton>
              <div className="side-user">
                <b>{name || "Field rep"}</b>
                {email && <span>{email}</span>}
              </div>
              <Link href="/account/security" className="footlink" title="Account and security">
                Security
              </Link>
            </div>
          </SignedIn>
        </div>
      </aside>

      <div style={{ minWidth: 0 }}>
        <div className="top">
          <div className="workspaceContext">
            <span>{isTeam && !isRep ? "Field Desk · team view" : "Field Desk"}</span>
            <b>{activeSection}</b>
          </div>
          <div className="sp" />
          <GlobalSearch />
          {now && (
            <Link href="/calendar" className="topclock" aria-label="Open calendar">
              <span>{formatTopDate(now)}</span>
              <b className="num">{formatTopTime(now)}</b>
            </Link>
          )}
          {isTeam && (
            <div className="seg consoleSwitch" aria-label="Console switcher">
              <a href={FUNDING_URL}>Funding</a>
              <span className="on">Field Desk</span>
              <a href={AUDIT_URL}>Audit</a>
            </div>
          )}
          {isSuperAdmin && <SystemStatusMenu />}
          <UploadStatusMenu />
          {notificationControl("mobile")}
          <ActionHub />
        </div>
        <nav className="mobileTabs" aria-label="Field Desk sections">
          {REP_NAV.map((item) => {
            const on = isActiveNavItem(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={on ? "on" : undefined}
                aria-current={on ? "page" : undefined}
              >
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
        </nav>
        <div className="content content--wide">
          {/* Above the page, not inside it: the prompt has to be visible
              wherever you land, not only on one screen you might not open. */}
          <MfaBanner />
          {children}
        </div>
        <ApplicationWorkspaceDock />
      </div>
    </div>
  );
}
