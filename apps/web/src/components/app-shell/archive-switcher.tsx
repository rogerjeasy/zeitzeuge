"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, ChevronsUpDown } from "lucide-react";
import { Menu, MenuItem, MenuLabel } from "@/components/ui/menu";
import { ARCHIVES } from "@/lib/data/dashboard";
import { cn } from "@/lib/cn";

/**
 * Which archive you are working in.
 *
 * The data model is multi-tenant (`organizations ──< users`, RLS on every
 * tenant table), so the tenant is never implicit — it is named in the chrome,
 * on every screen. This is also where the archive/role step promised at sign-up
 * will land.
 */
export function ArchiveSwitcher({ className }: { className?: string }) {
  const t = useTranslations("app.header");
  const locale = useLocale();
  const [current, setCurrent] = useState(ARCHIVES[0].id);
  const active = ARCHIVES.find((a) => a.id === current) ?? ARCHIVES[0];
  const nf = new Intl.NumberFormat(locale === "de" ? "de-CH" : locale);

  return (
    <Menu
      align="start"
      label={t("archiveSwitch")}
      trigger={(props) => (
        <button
          type="button"
          data-menu-trigger
          onClick={props.toggle}
          aria-expanded={props["aria-expanded"]}
          aria-haspopup={props["aria-haspopup"]}
          aria-controls={props["aria-controls"]}
          className={cn(
            "flex h-9 max-w-[15rem] items-center gap-2 rounded-lg border border-line bg-surface transition-colors duration-150 hover:border-line-strong",
            "px-1.5 sm:px-2 sm:pr-1.5",
            className,
          )}
        >
          <span
            aria-hidden
            className="grid size-6 shrink-0 place-items-center rounded-[5px] bg-evidence-soft font-mono text-[0.5625rem] font-semibold text-evidence"
          >
            {active.short}
          </span>
          <span className="hidden min-w-0 flex-col items-start leading-none sm:flex">
            <span className="font-mono text-[0.5rem] uppercase tracking-[0.1em] text-muted-2">
              {t("archiveLabel")}
            </span>
            <span className="mt-0.5 max-w-[9.5rem] truncate text-[0.8125rem] font-medium text-foreground">
              {active.name}
            </span>
          </span>
          <ChevronsUpDown
            aria-hidden
            className="hidden size-3.5 shrink-0 text-muted-2 sm:block"
            strokeWidth={2}
          />
          {/* the accessible name never depends on what is painted */}
          <span className="sr-only sm:hidden">
            {t("archiveLabel")}: {active.name}
          </span>
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>{t("archiveSwitch")}</MenuLabel>
          {ARCHIVES.map((archive) => (
            <MenuItem
              key={archive.id}
              onClick={() => {
                setCurrent(archive.id);
                close();
              }}
              aria-current={archive.id === current ? "true" : undefined}
            >
              <span
                aria-hidden
                className="grid size-6 shrink-0 place-items-center rounded-[5px] bg-surface-2 font-mono text-[0.5625rem] font-semibold text-muted"
              >
                {archive.short}
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate">{archive.name}</span>
                <span className="font-mono text-[0.5625rem] text-muted-2">
                  {nf.format(archive.records)} {t("archiveRecords")}
                </span>
              </span>
              {archive.id === current && (
                <Check aria-hidden className="ml-auto size-3.5 text-evidence" strokeWidth={2.5} />
              )}
            </MenuItem>
          ))}
        </>
      )}
    </Menu>
  );
}
