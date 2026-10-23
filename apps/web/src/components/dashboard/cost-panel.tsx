"use client";

import { useLocale, useTranslations } from "next-intl";
import { COST } from "@/lib/data/dashboard";
import { useInView } from "@/hooks/use-in-view";
import { cn } from "@/lib/cn";

const CASCADE = [
  { id: "costFast", share: COST.fastPassShare, bar: "bg-corroborated" },
  { id: "costStandard", share: COST.standardShare, bar: "bg-evidence" },
  { id: "costDeep", share: COST.deepShare, bar: "bg-review" },
] as const;

/**
 * Spend against the credit, plus where the money actually goes. The cascade
 * split is the answer to "does this scale to 100'000 images?" (§5.4 M1) — most
 * images never reach the expensive model.
 */
export function CostPanel() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const { ref, inView } = useInView<HTMLElement>({ threshold: 0.25 });

  const intl = locale === "de" ? "de-CH" : locale;
  const usd = (v: number, digits = 0) =>
    new Intl.NumberFormat(intl, {
      style: "currency", currency: "USD",
      minimumFractionDigits: digits, maximumFractionDigits: digits,
    }).format(v);

  const used = (COST.spentUsd / COST.budgetUsd) * 100;

  return (
    <section
      ref={ref}
      className="flex flex-col gap-5 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground-strong">
          {t("costTitle")}
        </h2>

        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-[1.625rem] font-semibold leading-none tracking-[-0.025em] tabular-nums text-foreground-strong">
            {usd(COST.spentUsd)}
            <span className="ml-1.5 font-sans text-[0.75rem] font-normal text-muted-2">
              {t("costSpent")}
            </span>
          </p>
          <p className="font-mono text-[0.75rem] tabular-nums text-muted">
            {usd(COST.budgetUsd - COST.spentUsd)} {t("costRemaining")}
          </p>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-line-strong/30">
          <div
            className="h-full rounded-full bg-evidence transition-[width] duration-1000 [transition-timing-function:var(--ease-archival)]"
            style={{ width: inView ? `${used}%` : "0%" }}
          />
        </div>

        <p className="font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted-2">
          {usd(COST.perImageUsd, 3)} {t("costPerImage")}
        </p>
      </div>

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-2">
            {t("costCascadeTitle")}
          </h3>
          <p className="text-[0.6875rem] leading-snug text-muted">{t("costCascadeHint")}</p>
        </div>

        {/* one bar, three segments, 2px gaps so the parts stay countable */}
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
          {CASCADE.map((step) => (
            <div
              key={step.id}
              className={cn("h-full rounded-full transition-[width] duration-1000 [transition-timing-function:var(--ease-archival)]", step.bar)}
              style={{ width: inView ? `${step.share * 100}%` : "0%" }}
            />
          ))}
        </div>

        <dl className="flex flex-col gap-1.5">
          {CASCADE.map((step) => (
            <div key={step.id} className="flex items-center gap-2">
              <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", step.bar)} />
              <dt className="text-[0.75rem] text-muted">{t(step.id)}</dt>
              <dd className="ml-auto font-mono text-[0.75rem] tabular-nums text-foreground">
                {new Intl.NumberFormat(intl, { style: "percent", maximumFractionDigits: 0 }).format(step.share)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
