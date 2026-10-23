"use client";

import { useLocale, useTranslations } from "next-intl";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { COST, STATS, type Stat } from "@/lib/data/dashboard";
import { cn } from "@/lib/cn";

/**
 * Four numbers, no sparklines. A stat tile's job is the value and whether it is
 * moving the right way; the trend chart below does the shape properly, and a
 * postage-stamp line under each figure would only repeat it badly.
 */
export function StatRow() {
  return (
    <dl className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
      {STATS.map((stat) => (
        <StatTile key={stat.id} stat={stat} />
      ))}
    </dl>
  );
}

function StatTile({ stat }: { stat: Stat }) {
  const t = useTranslations("dashboard.stats");
  const tRoot = useTranslations("dashboard");
  const locale = useLocale();
  const intl = locale === "de" ? "de-CH" : locale;

  const value =
    stat.format === "count"
      ? new Intl.NumberFormat(intl).format(stat.value)
      : stat.format === "percent"
        ? `${new Intl.NumberFormat(intl, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(stat.value)} %`
        : new Intl.NumberFormat(intl, {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
          }).format(stat.value);

  // Good/bad follows the meaning of the metric, not the sign of the number: a
  // falling correction rate is the outcome this product exists to produce.
  const improving =
    stat.delta === undefined
      ? undefined
      : stat.higherIsBetter
        ? stat.delta > 0
        : stat.delta < 0;

  const hint =
    stat.id === "cost"
      ? t("costHint", { budget: new Intl.NumberFormat(intl).format(COST.budgetUsd) })
      : t(`${stat.id}Hint`);

  return (
    <div className="flex flex-col gap-2 bg-background p-4 sm:p-5">
      <dt className="text-[0.75rem] font-medium text-muted">{t(stat.id)}</dt>

      <dd className="flex flex-col gap-2">
        <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="font-display text-[1.625rem] font-semibold leading-none tracking-[-0.025em] tabular-nums text-foreground-strong">
            {value}
          </span>

          {stat.delta !== undefined && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[0.625rem] tabular-nums",
                improving
                  ? "bg-corroborated-soft text-corroborated"
                  : "bg-review-soft text-review",
              )}
              title={tRoot(improving ? "deltaUp" : "deltaDown")}
            >
              {stat.delta > 0 ? (
                <ArrowUpRight aria-hidden className="size-2.5" strokeWidth={2.5} />
              ) : (
                <ArrowDownRight aria-hidden className="size-2.5" strokeWidth={2.5} />
              )}
              {stat.format === "percent"
                ? `${Math.abs(stat.delta).toFixed(1)} pp`
                : new Intl.NumberFormat(intl).format(Math.abs(stat.delta))}
              <span className="sr-only"> {tRoot(improving ? "deltaUp" : "deltaDown")}</span>
            </span>
          )}
        </span>

        <span className="block text-[0.6875rem] leading-snug text-muted-2">{hint}</span>

        {stat.of !== undefined && (
          <span aria-hidden className="mt-1 block h-1 overflow-hidden rounded-full bg-line-strong/30">
            <span
              className="block h-full rounded-full bg-evidence"
              style={{ width: `${Math.min((stat.value / stat.of) * 100, 100)}%` }}
            />
          </span>
        )}
      </dd>
    </div>
  );
}
