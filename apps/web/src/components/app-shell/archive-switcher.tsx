"use client";

import { useTranslations } from "next-intl";
import { useSessionUser } from "@/components/auth/session-provider";
import { cn } from "@/lib/cn";

/** Two letters for the badge: the initials of the archive's first two words. */
function shortName(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

/**
 * Which archive you are working in.
 *
 * The data model is multi-tenant, so the tenant is never implicit — it is
 * named in the chrome, on every screen. An account belongs to one archive, so
 * this names it; there is nothing to switch to.
 */
export function ArchiveSwitcher({ className }: { className?: string }) {
  const t = useTranslations("app.header");
  const user = useSessionUser();
  const name = user.organizationName;

  return (
    <div
      className={cn(
        "flex h-9 min-w-0 max-w-[15rem] items-center gap-2 rounded-lg border border-line bg-surface px-1.5 sm:px-2",
        className,
      )}
    >
      <span
        aria-hidden
        className="grid size-6 shrink-0 place-items-center rounded-[5px] bg-evidence-soft font-mono text-[0.5625rem] font-semibold text-evidence"
      >
        {shortName(name)}
      </span>
      <span className="hidden min-w-0 flex-col items-start leading-none sm:flex">
        <span className="font-mono text-[0.5rem] uppercase tracking-[0.1em] text-muted-2">
          {t("archiveLabel")}
        </span>
        <span className="mt-0.5 max-w-[11rem] truncate text-[0.8125rem] font-medium text-foreground">
          {name}
        </span>
      </span>
      <span className="sr-only sm:hidden">
        {t("archiveLabel")}: {name}
      </span>
    </div>
  );
}
