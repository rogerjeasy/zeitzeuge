"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { HYPOTHESES } from "@/lib/data/record";
import { PRIORS, killedAt, posteriorsAt } from "@/lib/data/theater";
import { cn } from "@/lib/cn";

/**
 * The four candidates, moving.
 *
 * This is the panel the whole screen is for. The bars start at the priors, one
 * of them overtakes the rest as evidence lands, two of them collapse the moment
 * the falsifier re-renders the horizon — and then the leader *falls back* when
 * the red team objects. That dip is the most valuable pixel on the page: a
 * system whose confidence only ever rises is not reasoning, it is agreeing
 * with itself.
 */
export function HypothesisPanel({ t }: { t: number }) {
  const tr = useTranslations("theater");
  const tHyp = useTranslations("ledger.hypotheses");

  const posteriors = posteriorsAt(t);
  const killed = killedAt(t);

  return (
    <section
      aria-labelledby="hyp-heading"
      className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="hyp-heading"
          className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground-strong"
        >
          {tr("hypothesesTitle")}
        </h2>
        <p className="max-w-[74ch] text-[0.75rem] leading-relaxed text-muted">
          {tr("hypothesesHint")}
        </p>
      </div>

      <ul className="flex flex-col gap-2.5">
        {HYPOTHESES.map((hyp) => {
          const value = posteriors[hyp.id] ?? 0;
          const dead = killed.has(hyp.id);
          const leading = value === Math.max(...Object.values(posteriors));

          return (
            <li key={hyp.id} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-2">
                  {hyp.id.replace("hyp_", "")}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 text-[0.8125rem]",
                    dead ? "text-muted-2 line-through decoration-refuted/60" : "text-foreground",
                  )}
                >
                  {tHyp(hyp.key)}
                </span>
                {dead && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-refuted-soft px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.06em] text-refuted">
                    <X aria-hidden className="size-2.5" strokeWidth={3} />
                    {tr("refuted")}
                  </span>
                )}
                <span
                  className={cn(
                    "shrink-0 font-mono text-[0.8125rem] tabular-nums",
                    dead ? "text-refuted" : leading ? "text-corroborated" : "text-muted",
                  )}
                >
                  {value.toFixed(2)}
                </span>
              </div>

              <span aria-hidden className="relative flex h-2 overflow-hidden rounded-full bg-line-strong/25">
                <span
                  className={cn(
                    "h-full rounded-full transition-[width,background-color] duration-500",
                    "[transition-timing-function:var(--ease-archival)]",
                    dead ? "bg-refuted/50" : leading ? "bg-corroborated" : "bg-evidence/60",
                  )}
                  style={{ width: `${value * 100}%` }}
                />
                {/* where it started, so the movement has a reference */}
                <span
                  className="absolute top-0 h-full w-px bg-foreground-strong/35"
                  style={{ left: `${PRIORS[hyp.id] * 100}%` }}
                  title={`${tr("prior")} ${PRIORS[hyp.id].toFixed(2)}`}
                />
              </span>
            </li>
          );
        })}
      </ul>

      <p className="flex items-center gap-1.5 border-t border-line pt-2.5 font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-2">
        <span aria-hidden className="h-3 w-px bg-foreground-strong/35" />
        {tr("prior")}
      </p>
    </section>
  );
}
