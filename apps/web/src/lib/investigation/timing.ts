/**
 * How long a photograph took (spec 2026-10-24 batch management §6), as pure
 * functions: the duration text, the live elapsed clock, the «Restzeit»
 * estimate and the review screen's stage-bar widths.
 *
 * No React, no Next, no clock of its own: `now` is always passed in, so the
 * table's single shared ticker, the server render and the unit tests all get
 * the same answer for the same input.
 */

import type { RunStageTiming } from "../api/investigation-types";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

/** The batch worker's parallel runs; the estimate divides by this. */
export const DEFAULT_CONCURRENCY = 4;

const usable = (ms: number | null | undefined): ms is number =>
  typeof ms === "number" && Number.isFinite(ms) && ms >= 0;

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * «4.2 s» · «42 s» · «1 min 28 s» · «3 min» · «1 h 05 min».
 *
 * `locale` is a BCP 47 tag (`de-CH`, `fr-CH`, `en-GB`); it only decides the
 * decimal mark under ten seconds, since min / s / h read the same in all
 * three languages. Rounds once, to the unit shown, so 59.6 s is «1 min», not
 * «60 s». `null` for a missing or negative value: the caller shows «—».
 */
export function formatDuration(ms: number | null | undefined, locale: string): string | null {
  if (!usable(ms)) return null;
  if (ms < 10 * SECOND - 50) {
    const seconds = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(ms / SECOND);
    return `${seconds} s`;
  }
  const totalSeconds = Math.round(ms / SECOND);
  if (totalSeconds < 60) return `${totalSeconds} s`;
  if (totalSeconds < 3_600) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds ? `${minutes} min ${seconds} s` : `${minutes} min`;
  }
  const totalMinutes = Math.round(ms / MINUTE);
  return `${Math.floor(totalMinutes / 60)} h ${pad2(totalMinutes % 60)} min`;
}

/** The running clock: «0:42», «12:05», «1:02:03». Whole seconds, rounded down. */
export function formatClock(ms: number | null | undefined): string | null {
  if (!usable(ms)) return null;
  const total = Math.floor(ms / SECOND);
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  return hours ? `${hours}:${pad2(minutes)}:${pad2(seconds)}` : `${minutes}:${pad2(seconds)}`;
}

const parse = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/**
 * Milliseconds since `startedAt`, never negative: a server clock a second
 * ahead of the browser reads «0:00», not «-0:01». `null` without a start.
 */
export function elapsed(startedAt: string | null | undefined, now: number | Date): number | null {
  const start = parse(startedAt);
  if (start === null) return null;
  const at = typeof now === "number" ? now : now.getTime();
  return Number.isFinite(at) ? Math.max(0, at - start) : null;
}

/**
 * «Restzeit ca. …»: remaining photos × median ÷ parallel runs (spec §6). An
 * estimate, and labelled as one on screen. `0` when nothing is left, `null`
 * when there is no median yet to estimate from.
 */
export function estimateRemaining(
  remainingCount: number,
  medianMs: number | null | undefined,
  concurrency: number = DEFAULT_CONCURRENCY,
): number | null {
  if (!Number.isFinite(remainingCount) || remainingCount <= 0) return 0;
  if (!usable(medianMs) || medianMs === 0) return null;
  const lanes = Math.max(1, Math.floor(Number.isFinite(concurrency) ? concurrency : 1));
  return Math.round((remainingCount * medianMs) / lanes);
}

type StageLike = Pick<RunStageTiming, "duration_ms" | "started_at" | "ended_at">;

/** A stage's duration: the API's figure, else its own start and end, else `null` (still running). */
export function stageDuration(stage: StageLike): number | null {
  if (usable(stage.duration_ms)) return stage.duration_ms;
  const start = parse(stage.started_at);
  const end = parse(stage.ended_at);
  return start !== null && end !== null && end >= start ? end - start : null;
}

export type StageBar = {
  durationMs: number | null;
  /** Bar width in % of the track: proportional to the duration, the longest stage fills it. */
  widthPct: number;
  /** Share of the summed stage time, in %; `null` when no stage has a duration. */
  sharePct: number | null;
};

/** The smallest visible bar, so a 0.2 s stage is still a mark, not nothing. */
export const MIN_BAR_PCT = 2;

/**
 * One bar per stage, in the order given. Widths are relative to the longest
 * stage (the longest fills the track), so the bars stay comparable with each
 * other while the screen is narrow; the share of the total is reported apart.
 */
export function stageBars(stages: readonly StageLike[], minPct: number = MIN_BAR_PCT): StageBar[] {
  const durations = stages.map(stageDuration);
  const known = durations.filter((d): d is number => d !== null);
  const max = known.length ? Math.max(...known) : 0;
  const sum = known.reduce((a, b) => a + b, 0);
  return durations.map((d) => ({
    durationMs: d,
    widthPct: d === null || max === 0 ? 0 : Math.max(minPct, Math.min(100, (d / max) * 100)),
    sharePct: d === null || sum === 0 ? null : (d / sum) * 100,
  }));
}

/**
 * The contract lists the investigation stages; «the produce step is the
 * run's finished_at». This appends it as a stage of its own — last stage's
 * end → the run's finish — when both are known and the API has not already
 * listed it, so the timeline accounts for the whole run.
 */
export function withProduceStep(
  stages: readonly RunStageTiming[],
  finishedAt: string | null | undefined,
): RunStageTiming[] {
  const list = [...stages];
  if (list.length === 0 || list.some((s) => s.stage === "produce")) return list;
  const last = list[list.length - 1];
  const from = parse(last.ended_at);
  const to = parse(finishedAt);
  if (from === null || to === null || to < from) return list;
  list.push({
    stage: "produce",
    agent: null,
    acting_as: null,
    status: "succeeded",
    started_at: last.ended_at,
    ended_at: finishedAt ?? null,
    duration_ms: to - from,
    model: null,
    input_tokens: null,
    output_tokens: null,
    cost_usd: null,
  });
  return list;
}
