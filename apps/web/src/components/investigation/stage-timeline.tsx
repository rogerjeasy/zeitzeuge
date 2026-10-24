"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Clock } from "lucide-react";
import { STAGES, type CaseRun, type RunStageTiming } from "@/lib/api/investigation-types";
import { formatDuration, stageBars, withProduceStep } from "@/lib/investigation/timing";
import { cn } from "@/lib/cn";
import { ARCHIVE_TZ, intlLocale } from "./labels";
import { LiveElapsed } from "./timing";

const STATUS_KEYS = new Set(["succeeded", "failed", "running", "skipped", "cancelled"]);

/**
 * Where a run's time went (spec 2026-10-24 §6): one horizontal bar per stage,
 * in execution order, as wide as its share of the longest stage, labelled
 * with the stage and its duration. Model, tokens and cost open on hover, on
 * keyboard focus and on a tap — never hover-only — and are in the list's own
 * text for a screen reader, which hears an ordered list, not a picture.
 *
 * Renders nothing against an API that predates §6 (no `stages`, no duration).
 */
export function StageTimeline({ run }: { run: CaseRun }) {
  const t = useTranslations("investigation.timing.timeline");
  const ti = useTranslations("investigation");
  const intl = intlLocale(useLocale());
  const baseId = useId();
  const [pinned, setPinned] = useState<number | null>(null);

  const stages = withProduceStep(run.stages ?? [], run.finished_at);
  const hasTotals = typeof run.duration_ms === "number" || typeof run.wait_ms === "number";
  if (stages.length === 0 && !hasTotals) return null;

  const bars = stageBars(stages);
  const d = (ms: number | null | undefined) => formatDuration(ms, intl);
  const num = new Intl.NumberFormat(intl);
  const usd = new Intl.NumberFormat(intl, { style: "currency", currency: "USD", maximumFractionDigits: 3 });
  const pct = new Intl.NumberFormat(intl, { maximumFractionDigits: 0 });
  const clock = (iso: string) =>
    new Intl.DateTimeFormat(intl, { timeStyle: "medium", timeZone: ARCHIVE_TZ }).format(new Date(iso));
  const stageName = (s: string) => ((STAGES as readonly string[]).includes(s) ? ti(`stages.${s}`) : s);
  const runRunning = !run.finished_at && run.status === "running" && Boolean(run.started_at);

  const details = (s: RunStageTiming): { key: string; label: string; value: string }[] => {
    const rows: { key: string; label: string; value: string }[] = [];
    if (s.agent) {
      const roles = (s.acting_as ?? []).filter((r) => r && r !== s.agent);
      rows.push({
        key: "agent",
        label: t("agent"),
        value: roles.length ? `${s.agent} (${t("actingAs", { roles: roles.join(", ") })})` : s.agent,
      });
    }
    rows.push({ key: "model", label: t("model"), value: s.model ?? t("noModel") });
    if (s.input_tokens !== null || s.output_tokens !== null) {
      rows.push({
        key: "tokens",
        label: t("tokens"),
        value: t("tokensValue", { input: num.format(s.input_tokens ?? 0), output: num.format(s.output_tokens ?? 0) }),
      });
    }
    if (s.cost_usd !== null && s.cost_usd !== undefined) rows.push({ key: "cost", label: t("cost"), value: usd.format(s.cost_usd) });
    if (s.started_at) rows.push({ key: "start", label: t("start"), value: clock(s.started_at) });
    return rows;
  };

  return (
    <section
      aria-labelledby={`${baseId}-h`}
      className="flex min-w-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface"
    >
      <header className="border-b border-line px-4 py-3">
        <h2 id={`${baseId}-h`} className="flex items-center gap-1.5 font-display text-[1.0625rem] text-foreground-strong">
          <Clock aria-hidden className="size-4 text-muted" strokeWidth={2} />
          {t("title")}
        </h2>
        <p className="mt-1 text-[0.75rem] leading-relaxed text-muted">{t("hint")}</p>
      </header>

      {stages.length > 0 && (
        <ol aria-label={t("listLabel")} className="flex flex-col gap-1 px-2 py-2.5" onKeyDown={(e) => e.key === "Escape" && setPinned(null)}>
          {stages.map((s, i) => {
            const bar = bars[i];
            const failed = s.status === "failed";
            const running = s.status === "running" || (bar.durationMs === null && !s.ended_at && Boolean(s.started_at));
            const duration = d(bar.durationMs);
            const status = STATUS_KEYS.has(s.status) ? t(`status.${s.status}`) : s.status;
            const tipId = `${baseId}-tip-${i}`;
            const rows = details(s);
            const open = pinned === i;
            return (
              <li key={`${s.stage}-${i}`} className="group relative">
                <button
                  type="button"
                  aria-describedby={tipId}
                  aria-pressed={open}
                  onClick={() => setPinned(open ? null : i)}
                  className="grid w-full min-w-0 grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-2/70 focus-visible:bg-surface-2/70 sm:grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto]"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[0.75rem] font-medium text-foreground">
                      <span className="sr-only">{t("position", { n: i + 1, total: stages.length })} </span>
                      {stageName(s.stage)}
                    </span>
                    {/* A running stage says so in its live counter; only the other exceptions get a status line. */}
                    {(failed || s.status === "skipped" || s.status === "cancelled") && (
                      <span className={cn("truncate font-mono text-[0.5625rem] uppercase tracking-[0.06em]", failed ? "text-refuted" : "text-muted")}>
                        {status}
                      </span>
                    )}
                  </span>
                  <span aria-hidden className="relative h-2.5 min-w-0 overflow-hidden rounded-full bg-line/60">
                    <span
                      className={cn(
                        "absolute inset-y-0 left-0 rounded-full",
                        failed ? "bg-refuted" : running ? "animate-pulse bg-evidence/70" : "bg-evidence",
                      )}
                      style={{ width: `${running && bar.widthPct === 0 ? 6 : bar.widthPct}%` }}
                    />
                  </span>
                  <span className="whitespace-nowrap text-right font-mono text-[0.6875rem] tabular-nums text-foreground">
                    {duration ??
                      (running && s.started_at ? <LiveElapsed startedAt={s.started_at} className="text-evidence" /> : "—")}
                    {bar.sharePct !== null && (
                      <span className="sr-only"> ({t("share", { value: pct.format(bar.sharePct) })})</span>
                    )}
                  </span>
                </button>
                {/*
                  The details: shown on hover, on focus within, and pinned by a
                  tap (touch has no hover, and Safari does not focus a tapped
                  button). The button's description, so a screen reader hears
                  model, tokens and cost on focus even while it is hidden.
                */}
                <div
                  id={tipId}
                  className={cn(
                    "bg-ink-panel rounded-lg px-3 py-2 text-ink-panel-fg",
                    // Pinned: in the flow, so it pushes the next stages down instead of covering them.
                    open
                      ? "mx-2 mb-1 mt-0.5 block"
                      : "absolute left-2 right-2 top-full z-20 mt-0.5 hidden shadow-lift group-hover:block group-focus-within:block sm:left-auto sm:w-[18rem]",
                  )}
                >
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[0.6875rem]">
                    {rows.map((r) => (
                      <div key={r.key} className="contents">
                        <dt className="text-ink-panel-muted">{r.label}</dt>
                        <dd className="min-w-0 font-mono text-ink-panel-fg [overflow-wrap:anywhere]">{r.value}</dd>
                      </div>
                    ))}
                    {bar.sharePct !== null && (
                      <div className="contents">
                        <dt className="text-ink-panel-muted">{t("shareLabel")}</dt>
                        <dd className="font-mono tabular-nums text-ink-panel-fg">{pct.format(bar.sharePct)} %</dd>
                      </div>
                    )}
                    {failed && (
                      <div className="contents">
                        <dt className="text-ink-panel-muted">{t("statusLabel")}</dt>
                        <dd className="text-refuted">{status}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 border-t border-line px-4 py-3 text-[0.75rem]">
        {run.queued_at && (
          <>
            <dt className="text-muted">{t("queuedAt")}</dt>
            <dd className="font-mono tabular-nums text-foreground">{clock(run.queued_at)}</dd>
          </>
        )}
        <dt className="text-muted">{t("wait")}</dt>
        <dd className="font-mono tabular-nums text-foreground">{d(run.wait_ms) ?? "—"}</dd>
        <dt className="font-medium text-foreground">{t("total")}</dt>
        <dd className="font-mono font-semibold tabular-nums text-foreground-strong">
          {d(run.duration_ms) ??
            (runRunning && run.started_at ? <LiveElapsed startedAt={run.started_at} className="text-evidence" /> : "—")}
        </dd>
      </dl>
    </section>
  );
}
