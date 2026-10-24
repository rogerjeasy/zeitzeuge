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
  /** Set when the photo is withdrawn («entfernt»); only listed with `include_deleted`. */
  deleted_at?: string | null;
  deletion_reason?: string | null;
  /** Who withdrew it (the archivist's name), for the Papierkorb. */
  deleted_by_name?: string | null;
  captured_at?: string | null;
  /**
   * Timing (spec §6), `null` until each exists and absent from an API that
   * predates it. `duration_ms` = finished − started, only once finished;
   * `wait_ms` = started − queued.
   */
  queued_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  duration_ms?: number | null;
  wait_ms?: number | null;
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
  /** Withdrawn photos in the batch, whatever `include_deleted` says. */
  deleted?: number;
};

/** The batch's timing over runs with a duration (spec §6). */
export type BatchTiming = {
  finished: number;
  mean_ms: number | null;
  median_ms: number | null;
  p90_ms: number | null;
  min_ms: number | null;
  max_ms: number | null;
  first_started_at: string | null;
  last_finished_at: string | null;
  /** First start → last finish, or → now while photos are still running. */
  wall_ms: number | null;
  /** Finished ÷ wall hours; null while fewer than two have finished. */
  per_hour: number | null;
};

export type BatchOut = {
  id: string;
  label: string | null;
  status: string;
  created_at: string;
  mirrored_from: string | null;
  mirrored_at: string | null;
  deleted_at?: string | null;
  counts: BatchCounts;
  assets: BatchAsset[];
  /** Absent from an API that predates spec §6. */
  timing?: BatchTiming | null;
};

export type BatchSummary = {
  id: string;
  label: string | null;
  status: string;
  created_at: string;
  asset_count: number;
  mirrored_from: string | null;
  deleted_at?: string | null;
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

/** One stage of a run, in execution order (spec §6). */
export type RunStageTiming = {
  stage: string;
  agent: string | null;
  /** The specialist roles this agent played in the stage. */
  acting_as?: string[] | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  duration_ms: number | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
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
  /** Timing (spec §6); absent from an API that predates it. */
  queued_at?: string | null;
  duration_ms?: number | null;
  wait_ms?: number | null;
  /** In execution order; the produce step is the run's `finished_at`. */
  stages?: RunStageTiming[] | null;
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
  deleted_at?: string | null;
  deletion_reason?: string | null;
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
  /** The machine against the archive's own reviews; absent on an older API. */
  measured?: QcMeasured | null;
};

export type QcMeasured = {
  judged: number;
  fields: Record<string, { judged: number; correct: number; wrong: number; missed: number; precision: number | null }>;
  bins: { low: number; high: number; fields: number; correct: number; accuracy: number | null }[];
};

/**
 * Batch management (spec 2026-10-24-batch-management §3). The new fields
 * above are optional on purpose: an API that predates migration 0005 simply
 * omits them, and every screen reads a missing `deleted_at` as «not withdrawn».
 */
export type BulkAction = "delete" | "restore" | "rerun" | "accept";

/** Per-photo outcome; `detail` names why a photo was skipped. */
export type BulkDetail =
  | "already_withdrawn"
  | "not_withdrawn"
  | "not_found"
  | "running"
  | "withdrawn"
  | "no_record"
  | "nothing_to_accept";

export type BulkItemResult = { asset_id: string; ok: boolean; detail: BulkDetail | string | null };

export type BulkResult = {
  action: BulkAction;
  requested: number;
  succeeded: number;
  results: BulkItemResult[];
};

export type BulkRequest = { action: BulkAction; asset_ids: string[]; reason?: string };

export type WithdrawRequest = { reason?: string };

export type BatchDeleteResult = { batch_id: string; deleted_at: string; assets: number };
/** Failed runs deleted for good (API `DELETE /runs/failed`); finished runs are never touched. */
export type PurgeResult = { purged: number; batch_id: string | null };
export type QcImportResult = {
  batch_id: string;
  photos: number;
  accepted: number;
  edited: number;
  filled: number;
  already_reviewed: number;
  no_decision: number;
  unmatched: string[];
  label_issues: string[];
};
export type MirrorResult = {
  source_batch: string;
  mirror_batch: string;
  label: string | null;
  assets: number;
  records: number;
  evidence: number;
};
export type BatchRestoreResult = { batch_id: string; assets: number };

/** The contract's limits: 1–600 photos per bulk call, a reason of at most 500 characters. */
export const BULK_MAX = 600;
export const REASON_MAX = 500;
/**
 * A selection export travels as `?asset_ids=…` on a GET. CloudFront refuses a
 * URL over 8 192 bytes, and 37 bytes per id leaves room for 200; a larger
 * selection is exported as the whole batch or narrowed first.
 */
export const EXPORT_IDS_MAX = 200;

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

/** Archive work, newest first (`GET /history`): never addresses or IPs. */
export type HistoryEntry = {
  at: string;
  actor: string;
  actor_kind: "human" | "machine";
  action: string;
  asset_id: string | null;
  photo: string | null;
  batch_id: string | null;
  batch: string | null;
  field: string | null;
  detail: string | null;
  count: number | null;
};

/** One fonds and how far it is described (`GET /collections`). */
export type Collection = {
  id: string;
  reference_code: string;
  title: string;
  scope_note: string | null;
  photos: number;
  batches: number;
  investigated: number;
  described: number;
  reviewed: number;
};

/** A photo the system could not fully place (`GET /open-questions`). */
export type OpenQuestion = {
  asset_id: string;
  photo: string;
  batch_id: string | null;
  batch: string | null;
  preview_url: string | null;
  captured_at: string | null;
  open_fields: string[];
  known: Record<string, string>;
};

/** What the investigation costs (`GET /costs`), from the recorded model calls. */
export type CostVendor = "anthropic" | "openai" | "google" | "mixed" | "other";
export type CostReport = {
  currency: "USD";
  period: { days: number | null; from: string; to: string };
  totals: {
    cost_usd: number;
    calls: number;
    runs: number;
    photos: number;
    failed_runs: number;
    input_tokens: number;
    output_tokens: number;
    cost_per_photo: number | null;
    live_photos: number;
  };
  by_day: ({ day: string; total: number } & Record<CostVendor, number>)[];
  by_model: {
    label: string;
    vendor: CostVendor;
    model_ids: string[];
    calls: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    share: number;
    price_in_per_mtok: number | null;
    price_out_per_mtok: number | null;
    cost_per_call: number | null;
  }[];
  by_stage: { stage: string; calls: number; cost_usd: number; share: number; avg_seconds: number | null }[];
  by_batch: {
    /** null for the one row that sums withdrawn batches for non-approvers. */
    batch_id: string | null;
    label: string | null;
    withdrawn: boolean;
    runs: number;
    photos: number;
    failed_runs: number;
    cost_usd: number;
    cost_per_photo: number | null;
    created_at: string | null;
  }[];
  projection: {
    cost_per_photo: number | null;
    prio1_set: number | null;
    delivery_600: number | null;
    collection_200000: number | null;
  };
  unmetered: string[];
};
