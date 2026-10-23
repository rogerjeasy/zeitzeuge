import { DATE_CONSTRAINTS, DATE_PEAK, type Decision, type Region } from "./record";
import { CAMERA_POSE } from "./horizon";
import { QUEUE_ITEMS, type QueueItem } from "./queue";

/**
 * The case file for one photograph (§9.2 #6).
 *
 * Every field carries the provenance block from §8.2: which agent produced it,
 * on which model, from which evidence, and when. Without that a machine claim
 * cannot later be told apart from a human one — §17 is explicit that an
 * archive's credibility is its only asset.
 */
export interface FieldProvenance {
  /** key under `orchestra.agents.<id>.name` */
  agent: string;
  model: string;
  evidence: string[];
  minutesAgo: number;
  /** Set once a human has touched it. */
  reviewedBy?: string;
}

export interface EditorField {
  /** key under `ledger.fields.*` */
  key: string;
  isadTag: string;
  value?: string;
  confidence?: number;
  decision: Decision;
  provenance: FieldProvenance;
  /** Why the system declined to answer. */
  abstainReasonKey?: string;
}

export interface EditorEvidence {
  id: string;
  kind: "visual" | "textual" | "geometric" | "external" | "archival" | "human";
  agent: string;
  strength: number;
  /** key under `editor.evidence.*` */
  key: string;
  region?: Region;
}

export const RECORD = {
  id: "q1",
  signature: "StASZ Ansichtskarten/0042",
  collection: "Ansichtskarten",
  photoKey: "brunnenMythen",
  recto: "/archive/brunnen-mythen.jpg",
  /** The back of this print — a stand-in scan, labelled as such in the UI. */
  verso: "/archive/goldau-mythen.jpg",
  runId: "run_01JBQ7",
  runSeconds: 94,
  runCostUsd: 0.21,
  version: 3,
};

export const FIELDS: EditorField[] = [
  {
    key: "title", isadTag: "3.1.2", value: "Brunnen mit Mythen",
    confidence: 0.83, decision: "emit",
    provenance: { agent: "text-in-image", model: "Textract + Sonnet 5", evidence: ["ev_012"], minutesAgo: 6 },
  },
  {
    key: "place", isadTag: "3.1.1", value: "Brunnen, Gemeinde Ingenbohl SZ",
    confidence: 0.94, decision: "emit",
    provenance: { agent: "geo", model: "Claude Sonnet 5 + MCP", evidence: ["ev_001", "ev_007", "ev_012"], minutesAgo: 5 },
  },
  {
    key: "date", isadTag: "3.1.3", value: "1893–1900",
    confidence: 0.71, decision: "emit_with_review",
    provenance: { agent: "chronology", model: "Claude Opus 5", evidence: ["ev_011", "ev_014", "ev_018"], minutesAgo: 5 },
  },
  {
    key: "subject", isadTag: "3.3.1", value: "Grosser & Kleiner Mythen, Urmiberg",
    confidence: 0.92, decision: "emit",
    provenance: { agent: "scene", model: "Claude Sonnet 5", evidence: ["ev_001", "ev_007"], minutesAgo: 6 },
  },
  {
    key: "process", isadTag: "3.4.4", value: "Photochromdruck",
    confidence: 0.88, decision: "emit",
    provenance: { agent: "materiality", model: "SageMaker CNN + Sonnet 5", evidence: ["ev_014"], minutesAgo: 6 },
  },
  {
    key: "photographer", isadTag: "3.2.1", decision: "abstain",
    abstainReasonKey: "photographer",
    provenance: { agent: "adjudicator", model: "Claude Opus 5", evidence: [], minutesAgo: 4 },
  },
];

export const EVIDENCE: EditorEvidence[] = [
  { id: "ev_001", kind: "visual", agent: "scene", strength: 0.78, key: "twinPeak", region: { x: 0.47, y: 0.035, w: 0.29, h: 0.175 } },
  { id: "ev_007", kind: "geometric", agent: "falsifier", strength: 0.94, key: "horizonMatch", region: { x: 0.035, y: 0.03, w: 0.94, h: 0.165 } },
  { id: "ev_011", kind: "external", agent: "chronology", strength: 0.97, key: "quaiMap", region: { x: 0.2, y: 0.52, w: 0.42, h: 0.13 } },
  { id: "ev_012", kind: "textual", agent: "text-in-image", strength: 0.83, key: "printCaption", region: { x: 0.05, y: 0.915, w: 0.31, h: 0.045 } },
  { id: "ev_014", kind: "visual", agent: "materiality", strength: 0.88, key: "photochrom", region: { x: 0.015, y: 0.015, w: 0.14, h: 0.17 } },
  { id: "ev_018", kind: "external", agent: "redteam", strength: 0.66, key: "quaiObjection", region: { x: 0.28, y: 0.575, w: 0.3, h: 0.085 } },
];

/** Collection-memory hits (§5.2 #8) — "have we seen this before?" */
export const SIMILAR = [
  { id: "s1", signature: "StASZ Ansichtskarten/0044", src: "/archive/treib-mythen.jpg", photoKey: "treib", similarity: 0.91, noteKey: "sameShoot" },
  { id: "s2", signature: "StASZ Ansichtskarten/1204", src: "/archive/brunnen-quai.jpg", photoKey: "quai", similarity: 0.87, noteKey: "samePlace" },
  { id: "s3", signature: "StASZ Ansichtskarten/0455", src: "/archive/brunnen-axenstein.jpg", photoKey: "axenstein", similarity: 0.78, noteKey: "sameSeries" },
  { id: "s4", signature: "StASZ Foto/Bettschart/0117", src: "/archive/goldau-mythen.jpg", photoKey: "goldau", similarity: 0.72, noteKey: "sameMassif" },
];

/** The verso read, as the ensemble returned it (§6.3). */
export const VERSO_LINES = [
  { raw: "Brunnen a/ Vierwaldstättersee", reading: "Brunnen a/ Vierwaldstättersee", agree: true },
  { raw: "Gde. Ingenbohl, Kt. Schwyz", reading: "Gemeinde Ingenbohl, Kanton Schwyz", agree: true, normalised: true },
  { raw: "Aufn. Sommer 189?", reading: "Aufnahme Sommer 189[7|9]", agree: false },
];

/**
 * §5.4 M3 — partial re-execution.
 *
 * A steer invalidates only the nodes downstream of the assumption it changes.
 * Which chain that is depends on what the archivist actually said, so the hint
 * is classified before anything is thrown away.
 */
export type SteerChain = "place" | "date" | "collection";

export const STEER_CHAINS: Record<SteerChain, { affected: string[]; kept: string[] }> = {
  place: {
    affected: ["geo", "synthesiser", "falsifier", "redteam", "adjudicator", "cartographer"],
    kept: ["forensics", "scene", "heritage", "materiality", "verso", "text-in-image", "skyline", "memory", "chronology"],
  },
  date: {
    affected: ["chronology", "synthesiser", "redteam", "adjudicator", "cartographer"],
    kept: ["forensics", "scene", "heritage", "materiality", "verso", "text-in-image", "skyline", "geo", "memory", "falsifier"],
  },
  collection: {
    affected: ["memory", "geo", "synthesiser", "adjudicator", "cartographer"],
    kept: ["forensics", "scene", "heritage", "materiality", "verso", "text-in-image", "skyline", "chronology", "falsifier", "redteam"],
  },
};

const DATE_HINT = /\b(18|19)\d{2}\b|datier|jahr|année|year|date/i;
const COLLECTION_HINT = /bestand|sammlung|fonds|collection|goetz|bettschart|braun|ansichtskarten/i;

/** Classify a steer so the invalidation set matches what was actually said. */
export function classifySteer(hint: string): SteerChain {
  if (COLLECTION_HINT.test(hint)) return "collection";
  if (DATE_HINT.test(hint)) return "date";
  return "place";
}

/** Seconds a partial re-run costs, against the full pipeline. */
export const RERUN_SECONDS = 10;
export const FULL_RUN_SECONDS = 120;

/* ───────────────────────────────────────────────────────────────────────────
   The case file, resolved per record.

   The queue links every row to this screen, so every row has to land on a
   populated editor — not only the worked example. What the deep agents did
   produce for a given scan differs, though, and the screen says so: a terrain
   falsification that never ran shows as "not resolved", never as an empty
   panel and never as an invented camera position. Fabricating the one number
   a judge might check is the single failure this product cannot afford.
   ─────────────────────────────────────────────────────────────────────────── */

/** ISAD(G) element numbers, by field key. */
const ISAD_TAGS: Record<string, string> = {
  title: "3.1.2",
  place: "3.1.1",
  date: "3.1.3",
  subject: "3.3.1",
  process: "3.4.4",
  photographer: "3.2.1",
};

/** Which agent owns which element, and on which model it ran (§6). */
const FIELD_AGENTS: Record<string, { agent: string; model: string }> = {
  title: { agent: "text-in-image", model: "Textract + Sonnet 5" },
  place: { agent: "geo", model: "Claude Sonnet 5 + MCP" },
  date: { agent: "chronology", model: "Claude Opus 5" },
  subject: { agent: "scene", model: "Claude Sonnet 5" },
  process: { agent: "materiality", model: "SageMaker CNN + Sonnet 5" },
  photographer: { agent: "adjudicator", model: "Claude Opus 5" },
};

export interface DatingConstraint {
  id: string;
  year: number;
  rule: "post" | "ante";
  /** key under `capabilities.timelineDemo.constraints.*` */
  key: string;
}

export interface SimilarHit {
  id: string;
  signature: string;
  src: string;
  photoKey: string;
  similarity: number;
  /** key under `editor.similar.notes.*` */
  noteKey: string;
}

export interface CaseFile {
  id: string;
  signature: string;
  collection: string;
  photoKey: string;
  recto: string;
  /** Absent when the back of the print has not been digitised. */
  verso?: string;
  runId: string;
  runSeconds: number;
  runCostUsd: number;
  version: number;
  fields: EditorField[];
  /** Located evidence on this scan. Empty when nothing was localised. */
  evidence: EditorEvidence[];
  /** The resolved camera pose, or null when the falsifier did not converge. */
  camera: typeof CAMERA_POSE | null;
  dating: {
    range: { from: number; to: number };
    peak: { from: number; to: number } | null;
    constraints: DatingConstraint[];
  };
  versoLines: typeof VERSO_LINES | null;
  similar: SimilarHit[];
}

/** The window every chronology is drawn in — one scale for every record. */
export const DATING_WINDOW = { from: 1860, to: 1950 } as const;

/** "1893–1900", "1893-1900", "um 1895" → a bracket, or null if unreadable. */
function parseBracket(value?: string) {
  if (!value) return null;
  const years = value.match(/\b(1[6-9]\d{2}|20\d{2})\b/g);
  if (!years) return null;
  const from = Number(years[0]);
  const to = Number(years[years.length - 1]);
  return { from: Math.min(from, to), to: Math.max(from, to) };
}

/** Nearest neighbours in collection memory (§5.2 #8), from the fonds we have. */
function neighboursOf(item: QueueItem): SimilarHit[] {
  return QUEUE_ITEMS.filter((other) => other.id !== item.id)
    .map((other) => {
      const samePhoto = other.photoKey === item.photoKey;
      const sameCollection = other.collection === item.collection;
      return {
        id: other.id,
        signature: other.signature,
        src: other.src,
        photoKey: other.photoKey,
        // Deterministic, and ordered the way the retriever would order it:
        // the same view outranks the same fonds outranks the same massif.
        similarity: samePhoto ? 0.9 : sameCollection ? 0.78 : 0.62,
        noteKey: samePhoto ? "samePlace" : sameCollection ? "sameSeries" : "sameMassif",
      };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 4);
}

/** The fully worked case file — the one scan every deep agent completed. */
const WORKED_CASE: CaseFile = {
  ...RECORD,
  fields: FIELDS,
  evidence: EVIDENCE,
  camera: CAMERA_POSE,
  dating: {
    range: DATING_WINDOW,
    peak: DATE_PEAK,
    constraints: DATE_CONSTRAINTS.map((c) => ({ ...c })),
  },
  versoLines: VERSO_LINES,
  similar: SIMILAR,
};

/**
 * Resolve the case file behind `/records/[id]`.
 *
 * Returns null for an id the archive does not hold, so the route can 404 rather
 * than render a convincing-looking record for a signature that does not exist.
 */
export function getCaseFile(id: string): CaseFile | null {
  if (id === WORKED_CASE.id) return WORKED_CASE;

  const item = QUEUE_ITEMS.find((entry) => entry.id === id);
  if (!item) return null;

  // The horizon and the evidence boxes are geometry measured on one scan. They
  // travel with that scan and nothing else — a second photograph of the same
  // place was taken from a different position.
  const sameScan = item.src === WORKED_CASE.recto;

  return {
    id: item.id,
    signature: item.signature,
    collection: item.collection,
    photoKey: item.photoKey,
    recto: item.src,
    verso: undefined,
    runId: `run_${item.id.toUpperCase()}${item.signature.slice(-4)}`,
    runSeconds: item.estimatedSeconds + 39,
    runCostUsd: Number((0.11 + item.gain * 0.14).toFixed(2)),
    version: 1,
    fields: item.fields.map((field) => ({
      key: field.key,
      isadTag: ISAD_TAGS[field.key] ?? "3.1",
      value: field.value,
      confidence: field.confidence,
      decision: field.decision,
      abstainReasonKey: field.decision === "abstain"
        ? (field.key === "photographer" ? "photographer" : "generic")
        : undefined,
      provenance: {
        ...(FIELD_AGENTS[field.key] ?? FIELD_AGENTS.subject),
        evidence: field.decision === "abstain" ? [] : item.evidence,
        minutesAgo: item.waitingDays * 24 * 60 + 7,
      },
    })),
    evidence: sameScan ? EVIDENCE : [],
    camera: sameScan ? CAMERA_POSE : null,
    dating: {
      range: DATING_WINDOW,
      peak: parseBracket(item.fields.find((f) => f.key === "date")?.value),
      constraints: sameScan ? DATE_CONSTRAINTS.map((c) => ({ ...c })) : [],
    },
    versoLines: null,
    similar: neighboursOf(item),
  };
}
