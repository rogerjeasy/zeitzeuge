import "server-only";

import { cookies, headers } from "next/headers";
import { authApi } from "@/lib/auth/api";
import { readAccessToken, readSession, writeSession } from "@/lib/auth/session";
import { apiRequest, callerFrom, type ApiResult, type CallerHeaders } from "./server";
import type {
  BatchOut,
  BatchSummary,
  CaseFile,
  CommitResponse,
  CreateBatchRequest,
  FieldReviewRequest,
  QcSummary,
  RegisterFilesRequest,
  RegisterFilesResponse,
} from "./investigation-types";

export * from "./investigation-types";

/**
 * Typed calls to the investigation surface (`/api/v1/batches`, `/assets`,
 * `/records`), one function per route of `api/v1/investigation.py`.
 *
 * Server-only. The bearer comes from the HttpOnly `zz_at` cookie and never
 * reaches browser JavaScript; server actions (`lib/investigation/actions.ts`)
 * and the two proxy route handlers (`app/bff/batches/[id]/*`) are the only
 * doors from the browser to these functions.
 */

export type ApiAuth = { accessToken: string; sessionId?: string; caller: CallerHeaders };

/**
 * The caller's credentials, or null when there is no session.
 *
 * `refresh` renews an expired access token from the refresh token and writes
 * the new cookie — only allowed where cookies can be set (server actions and
 * route handlers). Server Components pass `false`: the proxy has already
 * renewed the token on the navigation that rendered them.
 */
export async function resolveAuth({ refresh }: { refresh: boolean }): Promise<ApiAuth | null> {
  const jar = await cookies();
  const caller = callerFrom(await headers());
  const session = readSession(jar);
  const accessToken = readAccessToken(jar);
  if (accessToken) return { accessToken, sessionId: session?.sessionId, caller };
  if (!refresh || !session) return null;

  const renewed = await authApi.refresh(
    { refresh_token: session.refreshToken, session_id: session.sessionId },
    caller,
  );
  if (!renewed.ok) return null;
  writeSession(jar, renewed.data, { remember: session.remember, previous: session });
  return { accessToken: renewed.data.access_token, sessionId: renewed.data.session_id, caller };
}

const auth = (a: ApiAuth) => ({
  accessToken: a.accessToken,
  sessionId: a.sessionId,
  caller: a.caller,
});

const id = (value: string) => encodeURIComponent(value);

export const investigationApi = {
  listBatches(a: ApiAuth): Promise<ApiResult<BatchSummary[]>> {
    return apiRequest("/batches", { method: "GET", ...auth(a) });
  },

  createBatch(a: ApiAuth, body: CreateBatchRequest): Promise<ApiResult<BatchSummary>> {
    return apiRequest("/batches", { method: "POST", body, ...auth(a) });
  },

  registerFiles(
    a: ApiAuth,
    batchId: string,
    body: RegisterFilesRequest,
  ): Promise<ApiResult<RegisterFilesResponse>> {
    return apiRequest(`/batches/${id(batchId)}/assets`, {
      method: "POST",
      body,
      timeoutMs: 30_000,
      ...auth(a),
    });
  },

  commitUpload(a: ApiAuth, assetId: string): Promise<ApiResult<CommitResponse>> {
    return apiRequest(`/assets/${id(assetId)}/commit`, { method: "PUT", ...auth(a) });
  },

  rerun(a: ApiAuth, assetId: string): Promise<ApiResult<{ run_id: string }>> {
    return apiRequest(`/assets/${id(assetId)}/rerun`, { method: "POST", ...auth(a) });
  },

  batch(a: ApiAuth, batchId: string): Promise<ApiResult<BatchOut>> {
    return apiRequest(`/batches/${id(batchId)}`, { method: "GET", timeoutMs: 20_000, ...auth(a) });
  },

  qc(a: ApiAuth, batchId: string): Promise<ApiResult<QcSummary>> {
    return apiRequest(`/batches/${id(batchId)}/qc`, { method: "GET", ...auth(a) });
  },

  caseFile(a: ApiAuth, assetId: string): Promise<ApiResult<CaseFile>> {
    return apiRequest(`/assets/${id(assetId)}/case`, { method: "GET", ...auth(a) });
  },

  reviewField(
    a: ApiAuth,
    recordId: string,
    fieldKey: string,
    body: FieldReviewRequest,
    version: number | null,
  ): Promise<ApiResult<CaseFile>> {
    return apiRequest(`/records/${id(recordId)}/fields/${id(fieldKey)}`, {
      method: "PATCH",
      body,
      headers: version === null ? undefined : { "If-Match": `"${version}"` },
      ...auth(a),
    });
  },
};

/** Paths the two proxy route handlers pass through byte for byte. */
export const investigationPaths = {
  stream: (batchId: string) => `/batches/${id(batchId)}/stream`,
  export: (batchId: string) => `/batches/${id(batchId)}/export?fmt=xlsx`,
};

/**
 * The `prio1` batch if there is one, else the newest `prio1…` batch, else the
 * newest batch (the list arrives newest first). Null when the archive has none.
 */
export function pickQcBatch(batches: BatchSummary[]): BatchSummary | null {
  return (
    batches.find((b) => b.label === "prio1") ??
    batches.find((b) => b.label?.startsWith("prio1")) ??
    batches[0] ??
    null
  );
}
