"use client";

import { useLocale, useTranslations } from "next-intl";
import { ABLATION } from "@/lib/data/calibration";
import { useInView } from "@/hooks/use-in-view";
import { cn } from "@/lib/cn";

/**
 * The ablation, as two separate one-measure comparisons rather than one grouped
 * chart: coverage and hallucination rate are different measures and sharing an
 * axis between them would be meaningless.
 *
 * Both bars are neutral. Colour is spent only on the delta chip, and it follows
 * the meaning of the change rather than the size of the bar — otherwise the
 * coverage panel would paint "without falsification" green and quietly argue
 * against the product. The drop in coverage is a real cost and is labelled as
 * one.
 */
export function AblationBars() {
  const t = useTranslations("calibration");
  const locale = useLocale();
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.35 });

  const nf = (v: number, digits = 1) =>
    new Intl.NumberFormat(locale === "de" ? "de-CH" : locale, {
      minimumFractionDigits: v % 1 === 0 ? 0 : digits,
      maximumFractionDigits: digits,
    }).format(v);

  return (
    <div ref={ref} className="grid gap-4 sm:grid-cols-2">
      {ABLATION.map((metric) => {
        const max = Math.max(metric.without, metric.with);
        const deltaAbs = metric.with - metric.without;
        const relative = Math.round((deltaAbs / metric.without) * 100);
        const improved = metric.lowerIsBetter ? deltaAbs < 0 : deltaAbs > 0;

        return (
          <figure
            key={metric.id}
            className="flex flex-col gap-3 rounded-[0.625rem] border border-line bg-surface p-4"
          >
            <figcaption className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <span className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-2">
                {t(`ablationMetrics.${metric.id}`)}
              </span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.06em]",
                  improved
                    ? "bg-corroborated-soft text-corroborated"
                    : "bg-review-soft text-review",
                )}
              >
                {improved ? t("ablationGain") : t("ablationCost")}{" "}
                {/* U+2212, not a hyphen — this is a number, not a word break */}
                {metric.lowerIsBetter
                  ? `−${Math.abs(relative)} %`
                  : `−${nf(Math.abs(deltaAbs))}${t("pp")}`}
              </span>
            </figcaption>

            <div className="flex flex-col gap-2.5">
              {[
                { label: t("withoutLabel"), value: metric.without, isWith: false },
                { label: t("withLabel"), value: metric.with, isWith: true },
              ].map((row) => (
                <div key={row.label} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className={cn(
                        "font-mono text-[0.5625rem] uppercase tracking-[0.08em]",
                        row.isWith ? "text-foreground" : "text-muted-2",
                      )}
                    >
                      {row.label}
                    </span>
                    <span
                      className={cn(
                        "font-mono text-[0.8125rem] font-semibold tabular-nums",
                        row.isWith ? "text-foreground-strong" : "text-muted",
                      )}
                    >
                      {nf(row.value)} %
                    </span>
                  </div>
                  <span className="h-2 overflow-hidden rounded-[3px] bg-line-strong/25">
                    <span
                      className={cn(
                        "block h-full rounded-[3px] transition-[width] duration-1000 [transition-timing-function:var(--ease-archival)]",
                        row.isWith ? "bg-evidence" : "bg-muted-2/60",
                      )}
                      style={{
                        width: inView ? `${Math.max((row.value / max) * 100, 2)}%` : "0%",
                      }}
                    />
                  </span>
                </div>
              ))}
            </div>
          </figure>
        );
      })}
    </div>
  );
}
