"use client";

import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  CalendarDays,
  LoaderCircle,
  Mail,
  MessageSquareText,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { api } from "@/lib/api";

type SearchKind = "file" | "contact" | "email" | "sms" | "booking";

type GlobalSearchItem = {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle: string | null;
  context: string | null;
  href: string;
  dealer_id: string | null;
  occurred_at: string | null;
};

type GlobalSearchResponse = {
  query: string;
  items: GlobalSearchItem[];
};

const KIND_LABEL: Record<SearchKind, string> = {
  file: "Files",
  contact: "Contacts",
  email: "Email",
  sms: "SMS",
  booking: "Bookings",
};

const KIND_ORDER: SearchKind[] = ["file", "contact", "email", "sms", "booking"];

function ResultIcon({ kind }: { kind: SearchKind }) {
  if (kind === "file") return <BriefcaseBusiness size={17} />;
  if (kind === "contact") return <UserRound size={17} />;
  if (kind === "email") return <Mail size={17} />;
  if (kind === "sms") return <MessageSquareText size={17} />;
  return <CalendarDays size={17} />;
}

function resultTime(item: GlobalSearchItem): string | null {
  if (!item.occurred_at) return null;
  const date = new Date(item.occurred_at);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    ...(item.kind === "booking" ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

export default function GlobalSearch() {
  const { getToken } = useAuth();
  const router = useRouter();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const deferredValue = useDeferredValue(value.trim());

  const search = useQuery({
    queryKey: ["field-desk-global-search", deferredValue],
    queryFn: async () =>
      api<GlobalSearchResponse>(`/dealer-os/global-search?q=${encodeURIComponent(deferredValue)}&limit=24`, {
        authToken: (await getToken()) ?? undefined,
      }),
    enabled: open && deferredValue.length >= 2,
    staleTime: 15_000,
  });

  const groupedItems = useMemo(
    () => KIND_ORDER.flatMap((kind) => (search.data?.items ?? []).filter((item) => item.kind === kind)),
    [search.data?.items],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [deferredValue]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      const key = typeof event.key === "string" ? event.key.toLowerCase() : "";
      if ((event.ctrlKey || event.metaKey) && key === "k") {
        event.preventDefault();
        setOpen(true);
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  const openSearch = () => {
    setOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const choose = (item: GlobalSearchItem) => {
    setOpen(false);
    setValue("");
    inputRef.current?.blur();
    router.push(item.href);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!groupedItems.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % groupedItems.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + groupedItems.length) % groupedItems.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(groupedItems[activeIndex] ?? groupedItems[0]);
    }
  };

  let renderedIndex = -1;

  return (
    <div ref={rootRef} className={`globalSearch${open ? " isOpen" : ""}`}>
      <button type="button" className="globalSearchMobileButton" onClick={openSearch} aria-label="Search Field Desk">
        <Search size={19} />
      </button>
      <div className="globalSearchBox">
        {search.isFetching ? <LoaderCircle className="globalSearchSpinner" size={17} /> : <Search size={17} />}
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search names, emails, addresses, businesses..."
          aria-label="Search all Field Desk records"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={groupedItems[activeIndex] ? `${listboxId}-${groupedItems[activeIndex].kind}-${groupedItems[activeIndex].id}` : undefined}
          autoComplete="off"
        />
        {value ? (
          <button
            type="button"
            className="globalSearchClear"
            onClick={() => {
              setValue("");
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
          >
            <X size={15} />
          </button>
        ) : (
          <span className="globalSearchShortcut">Ctrl K</span>
        )}
      </div>

      {open && (
        <div id={listboxId} className="globalSearchResults" role="listbox" aria-label="Field Desk search results">
          {deferredValue.length < 2 && (
            <div className="globalSearchState">
              <Search size={18} />
              <span>Search files, contacts, email, SMS, and bookings.</span>
            </div>
          )}
          {deferredValue.length >= 2 && search.isLoading && (
            <div className="globalSearchState">
              <LoaderCircle className="globalSearchSpinner" size={18} />
              <span>Searching your Field Desk...</span>
            </div>
          )}
          {deferredValue.length >= 2 && search.isError && (
            <div className="globalSearchState error">
              <span>Search is temporarily unavailable. Try again.</span>
            </div>
          )}
          {deferredValue.length >= 2 && !search.isFetching && !search.isError && groupedItems.length === 0 && (
            <div className="globalSearchState">
              <span>No accessible records match “{deferredValue}”.</span>
            </div>
          )}
          {KIND_ORDER.map((kind) => {
            const rows = groupedItems.filter((item) => item.kind === kind);
            if (!rows.length) return null;
            return (
              <div className="globalSearchGroup" key={kind}>
                <div className="globalSearchGroupLabel">{KIND_LABEL[kind]}</div>
                {rows.map((item) => {
                  renderedIndex += 1;
                  const itemIndex = renderedIndex;
                  const when = resultTime(item);
                  return (
                    <button
                      key={`${item.kind}-${item.id}`}
                      id={`${listboxId}-${item.kind}-${item.id}`}
                      type="button"
                      role="option"
                      aria-selected={itemIndex === activeIndex}
                      className={`globalSearchResult${itemIndex === activeIndex ? " active" : ""}`}
                      onMouseEnter={() => setActiveIndex(itemIndex)}
                      onClick={() => choose(item)}
                    >
                      <span className={`globalSearchResultIcon kind-${item.kind}`}>
                        <ResultIcon kind={item.kind} />
                      </span>
                      <span className="globalSearchResultText">
                        <span className="globalSearchResultTitle">{item.title}</span>
                        {item.subtitle && <span>{item.subtitle}</span>}
                        {item.context && <small>{item.context}</small>}
                      </span>
                      <span className="globalSearchResultAside">
                        <small>{when}</small>
                        <b>{item.kind === "file" ? "Open file" : KIND_LABEL[item.kind].replace("s", "")}</b>
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
