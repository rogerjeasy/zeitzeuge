"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { RotateCcw, X } from "lucide-react";
import type { CaseFile } from "@/lib/data/editor";
import { cn } from "@/lib/cn";

/**
 * The date as a corridor between constraints, not as a guess.
 *
 * Each bound is a piece of evidence that forbids a range; what survives between
 * them is the answer. Dropping one and watching the bracket widen is the
 * fastest way to show an archivist that the dating is derived rather than
 * asserted — so every bound is removable, and restoring it costs one click.
 */
export function DatingTab({ record }: { record: CaseFile }) {
  const t = useTranslations("editor.time");
  const tConstraints = useTranslations("capabilities.timelineDemo");

  const [dropped, setDropped] = useState<string[]>([]);
  const { range, constraints, peak } = record.dating;
  const span = range.to - range.from;
  const pct = (year: number) => ((year - range.from) / span) * 100;

  const bracket = useMemo(() => {
    const live = constraints.filter((c) => !dropped.includes(c.id));
    if (live.length === 0) return peak;
    const posts = live.filter((c) => c.rule === "post").map((c) => c.year);
    const antes = live.filter((c) => c.rule === "ante").map((c) => c.year);
    return {
      from: posts.length ? Math.max(...posts) : range.from,
      to: antes.length ? Math.min(...antes) : range.to,
    };
  }, [constraints, dropped, peak, range.from, range.to]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-[0.8125rem] leading-relaxed text-muted">{t("hint")}</p>

      {bracket ? (
        <>
          <div className="relative h-20 overflow-hidden rounded-lg border border-line bg-surface-2/70">
            <div aria-hidden className="texture-halftone absolute inset-0 text-muted-2/30" />

            {/* what the surviving bounds forbid */}
            <div
              className="absolute inset-y-0 left-0 bg-refuted-soft transition-[width] duration-500 [transition-timing-function:var(--ease-archival)]"
              style={{ width: `${pct(bracket.from)}%` }}
            />
            <div
              className="absolute inset-y-0 right-0 bg-refuted-soft transition-[width] duration-500 [transition-timing-function:var(--ease-archival)]"
              style={{ width: `${100 - pct(bracket.to)}%` }}
            />

            <div
              className="absolute inset-y-0 border-x-2 border-corroborated bg-corroborated-soft transition-[left,width] duration-500 [transition-timing-function:var(--ease-archival)]"
              style={{ left: `${pct(bracket.from)}%`, width: `${pct(bracket.to) - pct(bracket.from)}%` }}
            >
              <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 whitespace-nowrap text-center font-mono text-[0.625rem] font-semibold tabular-nums text-corroborated">
                {bracket.from}–{bracket.to}
              </span>
            </div>

            {constraints.map((constraint, i) => {
              const off = dropped.includes(constraint.id);
              return (
                <div
                  key={constraint.id}
                  className={cn(
                    "absolute inset-y-0 w-px transition-opacity duration-300",
                    off ? "bg-muted-2/30 opacity-40" : "bg-foreground-strong/45",
                  )}
                  style={{ left: `${pct(constraint.year)}%` }}
                >
                  {/* Bounds four years apart are four pixels apart on a
                      ninety-year scale, so the years are stepped down the wall
                      rather than laid on one line where they would overprint. */}
                  <span
                    className={cn(
                      "absolute whitespace-nowrap rounded-[3px] px-1 py-px font-mono text-[0.5rem]",
                      constraint.rule === "post" ? "left-0.5" : "right-0.5",
                      off
                        ? "bg-muted-2/40 text-background line-through"
                        : "bg-foreground-strong text-background",
                    )}
                    style={{ top: `${0.25 + (i % 3) * 0.85}rem` }}
                  >
                    {constraint.year}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-baseline justify-between font-mono text-[0.5625rem] tabular-nums text-muted-2">
            <span>{range.from}</span>
            <span className="text-[0.625rem] uppercase tracking-[0.1em] text-muted">
              {t("result")}: <span className="text-corroborated">{bracket.from}–{bracket.to}</span>
            </span>
            <span>{range.to}</span>
          </div>
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-line-strong bg-surface-2/40 px-3 py-6 text-center text-[0.8125rem] text-muted">
          {t("noBracket")}
        </p>
      )}

      {constraints.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {constraints.map((constraint) => {
            const off = dropped.includes(constraint.id);
            return (
              <li
                key={constraint.id}
                className={cn(
                  "flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-2 text-[0.6875rem] leading-snug transition-opacity duration-200",
                  off && "opacity-55",
                )}
              >
                <span className="font-mono tabular-nums text-evidence">{constraint.id}</span>
                <span
                  className={cn(
                    "font-mono text-[0.5625rem] uppercase tracking-[0.08em]",
                    off
                      ? "text-muted-2 line-through"
                      : constraint.rule === "post"
                        ? "text-corroborated"
                        : "text-review",
                  )}
                >
                  {tConstraints(constraint.rule)} {constraint.year}
                </span>
                <span className="min-w-0 flex-1 text-muted">
                  {tConstraints(`constraints.${constraint.key}`)}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setDropped((list) =>
                      off ? list.filter((id) => id !== constraint.id) : [...list, constraint.id],
                    )
                  }
                  title={off ? t("restore") : t("drop")}
                  className="ml-auto grid size-7 shrink-0 place-items-center rounded-md border border-line text-muted-2 transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  {off ? (
                    <RotateCcw aria-hidden className="size-3" strokeWidth={2} />
                  ) : (
                    <X aria-hidden className="size-3.5" strokeWidth={2.2} />
                  )}
                  <span className="sr-only">{off ? t("restore") : t("drop")}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[0.75rem] leading-relaxed text-muted-2">{t("noConstraints")}</p>
      )}

      {dropped.length > 0 && (
        <button
          type="button"
          onClick={() => setDropped([])}
          className="inline-flex h-8 w-fit items-center gap-1.5 rounded-lg px-2.5 text-[0.75rem] text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <RotateCcw aria-hidden className="size-3.5" strokeWidth={2} />
          {t("restore")} ({dropped.length} {t("removed")})
        </button>
      )}
    </div>
  );
}
