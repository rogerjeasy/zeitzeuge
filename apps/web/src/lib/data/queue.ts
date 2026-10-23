import type { Decision } from "./record";

/**
 * The triage queue (§9.2 #7).
 *
 * Ordered by expected information gain, not by date: a human minute is the
 * scarce resource, so the queue's job is to spend it where it buys the most.
 * Every item carries the reason it ranks where it does — the order is a claim,
 * and a claim without evidence is the one thing this product refuses to make.
 */
export type GainReason = "series" | "boundary" | "refuted" | "verso" | "waiting";

export interface QueueField {
  /** key under `ledger.fields.*` */
  key: string;
  value?: string;
  confidence?: number;
  decision: Decision;
}

export interface QueueItem {
  id: string;
  signature: string;
  /** key under `archive.photos.*` */
  photoKey: string;
  src: string;
  collection: string;
  fields: QueueField[];
  evidence: string[];
  /** 0–1. Drives the default order. */
  gain: number;
  reason: GainReason;
  /** e.g. how many photographs in the series hang on this decision */
  reasonCount?: number;
  waitingDays: number;
  estimatedSeconds: number;
}

/** What the bulk threshold compares against: the weakest field we would emit. */
export function minConfidence(item: QueueItem) {
  const values = item.fields
    .filter((f) => f.decision !== "abstain" && f.confidence !== undefined)
    .map((f) => f.confidence!);
  return values.length ? Math.min(...values) : 0;
}

const P = {
  brunnen: "/archive/brunnen-mythen.jpg",
  goldau: "/archive/goldau-mythen.jpg",
  kloster: "/archive/einsiedeln-kloster.jpg",
  treib: "/archive/treib-mythen.jpg",
  axenstein: "/archive/brunnen-axenstein.jpg",
  quai: "/archive/brunnen-quai.jpg",
  schule: "/archive/einsiedeln-schule.jpg",
};

export const QUEUE_ITEMS: QueueItem[] = [
  {
    id: "q1", signature: "StASZ Ansichtskarten/0042", photoKey: "brunnenMythen", src: P.brunnen,
    collection: "Ansichtskarten", gain: 0.94, reason: "series", reasonCount: 14, waitingDays: 3, estimatedSeconds: 55,
    evidence: ["ev_001", "ev_007", "ev_011"],
    fields: [
      { key: "place", value: "Brunnen, Gemeinde Ingenbohl SZ", confidence: 0.94, decision: "emit" },
      { key: "date", value: "1893–1900", confidence: 0.71, decision: "emit_with_review" },
      { key: "subject", value: "Grosser & Kleiner Mythen", confidence: 0.92, decision: "emit" },
      { key: "photographer", decision: "abstain" },
    ],
  },
  {
    id: "q2", signature: "StASZ Ansichtskarten/0455", photoKey: "axenstein", src: P.axenstein,
    collection: "Ansichtskarten", gain: 0.88, reason: "refuted", waitingDays: 1, estimatedSeconds: 70,
    evidence: ["ev_021", "ev_024"],
    fields: [
      { key: "place", value: "Axenstein, Morschach SZ", confidence: 0.64, decision: "emit_with_review" },
      { key: "date", value: "1900–1910", confidence: 0.58, decision: "emit_with_review" },
      { key: "photographer", decision: "abstain" },
    ],
  },
  {
    id: "q3", signature: "StASZ Ansichtskarten/1204", photoKey: "quai", src: P.quai,
    collection: "Ansichtskarten", gain: 0.81, reason: "verso", waitingDays: 2, estimatedSeconds: 90,
    evidence: ["ev_033"],
    fields: [
      { key: "place", value: "Quai Brunnen SZ", confidence: 0.89, decision: "emit" },
      { key: "date", value: "1905–1915", confidence: 0.55, decision: "emit_with_review" },
      { key: "subject", value: "Quaianlage mit Dampfschiff", confidence: 0.77, decision: "emit_with_review" },
    ],
  },
  {
    id: "q4", signature: "StASZ Foto/Bettschart/0117", photoKey: "goldau", src: P.goldau,
    collection: "Bettschart", gain: 0.72, reason: "boundary", waitingDays: 1, estimatedSeconds: 40,
    evidence: ["ev_041", "ev_044"],
    fields: [
      { key: "place", value: "Goldau, Gemeinde Arth SZ", confidence: 0.93, decision: "emit" },
      { key: "date", value: "1890–1900", confidence: 0.68, decision: "emit_with_review" },
      { key: "photographer", decision: "abstain" },
    ],
  },
  {
    id: "q5", signature: "StASZ Foto/Bettschart/0308", photoKey: "einsiedeln", src: P.kloster,
    collection: "Bettschart", gain: 0.64, reason: "series", reasonCount: 6, waitingDays: 0, estimatedSeconds: 30,
    evidence: ["ev_051", "ev_052"],
    fields: [
      { key: "place", value: "Kloster Einsiedeln SZ", confidence: 0.97, decision: "emit" },
      { key: "subject", value: "Klosterkirche, Westfassade", confidence: 0.94, decision: "emit" },
      { key: "date", value: "1893–1899", confidence: 0.81, decision: "emit" },
    ],
  },
  {
    id: "q6", signature: "StASZ Foto/Bettschart/0091", photoKey: "treib", src: P.treib,
    collection: "Bettschart", gain: 0.58, reason: "waiting", waitingDays: 5, estimatedSeconds: 35,
    evidence: ["ev_061"],
    fields: [
      { key: "place", value: "Treib, Seelisberg UR", confidence: 0.88, decision: "emit" },
      { key: "date", value: "1894–1900", confidence: 0.62, decision: "emit_with_review" },
    ],
  },
  {
    id: "q7", signature: "StASZ Ansichtskarten/0312", photoKey: "schule", src: P.schule,
    collection: "Ansichtskarten", gain: 0.46, reason: "boundary", waitingDays: 0, estimatedSeconds: 25,
    evidence: ["ev_071", "ev_072"],
    fields: [
      { key: "place", value: "Einsiedeln SZ, Schulhaus", confidence: 0.95, decision: "emit" },
      { key: "date", value: "1900–1910", confidence: 0.86, decision: "emit" },
      { key: "photographer", decision: "abstain" },
    ],
  },
  {
    id: "q8", signature: "StASZ Ansichtskarten/1207", photoKey: "brunnenMythen", src: P.brunnen,
    collection: "Ansichtskarten", gain: 0.39, reason: "series", reasonCount: 3, waitingDays: 1, estimatedSeconds: 22,
    evidence: ["ev_081"],
    fields: [
      { key: "place", value: "Brunnen SZ", confidence: 0.96, decision: "emit" },
      { key: "subject", value: "Seeufer mit Mythen", confidence: 0.93, decision: "emit" },
    ],
  },
  {
    id: "q9", signature: "StASZ Ansichtskarten/0461", photoKey: "axenstein", src: P.axenstein,
    collection: "Ansichtskarten", gain: 0.34, reason: "waiting", waitingDays: 4, estimatedSeconds: 20,
    evidence: ["ev_091"],
    fields: [
      { key: "place", value: "Morschach SZ", confidence: 0.94, decision: "emit" },
      { key: "date", value: "1900–1912", confidence: 0.93, decision: "emit" },
    ],
  },
  {
    id: "q10", signature: "StASZ Foto/Bettschart/0123", photoKey: "goldau", src: P.goldau,
    collection: "Bettschart", gain: 0.28, reason: "boundary", waitingDays: 0, estimatedSeconds: 18,
    evidence: ["ev_101"],
    fields: [
      { key: "place", value: "Arth SZ", confidence: 0.95, decision: "emit" },
      { key: "date", value: "1892–1898", confidence: 0.94, decision: "emit" },
    ],
  },
  {
    id: "q11", signature: "StASZ Ansichtskarten/1211", photoKey: "treib", src: P.treib,
    collection: "Ansichtskarten", gain: 0.21, reason: "series", reasonCount: 2, waitingDays: 2, estimatedSeconds: 15,
    evidence: ["ev_111"],
    fields: [
      { key: "place", value: "Vierwaldstättersee, Treib", confidence: 0.97, decision: "emit" },
      { key: "date", value: "1898–1906", confidence: 0.95, decision: "emit" },
    ],
  },
  {
    id: "q12", signature: "StASZ Foto/Bettschart/0319", photoKey: "einsiedeln", src: P.kloster,
    collection: "Bettschart", gain: 0.16, reason: "waiting", waitingDays: 3, estimatedSeconds: 12,
    evidence: ["ev_121"],
    fields: [
      { key: "place", value: "Einsiedeln SZ", confidence: 0.98, decision: "emit" },
      { key: "subject", value: "Klosterplatz", confidence: 0.96, decision: "emit" },
    ],
  },
];

export type SortKey = "gain" | "waiting" | "confidence" | "signature";

export const SORT_KEYS: SortKey[] = ["gain", "waiting", "confidence", "signature"];

export function sortQueue(items: QueueItem[], key: SortKey) {
  const copy = [...items];
  switch (key) {
    case "waiting":
      return copy.sort((a, b) => b.waitingDays - a.waitingDays);
    case "confidence":
      return copy.sort((a, b) => minConfidence(a) - minConfidence(b));
    case "signature":
      return copy.sort((a, b) => a.signature.localeCompare(b.signature));
    default:
      return copy.sort((a, b) => b.gain - a.gain);
  }
}
