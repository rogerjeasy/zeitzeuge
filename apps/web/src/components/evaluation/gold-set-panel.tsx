"use client";

import { useLocale, useTranslations } from "next-intl";
import { EyeOff } from "lucide-react";
import { GOLD_SET, STRATA, type Stratum } from "@/lib/data/evaluation";
import { cn } from "@/lib/cn";

/**
 * What was measured, before anything about the measurement.
 *
 * A metric with no stated population is a number with no meaning, so the set
 * comes first — how big, how it splits, where the ground truth came from, and
 * how much of it nobody on the team was allowed to look at.
 */
export function GoldSetPanel({
  selected,
  onSelect,
}: {
  selected: Stratum[];
  onSelect: (next: Stratum[]) => void;
}) {
  const t = useTranslations("evaluation");
  const locale = useLocale();
  const intl = locale === "de" ? "de-CH" : locale;
  const number = (v: number) => new Intl.NumberFormat(intl).format(v);

  const total = GOLD_SET.total;

  return (
    <section
      aria-labelledby="goldset-heading"
      className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="goldset-heading"
          className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground-strong"
        >
          {t("goldSet.title")}
        </h2>
        <p className="max-w-[78ch] text-[0.75rem] leading-relaxed text-muted">
          {t("goldSet.hint")}
        </p>
      </div>

      {/* the stratification, as the thing you select with */}
      <div className="flex flex-col gap-2">
        <div
          role="group"
          aria-label={t("filterTitle")}
          className="flex h-8 gap-[2px]"
        >
          {STRATA.map((s) => {
            const active = selected.includes(s);
            const share = (GOLD_SET.counts[s] / total) * 100;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={active}
                title={`${t(`strata.${s}`)} · ${GOLD_SET.counts[s]}`}
                onClick={() =>
                  onSelect(
                    // clicking the only selected stratum widens back to the set,
                    // so the reader can never strand themselves on an empty view
                    active
                      ? selected.length === 1
                        ? [...STRATA]
                        : selected.filter((x) => x !== s)
                      : [...selected, s],
                  )
                }
                style={{ flexGrow: share, flexBasis: 0 }}
                className={cn(
                  "group relative min-w-0 rounded-[3px] transition-colors duration-200",
                  active
                    ? "bg-evidence"
                    : "bg-evidence-soft ring-1 ring-inset ring-line-strong hover:bg-evidence/30",
                )}
              >
                <span className="sr-only">
                  {t(`strata.${s}`)} — {GOLD_SET.counts[s]}
                </span>
              </button>
            );
          })}
        </div>

        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          {STRATA.map((s) => {
            const active = selected.includes(s);
            return (
              <li key={s}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    onSelect(
                      active
                        ? selected.length === 1
                          ? [...STRATA]
                          : selected.filter((x) => x !== s)
                        : [...selected, s],
                    )
                  }
                  className={cn(
                    "flex items-center gap-1.5 text-[0.75rem] transition-colors",
                    active ? "text-foreground" : "text-muted-2 hover:text-foreground",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-2.5 rounded-[2px] transition-colors",
                      active ? "bg-evidence" : "bg-evidence-soft ring-1 ring-inset ring-line-strong",
                    )}
                  />
                  {t(`strata.${s}`)}
                  <span className="font-mono text-[0.6875rem] tabular-nums text-muted-2">
                    {GOLD_SET.counts[s]}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* the reserved share — the number the final claim is quoted on */}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line bg-surface-2/50 px-3 py-2.5 text-[0.75rem] leading-relaxed text-muted">
        <EyeOff aria-hidden className="size-3.5 shrink-0 text-muted-2" strokeWidth={1.9} />
        <span className="font-medium text-foreground-strong">
          {t("goldSet.heldOut", { count: GOLD_SET.heldOut })}
        </span>
        <span className="min-w-0">{t("goldSet.heldOutHint")}</span>
      </p>

      <div className="flex flex-col gap-2">
        <h3 className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-muted-2">
          {t("goldSet.sourcesTitle")}
        </h3>
        <ul className="flex flex-col divide-y divide-line">
          {GOLD_SET.sources.map((source) => (
            <li key={source.key} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:gap-3">
              {/* Count and name hold one line; the ground-truth note only sits
                  beside them once there is room. Left to wrap on a phone it
                  loses its column and breaks one character per line. */}
              <span className="flex items-baseline gap-2 sm:shrink-0">
                <span className="font-mono text-[0.8125rem] tabular-nums text-foreground-strong">
                  {number(source.count)}
                </span>
                <span className="text-[0.8125rem] text-foreground">
                  {t(`goldSet.sources.${source.key}`)}
                </span>
              </span>
              <span className="min-w-0 text-[0.75rem] leading-snug text-muted-2 sm:flex-1">
                {t(`goldSet.truth.${source.truthKey}`)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
