"use client";

import { useLocale, useTranslations } from "next-intl";
import { ArrowDown } from "lucide-react";
import { projectCascade } from "@/lib/data/admin";
import { cn } from "@/lib/cn";

const STAGES = ["fast", "standard", "deep"] as const;

const TONE: Record<(typeof STAGES)[number], { bar: string; text: string }> = {
  fast: { bar: "bg-corroborated", text: "text-corroborated" },
  standard: { bar: "bg-evidence", text: "text-evidence" },
  deep: { bar: "bg-review", text: "text-review" },
};

/**
 * §5.4 M1 made draggable.
 *
 * "Does it scale to 100'000 images?" is a business question, and the honest
 * answer is a function of two thresholds. So the thresholds are the control and
 * this is the readout: move one and the split, the blended cost and the saving
 * against a flat deep pipeline all move with it. Shares are integrated from the
 * measured first-pass confidence histogram, which is why the defaults land on
 * the 60 / 30 / 10 the architecture claims rather than restating it.
 */
export function Cascade({
  emitAtFast,
  emitAtStandard,
}: {
  emitAtFast: number;
  emitAtStandard: number;
}) {
  const t = useTranslations("admin.routing");
  const locale = useLocale();
  const intl = locale === "de" ? "de-CH" : locale;

  const p = projectCascade(emitAtFast, emitAtStandard);
  const money = (v: number) =>
    new Intl.NumberFormat(intl, {
      style: "currency", currency: "USD",
      minimumFractionDigits: 3, maximumFractionDigits: 3,
    }).format(v);
  const pct = (v: number) =>
    new Intl.NumberFormat(intl, { style: "percent", maximumFractionDigits: 1 }).format(v);

  const shares = { fast: p.fast, standard: p.standard, deep: p.deep };

  return (
    <div className="flex flex-col gap-3 rounded-[0.625rem] border border-line bg-surface-2/40 p-3.5">
      <p className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-muted-2">
        {t("projection")}
      </p>

      {/* one bar, three segments, 2px of surface between them */}
      <div className="flex h-7 gap-[2px]">
        {STAGES.map((stage) => (
          <div
            key={stage}
            style={{ flexGrow: Math.max(shares[stage], 0.001), flexBasis: 0 }}
            className={cn(
              "flex min-w-0 items-center justify-center rounded-[3px] transition-[flex-grow] duration-500",
              "[transition-timing-function:var(--ease-archival)]",
              TONE[stage].bar,
            )}
          >
            <span className="truncate px-1 font-mono text-[0.625rem] tabular-nums text-background">
              {shares[stage] >= 0.08 ? pct(shares[stage]) : ""}
            </span>
          </div>
        ))}
      </div>

      <ul className="flex flex-col gap-1.5">
        {STAGES.map((stage, i) => (
          <li key={stage} className="flex items-center gap-2">
            <span aria-hidden className={cn("size-2.5 shrink-0 rounded-[2px]", TONE[stage].bar)} />
            <span className="min-w-0 flex-1 text-[0.8125rem] text-foreground">
              {t(`stages.${stage}`)}
            </span>
            {i < STAGES.length - 1 && (
              <ArrowDown aria-hidden className="size-3 shrink-0 text-muted-2" strokeWidth={2} />
            )}
            <span className={cn("shrink-0 font-mono text-[0.8125rem] tabular-nums", TONE[stage].text)}>
              {pct(shares[stage])}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line pt-2.5">
        <span className="text-[0.75rem] text-muted">{t("costPerImage")}</span>
        <span className="font-mono text-[1.0625rem] tabular-nums text-foreground-strong">
          {money(p.costPerImage)}
        </span>
      </div>

      <p className="text-[0.75rem] leading-relaxed text-muted-2">
        {t("flatCompare", {
          ratio: (p.flatCostPerImage / p.costPerImage).toFixed(1),
          flat: money(p.flatCostPerImage),
        })}
      </p>
    </div>
  );
}
