"use client";

import { useLocale, useTranslations } from "next-intl";
import { Clock, Hourglass, Timer } from "lucide-react";
import type { BatchAsset, BatchTiming } from "@/lib/api/investigation-types";
import { DEFAULT_CONCURRENCY, elapsed, estimateRemaining, formatClock, formatDuration } from "@/lib/investigation/timing";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/cn";
import { ARCHIVE_TZ, intlLocale } from "./labels";

/**
 * Timing on the batch view (spec 2026-10-24 §6): the per-row duration or live
 * counter, and the header's «Zeit» card. Every field is optional on the wire,
 * so against an API that predates §6 both simply render nothing.
 */

/** «läuft seit 0:42», ticking off the page's one shared clock. Only this span re-renders. */
export function LiveElapsed({ startedAt, className }: { startedAt: string; className?: string }) {
  const t = useTranslations("investigation.timing");
  const now = useNow();
  const clock = now === null ? null : formatClock(elapsed(startedAt, now));
  return (
    <span className={cn("whitespace-nowrap", className)}>{clock ? t("running", { clock }) : t("runningNoClock")}</span>
  );
}

const isRunning = (asset: BatchAsset): asset is BatchAsset & { started_at: string } =>
  Boolean(asset.started_at) && !asset.finished_at && asset.run_status === "running";

/**
 * The row's timing line: the duration once finished, the live counter while
 * running, nothing while queued. The wait sits beside it, quieter; the exact
 * times are in the tooltip.
 */
export function RowTiming({ asset }: { asset: BatchAsset }) {
  const t = useTranslations("investigation.timing");
  const intl = intlLocale(useLocale());
  const duration = formatDuration(asset.duration_ms, intl);
  const running = !duration && isRunning(asset);
  if (!duration && !running) return null;

  const wait = formatDuration(asset.wait_ms, intl);
  const clock = (iso: string) =>
    new Intl.DateTimeFormat(intl, { timeStyle: "medium", timeZone: ARCHIVE_TZ }).format(new Date(iso));
  const title = [
    asset.queued_at && t("queuedAt", { time: clock(asset.queued_at) }),
    asset.started_at && t("startedAt", { time: clock(asset.started_at) }),
    asset.finished_at && t("finishedAt", { time: clock(asset.finished_at) }),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <p
      className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[0.625rem] tabular-nums text-muted"
      title={title || undefined}
    >
      <Timer aria-hidden className="size-3 shrink-0" strokeWidth={2} />
      {duration ? (
        <span className="whitespace-nowrap text-foreground">
          <span className="sr-only">{t("durationLabel")} </span>
          {duration}
        </span>
      ) : (
        isRunning(asset) && <LiveElapsed startedAt={asset.started_at} className="text-evidence" />
      )}
      {wait && (
        <span className="whitespace-nowrap text-muted-2">
          <span aria-hidden>· </span>
          {t("wait", { value: wait })}
        </span>
      )}
    </p>
  );
}

/**
 * The header's «Zeit» card: Ø, Median, schnellste / langsamste, Gesamtdauer,
 * Fotos pro Stunde — and, while photos are still open, «Restzeit ca. …»,
 * marked as an estimate. Hidden when the API sends no timing or nothing has
 * finished yet: an empty card would only say «—» six times.
 */
export function BatchTimingCard({ timing, open }: { timing: BatchTiming | null | undefined; open: number }) {
  const t = useTranslations("investigation.timing.card");
  const intl = intlLocale(useLocale());
  const running = open > 0;
  // While photos are open, «Gesamtdauer bisher» keeps counting from the first start.
  const now = useNow(running && Boolean(timing?.first_started_at));
  if (!timing || !(timing.finished > 0)) return null;

  const d = (ms: number | null | undefined) => formatDuration(ms, intl) ?? "—";
  const live = running && now !== null ? elapsed(timing.first_started_at, now) : null;
  const wall = live !== null ? Math.max(live, timing.wall_ms ?? 0) : timing.wall_ms;
  const remaining = running ? estimateRemaining(open, timing.median_ms, DEFAULT_CONCURRENCY) : null;
  const perHour =
    timing.per_hour === null || timing.per_hour === undefined
      ? null
      : new Intl.NumberFormat(intl, { maximumFractionDigits: 1 }).format(timing.per_hour);

  const cells: { key: string; label: string; value: string; note?: string; wide?: boolean }[] = [
    { key: "mean", label: t("mean"), value: d(timing.mean_ms) },
    { key: "median", label: t("median"), value: d(timing.median_ms) },
    {
      key: "range",
      label: t("range"),
      value: `${d(timing.min_ms)} / ${d(timing.max_ms)}`,
      wide: true,
    },
    { key: "wall", label: running ? t("wallRunning") : t("wall"), value: d(wall) },
    {
      key: "perHour",
      label: t("perHour"),
      value: perHour ?? "—",
      note: perHour === null ? t("perHourPending") : undefined,
    },
  ];

  return (
    <section
      aria-labelledby="batch-timing-heading"
      className="min-w-0 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line px-3.5 py-2.5">
        <h2
          id="batch-timing-heading"
          className="flex items-center gap-1.5 font-display text-[0.9375rem] font-semibold text-foreground-strong"
        >
          <Clock aria-hidden className="size-4 text-muted" strokeWidth={2} />
          {t("title")}
        </h2>
        <p className="text-[0.6875rem] text-muted">{t("basis", { count: timing.finished })}</p>
      </header>
      <dl className="grid grid-cols-2 gap-px bg-line md:grid-cols-5">
        {cells.map((cell) => (
          <div
            key={cell.key}
            className={cn("flex min-w-0 flex-col justify-between gap-1 bg-surface px-3 py-3", cell.wide && "col-span-2 md:col-span-1")}
          >
            <dt className="text-[0.6875rem] leading-tight text-muted [overflow-wrap:anywhere]">{cell.label}</dt>
            <dd className="font-display text-[1.125rem] font-semibold leading-tight tabular-nums tracking-[-0.01em] text-foreground-strong">
              {cell.value}
              {cell.note && (
                <span className="mt-0.5 block font-sans text-[0.6875rem] font-normal tracking-normal text-muted">
                  {cell.note}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {remaining !== null && remaining > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line bg-surface-2/50 px-3.5 py-2.5">
          <Hourglass aria-hidden className="size-4 shrink-0 text-muted" strokeWidth={2} />
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[0.8125rem] text-foreground">
            <span>{t("remaining")}</span>
            <span className="font-display text-[1.0625rem] font-semibold tabular-nums text-foreground-strong">
              {d(remaining)}
            </span>
            <span className="rounded-full border border-line-strong bg-surface px-2 py-0.5 font-mono text-[0.5625rem] font-medium uppercase tracking-[0.08em] text-muted">
              {t("estimate")}
            </span>
          </p>
          <p className="min-w-0 flex-[1_1_16rem] text-[0.6875rem] text-muted">
            {t("remainingHint", { count: open, lanes: DEFAULT_CONCURRENCY })}
          </p>
        </div>
      )}
    </section>
  );
}
