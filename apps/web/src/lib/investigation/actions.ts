"use server";

import {
  BULK_MAX,
  REASON_MAX,
  investigationApi,
  isUuid,
  resolveAuth,
  type ApiAuth,
  type BatchDeleteResult,
  type BatchOut,
  type BatchRestoreResult,
  type BulkAction,
  type BulkRequest,
  type BulkResult,
  type BatchSummary,
  type CaseFile,
  type CommitResponse,
  type FieldReviewRequest,
  type FileToRegister,
  type InvestigationResult,
  type RegisterFilesResponse,
  type RunMode,
  PurgeResult,
} from "@/lib/api/investigation";
import type { ApiResult } from "@/lib/api/server";

/**
 * The browser's door to the investigation API for every JSON call.
 *
 * Each action is a public endpoint, so each one re-validates what it is given
 * and returns data or a problem `code`, never a thrown error or a token. The
 * API is the authority on who may write: a guest's write comes back as
 * `forbidden`, and the screens say so.
 */

const UNAUTHENTICATED = { ok: false, status: 401, code: "unauthenticated" } as const;
const INVALID = { ok: false, status: 400, code: "invalid_request" } as const;

const MODES: ReadonlySet<string> = new Set(["fast", "standard", "deep"]);
const TYPES: ReadonlySet<string> = new Set(["image/jpeg", "image/png", "image/tiff", "image/webp"]);
const LABEL = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const FIELD_KEY = /^[a-z][a-z0-9_]{0,63}$/;

async function call<T>(
  run: (auth: ApiAuth) => Promise<ApiResult<T>>,
): Promise<InvestigationResult<T>> {
  const auth = await resolveAuth({ refresh: true });
  if (!auth) return UNAUTHENTICATED;
  const result = await run(auth);
  if (result.ok) return result;
  return { ok: false, status: result.problem.status, code: result.problem.code };
}

export async function listBatchesAction(
  opts: { includeDeleted?: boolean } = {},
): Promise<InvestigationResult<BatchSummary[]>> {
  const includeDeleted = opts?.includeDeleted === true;
  return call((a) => investigationApi.listBatches(a, { includeDeleted }));
}

export async function createBatchAction(input: {
  label: string;
  priority: number | null;
  mode: string;
}): Promise<InvestigationResult<BatchSummary>> {
  const label = String(input?.label ?? "").trim().toLowerCase();
  const mode = MODES.has(input?.mode) ? (input.mode as RunMode) : "standard";
  const priority =
    Number.isInteger(input?.priority) && input.priority! >= 1 && input.priority! <= 9
      ? input.priority
      : null;
  if (!LABEL.test(label)) return INVALID;
  return call((a) => investigationApi.createBatch(a, { label, mode, priority }));
}

export async function registerFilesAction(
  batchId: string,
  files: FileToRegister[],
): Promise<InvestigationResult<RegisterFilesResponse>> {
  if (!isUuid(String(batchId)) || !Array.isArray(files) || files.length < 1 || files.length > 200) {
    return INVALID;
  }
  const clean: FileToRegister[] = [];
  for (const f of files) {
    const filename = String(f?.filename ?? "");
    const size = Number(f?.content_length);
    if (!filename || filename.length > 260 || !TYPES.has(f?.content_type)) return INVALID;
    if (!Number.isInteger(size) || size <= 0 || size > 209_715_200) return INVALID;
    clean.push({
      filename,
      content_type: f.content_type,
      content_length: size,
      priority: Number.isInteger(f?.priority) ? f.priority : null,
    });
  }
  return call((a) => investigationApi.registerFiles(a, batchId, { files: clean }));
}

export async function commitUploadAction(
  assetId: string,
): Promise<InvestigationResult<CommitResponse>> {
  if (!isUuid(String(assetId))) return INVALID;
  return call((a) => investigationApi.commitUpload(a, assetId));
}

export async function rerunAction(assetId: string): Promise<InvestigationResult<{ run_id: string }>> {
  if (!isUuid(String(assetId))) return INVALID;
  return call((a) => investigationApi.rerun(a, assetId));
}

export async function getBatchAction(
  batchId: string,
  opts: { includeDeleted?: boolean } = {},
): Promise<InvestigationResult<BatchOut>> {
  if (!isUuid(String(batchId))) return INVALID;
  const includeDeleted = opts?.includeDeleted === true;
  return call((a) => investigationApi.batch(a, batchId, { includeDeleted }));
}

/*
 * Batch management (spec 2026-10-24-batch-management §3). «Löschen» is a
 * withdrawal: the master stays under Object Lock, the ledger stays, and every
 * one of these can be undone. Who may is the API's decision — withdraw and
 * restore need `can_approve`, re-run and accept `can_write` — and a refusal
 * comes back as `forbidden` like every other write.
 */

const BULK_ACTIONS: ReadonlySet<string> = new Set(["delete", "restore", "rerun", "accept"]);

function cleanReason(reason: unknown): string | undefined {
  const text = String(reason ?? "").trim().slice(0, REASON_MAX);
  return text || undefined;
}

function cleanIds(ids: unknown): string[] | null {
  if (!Array.isArray(ids)) return null;
  const unique = [...new Set(ids.map(String))];
  if (unique.length < 1 || unique.length > BULK_MAX || !unique.every(isUuid)) return null;
  return unique;
}

export async function withdrawAssetAction(
  assetId: string,
  reason?: string | null,
): Promise<InvestigationResult<BulkResult>> {
  if (!isUuid(String(assetId))) return INVALID;
  return call((a) => investigationApi.withdrawAsset(a, assetId, { reason: cleanReason(reason) }));
}

export async function restoreAssetAction(assetId: string): Promise<InvestigationResult<BulkResult>> {
  if (!isUuid(String(assetId))) return INVALID;
  return call((a) => investigationApi.restoreAsset(a, assetId));
}

export async function bulkAssetsAction(input: {
  action: string;
  assetIds: string[];
  reason?: string | null;
}): Promise<InvestigationResult<BulkResult>> {
  if (!BULK_ACTIONS.has(String(input?.action))) return INVALID;
  const assetIds = cleanIds(input?.assetIds);
  if (!assetIds) return INVALID;
  const body: BulkRequest = { action: input.action as BulkAction, asset_ids: assetIds };
  const reason = input.action === "delete" ? cleanReason(input.reason) : undefined;
  if (reason) body.reason = reason;
  return call((a) => investigationApi.bulk(a, body));
}

export async function withdrawBatchAction(
  batchId: string,
  reason?: string | null,
): Promise<InvestigationResult<BatchDeleteResult>> {
  if (!isUuid(String(batchId))) return INVALID;
  return call((a) => investigationApi.withdrawBatch(a, batchId, { reason: cleanReason(reason) }));
}

/** Delete this batch's failed runs for good. The API keeps every run a record cites. */
export async function purgeFailedRunsAction(batchId: string): Promise<InvestigationResult<PurgeResult>> {
  if (!isUuid(String(batchId))) return INVALID;
  return call((a) => investigationApi.purgeFailedRuns(a, batchId));
}

export async function restoreBatchAction(
  batchId: string,
): Promise<InvestigationResult<BatchRestoreResult>> {
  if (!isUuid(String(batchId))) return INVALID;
  return call((a) => investigationApi.restoreBatch(a, batchId));
}

export async function getCaseFileAction(assetId: string): Promise<InvestigationResult<CaseFile>> {
  if (!isUuid(String(assetId))) return INVALID;
  return call((a) => investigationApi.caseFile(a, assetId));
}

export async function reviewFieldAction(input: {
  recordId: string;
  fieldKey: string;
  action: string;
  value?: string | null;
  reason?: string | null;
  version: number | null;
}): Promise<InvestigationResult<CaseFile>> {
  const { recordId, fieldKey } = input ?? {};
  if (!isUuid(String(recordId)) || !FIELD_KEY.test(String(fieldKey))) return INVALID;
  if (!["accept", "correct", "reject"].includes(input.action)) return INVALID;
  const body: FieldReviewRequest = { action: input.action as FieldReviewRequest["action"] };
  if (body.action === "correct") {
    const value = String(input.value ?? "").trim();
    if (!value) return INVALID;
    body.value = value;
  }
  const reason = String(input.reason ?? "").trim().slice(0, 1000);
  if (reason) body.reason = reason;
  const version = Number.isInteger(input.version) ? input.version : null;
  return call((a) => investigationApi.reviewField(a, recordId, fieldKey, body, version));
}
