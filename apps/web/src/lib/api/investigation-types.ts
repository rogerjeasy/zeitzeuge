/**
 * The investigation surface's wire shapes, stated once — a field-for-field
 * mirror of `apps/api/src/zeitzeuge_api/schemas/investigation.py`.
 *
 * Types only, no runtime code, so client components can import them without
 * pulling the server-only API client into the browser bundle. Keys are the
 * API's snake_case, except `overrideRate`, which the API serialises by alias.
 * Datetimes arrive as ISO strings.
 */

export type ImageType = "image/jpeg" | "image/png" | "image/tiff" | "image/webp";
export type RunMode = "fast" | "standard" | "deep";

export type CreateBatchRequest = {
  label?: string | null;
  fonds_slug?: string;
  mode?: RunMode;
  /** Default priority for every file in the batch (`1` for the Prio-1 set). */
  priority?: number | null;
};

export type FileToRegister = {
  filename: string;
  content_type: ImageType;
  content_length: number;
  sha256?: string | null;
  priority?: number | null;
};

export type RegisterFilesRequest = { files: FileToRegister[] };

export type UploadTicketOut = {
  upload_url: string;
  /** POST these as multipart form fields, `file` last. */
  fields: Record<string, string>;
  key: string;
  expires_in: number;
  max_bytes: number;
};

export type RegisteredFile = {
  asset_id: string;
  filename: string;
  /** null when the file is already in the batch (re-registering is idempotent). */
  upload: UploadTicketOut | null;
  status: string;
};

export type RegisterFilesResponse = { batch_id: string; files: RegisteredFile[] };

export type CommitResponse = { asset_id: string; run_id: string; status: string };

export type FieldDecision = "emit" | "emit_with_review" | "abstain";

export type FieldSummary = {
  value: string | null;
  decision: FieldDecision | string;
  confidence: number | null;
};

/** übernahmefähig · Prüfbedarf · unbestimmt (design note §4). */
export type StatusLabel = "übernahmefähig" | "Prüfbedarf" | "unbestimmt";
/** maschinell · geprüft · korrigiert · offen. */
export type QcStatus = "maschinell" | "geprüft" | "korrigiert" | "offen";

/** queued · uploading · uploaded · analysing · done · error */
export type AssetStatus = "queued" | "uploading" | "uploaded" | "analysing" | "done" | "error";
/** queued · running · awaiting_review · accepted · abstained · failed · cancelled · superseded */
export type RunStatus =
  | "queued"
  | "running"
  | "awaiting_review"
  | "accepted"
  | "abstained"
  | "failed"
  | "cancelled"
  | "superseded";

export type BatchAsset = {
  asset_id: string;
  external_ref: string;
  priority: number | null;
  status: AssetStatus | string;
  stage: string | null;
  run_id: string | null;
  run_status: RunStatus | string | null;
  error: string | null;
  outcome_confidence: number | null;
  record_id: string | null;
  status_label: StatusLabel | string | null;
  qc_status: QcStatus | string;
  fields: Record<string, FieldSummary>;
  preview_url: string | null;
};

export type BatchCounts = {
  total: number;
  uploaded: number;
  queued: number;
  running: number;
  done: number;
  failed: number;
  accepted: number;
  review: number;
  undetermined: number;
};

export type BatchOut = {
  id: string;
  label: string | null;
  status: string;
  created_at: string;
  mirrored_from: string | null;
  mirrored_at: string | null;
  counts: BatchCounts;
  assets: BatchAsset[];
};

export type BatchSummary = {
  id: string;
  label: string | null;
  status: string;
  created_at: string;
  asset_count: number;
  mirrored_from: string | null;
};

export type EvidenceOut = {
  id: string;
  kind: string;
  source_class: string;
  source_class_label: string;
  agent: string | null;
  model: string | null;
  observation: string;
  source: string | null;
  source_uri: string | null;
  strength: number;
  field: string | null;
  value: string | null;
};

export type HypothesisOut = {
  id: string;
  field: string | null;
  value: string;
  prior: number;
  posterior: number | null;
  status: string;
  supporting: string[];
  refuting: string[];
};

export type ObjectionOut = {
  hypothesis: string;
  claim: string;
  severity: number;
  resolution: string;
  model: string | null;
};

export type CaseField = {
  key: string;
  label: string;
  rank: number | null;
  decision: FieldDecision | string;
  value: string | null;
  typed_value: unknown;
  confidence: number | null;
  raw_confidence: number | null;
  explanation: string | null;
  rationale: string | null;
  abstain_reason: string | null;
  source_classes: string[];
  /** Local evidence ids cited by this field (`ev_007`). */
  evidence: string[];
  origin: string;
  review_action: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
};

export type RunEventOut = {
  seq: number;
  t_ms: number;
  agent: string;
  kind: string;
  summary: string;
  evidence: string | null;
};

export type CaseRun = {
  id: string;
  status: string;
  stage: string | null;
  started_at: string | null;
  finished_at: string | null;
  cost_usd: number;
  models: string[];
  error: string | null;
};

export type CaseFile = {
  record_id: string | null;
  version: number | null;
  asset_id: string;
  external_ref: string;
  priority: number | null;
  captured_at: string | null;
  camera: string | null;
  preview_url: string | null;
  batch_id: string | null;
  status_label: StatusLabel | string | null;
  qc_status: QcStatus | string;
  row_confidence: number | null;
  run: CaseRun | null;
  fields: CaseField[];
  evidence: EvidenceOut[];
  hypotheses: HypothesisOut[];
  objections: ObjectionOut[];
  events: RunEventOut[];
};

export type ReviewAction = "accept" | "correct" | "reject";

export type FieldReviewRequest = {
  action: ReviewAction;
  value?: string | null;
  reason?: string | null;
};

export type QcSummary = {
  batch: string | null;
  total: number;
  processed: number;
  confirmed: number;
  corrected: number;
  open: number;
  machine: number;
  /** Per ranked field: overridden ÷ reviewed; null when nothing was reviewed. */
  overrideRate: Record<string, number | null>;
};

/** What an action hands a client component: data, or a code to translate. */
export type InvestigationResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string };

/** The brief's five ranked fields, in priority order (`services/qc.py`). */
export const RANKED_FIELD_KEYS = [
  "locality",
  "municipality",
  "building",
  "landscape_feature",
  "street",
] as const;
export type RankedFieldKey = (typeof RANKED_FIELD_KEYS)[number];

/** The investigation's stages in run order (`investigation/pipeline.py`), then `produce`. */
export const STAGES = [
  "intake",
  "perception",
  "grounding",
  "reference",
  "resolve",
  "hypothesise",
  "check",
  "adjudicate",
  "produce",
] as const;

/** A run that finished with a result (the API's `FINISHED`). */
export const FINISHED_RUN_STATUSES: ReadonlySet<string> = new Set([
  "awaiting_review",
  "accepted",
  "abstained",
]);

/** The rule's threshold for «übernahmefähig» (`investigation/confidence.py`). */
export const ACCEPT_THRESHOLD = 0.9;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID.test(value);
