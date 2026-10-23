"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Pause, Play, RotateCcw } from "lucide-react";
import { EVENTS, RUN_SECONDS } from "@/lib/data/theater";
import { cn } from "@/lib/cn";

const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

/**
 * Play, pause, scrub.
 *
 * The scrubber is the point: a run that can only be watched is a video, and a
 * judge who wants to look again at the six seconds where the red team objects
 * should not have to sit through the ninety that precede them. Ledger rows are
 * ticked onto the track so those moments are findable without hunting.
 */
export function TransportBar({
  t,
  playing,
  speed,
  onSeek,
  onToggle,
  onRestart,
  onSpeed,
}: {
  t: number;
  playing: boolean;
  speed: Speed;
  onSeek: (next: number) => void;
  onToggle: () => void;
  onRestart: () => void;
  onSpeed: (next: Speed) => void;
}) {
  const tr = useTranslations("theater");
  const id = useId();
  const ended = t >= RUN_SECONDS;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-[var(--radius-card)] border border-line bg-surface px-3 py-2.5 sm:px-4">
      <button
        type="button"
        onClick={onToggle}
        title={playing ? tr("transport.pause") : tr("transport.play")}
        className="grid size-9 shrink-0 place-items-center rounded-lg bg-foreground text-background transition-colors hover:bg-foreground-strong"
      >
        {playing ? (
          <Pause aria-hidden className="size-4" strokeWidth={2.2} />
        ) : (
          <Play aria-hidden className="size-4" strokeWidth={2.2} />
        )}
        <span className="sr-only">{playing ? tr("transport.pause") : tr("transport.play")}</span>
      </button>

      <button
        type="button"
        onClick={onRestart}
        title={tr("transport.restart")}
        className="grid size-9 shrink-0 place-items-center rounded-lg border border-line-strong text-muted transition-colors hover:border-evidence hover:text-evidence"
      >
        <RotateCcw aria-hidden className="size-3.5" strokeWidth={2} />
        <span className="sr-only">{tr("transport.restart")}</span>
      </button>

      <span className="shrink-0 font-mono text-[0.8125rem] tabular-nums text-foreground-strong">
        {String(Math.floor(t)).padStart(2, "0")}
        <span className="text-muted-2">/{RUN_SECONDS}s</span>
      </span>

      <div className="relative flex min-w-0 flex-1 basis-48 flex-col justify-center">
        <label htmlFor={id} className="sr-only">
          {tr("transport.scrub")}
        </label>
        <input
          id={id}
          type="range"
          min={0}
          max={RUN_SECONDS}
          step={1}
          value={Math.round(t)}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="zz-range h-5 w-full cursor-pointer appearance-none bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-evidence/25"
          style={{ "--pct": `${(t / RUN_SECONDS) * 100}%` } as React.CSSProperties}
        />

        {/* ledger rows, as findable marks on the track */}
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-3 -translate-y-1/2">
          {EVENTS.filter((e) => e.kind !== "note").map((e) => (
            <span
              key={e.id}
              className={cn(
                "absolute top-1/2 h-2 w-px -translate-y-1/2",
                e.kind === "objection"
                  ? "bg-refuted"
                  : e.kind === "verdict"
                    ? "bg-corroborated"
                    : "bg-foreground-strong/40",
              )}
              style={{ left: `${(e.t / RUN_SECONDS) * 100}%` }}
            />
          ))}
        </span>
      </div>

      <div
        role="group"
        aria-label={tr("transport.speed")}
        className="flex shrink-0 rounded-lg border border-line p-0.5"
      >
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSpeed(s)}
            aria-pressed={speed === s}
            className={cn(
              "h-7 rounded-md px-2 font-mono text-[0.6875rem] tabular-nums transition-colors",
              speed === s ? "bg-foreground text-background" : "text-muted hover:text-foreground",
            )}
          >
            {s}×
          </button>
        ))}
      </div>

      <span
        aria-live="polite"
        className={cn(
          "shrink-0 font-mono text-[0.5625rem] uppercase tracking-[0.1em]",
          ended ? "text-corroborated" : playing ? "text-evidence" : "text-muted-2",
        )}
      >
        {ended ? tr("transport.ended") : playing ? tr("transport.live") : ""}
      </span>
    </div>
  );
}
