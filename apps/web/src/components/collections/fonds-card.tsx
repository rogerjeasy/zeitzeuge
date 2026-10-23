"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, ScanLine } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { STATS, type Fonds } from "@/lib/data/collections";
import { cn } from "@/lib/cn";

/**
 * One fonds, at the level an archivist recognises it: reference code, creator,
 * period, extent — then how far we have got through it.
 *
 * The coverage meter is the only number here that is ours rather than theirs,
 * so it is the only one that gets colour.
 */
export function FondsCard({ fonds, eager }: { fonds: Fonds; eager?: boolean }) {
  const t = useTranslations("collections");
  const locale = useLocale();
  const intl = locale === "de" ? "de-CH" : locale;
  const number = (value: number) => new Intl.NumberFormat(intl).format(value);

  const stats = STATS[fonds.id];
  const period = `${fonds.findingAid.circa ? `${t("circa")} ` : ""}${fonds.findingAid.from}–${fonds.findingAid.to}`;

  if (!fonds.digitised) {
    return (
      <li className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface-2/30 p-4 sm:p-5">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted-2">
            {fonds.reference}
          </span>
          <h2 className="font-display text-[1.0625rem] font-semibold tracking-[-0.01em] text-muted">
            {fonds.name}
          </h2>
        </div>
        <p className="text-[0.8125rem] leading-relaxed text-muted-2">
          {t(`fonds.${fonds.scopeKey}`)}
        </p>
        <p className="mt-auto flex items-center gap-2 pt-1 text-[0.75rem] text-muted-2">
          <ScanLine aria-hidden className="size-3.5 shrink-0" strokeWidth={1.9} />
          <span className="font-mono text-[0.625rem] uppercase tracking-[0.08em]">
            {t("card.notDigitised")}
          </span>
        </p>
        <p className="text-[0.75rem] leading-snug text-muted-2">{t("card.notDigitisedHint")}</p>
      </li>
    );
  }

  const coverage = stats.described / fonds.extent;

  return (
    <li>
      <Link
        href={`/collections/${fonds.id}`}
        className="group flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface transition-[border-color,box-shadow] duration-200 hover:border-evidence/50 hover:shadow-plate"
      >
        {/* three plates from the fonds, not a hero image */}
        <div className="flex h-24 gap-px bg-line sm:h-28">
          {fonds.cover.map((src, i) => (
            <figure key={src} className={cn("relative min-w-0 flex-1", i > 0 && "hidden sm:block")}>
              <Image
                src={src}
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, 20vw"
                // the first plate of the first fonds is the page's LCP image
                priority={eager && i === 0}
                className="photo-archival object-cover"
              />
            </figure>
          ))}
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted-2">
              {fonds.reference}
            </span>
            <h2 className="font-display text-[1.0625rem] font-semibold tracking-[-0.01em] text-foreground-strong">
              {fonds.name}
            </h2>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[0.6875rem] tabular-nums text-muted">
              {period}
              <span aria-hidden className="text-line-strong">·</span>
              <span className="font-sans text-[0.75rem]">
                {t(`extent.${fonds.extentUnit}`, { count: fonds.extent, formatted: number(fonds.extent) })}
              </span>
            </p>
          </div>

          {fonds.creator && (
            <p className="text-[0.75rem] text-muted">
              {fonds.creator}
              {fonds.creatorDates && <span className="text-muted-2"> · {fonds.creatorDates}</span>}
            </p>
          )}

          <p className="text-[0.8125rem] leading-relaxed text-muted">
            {t(`fonds.${fonds.scopeKey}`)}
          </p>

          <div className="mt-auto flex flex-col gap-2 pt-1">
            {/* described (filled) against the rest of the fonds (lighter step) */}
            <span aria-hidden className="flex h-1.5 overflow-hidden rounded-full bg-evidence-soft">
              <span
                className="h-full rounded-full bg-evidence transition-[width] duration-500"
                style={{ width: `${coverage * 100}%` }}
              />
            </span>

            <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[0.75rem]">
              <span className="text-muted">
                <span className="font-medium tabular-nums text-foreground-strong">
                  {number(stats.described)}
                </span>{" "}
                {t("coverage", { percent: Math.round(coverage * 100) })}
              </span>
              <span className="inline-flex items-center gap-1 text-muted-2 transition-colors group-hover:text-evidence">
                {t("card.open")}
                <ArrowRight aria-hidden className="size-3.5" strokeWidth={2} />
              </span>
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}
