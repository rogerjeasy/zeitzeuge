"use client";

import { useTranslations } from "next-intl";
import { ChevronsUp, ChevronUp, Minus } from "lucide-react";
import type { GainReason } from "@/lib/data/queue";
import { cn } from "@/lib/cn";

/**
 * Why this item is where it is.
 *
 * The queue order is itself a claim, and this product's whole position is that
 * a claim names its evidence. A bare rank would ask for exactly the trust the
 * rest of the system refuses to ask for.
 */
export function GainBadge({
  gain,
  reason,
  reasonCount,
  waitingDays,
}: {
  gain: number;
  reason: GainReason;
  reasonCount?: number;
  waitingDays: number;
}) {
  const t = useTranslations("queue");

  const band = gain >= 0.7 ? "high" : gain >= 0.4 ? "medium" : "low";
  const tone = {
    high: "bg-review-soft text-review",
    medium: "bg-evidence-soft text-evidence",
    low: "bg-surface-2 text-muted",
  }[band];
  const Icon = { high: ChevronsUp, medium: ChevronUp, low: Minus }[band];
  const label = t(band === "high" ? "gainHigh" : band === "medium" ? "gainMedium" : "gainLow");

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.08em]",
          tone,
        )}
      >
        <Icon aria-hidden className="size-2.5" strokeWidth={2.6} />
        {label}
      </span>
      <span className="text-[0.75rem] leading-snug text-muted">
        {t(`reasons.${reason}`, { count: reasonCount ?? 0, days: waitingDays })}
      </span>
    </span>
  );
}
