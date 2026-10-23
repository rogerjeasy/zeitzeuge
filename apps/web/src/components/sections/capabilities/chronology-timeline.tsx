"use client";

import { useTranslations } from "next-intl";
import { DATE_CONSTRAINTS, DATE_PEAK, DATE_RANGE } from "@/lib/data/record";
import { useInView } from "@/hooks/use-in-view";
import { cn } from "@/lib/cn";

const SPAN = DATE_RANGE.to - DATE_RANGE.from;
const pct = (year: number) => ((year - DATE_RANGE.from) / SPAN) * 100;

/**
 * The date distribution as constraints rather than a guess. Each period tool
 * draws a wall; the corridor that survives between the walls is the answer.
 * This is the visual that makes "terminus post quem" legible to a non-archivist.
 */
export function ChronologyTimeline() {
  const t = useTranslations("capabilities.timelineDemo");
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.35 });

  const left = pct(DATE_PEAK.from);
  const width = pct(DATE_PEAK.to) - left;

  return (
    <div
      ref={ref}
      className="flex flex-col gap-4 rounded-[0.625rem] border border-line bg-surface/70 p-4 sm:p-5"
    >
      <div className="relative">
        <div className="relative h-20 overflow-hidden rounded-lg border border-line bg-surface-2/70 sm:h-24">
          <div aria-hidden className="texture-halftone absolute inset-0 text-muted-2/30" />

          <div
            className="absolute inset-y-0 left-0 bg-refuted-soft transition-[width] duration-1000 [transition-timing-function:var(--ease-archival)]"
            style={{ width: inView ? `${left}%` : "0%" }}
          />
          <div
            className="absolute inset-y-0 right-0 bg-refuted-soft transition-[width] duration-1000 [transition-timing-function:var(--ease-archival)]"
            style={{ width: inView ? `${100 - left - width}%` : "0%" }}
          />

          <div
            className="absolute inset-y-0 border-x-2 border-corroborated bg-corroborated-soft transition-opacity delay-500 duration-700"
            style={{ left: `${left}%`, width: `${width}%`, opacity: inView ? 1 : 0 }}
          >
            <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-mono text-[0.625rem] font-semibold tabular-nums text-corroborated sm:text-xs">
              {DATE_PEAK.from}–{DATE_PEAK.to}
            </span>
          </div>

          {DATE_CONSTRAINTS.map((constraint, i) => (
            <div
              key={constraint.id}
              className="absolute inset-y-0 w-px bg-foreground-strong/45 transition-opacity duration-500"
              style={{
                left: `${pct(constraint.year)}%`,
                opacity: inView ? 1 : 0,
                transitionDelay: `${700 + i * 120}ms`,
              }}
            >
              <span
                className={cn(
                  "absolute top-1 whitespace-nowrap rounded-[3px] bg-foreground-strong px-1 py-px font-mono text-[0.5rem] text-background",
                  constraint.rule === "post" ? "left-0.5" : "right-0.5",
                )}
              >
                {constraint.year}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-1.5 flex justify-between font-mono text-[0.5625rem] tabular-nums text-muted-2">
          <span>{DATE_RANGE.from}</span>
          <span>{DATE_RANGE.to}</span>
        </div>
      </div>

      <ul className="flex flex-col gap-1.5 border-t border-line pt-3">
        {DATE_CONSTRAINTS.map((constraint) => (
          <li
            key={constraint.id}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[0.6875rem] leading-snug"
          >
            <span className="font-mono tabular-nums text-evidence">{constraint.id}</span>
            <span
              className={cn(
                "font-mono text-[0.5625rem] uppercase tracking-[0.08em]",
                constraint.rule === "post" ? "text-corroborated" : "text-review",
              )}
            >
              {t(constraint.rule)} {constraint.year}
            </span>
            <span className="min-w-0 text-muted">{t(`constraints.${constraint.key}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
