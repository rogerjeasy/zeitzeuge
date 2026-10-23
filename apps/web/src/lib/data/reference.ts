/**
 * The three reference pages: documentation, API and archival standards.
 *
 * Paths, ISAD(G) element numbers, media types and status codes are facts, not
 * copy — they live here and are never translated. Everything that reads as
 * prose is in `messages/*.json` under `docs.*`, `api.*` and `standards.*`.
 */

/* ── documentation ──────────────────────────────────────────────────────── */

export interface DocStep {
  /** key under `docs.steps.<id>` */
  id: string;
  href: string;
}

/** The path a photograph takes, and the screen that owns each leg of it. */
export const DOC_STEPS: DocStep[] = [
  { id: "upload", href: "/upload" },
  { id: "investigate", href: "/runs/run_01JBQ7" },
  { id: "review", href: "/queue" },
  { id: "release", href: "/records/q1" },
];

export const DOC_CONCEPTS = [
  "ledger", "abstention", "provenance", "calibration", "memory", "steering",
] as const;

export interface DocGuide {
  /** key under `docs.guides.<id>` */
  id: string;
  href: string;
}

export const DOC_GUIDES: DocGuide[] = [
  { id: "reviewing", href: "/records/q1" },
  { id: "triage", href: "/queue" },
  { id: "steering", href: "/records/q1" },
  { id: "exporting", href: "/records/q1" },
  { id: "audit", href: "/history" },
  { id: "assist", href: "/help-identify" },
];

/** §13 — the limits, stated where a reader will look for them. */
export const DOC_LIMITS = ["writeback", "faces", "handwriting", "coverage"] as const;

/* ── API (§9.3) ─────────────────────────────────────────────────────────── */

export type Method = "GET" | "POST" | "PATCH" | "WS";

export interface Endpoint {
  method: Method;
  path: string;
  /** key under `api.endpoints.<id>` */
  id: string;
  group: string;
}

export const API_BASE = "https://api.zeitzeuge.sz.ch";
export const API_VERSION = "v1";

export const ENDPOINTS: Endpoint[] = [
  { group: "assets", method: "POST", path: "/api/v1/assets", id: "createAsset" },
  { group: "assets", method: "POST", path: "/api/v1/assets/{id}/verso", id: "attachVerso" },

  { group: "runs", method: "POST", path: "/api/v1/runs", id: "startRun" },
  { group: "runs", method: "GET", path: "/api/v1/runs/{id}", id: "getRun" },
  { group: "runs", method: "WS", path: "/api/v1/runs/{id}/stream", id: "streamRun" },
  { group: "runs", method: "POST", path: "/api/v1/runs/{id}/steer", id: "steerRun" },

  { group: "records", method: "GET", path: "/api/v1/records/{id}", id: "getRecord" },
  { group: "records", method: "PATCH", path: "/api/v1/records/{id}/fields/{name}", id: "patchField" },
  { group: "records", method: "POST", path: "/api/v1/records/{id}/approve", id: "approveRecord" },
  { group: "records", method: "GET", path: "/api/v1/records/{id}/export", id: "exportRecord" },

  { group: "batches", method: "POST", path: "/api/v1/batches", id: "createBatch" },
  { group: "eval", method: "GET", path: "/api/v1/eval/metrics", id: "evalMetrics" },
  { group: "harvest", method: "GET", path: "/oai", id: "oai" },
];

export const API_GROUPS = ["assets", "runs", "records", "batches", "eval", "harvest"] as const;

export const METHOD_TONE: Record<Method, string> = {
  GET: "bg-corroborated-soft text-corroborated",
  POST: "bg-evidence-soft text-evidence",
  PATCH: "bg-review-soft text-review",
  WS: "bg-sepia-soft text-sepia",
};

/** The error contract. Codes are HTTP; the `code` string is ours. */
export const API_ERRORS = [
  { status: 400, code: "invalid_request" },
  { status: 401, code: "unauthenticated" },
  { status: 403, code: "forbidden_tenant" },
  { status: 404, code: "not_found" },
  { status: 409, code: "version_conflict" },
  { status: 422, code: "evidence_missing" },
  { status: 429, code: "rate_limited" },
  { status: 503, code: "budget_exhausted" },
] as const;

/* ── archival standards (§8) ────────────────────────────────────────────── */

export interface IsadElement {
  /** ISAD(G) element number. */
  tag: string;
  /** key under `ledger.fields.*` where we emit one, else null. */
  fieldKey: string | null;
  /** key under `standards.isadNames.<id>` */
  id: string;
  emitted: boolean;
}

/**
 * The ISAD(G) elements the product actually writes, in the standard's own
 * order. The ones we do not write are listed too — a mapping table that only
 * shows its hits is not a mapping table.
 */
export const ISAD_ELEMENTS: IsadElement[] = [
  { tag: "3.1.1", id: "reference", fieldKey: null, emitted: true },
  { tag: "3.1.2", id: "title", fieldKey: "title", emitted: true },
  { tag: "3.1.3", id: "date", fieldKey: "date", emitted: true },
  { tag: "3.1.4", id: "level", fieldKey: null, emitted: true },
  { tag: "3.1.5", id: "extent", fieldKey: null, emitted: true },
  { tag: "3.2.1", id: "creator", fieldKey: "photographer", emitted: true },
  { tag: "3.2.2", id: "adminHistory", fieldKey: null, emitted: false },
  { tag: "3.3.1", id: "scope", fieldKey: "subject", emitted: true },
  { tag: "3.4.4", id: "characteristics", fieldKey: "process", emitted: true },
  { tag: "3.5.3", id: "language", fieldKey: null, emitted: true },
  { tag: "3.6.1", id: "note", fieldKey: null, emitted: true },
  { tag: "3.7.1", id: "archivistNote", fieldKey: null, emitted: true },
];

export type StandardStatus = "ships" | "planned" | "designed";

export interface ExportStandard {
  /** key under `standards.formats.<id>` */
  id: string;
  /** The standard as its maintainer names it — never translated. */
  standard: string;
  mediaType: string;
  status: StandardStatus;
}

export const EXPORT_STANDARDS: ExportStandard[] = [
  { id: "isadCsv", standard: "ISAD(G) 2nd ed.", mediaType: "text/csv", status: "ships" },
  { id: "ead", standard: "EAD3", mediaType: "application/xml", status: "ships" },
  { id: "dc", standard: "Dublin Core (DCMI Terms)", mediaType: "application/xml", status: "ships" },
  { id: "iiif", standard: "IIIF Presentation 3.0", mediaType: "application/ld+json", status: "ships" },
  { id: "ricoXml", standard: "RiC-O 1.0", mediaType: "application/ld+json", status: "ships" },
  { id: "xmpJpeg", standard: "XMP / IPTC Photo Metadata", mediaType: "image/jpeg", status: "ships" },
  { id: "oai", standard: "OAI-PMH 2.0", mediaType: "application/xml", status: "planned" },
  { id: "writeback", standard: "AIS import adapter", mediaType: "—", status: "designed" },
];

/** The provenance block written beside every field (§8.2). */
export const PROVENANCE_FIELDS = [
  "agent", "model", "evidence", "confidence", "decidedAt", "reviewedBy",
] as const;
