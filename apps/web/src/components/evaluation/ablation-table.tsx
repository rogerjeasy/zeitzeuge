"use client";

import { useLocale, useTranslations } from "next-intl";
import { ablation, metric, type Stratum } from "@/lib/data/evaluation";
import { formatValue } from "./format";
import { cn } from "@/lib/cn";

const COLUMNS = ["municipality", "datingMae", "hallucination"] as const;

/**
 * §11.3 — the slide that decides the prize.
 *
 * Three configurations, three measures, each measure on its own row-scale: a
 * percentage, a count of years and a percentage do not share an axis, so each
 * column's bar is normalised within its own column and nothing invites the
 * reader to compare across them.
 *
 * Bars are neutral; colour marks only the best cell per measure, and "best"
 * follows the measure's own direction rather than the bar's length — dating
 * error is won by the shortest bar.
 */
export function AblationTable({ strata }: { strata: Stratum[] }) {
  const t = useTranslations("evaluation.ablation");
  const tMetrics = useTranslations("evaluation.metrics");
  const locale = useLocale();
  const intl = locale === "de" ? "de-CH" : locale;

  const rows = ablation(strata);

  const columnPeak = Object.fromEntries(
    COLUMNS.map((c) => [c, Math.max(...rows.map((r) => r[c]), 0.0001)]),
  ) as Record<(typeof COLUMNS)[number], number>;

  const best = Object.fromEntries(
    COLUMNS.map((c) => {
      const higher = metric(c).higherIsBetter;
      const values = rows.map((r) => r[c]);
      return [c, higher ? Math.max(...values) : Math.min(...values)];
    }),
  ) as Record<(typeof COLUMNS)[number], number>;

  return (
    <section
      aria-labelledby="ablation-heading"
      className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="ablation-heading"
          className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground-strong"
        >
          {t("title")}
        </h2>
        <p className="max-w-[78ch] text-[0.75rem] leading-relaxed text-muted">{t("hint")}</p>
      </div>

      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li
            key={row.id}
            className={cn(
              "flex flex-col gap-3 rounded-[0.625rem] border p-3.5 transition-colors",
              row.id === "full"
                ? "border-evidence/40 bg-evidence-soft/40"
                : "border-line bg-surface-2/30",
            )}
          >
            <div className="flex flex-col gap-0.5">
              <h3
                className={cn(
                  "text-[0.875rem] font-medium",
                  row.id === "full" ? "text-evidence" : "text-foreground-strong",
                )}
              >
                {t(`configs.${row.id}`)}
              </h3>
              <p className="max-w-[80ch] text-[0.75rem] leading-relaxed text-muted">
                {t(`configs.${row.id}Desc`)}
              </p>
            </div>

            <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-3">
              {COLUMNS.map((c) => {
                const value = row[c];
                const isBest = value === best[c];
                return (
                  <div key={c} className="flex min-w-0 flex-col gap-1">
                    <dt className="font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-2">
                      {tMetrics(c)}
                    </dt>
                    <dd className="flex flex-col gap-1.5">
                      <span className="flex items-baseline gap-2">
                        <span
                          className={cn(
                            "font-mono text-[1.0625rem] tabular-nums",
                            isBest ? "text-corroborated" : "text-foreground-strong",
                          )}
                        >
                          {formatValue(value, metric(c).unit, intl)}
                        </span>
                        {isBest && (
                          <span className="rounded-full bg-corroborated-soft px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.06em] text-corroborated">
                            {t("best")}
                          </span>
                        )}
                      </span>
                      {/* normalised inside its own measure, never across them */}
                      <span
                        aria-hidden
                        className="flex h-1.5 overflow-hidden rounded-full bg-line-strong/25"
                      >
                        <span
                          className={cn(
                            "h-full rounded-full transition-[width] duration-700",
                            "[transition-timing-function:var(--ease-archival)]",
                            isBest ? "bg-corroborated" : "bg-muted-2/60",
                          )}
                          style={{ width: `${Math.max((value / columnPeak[c]) * 100, value > 0 ? 3 : 0)}%` }}
                        />
                      </span>
                    </dd>
                  </div>
                );
              })}
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}
