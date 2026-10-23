/**
 * Demo figures for the dashboard. Shapes match what the API in §9.3 will
 * return, so wiring this to real endpoints is a fetch, not a refactor.
 */

/** §9.2: "review queue depth". The screen opens on this. */
export const REVIEW_QUEUE = {
  waiting: 12,
  avgSecondsPerItem: 40,
  oldestDays: 3,
  /** Above this confidence the archivist has set bulk-accept. */
  autoAcceptThreshold: 0.92,
};

export type StatFormat = "count" | "percent" | "currency";

export interface Stat {
  /** key under `dashboard.stats.*` */
  id: string;
  value: number;
  format: StatFormat;
  /** Change against the previous period, in the same unit. */
  delta?: number;
  /** For currency: the ceiling it is measured against. */
  of?: number;
  /** Whether a rising number is the good direction. */
  higherIsBetter: boolean;
}

export const STATS: Stat[] = [
  { id: "catalogued", value: 1284, format: "count", delta: 112, higherIsBetter: true },
  { id: "precision", value: 94.1, format: "percent", delta: 0.8, higherIsBetter: true },
  { id: "override", value: 8.6, format: "percent", delta: -1.9, higherIsBetter: false },
  { id: "cost", value: 214, format: "currency", of: 2000, higherIsBetter: false },
];

/**
 * Fourteen days of the two numbers that matter: precision on emitted fields,
 * and how often a human had to correct us. §10.6 calls `human_override_rate`
 * the product's true north — it should fall.
 */
export interface TrendPoint {
  day: string;
  precision: number;
  override: number;
}

export const TREND: TrendPoint[] = [
  { day: "2026-09-09", precision: 89.2, override: 14.8 },
  { day: "2026-09-10", precision: 89.9, override: 14.1 },
  { day: "2026-09-11", precision: 90.4, override: 13.6 },
  { day: "2026-09-12", precision: 90.1, override: 13.9 },
  { day: "2026-09-13", precision: 91.3, override: 12.7 },
  { day: "2026-09-14", precision: 91.8, override: 12.2 },
  { day: "2026-09-15", precision: 92.0, override: 11.9 },
  { day: "2026-09-16", precision: 92.6, override: 11.1 },
  { day: "2026-09-17", precision: 92.4, override: 11.4 },
  { day: "2026-09-18", precision: 93.1, override: 10.3 },
  { day: "2026-09-19", precision: 93.4, override: 9.8 },
  { day: "2026-09-20", precision: 93.6, override: 9.4 },
  { day: "2026-09-21", precision: 93.9, override: 8.9 },
  { day: "2026-09-22", precision: 94.1, override: 8.6 },
];

export type RunStatus = "running" | "review" | "accepted" | "abstained" | "failed";

export interface Run {
  id: string;
  signature: string;
  /** key under `archive.photos.*`, reused from the landing page's set */
  photoKey: string;
  src: string;
  collection: string;
  status: RunStatus;
  confidence?: number;
  /** Wall-clock seconds the pipeline took. */
  seconds: number;
  costUsd: number;
  /** Minutes ago. Rendered relative so the demo never looks stale. */
  minutesAgo: number;
}

export const RECENT_RUNS: Run[] = [
  { id: "run_01JBQ7", signature: "StASZ Ansichtskarten/0042", photoKey: "brunnenMythen", src: "/archive/brunnen-mythen.jpg", collection: "Ansichtskarten", status: "review", confidence: 0.71, seconds: 94, costUsd: 0.21, minutesAgo: 4 },
  { id: "run_01JBQ6", signature: "StASZ Foto/Bettschart/0117", photoKey: "goldau", src: "/archive/goldau-mythen.jpg", collection: "Bettschart", status: "accepted", confidence: 0.93, seconds: 61, costUsd: 0.08, minutesAgo: 12 },
  { id: "run_01JBQ5", signature: "StASZ Foto/Bettschart/0308", photoKey: "einsiedeln", src: "/archive/einsiedeln-kloster.jpg", collection: "Bettschart", status: "accepted", confidence: 0.97, seconds: 48, costUsd: 0.06, minutesAgo: 27 },
  { id: "run_01JBQ4", signature: "StASZ Ansichtskarten/0455", photoKey: "axenstein", src: "/archive/brunnen-axenstein.jpg", collection: "Ansichtskarten", status: "running", seconds: 38, costUsd: 0.04, minutesAgo: 0 },
  { id: "run_01JBQ3", signature: "StASZ Ansichtskarten/1204", photoKey: "quai", src: "/archive/brunnen-quai.jpg", collection: "Ansichtskarten", status: "abstained", seconds: 112, costUsd: 0.26, minutesAgo: 44 },
  { id: "run_01JBQ2", signature: "StASZ Foto/Bettschart/0091", photoKey: "treib", src: "/archive/treib-mythen.jpg", collection: "Bettschart", status: "accepted", confidence: 0.88, seconds: 57, costUsd: 0.07, minutesAgo: 58 },
];

/** §12: the cost model, measured against the hackathon credit. */
export const COST = {
  spentUsd: 214,
  budgetUsd: 2000,
  perImageUsd: 0.167,
  /** Share of runs resolved by the cheap first pass (§5.4 M1). */
  fastPassShare: 0.62,
  standardShare: 0.29,
  deepShare: 0.09,
};

export const ARCHIVES = [
  { id: "stasz", name: "Staatsarchiv Schwyz", short: "SZ", records: 1284 },
  { id: "ingenbohl", name: "Gemeindearchiv Ingenbohl", short: "IN", records: 216 },
  { id: "demo", name: "Demo-Bestand", short: "DE", records: 24 },
];

export const CURRENT_USER = {
  name: "Andrea Betschart",
  initials: "AB",
  /** key under `personas.items.andrea.role` is reused for the label */
  email: "a.betschart@sz.ch",
};
