export type AssetStatus =
  | "queued"
  | "uploading"
  | "uploaded"
  | "analysing"
  | "done"
  | "error";

export interface QueuedFile {
  id: string;
  file: File;
  /** Object URL for the thumbnail. Revoked when the asset is removed. */
  preview: string;
}

/**
 * One photograph. Recto and verso are two files but one asset — the shape
 * §9.3 implies with `POST /assets` followed by `POST /assets/{id}/verso`.
 */
export interface QueuedAsset {
  id: string;
  recto?: QueuedFile;
  verso?: QueuedFile;
  /** Why these two were put together, for display. */
  pairedBy?: string;
  pairMarkers?: { recto?: string; verso?: string };
  signature: string;
  collection: string;
  status: AssetStatus;
  /** 0–100 while uploading. */
  progress: number;
}

export const ACCEPTED_TYPES = [
  "image/jpeg", "image/png", "image/tiff", "image/webp", "image/avif",
];

export const ACCEPTED_EXTENSIONS = /\.(jpe?g|png|tiff?|webp|avif)$/i;

/** Presigned S3 PUT has no practical ceiling; this is a sanity bound. */
export const MAX_FILE_BYTES = 200 * 1024 * 1024;

export type IssueCode =
  | "missing-signature"
  | "duplicate-signature"
  | "missing-recto"
  | "too-large"
  | "wrong-type";

export interface Issue {
  code: IssueCode;
  assetId?: string;
  detail?: string;
  /** Blocking issues stop the run from starting. */
  blocking: boolean;
}
