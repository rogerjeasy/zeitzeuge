"use client";

import { useTranslations } from "next-intl";
import { ArrowRight, BookMarked, FlaskConical, Sparkles } from "lucide-react";
import { RECENT_CORRECTIONS, type CorrectionEffect } from "@/lib/data/profile";
import { cn } from "@/lib/cn";

const EFFECT = {
  alias: { Icon: BookMarked, tone: "bg-evidence-soft text-evidence" },
  evalCase: { Icon: FlaskConical, tone: "bg-corroborated-soft text-corroborated" },
  exemplar: { Icon: Sparkles, tone: "bg-sepia-soft text-sepia" },
} satisfies Record<CorrectionEffect, { Icon: typeof BookMarked; tone: string }>;

/**
 * Each row shows the correction *and* what the system did with it. A list of
 * edits would be an audit log; the consequence is what makes it a contribution.
 */
export function RecentCorrections() {
  const t = useTranslations("profile");
  const tFields = useTranslations("ledger.fields");

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[1.0625rem] font-semibold tracking-[-0.02em] text-foreground-strong">
          {t("correctionsTitle")}
        </h2>
        <p className="text-[0.8125rem] text-muted">{t("correctionsHint")}</p>
      </div>

      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        {RECENT_CORRECTIONS.map((correction) => {
          const { Icon, tone } = EFFECT[correction.effect];

          return (
            <li key={correction.id} className="flex flex-col gap-2 px-4 py-3.5 sm:px-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted-2">
                  {tFields(correction.field)}
                </span>

                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.75rem] text-muted line-through decoration-refuted/50">
                    {correction.from}
                  </span>
                  <ArrowRight aria-hidden className="size-3 shrink-0 text-muted-2" strokeWidth={2} />
                  <span className="rounded bg-corroborated-soft px-1.5 py-0.5 font-mono text-[0.75rem] text-corroborated">
                    {correction.to}
                  </span>
                  <span className="sr-only">{t("changed")}</span>
                </span>

                <span
                  className={cn(
                    "ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.08em]",
                    tone,
                  )}
                >
                  <Icon aria-hidden className="size-2.5" strokeWidth={2.2} />
                  {t(`effects.${correction.effect}`)}
                </span>
              </div>

              <p className="font-mono text-[0.625rem] text-muted-2">
                {correction.signature} ·{" "}
                {correction.daysAgo === 0 ? t("today") : t("daysAgo", { days: correction.daysAgo })}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
