"use client";

import { useLocale, useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import { ARCHIVE, FONDS, archiveTotals } from "@/lib/data/collections";
import { FondsCard } from "./fonds-card";

const STAT_IDS = ["holdings", "described", "approved", "unknown"] as const;

/**
 * The tectonic (§9.2 #8) — the archive's photographic fonds as its own finding
 * aid orders them, with our coverage laid over the top.
 *
 * An archivist arrives here knowing the fonds and not knowing us, so the fonds
 * leads on every card and the coverage number follows it.
 */
export function CollectionsScreen() {
  const t = useTranslations("collections");
  const locale = useLocale();
  const intl = locale === "de" ? "de-CH" : locale;

  const totals = archiveTotals();
  const values = {
    holdings: totals.holdings,
    described: totals.described,
    approved: totals.approved,
    unknown: totals.placeUnknown,
  };

  return (
    <div className="mx-auto flex w-full max-w-[82rem] flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[clamp(1.5rem,1.25rem+1vw,2rem)] font-semibold leading-tight tracking-[-0.03em] text-foreground-strong">
          {t("title")}
        </h1>
        <p className="max-w-[76ch] text-[0.875rem] leading-relaxed text-muted">
          {t("subtitle", { archive: ARCHIVE.name })}
        </p>
        <p className="flex items-center gap-1.5 font-mono text-[0.6875rem] text-muted-2">
          <ExternalLink aria-hidden className="size-3" strokeWidth={2} />
          {t("catalogue")}: {ARCHIVE.catalogue}
        </p>
      </header>

      <dl className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
        {STAT_IDS.map((id) => (
          <div key={id} className="flex flex-col gap-1.5 bg-background p-4 sm:p-5">
            <dt className="text-[0.75rem] font-medium text-muted">{t(`stats.${id}`)}</dt>
            <dd className="flex flex-col gap-1">
              <span className="font-display text-[1.625rem] font-semibold leading-none tracking-[-0.025em] text-foreground-strong">
                {new Intl.NumberFormat(intl).format(values[id])}
              </span>
              <span className="text-[0.6875rem] leading-snug text-muted-2">
                {t(`stats.${id}Hint`)}
              </span>
            </dd>
          </div>
        ))}
      </dl>

      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {FONDS.map((fonds, i) => (
          <FondsCard key={fonds.id} fonds={fonds} eager={i < 3} />
        ))}
      </ul>
    </div>
  );
}
