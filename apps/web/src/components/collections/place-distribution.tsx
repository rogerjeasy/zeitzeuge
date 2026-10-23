"use client";

import { useLocale, useTranslations } from "next-intl";
import { Info, MapPin, MinusCircle } from "lucide-react";
import type { FondsStats } from "@/lib/data/collections";

/**
 * Where the fonds was made, counted by commune.
 *
 * §9.2 asks for a map here and this is deliberately not one. We hold a resolved
 * coordinate for the photographs the terrain falsifier converged on and nothing
 * for the rest, so a plotted map would be mostly placed by guesswork — and a
 * guessed pin on a Swiss map is a claim a Schwyzer reader can check and catch.
 * Counted by Gemeinde, every number here is one the gazetteer can defend. The
 * swisstopo basemap replaces this the day the tile layer exists.
 */
export function PlaceDistribution({ stats }: { stats: FondsStats }) {
  const t = useTranslations("collections.detail");
  const locale = useLocale();
  const intl = locale === "de" ? "de-CH" : locale;
  const number = (value: number) => new Intl.NumberFormat(intl).format(value);

  const located = stats.places.reduce((n, place) => n + place.count, 0);
  const peak = Math.max(...stats.places.map((p) => p.count), 1);

  return (
    <section
      aria-labelledby="places-heading"
      className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="places-heading"
          className="flex items-center gap-2 font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground-strong"
        >
          <MapPin aria-hidden className="size-4 text-muted-2" strokeWidth={1.9} />
          {t("placesTitle")}
        </h2>
        <p className="text-[0.75rem] leading-snug text-muted">{t("placesHint")}</p>
        <p className="font-mono text-[0.6875rem] tabular-nums text-muted-2">
          {number(located)} / {number(located + stats.placeUnknown)}
        </p>
      </div>

      <ul className="flex flex-col gap-1.5">
        {stats.places.map((place) => (
          <li key={place.name} className="grid grid-cols-[minmax(5.5rem,auto)_minmax(0,1fr)_2.75rem] items-center gap-2.5">
            <span className="truncate text-[0.8125rem] text-foreground">{place.name}</span>
            <span aria-hidden className="h-2 overflow-hidden rounded-[3px] bg-evidence-soft">
              <span
                className="block h-full rounded-[3px] bg-evidence transition-[width] duration-500"
                style={{ width: `${(place.count / peak) * 100}%` }}
              />
            </span>
            <span className="text-right font-mono text-[0.6875rem] tabular-nums text-muted">
              {number(place.count)}
            </span>
          </li>
        ))}

        {/* The residue, given the same weight as an answer (§5.3). */}
        <li className="mt-1 grid grid-cols-[minmax(5.5rem,auto)_minmax(0,1fr)_2.75rem] items-center gap-2.5 border-t border-line pt-2.5">
          <span className="flex min-w-0 items-center gap-1.5 truncate text-[0.8125rem] text-abstain">
            <MinusCircle aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
            {t("placesUnknown")}
          </span>
          <span aria-hidden className="h-2 overflow-hidden rounded-[3px] bg-abstain-soft">
            <span
              className="block h-full rounded-[3px] bg-abstain transition-[width] duration-500"
              style={{ width: `${(stats.placeUnknown / peak) * 100}%` }}
            />
          </span>
          <span className="text-right font-mono text-[0.6875rem] tabular-nums text-abstain">
            {number(stats.placeUnknown)}
          </span>
        </li>
      </ul>

      <p className="flex items-start gap-1.5 border-t border-line pt-3 text-[0.6875rem] leading-relaxed text-muted-2">
        <Info aria-hidden className="mt-px size-3 shrink-0" strokeWidth={2} />
        <span>{t("placesNoBasemap")}</span>
      </p>
    </section>
  );
}
