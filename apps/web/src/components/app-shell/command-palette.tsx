"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Search, CornerDownLeft } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { ALL_NAV } from "@/lib/data/nav";
import { NAV_ICON } from "./nav-icons";
import { cn } from "@/lib/cn";

interface Entry {
  key: string;
  label: string;
  meta?: string;
  href: string;
  group: "screens";
  icon?: React.ReactNode;
}

/**
 * ⌘K search over the things this shell can actually reach: every screen in the
 * nav. It navigates for real — a search box that looks
 * live and does nothing is worse than no search box.
 */
export function CommandPalette() {
  const t = useTranslations("app.header");
  const tNav = useTranslations("app.nav");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  const entries = useMemo<Entry[]>(() => {
    const screens: Entry[] = ALL_NAV.map((item) => {
      const Icon = NAV_ICON[item.icon];
      return {
        key: `nav-${item.id}`,
        label: tNav(item.id),
        href: item.href,
        group: "screens",
        icon: <Icon aria-hidden className="size-4 text-muted-2" strokeWidth={1.9} />,
      };
    });
    return screens;
  }, [tNav]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.label.toLowerCase().includes(q) ||
        (e.meta ?? "").toLowerCase().includes(q),
    );
  }, [entries, query]);

  // ⌘K / Ctrl-K from anywhere
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((wasOpen) => {
          if (wasOpen) {
            setQuery("");
            setCursor(0);
            return false;
          }
          restoreFocus.current = document.activeElement as HTMLElement;
          return true;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  function openPalette() {
    restoreFocus.current = document.activeElement as HTMLElement;
    setOpen(true);
  }

  function closePalette() {
    setOpen(false);
    setQuery("");
    setCursor(0);
    restoreFocus.current?.focus?.();
  }

  function go(entry: Entry) {
    closePalette();
    router.push(entry.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") return closePalette();
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    }
    if (event.key === "Enter" && results[cursor]) {
      event.preventDefault();
      go(results[cursor]);
    }
  }

  const groups: { id: Entry["group"]; label: string }[] = [
    { id: "screens", label: t("searchScreens") },
  ];

  return (
    <>
      <button
        type="button"
        onClick={openPalette}
        className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-muted transition-colors duration-150 hover:border-line-strong hover:text-foreground sm:w-[13rem] lg:w-[15rem] xl:w-[19rem]"
      >
        <Search aria-hidden className="size-4 shrink-0" strokeWidth={1.9} />
        <span className="hidden text-[0.8125rem] sm:inline">{t("searchPlaceholder")}</span>
        <kbd className="ml-auto hidden rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[0.625rem] text-muted-2 sm:inline">
          ⌘K
        </kbd>
        <span className="sr-only">{t("searchOpen")}</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-foreground-strong/25 p-4 pt-[12vh] backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) closePalette();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("searchPlaceholder")}
            onKeyDown={onKeyDown}
            className="flex w-full max-w-[34rem] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-lift [animation:rise-in_160ms_var(--ease-archival)_both]"
          >
            <div className="flex items-center gap-2.5 border-b border-line px-3.5">
              <Search aria-hidden className="size-4 shrink-0 text-muted-2" strokeWidth={1.9} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCursor(0);
                }}
                placeholder={t("searchHint")}
                aria-label={t("searchHint")}
                className="h-12 flex-1 bg-transparent text-[0.9375rem] text-foreground outline-none placeholder:text-muted-2"
              />
              <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[0.625rem] text-muted-2">
                Esc
              </kbd>
            </div>

            <div className="max-h-[22rem] overflow-y-auto p-1.5">
              {results.length === 0 && (
                <p className="px-3 py-6 text-center text-[0.8125rem] text-muted">
                  {t("searchEmpty")}
                </p>
              )}

              {groups.map((group) => {
                const inGroup = results.filter((r) => r.group === group.id);
                if (inGroup.length === 0) return null;
                return (
                  <div key={group.id} className="mb-1">
                    <p className="px-2.5 pb-1 pt-2 font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-muted-2">
                      {group.label}
                    </p>
                    {inGroup.map((entry) => {
                      const index = results.indexOf(entry);
                      const active = index === cursor;
                      return (
                        <button
                          key={entry.key}
                          type="button"
                          onMouseEnter={() => setCursor(index)}
                          onClick={() => go(entry)}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[0.8125rem] transition-colors duration-100",
                            active ? "bg-surface-2 text-foreground-strong" : "text-muted",
                          )}
                        >
                          {entry.icon ?? (
                            <span
                              aria-hidden
                              className="size-1.5 shrink-0 rounded-full bg-muted-2"
                            />
                          )}
                          <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                          {entry.meta && (
                            <span className="shrink-0 font-mono text-[0.625rem] text-muted-2">
                              {entry.meta}
                            </span>
                          )}
                          {active && (
                            <CornerDownLeft
                              aria-hidden
                              className="size-3.5 shrink-0 text-muted-2"
                              strokeWidth={2}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
