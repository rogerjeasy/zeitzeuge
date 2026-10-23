import { useLocale, useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { PROFILE } from "@/lib/data/profile";

export function ProfileHeader() {
  const t = useTranslations("profile");
  const tRoles = useTranslations("settings.archive.roles");
  const locale = useLocale();

  const since = new Intl.DateTimeFormat(locale === "de" ? "de-CH" : locale, {
    month: "long",
    year: "numeric",
  }).format(new Date(PROFILE.memberSince));

  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-center gap-4">
        <span
          aria-hidden
          className="grid size-14 shrink-0 place-items-center rounded-full bg-evidence-soft font-mono text-[1.0625rem] font-semibold text-evidence sm:size-16"
        >
          {PROFILE.initials}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-[clamp(1.375rem,1.15rem+1vw,1.875rem)] font-semibold leading-tight tracking-[-0.03em] text-foreground-strong">
            {PROFILE.name}
          </h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.8125rem] text-muted">
            <span>{tRoles(PROFILE.role)}</span>
            <span aria-hidden className="text-line-strong">·</span>
            <span>{PROFILE.archive}</span>
          </p>
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted-2">
            {t("since", { date: since })}
          </p>
        </div>
      </div>

      <Link
        href="/settings"
        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5 text-[0.8125rem] font-medium text-foreground transition-colors hover:border-evidence hover:text-evidence"
      >
        <Pencil aria-hidden className="size-3.5" strokeWidth={2} />
        {t("editCta")}
      </Link>
    </header>
  );
}
