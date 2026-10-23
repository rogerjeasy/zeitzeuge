"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  UserCog, Palette, Bell, Layers, FileOutput, ShieldCheck, KeyRound, Building2,
} from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { SETTINGS_SECTIONS } from "@/lib/data/settings";
import { cn } from "@/lib/cn";

const ICON = {
  account: UserCog, appearance: Palette, notifications: Bell, cataloguing: Layers,
  export: FileOutput, security: ShieldCheck, api: KeyRound, archive: Building2,
} as const;

/**
 * The section column. Becomes a horizontal scroller below `lg` rather than a
 * dropdown: the sections are few enough to scan, and a picker would hide where
 * the reader currently is.
 */
export function SettingsNav() {
  const t = useTranslations("settings");
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);

  // On a phone the nav scrolls sideways; land with the current section in view
  // rather than leaving the reader to hunt for where they are.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  return (
    <div className="relative">
      {/* scroll affordance, only while the nav is a horizontal strip */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent lg:hidden"
      />
      <nav
        aria-label={t("navLabel")}
        className={cn(
          "scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6",
          "lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0",
        )}
      >
      {SETTINGS_SECTIONS.map((section) => {
        const Icon = ICON[section.icon];
        const active = pathname === section.href;

        return (
          <Link
            key={section.id}
            ref={active ? activeRef : undefined}
            href={section.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-[0.8125rem] font-medium transition-colors duration-150",
              "lg:shrink lg:justify-start",
              active
                ? "bg-surface-2 text-foreground-strong"
                : "text-muted hover:bg-surface-2/70 hover:text-foreground",
            )}
          >
            <Icon
              aria-hidden
              className={cn("size-4 shrink-0", active ? "text-evidence" : "text-muted-2")}
              strokeWidth={1.9}
            />
            <span className="whitespace-nowrap">{t(`nav.${section.id}`)}</span>
          </Link>
          );
        })}
      </nav>
    </div>
  );
}
