"use client";

// The console switcher in the top bar. Same markup and classes in every app
// (.seg.consoleSwitch in globals.css) so it reads identically wherever you
// are. The list comes from /auth/me — the backend decides which consoles this
// login opens — so there are no environment host literals here. One Clerk
// session spans every host, which is why the others are plain anchors.

export type ConsoleEntry = { key: "funding" | "field_desk" | "audit"; label: string; url: string };

export default function ConsoleSwitcher({ consoles, current }: { consoles: ConsoleEntry[]; current: ConsoleEntry["key"] }) {
  if (consoles.length < 2) return null;
  return (
    <div className="seg consoleSwitch" aria-label="Console switcher">
      {consoles.map((c) =>
        c.key === current ? (
          <span key={c.key} className="on">{c.label}</span>
        ) : (
          <a key={c.key} href={c.url} title={"Open " + c.label + " under the same account"}>{c.label}</a>
        ),
      )}
    </div>
  );
}
