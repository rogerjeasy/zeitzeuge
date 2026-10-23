"use client";

import { useLocale, useTranslations } from "next-intl";
import { CONTRIBUTION_STATS } from "@/lib/data/profile";
import { useCountUp } from "@/hooks/use-count-up";
import { useInView } from "@/hooks/use-in-view";

/**
 * §5.4 M5 made visible: corrections become aliases, exemplars and regression
 * cases, and every improvement is attributable to a named archivist. This is
 * the attribution — the same logic archival authority control has always used.
 */
export function ContributionStats() {
  const t = useTranslations("profile");
  const { ref, inView } = useInView<HTMLDivElement>({ rootMargin: "0px", threshold: 0.1 });

  return (
    <section ref={ref} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-[1.0625rem] font-semibold tracking-[-0.02em] text-foreground-strong">
          {t("taughtTitle")}
        </h2>
        <p className="max-w-[72ch] text-[0.8125rem] leading-relaxed text-muted">
          {t("taughtSubtitle")}
        </p>
      </div>

      <dl className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
        {CONTRIBUTION_STATS.map((stat) => (
          <StatCell
            key={stat.id}
            id={stat.id}
            value={stat.value}
            isPercent={"isPercent" in stat ? stat.isPercent : false}
            active={inView}
          />
        ))}
      </dl>
    </section>
  );
}

function StatCell({
  id,
  value,
  isPercent,
  active,
}: {
  id: string;
  value: number;
  isPercent: boolean;
  active: boolean;
}) {
  const t = useTranslations("profile.stats");
  const locale = useLocale();
  const current = useCountUp(value, active);
  const formatted = new Intl.NumberFormat(locale === "de" ? "de-CH" : locale, {
    maximumFractionDigits: 0,
  }).format(current);

  return (
    <div className="flex flex-col gap-1.5 bg-background p-4 sm:p-5">
      <dt className="text-[0.75rem] font-medium text-muted">{t(id)}</dt>
      <dd className="flex flex-col gap-1">
        <span className="font-display text-[1.625rem] font-semibold leading-none tracking-[-0.025em] tabular-nums text-foreground-strong">
          {formatted}
          {isPercent && <span className="text-muted-2"> %</span>}
        </span>
        <span className="text-[0.6875rem] leading-snug text-muted-2">{t(`${id}Hint`)}</span>
      </dd>
    </div>
  );
}
