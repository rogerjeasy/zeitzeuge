/**
 * The worked example rendered in the Evidence Ledger section: a real record
 * from the Prio-1 run on 24.10.2026 — SG.CIV.17.94 (Gersau), run
 * run_01M5PDA916J7NS0M1D2NZTG88M, taken from the «Ergebnisse» and «Belege»
 * sheets of the production export. Values, confidences, decisions, source
 * classes, strengths, agents and models are as the pipeline wrote them; the
 * evidence texts are short translations of its observations. All four filled
 * fields match the team's QC labels; the street was deliberately left open.
 * The ids (B01…) number the rows shown here, not ledger ids.
 */
export type Decision = "emit" | "emit_with_review" | "abstain";

export interface RecordField {
  /** i18n key under `ledger.fields.<key>` */
  key: string;
  /** The brief's rank (Ortschaft → Gemeinde → Gebäude → See/Fluss/Berg → Strasse). */
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
  /** The model that produced it, as the ledger names it; absent for a register lookup. */
  model?: string;
  strength: number;
  /** i18n key under `ledger.evidence.<key>` */
  key: string;
  /** The pixels the claim points at. Absent for evidence that isn't in-frame. */
  region?: Region;
  supports?: string[];
  refutes?: string[];
}

export const RECORD_FIELDS: RecordField[] = [
  { key: "locality", isadTag: "#1", value: "Gersau", confidence: 0.952, decision: "emit", evidence: ["B01", "B03", "B04", "B11", "B09"] },
  { key: "municipality", isadTag: "#2", value: "Gersau (BFS 1311)", confidence: 0.894, decision: "emit_with_review", evidence: ["B02", "B03", "B04"] },
  { key: "building", isadTag: "#3", value: "Seehotel Schwert", confidence: 0.958, decision: "emit", evidence: ["B03", "B04", "B05", "B06", "B07", "B08", "B09"] },
  { key: "landscape_feature", isadTag: "#4", value: "Vierwaldstättersee", confidence: 0.907, decision: "emit", evidence: ["B10", "B11", "B03"] },
  { key: "street", isadTag: "#5", decision: "abstain", evidence: [] },
];

export const EVIDENCE: EvidenceItem[] = [
  { id: "B01", kind: "geometric", agent: "geo", strength: 0.9, key: "localityRegister", supports: ["H1"] },
  { id: "B02", kind: "geometric", agent: "geo", strength: 0.9, key: "municipalityBoundary", supports: ["H2"] },
  { id: "B03", kind: "external", agent: "research", model: "GPT-5.5", strength: 0.9, key: "openai", supports: ["H1", "H2", "H3", "H4"] },
  { id: "B04", kind: "external", agent: "research", model: "Gemini 4 Argon", strength: 0.9, key: "gemini", supports: ["H1", "H2", "H3", "H4"] },
  { id: "B05", kind: "external", agent: "heritage", strength: 0.85, key: "wikidata", supports: ["H3"] },
  { id: "B06", kind: "visual", agent: "memory", model: "Claude Sonnet 4.6", strength: 0.8, key: "placesPhoto", supports: ["H3"] },
  { id: "B07", kind: "archival", agent: "memory", model: "Claude Sonnet 4.6", strength: 0.8, key: "archivePostcard", supports: ["H3"] },
  { id: "B08", kind: "visual", agent: "streetlevel", model: "Claude Sonnet 4.6", strength: 0.8, key: "streetView", supports: ["H3"] },
  { id: "B09", kind: "external", agent: "research", strength: 0.5, key: "lens", supports: ["H1", "H3"] },
  { id: "B10", kind: "geometric", agent: "geo", strength: 0.9, key: "lakeDistance", supports: ["H4"] },
  { id: "B11", kind: "visual", agent: "skyline", model: "Claude Opus 4.5", strength: 0.8, key: "lakeSeen", supports: ["H1", "H4"] },
];

export interface Hypothesis {
  id: string;
  /** i18n key under `ledger.fields.<field>` */
  field: string;
  /** The surviving value; absent when no candidate survived. */
  value?: string;
  /** Independent source classes that confirm it (i18n keys under `ledger.classes`). */
  classes: string[];
  objections: number;
  confidence?: number;
}

/** One surviving hypothesis per field, as the adjudicator left it. */
export const HYPOTHESES: Hypothesis[] = [
  { id: "H1", field: "locality", value: "Gersau", classes: ["geodata", "reference", "research", "webImage", "imageContent"], objections: 0, confidence: 0.952 },
  { id: "H2", field: "municipality", value: "Gersau", classes: ["geodata", "reference", "research"], objections: 0, confidence: 0.894 },
  { id: "H3", field: "building", value: "Seehotel Schwert", classes: ["geodata", "reference", "research", "webImage", "streetView"], objections: 0, confidence: 0.958 },
  { id: "H4", field: "landscape_feature", value: "Vierwaldstättersee", classes: ["geodata", "research", "webImage", "imageContent"], objections: 0, confidence: 0.907 },
  { id: "H5", field: "street", classes: [], objections: 0 },
];

/** The date distribution rendered as the chronology timeline. */
export const DATE_RANGE = { from: 1860, to: 1950 } as const;

export const DATE_CONSTRAINTS = [
  { id: "ev_014", year: 1889, rule: "post", key: "photochromPatent" },
  { id: "ev_011", year: 1893, rule: "post", key: "axenstrasseBuilt" },
  { id: "ev_018", year: 1900, rule: "ante", key: "quaiRebuild" },
] as const;

export const DATE_PEAK = { from: 1893, to: 1900 } as const;
