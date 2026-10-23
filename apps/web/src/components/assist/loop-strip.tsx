"use client";

import { useTranslations } from "next-intl";
import { ArrowRight, Gavel, MessageSquare, Scale, Send } from "lucide-react";

const STEPS = [
  { key: "published", icon: Send },
  { key: "tip", icon: MessageSquare },
  { key: "crossExamined", icon: Scale },
  { key: "settled", icon: Gavel },
] as const;

/**
 * The loop, stated before any of its contents.
 *
 * Everything below this strip is an instance of these four steps, and the third
 * one is the whole argument: a tip does not skip the cross-examination because
 * a human sent it. Said once here, the rest of the page can just be evidence.
 */
export function LoopStrip() {
  const t = useTranslations("assist.loop");

  return (
    <section
      aria-labelledby="loop-heading"
      className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5"
    >
      <h2
        id="loop-heading"
        className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground-strong"
      >
        {t("title")}
      </h2>

      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STEPS.map(({ key, icon: Icon }, i) => (
          <li key={key} className="relative flex gap-3 rounded-lg border border-line bg-surface-2/40 p-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-evidence-soft text-evidence">
              <Icon aria-hidden className="size-4" strokeWidth={1.9} />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="flex items-baseline gap-1.5">
                <span className="font-mono text-[0.5625rem] tabular-nums text-muted-2">{i + 1}</span>
                <span className="text-[0.8125rem] font-medium text-foreground-strong">{t(key)}</span>
              </span>
              <span className="text-[0.75rem] leading-relaxed text-muted">{t(`${key}Body`)}</span>
            </div>

            {/* the connector exists only where the steps actually sit in a row */}
            {i < STEPS.length - 1 && (
              <ArrowRight
                aria-hidden
                className="absolute -right-[13px] top-1/2 hidden size-3.5 -translate-y-1/2 text-line-strong xl:block"
                strokeWidth={2}
              />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
