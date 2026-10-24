import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { RunStageTiming } from "../../api/investigation-types";
import {
  MIN_BAR_PCT,
  elapsed,
  estimateRemaining,
  formatClock,
  formatDuration,
  stageBars,
  stageDuration,
  withProduceStep,
} from "../timing";

describe("formatDuration", () => {
  it("reads like the spec: «42 s», «1 min 28 s», «1 h 05 min»", () => {
    assert.equal(formatDuration(42_000, "de-CH"), "42 s");
    assert.equal(formatDuration(88_100, "de-CH"), "1 min 28 s");
    assert.equal(formatDuration(3_900_000, "de-CH"), "1 h 05 min");
  });

  it("keeps one decimal under ten seconds, in the locale's own decimal mark", () => {
    assert.equal(formatDuration(4_240, "de-CH"), "4.2 s");
    assert.equal(formatDuration(4_240, "fr-CH"), "4,2 s");
    assert.equal(formatDuration(4_240, "en-GB"), "4.2 s");
    assert.equal(formatDuration(0, "de-CH"), "0 s");
  });

  it("rounds once, to the unit shown, and carries over", () => {
    assert.equal(formatDuration(9_960, "de-CH"), "10 s");
    assert.equal(formatDuration(59_600, "de-CH"), "1 min");
    assert.equal(formatDuration(180_000, "de-CH"), "3 min");
    assert.equal(formatDuration(3_599_600, "de-CH"), "1 h 00 min");
    assert.equal(formatDuration(2 * 3_600_000 + 29 * 60_000 + 40_000, "de-CH"), "2 h 30 min");
  });

  it("says nothing for a missing, negative or broken value", () => {
    assert.equal(formatDuration(null, "de-CH"), null);
    assert.equal(formatDuration(undefined, "de-CH"), null);
    assert.equal(formatDuration(-1, "de-CH"), null);
    assert.equal(formatDuration(Number.NaN, "de-CH"), null);
  });
});

describe("formatClock", () => {
  it("ticks as m:ss, then h:mm:ss", () => {
    assert.equal(formatClock(42_900), "0:42");
    assert.equal(formatClock(725_000), "12:05");
    assert.equal(formatClock(3_723_000), "1:02:03");
    assert.equal(formatClock(null), null);
  });
});

describe("elapsed", () => {
  const start = "2026-10-24T05:00:00Z";
  it("counts from the start, as a number or a Date", () => {
    assert.equal(elapsed(start, Date.parse(start) + 42_000), 42_000);
    assert.equal(elapsed(start, new Date(Date.parse(start) + 1_000)), 1_000);
  });
  it("never goes negative when the server clock runs ahead", () => {
    assert.equal(elapsed(start, Date.parse(start) - 900), 0);
  });
  it("is null without a usable start", () => {
    assert.equal(elapsed(null, Date.now()), null);
    assert.equal(elapsed("not a date", Date.now()), null);
  });
});

describe("estimateRemaining", () => {
  it("is remaining × median ÷ four parallel runs by default", () => {
    assert.equal(estimateRemaining(10, 88_000), 220_000);
    assert.equal(estimateRemaining(10, 88_000, 1), 880_000);
  });
  it("is 0 when nothing is left and null without a median", () => {
    assert.equal(estimateRemaining(0, 88_000), 0);
    assert.equal(estimateRemaining(5, null), null);
    assert.equal(estimateRemaining(5, 0), null);
  });
  it("treats a nonsense concurrency as one lane", () => {
    assert.equal(estimateRemaining(3, 1_000, 0), 3_000);
    assert.equal(estimateRemaining(3, 1_000, Number.NaN), 3_000);
  });
});

const stage = (over: Partial<RunStageTiming>): RunStageTiming => ({
  stage: "perception",
  agent: "scene",
  acting_as: null,
  status: "succeeded",
  started_at: null,
  ended_at: null,
  duration_ms: null,
  model: null,
  input_tokens: null,
  output_tokens: null,
  cost_usd: null,
  ...over,
});

describe("stageDuration / stageBars", () => {
  it("falls back to start and end when the API gives no duration", () => {
    assert.equal(stageDuration(stage({ duration_ms: 1_200 })), 1_200);
    assert.equal(
      stageDuration(stage({ started_at: "2026-10-24T05:00:00Z", ended_at: "2026-10-24T05:00:03.5Z" })),
      3_500,
    );
    assert.equal(stageDuration(stage({ started_at: "2026-10-24T05:00:00Z" })), null);
  });

  it("sizes bars against the longest stage, shares against the sum", () => {
    const bars = stageBars([
      stage({ duration_ms: 10_000 }),
      stage({ duration_ms: 30_000 }),
      stage({ duration_ms: 100 }),
      stage({}),
    ]);
    assert.deepEqual(
      bars.map((b) => Math.round(b.widthPct * 10) / 10),
      [33.3, 100, MIN_BAR_PCT, 0],
    );
    assert.equal(Math.round(bars[1].sharePct! * 10) / 10, 74.8);
    assert.equal(bars[3].sharePct, null);
    assert.equal(bars[3].durationMs, null);
  });

  it("draws nothing when no stage has a duration", () => {
    assert.deepEqual(stageBars([stage({}), stage({})]).map((b) => b.widthPct), [0, 0]);
    assert.deepEqual(stageBars([]), []);
  });
});

describe("withProduceStep", () => {
  const listed = [stage({ stage: "adjudicate", ended_at: "2026-10-24T05:01:20Z", duration_ms: 5_000 })];
  it("adds the produce step from the last stage's end to the run's finish", () => {
    const all = withProduceStep(listed, "2026-10-24T05:01:22.4Z");
    assert.equal(all.length, 2);
    assert.equal(all[1].stage, "produce");
    assert.equal(all[1].duration_ms, 2_400);
    assert.equal(listed.length, 1, "the input is left alone");
  });
  it("adds nothing when the run is unfinished, already lists it, or the times disagree", () => {
    assert.equal(withProduceStep(listed, null).length, 1);
    assert.equal(withProduceStep(listed, "2026-10-24T05:01:00Z").length, 1);
    assert.equal(withProduceStep([...listed, stage({ stage: "produce" })], "2026-10-24T05:02:00Z").length, 2);
    assert.equal(withProduceStep([], "2026-10-24T05:02:00Z").length, 0);
  });
});
