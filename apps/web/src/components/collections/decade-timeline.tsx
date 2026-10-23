"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import type { Fonds, FondsStats } from "@/lib/data/collections";
import { decadesOutside, findingAidDrift } from "@/lib/data/collections";
import { cn } from "@/lib/cn";

/**
 * When the fonds was made, by decade, against what the finding aid claims.
 *
 * One series, so one colour and no legend — the title says what is plotted.
 * The finding aid is not a second series but a reference band drawn behind the
 * bars: it is a different kind of claim, by a different author, and encoding it
 * as a rival colour would invite the reader to average the two.
 */
export function DecadeTimeline({ fonds, stats }: { fonds: Fonds; stats: FondsStats }) {
  const t = useTranslations("collections.detail");
  const [hovered, setHovered] = useState<number | null>(null);

  const decades = Object.keys(stats.decades).map(Number).sort((a, b) => a - b);
  // Always draw the finding aid's own decades too, even where we have nothing:
  // the gap between what it claims and what we hold is the reading.
  const first = Math.min(decades[0], Math.floor(fonds.findingAid.from / 10) * 10);
  const last = Math.max(decades[decades.length - 1], Math.floor(fonds.findingAid.to / 10) * 10);
  const scale = Array.from({ length: (last - first) / 10 + 1 }, (_, i) => first + i * 10);

  const peak = Math.max(...Object.values(stats.decades), 1);
  const drift = findingAidDrift(fonds, stats);
  const outside = new Set(decadesOutside(fonds, stats));

  const shown = hovered !== null ? { decade: hovered, count: stats.decades[hovered] ?? 0 } : null;

  return (
    <section
      aria-labelledby="timeline-heading"
      className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="timeline-heading"
          className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground-strong"
        >
          {t("timelineTitle")}
        </h2>
        <p className="text-[0.75rem] leading-snug text-muted">{t("timelineHint")}</p>
      </div>

      <p aria-live="polite" className="min-h-[1.25rem] text-[0.75rem] text-muted">
        {shown ? (
          <>
            <span className="font-mono font-medium tabular-nums text-foreground-strong">
              {shown.decade}s
            </span>
            {" · "}
            {t("timelineRecords", { count: shown.count })}
          </>
        ) : (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span aria-hidden className="h-3 w-5 border-x border-dashed border-sepia/60 bg-sepia/[0.08]" />
            <span className="text-muted-2">
              {t("timelineFindingAid")} {fonds.findingAid.from}–{fonds.findingAid.to}
            </span>
          </span>
        )}
      </p>

      <div className="relative flex items-end gap-[3px] border-b border-line-strong/60 pt-2 sm:gap-1.5">
        {/* the finding aid's claim, behind everything */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 border-x border-dashed border-sepia/50 bg-sepia/[0.06]"
          style={{
            left: `${((Math.floor(fonds.findingAid.from / 10) * 10 - first) / ((last - first) + 10)) * 100}%`,
            width: `${(((Math.floor(fonds.findingAid.to / 10) * 10) - (Math.floor(fonds.findingAid.from / 10) * 10) + 10) / ((last - first) + 10)) * 100}%`,
          }}
        />

        {scale.map((decade) => {
          const count = stats.decades[decade] ?? 0;
          const beyond = outside.has(decade);
          return (
            <button
              key={decade}
              type="button"
              onMouseEnter={() => setHovered(decade)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(decade)}
              onBlur={() => setHovered(null)}
              title={`${decade}s — ${count}`}
              className="group relative z-10 flex min-w-0 flex-1 flex-col items-center gap-1.5 pb-0.5"
            >
              <span className="flex h-24 w-full max-w-6 items-end justify-center sm:h-28">
                {count > 0 ? (
                  <span
                    className={cn(
                      "w-full rounded-t-[4px] transition-[height,opacity] duration-300",
                      "[transition-timing-function:var(--ease-archival)]",
                      hovered !== null && hovered !== decade && "opacity-60",
                    )}
                    style={{
                      height: `${Math.max((count / peak) * 100, 6)}%`,
                      // a decade the finding aid does not cover is still drawn
                      // in the series colour — it is the same measurement — and
                      // called out by the note below, not by a warning hue
                      background: beyond ? "var(--chart-2)" : "var(--chart-1)",
                    }}
                  />
                ) : (
                  <span aria-hidden className="h-px w-full rounded-full bg-line-strong/50" />
                )}
              </span>
              <span
                className={cn(
                  "w-full truncate text-center font-mono text-[0.5rem] tabular-nums transition-colors",
                  hovered === decade ? "text-foreground" : "text-muted-2",
                )}
              >
                {decade}
              </span>
            </button>
          );
        })}
      </div>

      {drift && (
        <div className="flex gap-2.5 rounded-lg border border-review/35 bg-review-soft px-3 py-2.5">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-review" strokeWidth={2} />
          <div className="min-w-0">
            <p className="font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-review">
              {t("driftTitle")}
            </p>
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
              {t("driftBody", {
                count: drift.decades.length,
                from: fonds.findingAid.from,
                to: fonds.findingAid.to,
              })}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
