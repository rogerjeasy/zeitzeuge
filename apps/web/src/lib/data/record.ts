/**
 * The worked example rendered in the Evidence Ledger section — the shape of a
 * real adjudication (§5.3), including one field that deliberately abstains.
 */
export type Decision = "emit" | "emit_with_review" | "abstain";

export interface RecordField {
  /** i18n key under `ledger.fields.<key>` */
  key: string;
  isadTag: string;
  value?: string;
  confidence?: number;
  decision: Decision;
  evidence: string[];
}

/** Normalised bounding box on the scan (0–1, origin top-left). */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EvidenceItem {
  id: string;
  kind: "visual" | "textual" | "geometric" | "external" | "archival" | "human";
  agent: string;
  strength: number;
  /** i18n key under `ledger.evidence.<key>` */
  key: string;
  /** The pixels the claim points at. Absent for evidence that isn't in-frame. */
  region?: Region;
  supports?: string[];
  refutes?: string[];
}

export const RECORD_FIELDS: RecordField[] = [
  { key: "place", isadTag: "3.1.1", value: "Brunnen, Gemeinde Ingenbohl SZ", confidence: 0.94, decision: "emit", evidence: ["ev_001", "ev_007", "ev_012"] },
  { key: "date", isadTag: "3.1.3", value: "1893–1900", confidence: 0.71, decision: "emit_with_review", evidence: ["ev_011", "ev_014", "ev_018"] },
  { key: "subject", isadTag: "3.3.1", value: "Grosser & Kleiner Mythen, Urmiberg", confidence: 0.92, decision: "emit", evidence: ["ev_001", "ev_007"] },
  { key: "process", isadTag: "3.4.4", value: "Photochromdruck", confidence: 0.88, decision: "emit", evidence: ["ev_014"] },
  { key: "photographer", isadTag: "3.2.1", decision: "abstain", evidence: [] },
];

export const EVIDENCE: EvidenceItem[] = [
  { id: "ev_001", kind: "visual", agent: "scene", strength: 0.78, key: "twinPeak", region: { x: 0.47, y: 0.035, w: 0.29, h: 0.175 }, supports: ["hyp_A"] },
  { id: "ev_007", kind: "geometric", agent: "falsifier", strength: 0.94, key: "horizonMatch", region: { x: 0.035, y: 0.03, w: 0.94, h: 0.165 }, supports: ["hyp_A"], refutes: ["hyp_B", "hyp_C"] },
  { id: "ev_011", kind: "external", agent: "chronology", strength: 0.97, key: "axenstrasse", region: { x: 0.2, y: 0.52, w: 0.42, h: 0.13 }, supports: ["hyp_A"] },
  { id: "ev_012", kind: "textual", agent: "text-in-image", strength: 0.83, key: "printCaption", region: { x: 0.05, y: 0.915, w: 0.31, h: 0.045 }, supports: ["hyp_A"] },
  { id: "ev_014", kind: "visual", agent: "materiality", strength: 0.88, key: "photochrom", region: { x: 0.015, y: 0.015, w: 0.14, h: 0.17 }, supports: ["hyp_A"] },
  { id: "ev_018", kind: "external", agent: "redteam", strength: 0.66, key: "quaiObjection", region: { x: 0.28, y: 0.575, w: 0.3, h: 0.085 }, refutes: ["hyp_A"] },
];

export interface Hypothesis {
  id: string;
  /** i18n key under `ledger.hypotheses.<key>` */
  key: string;
  prior: number;
  posterior: number;
  refutedBy?: string;
}

export const HYPOTHESES: Hypothesis[] = [
  { id: "hyp_A", key: "brunnen", prior: 0.42, posterior: 0.94 },
  { id: "hyp_B", key: "einsiedeln", prior: 0.31, posterior: 0.02, refutedBy: "ev_007" },
  { id: "hyp_C", key: "weggis", prior: 0.19, posterior: 0.03, refutedBy: "ev_007" },
  { id: "hyp_D", key: "unknown", prior: 0.08, posterior: 0.01 },
];

/** The date distribution rendered as the chronology timeline. */
export const DATE_RANGE = { from: 1860, to: 1950 } as const;

export const DATE_CONSTRAINTS = [
  { id: "ev_014", year: 1889, rule: "post", key: "photochromPatent" },
  { id: "ev_011", year: 1893, rule: "post", key: "axenstrasseBuilt" },
  { id: "ev_018", year: 1900, rule: "ante", key: "quaiRebuild" },
] as const;

export const DATE_PEAK = { from: 1893, to: 1900 } as const;
