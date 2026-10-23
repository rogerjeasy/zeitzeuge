/**
 * The evaluation harness (§11).
 *
 * "Most hackathon teams demo one cherry-picked photo. We show a number, on a
 * held-out set, against a baseline." This screen is that number, and it has to
 * survive being clicked on: every figure below is either authored per stratum
 * or derived from those, never both, so the summary cannot disagree with the
 * breakdown it summarises.
 */

/** §11.1 — how the gold set is stratified. */
export type Stratum = "terrain" | "urban" | "interior" | "verso" | "hard";

export const STRATA: Stratum[] = ["terrain", "urban", "interior", "verso", "hard"];

export const GOLD_SET = {
  total: 150,
  /** Reserved, never looked at by anyone on the team — §11.1. */
  heldOut: 30,
  counts: { terrain: 46, urban: 38, interior: 18, verso: 31, hard: 17 } as Record<Stratum, number>,
  sources: [
    { key: "eth", count: 68, truthKey: "ethTruth" },
    { key: "commons", count: 42, truthKey: "commonsTruth" },
    { key: "stasz", count: 40, truthKey: "staszTruth" },
  ],
};

export type Unit = "percent" | "years" | "metres" | "usd" | "seconds" | "ratio";

export interface Metric {
  /** key under `evaluation.metrics.<id>` */
  id: string;
  unit: Unit;
  /** §11.2's target column. */
  target: number;
  higherIsBetter: boolean;
  /**
   * Measured per stratum. `null` means the metric is undefined there — the
   * geolocation error only exists where terrain actually solved, and averaging
   * a number into strata that never produced one would be a fabrication.
   */
  measured: Record<Stratum, number | null>;
  /** Marks the two §11.2 calls out as the ones the pitch leads with. */
  starred?: boolean;
}

export const METRICS: Metric[] = [
  {
    id: "municipality", unit: "percent", target: 80, higherIsBetter: true,
    measured: { terrain: 91, urban: 86, interior: 63, verso: 89, hard: 52 },
  },
  {
    id: "site", unit: "percent", target: 55, higherIsBetter: true,
    measured: { terrain: 68, urban: 57, interior: 38, verso: 61, hard: 24 },
  },
  {
    id: "geo", unit: "metres", target: 300, higherIsBetter: false,
    measured: { terrain: 140, urban: 260, interior: null, verso: 310, hard: 620 },
  },
  {
    id: "datingMae", unit: "years", target: 8, higherIsBetter: false,
    measured: { terrain: 6, urban: 8, interior: 13, verso: 3, hard: 16 },
  },
  {
    id: "datingHit", unit: "percent", target: 85, higherIsBetter: true,
    measured: { terrain: 89, urban: 86, interior: 76, verso: 95, hard: 70 },
  },
  {
    id: "coverage", unit: "percent", target: 90, higherIsBetter: true,
    measured: { terrain: 97, urban: 95, interior: 88, verso: 98, hard: 71 },
  },
  {
    id: "hallucination", unit: "percent", target: 0, higherIsBetter: false, starred: true,
    // Zero in every stratum is not a result we tuned for: a claim with no
    // supporting evidence row fails schema validation before it can be written
    // (§5.3), so the only way to move this number is to break the invariant.
    measured: { terrain: 0, urban: 0, interior: 0, verso: 0, hard: 0 },
  },
  {
    id: "ece", unit: "ratio", target: 0.08, higherIsBetter: false, starred: true,
    measured: { terrain: 0.05, urban: 0.06, interior: 0.11, verso: 0.04, hard: 0.13 },
  },
  {
    id: "abstentionPrecision", unit: "percent", target: 70, higherIsBetter: true,
    measured: { terrain: 79, urban: 74, interior: 68, verso: 81, hard: 86 },
  },
  {
    id: "minutesSaved", unit: "percent", target: 60, higherIsBetter: true,
    measured: { terrain: 71, urban: 68, interior: 52, verso: 78, hard: 41 },
  },
  {
    id: "cost", unit: "usd", target: 0.05, higherIsBetter: false,
    measured: { terrain: 0.052, urban: 0.041, interior: 0.034, verso: 0.047, hard: 0.078 },
  },
  {
    id: "latency", unit: "seconds", target: 120, higherIsBetter: false,
    // p95 per stratum. Pooling p95s by stratum weight is an approximation, not
    // a p95 over the whole set — close enough to report, wrong to call exact.
    measured: { terrain: 118, urban: 96, interior: 78, verso: 104, hard: 152 },
  },
];

/**
 * The value across the whole set, weighted by how many photographs each stratum
 * holds. Derived rather than authored: a hand-written total is the first thing
 * to fall out of step when a stratum changes.
 */
export function pooled(metric: Metric, strata: Stratum[] = STRATA) {
  let weight = 0;
  let sum = 0;
  for (const s of strata) {
    const value = metric.measured[s];
    if (value === null) continue;
    weight += GOLD_SET.counts[s];
    sum += value * GOLD_SET.counts[s];
  }
  return weight === 0 ? null : sum / weight;
}

/** How many photographs a selection of strata covers. */
export function photographs(strata: Stratum[] = STRATA) {
  return strata.reduce((n, s) => n + GOLD_SET.counts[s], 0);
}

export function meetsTarget(metric: Metric, value: number | null) {
  if (value === null) return null;
  // Rounded to the precision the screen prints, so a row can never show a
  // passing number next to a failing tick.
  const shown = Number(value.toFixed(metric.unit === "ratio" || metric.unit === "usd" ? 3 : 1));
  return metric.higherIsBetter ? shown >= metric.target : shown <= metric.target;
}

export const metric = (id: string) => METRICS.find((m) => m.id === id)!;

/* ── §11.3 the ablation ─────────────────────────────────────────────────── */

export interface AblationRow {
  /** key under `evaluation.configs.<id>` */
  id: string;
  municipality: number;
  datingMae: number;
  hallucination: number;
}

/**
 * The same held-out photographs through three configurations.
 *
 * Only A and B are stored. C is ZEITZEUGE, so its row is read straight off the
 * metric table above — the ablation's punchline and the metrics section are the
 * same measurement, and writing it twice is how they would come to disagree.
 */
const ABLATION_BASELINES: AblationRow[] = [
  { id: "single", municipality: 61, datingMae: 19, hallucination: 9.4 },
  { id: "noFalsification", municipality: 74, datingMae: 11, hallucination: 4.1 },
];

export function ablation(strata: Stratum[] = STRATA): AblationRow[] {
  return [
    ...ABLATION_BASELINES,
    {
      id: "full",
      municipality: pooled(metric("municipality"), strata) ?? 0,
      datingMae: pooled(metric("datingMae"), strata) ?? 0,
      hallucination: pooled(metric("hallucination"), strata) ?? 0,
    },
  ];
}

export const ABLATION_METRICS = ["municipality", "datingMae", "hallucination"] as const;

/** The run this page reports on. */
export const EVAL_RUN = {
  id: "eval_2026_09_22_c",
  images: 150,
  finishedDaysAgo: 0,
  /** §11.1 — the share nobody on the team has seen. */
  blindShare: 0.2,
};
