"use client";

import { useLocale, useTranslations } from "next-intl";
import { Globe } from "lucide-react";
import { usePathname } from "@/i18n/navigation";
import { localeLabels, routing, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";

/**
 * Three locales fit on one line, so they are shown as segments rather than
 * hidden behind a dropdown — one tap instead of two, and the available
 * languages are visible without interaction.
 *
 * These are real links doing a real navigation, deliberately — not a
 * client-side transition. `<html>`/`<body>` live inside the `[locale]` segment,
 * so a soft navigation between locales remounts the entire document subtree:
 * React rebuilds the whole DOM and re-renders next-themes' inline theme script,
 * which it then cannot execute on the client ("Encountered a script tag while
 * rendering React component"). A document navigation does less work, lets that
 * blocking script actually run before paint, and gives crawlers a real href to
 * follow alongside the `alternates.languages` metadata.
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations("nav");
  const locale = useLocale() as Locale;
  // Locale-stripped path, e.g. "/" — the prefix is added back per link below.
  const pathname = usePathname();

  const hrefFor = (value: Locale) =>
    `/${value}${pathname === "/" ? "" : pathname}`;

  return (
    <div
      role="group"
      aria-label={t("language")}
      className={cn(
        "flex items-center gap-0.5 rounded-full border border-line bg-surface/60 p-0.5 backdrop-blur-sm",
        className,
      )}
    >
      <Globe
        aria-hidden
        className="ml-1.5 mr-0.5 size-3.5 shrink-0 text-muted-2"
        strokeWidth={1.9}
      />
      {routing.locales.map((value) => {
        const active = value === locale;
        const href = hrefFor(value);

        return (
          <a
            key={value}
            href={href}
            hrefLang={value}
            lang={value}
            title={localeLabels[value].long}
            aria-current={active ? "true" : undefined}
            // Carry the reader's position across the language change. The bare
            // href stays correct if this never runs.
            onClick={(event) => {
              if (active) {
                event.preventDefault();
                return;
              }
              if (window.location.hash) {
                event.preventDefault();
                window.location.href = href + window.location.hash;
              }
            }}
            className={cn(
              "flex h-7 items-center rounded-full px-2 font-mono text-[0.6875rem] font-medium tracking-[0.06em] transition-colors duration-200",
              active
                ? "bg-foreground text-background"
                : "text-muted hover:text-foreground",
            )}
          >
            {localeLabels[value].short}
            <span className="sr-only"> — {localeLabels[value].long}</span>
          </a>
        );
      })}
    </div>
  );
}
