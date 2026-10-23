"use client";

import { useLocale, useTranslations } from "next-intl";
import { METRICS } from "@/lib/data/capabilities";
import { useCountUp } from "@/hooks/use-count-up";
import { useInView } from "@/hooks/use-in-view";

function Metric({
  value,
  decimals,
  suffix,
  label,
  active,
}: {
  value: number;
  decimals: number;
  suffix: string;
  label: string;
  active: boolean;
}) {
  const locale = useLocale();
  const current = useCountUp(value, active);

  // de-CH groups with an apostrophe (12'438), which is exactly the convention
  // an archivist in Schwyz expects to read.
  const formatted = new Intl.NumberFormat(locale === "de" ? "de-CH" : locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(current);

  return (
    <div className="min-w-0">
      <dt className="font-display text-[1.375rem] font-semibold tabular-nums leading-none tracking-[-0.02em] text-foreground-strong sm:text-2xl">
        {formatted}
        <span className="text-muted-2">{suffix}</span>
      </dt>
      <dd className="mt-1.5 text-[0.6875rem] leading-snug text-muted sm:text-xs">
        {label}
      </dd>
    </div>
  );
}

export function HeroMetrics() {
  const t = useTranslations("hero.metrics");
  const { ref, inView } = useInView<HTMLDListElement>({
    // No negative bottom margin here: these sit low in the hero and must start
    // as soon as any part of them is on screen, at any viewport height.
    rootMargin: "0px",
    threshold: 0.05,
  });

  return (
    <dl
      ref={ref}
      className="grid grid-cols-2 gap-x-5 gap-y-5 border-t border-line pt-6 sm:grid-cols-4 sm:gap-x-6"
    >
      {METRICS.map((metric) => (
        <Metric
          key={metric.id}
          value={metric.value}
          decimals={metric.decimals}
          suffix={metric.suffix}
          label={t(metric.id)}
          active={inView}
        />
      ))}
    </dl>
  );
}
