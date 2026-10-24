"use client";

import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useSessionUser } from "@/components/auth/session-provider";

/** The signed-in person as the API knows them — name, role, archive. */
export function ProfileHeader() {
  const t = useTranslations("profile");
  const tRoles = useTranslations("settings.archive.roles");
  const user = useSessionUser();
  const role = tRoles.has(user.role) ? tRoles(user.role) : user.role;

  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        <span
          aria-hidden
          className="grid size-14 shrink-0 place-items-center rounded-full bg-evidence-soft font-mono text-[1.0625rem] font-semibold text-evidence sm:size-16"
        >
          {user.initials}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="truncate font-display text-[clamp(1.375rem,1.15rem+1vw,1.875rem)] font-semibold leading-tight tracking-[-0.03em] text-foreground-strong">
            {user.displayName}
          </h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.8125rem] text-muted">
            <span>{role}</span>
            <span aria-hidden className="text-line-strong">·</span>
            <span className="min-w-0 [overflow-wrap:anywhere]">{user.organizationName}</span>
          </p>
          <p className="truncate font-mono text-[0.6875rem] text-muted">{user.email}</p>
        </div>
      </div>

      <Link
        href="/settings"
        className="inline-flex h-9 shrink-0 items-center gap-2 self-start rounded-lg border border-line-strong bg-surface px-3.5 text-[0.8125rem] font-medium text-foreground transition-colors hover:border-evidence hover:text-evidence"
      >
        <Pencil aria-hidden className="size-3.5" strokeWidth={2} />
        {t("editCta")}
      </Link>
    </header>
  );
}
