"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Layers } from "lucide-react";
import type { FondsStats } from "@/lib/data/collections";

/**
 * Detected series (§5.2 #8).
 *
 * These clusters were not typed by anyone: they are nearest neighbours in the
 * embedding of the whole fonds. That is the difference worth showing — a folder
 * structure records what an archivist already knew, a cluster proposes
 * something nobody had noticed, and one identified series resolves the twelve
 * photographs taken the same afternoon.
 */
export function SeriesPanel({ stats }: { stats: FondsStats }) {
  const t = useTranslations("collections.detail");
  const tSeries = useTranslations("collections.series");

  return (
    <section
      aria-labelledby="series-heading"
      className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="series-heading"
          className="flex items-center gap-2 font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground-strong"
        >
          <Layers aria-hidden className="size-4 text-muted-2" strokeWidth={1.9} />
          {t("seriesTitle")}
        </h2>
        <p className="text-[0.75rem] leading-snug text-muted">{t("seriesHint")}</p>
      </div>

      <ul className="flex flex-col divide-y divide-line">
        {stats.series.map((series) => (
          <li key={series.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
            <span className="flex shrink-0 -space-x-3">
              {series.thumbs.map((src) => (
                <span
                  key={src}
                  className="relative size-11 overflow-hidden rounded-md border border-line ring-2 ring-surface"
                >
                  <Image
                    src={src}
                    alt=""
                    fill
                    sizes="44px"
                    className="photo-archival object-cover"
                  />
                </span>
              ))}
            </span>

            <div className="flex min-w-0 flex-1 basis-40 flex-col gap-1">
              <p className="text-[0.875rem] leading-snug text-foreground-strong">
                {tSeries(series.key)}
              </p>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[0.625rem] tabular-nums text-muted-2">
                <span>{series.from}{series.to !== series.from && `–${series.to}`}</span>
                <span aria-hidden>·</span>
                <span className="font-sans text-[0.6875rem] text-muted">
                  {t("seriesCount", { count: series.count })}
                </span>
              </p>
            </div>

            <span
              className="flex shrink-0 items-center gap-2"
              title={`${t("seriesCohesion")} ${series.cohesion.toFixed(2)}`}
            >
              <span aria-hidden className="flex h-1.5 w-16 overflow-hidden rounded-full bg-evidence-soft">
                <span
                  className="h-full rounded-full bg-evidence"
                  style={{ width: `${series.cohesion * 100}%` }}
                />
              </span>
              <span className="font-mono text-[0.6875rem] tabular-nums text-evidence">
                {series.cohesion.toFixed(2)}
              </span>
              <span className="sr-only">
                {t("seriesCohesion")} {series.cohesion.toFixed(2)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
