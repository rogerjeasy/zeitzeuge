"use client";

import { useLocale, useTranslations } from "next-intl";
import { Check, Minus, Star, X } from "lucide-react";
import { METRICS, meetsTarget, pooled, type Metric, type Stratum } from "@/lib/data/evaluation";
import { formatValue } from "./format";
import { cn } from "@/lib/cn";

/**
 * §11.2, in full, with the verdict computed rather than asserted.
 *
 * Twelve rows and no editorialising: the target column is what was written down
 * before the run, the measured column is what came back, and the tick is
 * `meetsTarget` comparing the two at the precision the row prints. Narrow the
 * strata and some of these go red — which is the point of letting a judge
 * click. A page where nothing can fail proves nothing.
 */
export function MetricsTable({ strata }: { strata: Stratum[] }) {
  const t = useTranslations("evaluation");
  const locale = useLocale();
  const intl = locale === "de" ? "de-CH" : locale;

  return (
    <section
      aria-labelledby="metrics-heading"
      className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="metrics-heading"
          className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground-strong"
        >
          {t("metrics.title")}
        </h2>
        <p className="text-[0.75rem] leading-relaxed text-muted">{t("metrics.hint")}</p>
      </div>

      {/* A table on a wide screen; the same rows as cards on a phone, because a
          five-column table at 390 px is a horizontal-scroll trap. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-2">
              <th scope="col" className="py-2 pr-3 font-normal">{t("metrics.headerMetric")}</th>
              <th scope="col" className="py-2 pr-3 font-normal">{t("metrics.headerDefinition")}</th>
              <th scope="col" className="py-2 pr-3 text-right font-normal">{t("metrics.headerTarget")}</th>
              <th scope="col" className="py-2 pr-3 text-right font-normal">{t("metrics.headerMeasured")}</th>
              <th scope="col" className="py-2 font-normal"><span className="sr-only">✓</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {METRICS.map((m) => (
              <Row key={m.id} metric={m} strata={strata} intl={intl} />
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col divide-y divide-line md:hidden">
        {METRICS.map((m) => (
          <Card key={m.id} metric={m} strata={strata} intl={intl} />
        ))}
      </ul>
    </section>
  );
}

function useRow(metric: Metric, strata: Stratum[], intl: string) {
  const value = pooled(metric, strata);
  return {
    value,
    met: meetsTarget(metric, value),
    shown: value === null ? null : formatValue(value, metric.unit, intl),
    target: formatValue(metric.target, metric.unit, intl),
  };
}

function Row({ metric, strata, intl }: { metric: Metric; strata: Stratum[]; intl: string }) {
  const t = useTranslations("evaluation.metrics");
  const { met, shown, target } = useRow(metric, strata, intl);

  return (
    <tr className={cn("align-baseline", met === false && "bg-refuted-soft/25")}>
      <th scope="row" className="py-2.5 pr-3 text-left font-normal">
        <span className="flex items-center gap-1.5 text-[0.8125rem] text-foreground-strong">
          {metric.starred && (
            <Star aria-hidden className="size-3 shrink-0 fill-review text-review" strokeWidth={0} />
          )}
          {t(metric.id)}
        </span>
      </th>
      <td className="py-2.5 pr-3 text-[0.75rem] leading-snug text-muted">{t(`${metric.id}Def`)}</td>
      <td className="py-2.5 pr-3 text-right font-mono text-[0.75rem] tabular-nums text-muted-2">
        {metric.higherIsBetter ? "≥ " : "≤ "}
        {target}
      </td>
      <td
        className={cn(
          "py-2.5 pr-3 text-right font-mono text-[0.8125rem] font-medium tabular-nums",
          met === null ? "text-muted-2" : met ? "text-foreground-strong" : "text-refuted",
        )}
      >
        {shown ?? t("na")}
      </td>
      <td className="py-2.5"><Verdict met={met} /></td>
    </tr>
  );
}

function Card({ metric, strata, intl }: { metric: Metric; strata: Stratum[]; intl: string }) {
  const t = useTranslations("evaluation.metrics");
  const { met, shown, target } = useRow(metric, strata, intl);

  return (
    <li className={cn("flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0", met === false && "bg-refuted-soft/25")}>
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5 text-[0.8125rem] text-foreground-strong">
          {metric.starred && (
            <Star aria-hidden className="size-3 shrink-0 fill-review text-review" strokeWidth={0} />
          )}
          {t(metric.id)}
        </span>
        <Verdict met={met} />
      </div>
      <p className="text-[0.75rem] leading-snug text-muted">{t(`${metric.id}Def`)}</p>
      <p className="flex flex-wrap items-baseline gap-x-2 font-mono text-[0.75rem] tabular-nums">
        <span
          className={cn(
            "text-[0.875rem] font-medium",
            met === null ? "text-muted-2" : met ? "text-foreground-strong" : "text-refuted",
          )}
        >
          {shown ?? t("na")}
        </span>
        <span className="text-muted-2">
          {metric.higherIsBetter ? "≥ " : "≤ "}
          {target}
        </span>
      </p>
    </li>
  );
}

/** Never colour alone — the tick and the word travel together. */
function Verdict({ met }: { met: boolean | null }) {
  const t = useTranslations("evaluation.metrics");

  if (met === null) {
    return (
      <span
        title={t("naHint")}
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-abstain-soft px-1.5 py-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.06em] text-abstain"
      >
        <Minus aria-hidden className="size-2.5" strokeWidth={3} />
        {t("na")}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.06em]",
        met ? "bg-corroborated-soft text-corroborated" : "bg-refuted-soft text-refuted",
      )}
    >
      {met ? (
        <Check aria-hidden className="size-2.5" strokeWidth={3.5} />
      ) : (
        <X aria-hidden className="size-2.5" strokeWidth={3.5} />
      )}
      {met ? t("pass") : t("fail")}
    </span>
  );
}
