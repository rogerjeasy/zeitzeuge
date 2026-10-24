import "server-only";

import type { CallerHeaders } from "./caller";

/**
 * The one way the web tier talks to the FastAPI gateway.
 *
 * Server-side only: tokens never touch browser JavaScript, and the browser
 * never needs the API's address. In AWS `API_INTERNAL_URL` is the internal ALB
 * (infra/modules/compute-api); locally it is uvicorn on :8000.
 *
 * Every failure becomes an `ApiProblem` — the API's RFC 9457 `code`, or
 * `network` when it could not be reached at all — so callers branch on data,
 * never on a thrown exception or a status number.
 */

const API_URL = (process.env.API_INTERNAL_URL ?? "http://localhost:8000/api/v1").replace(
  /\/+$/,
  "",
);

const TIMEOUT_MS = 10_000;

export type ApiFieldError = { field: string; type: string };

export type ApiProblem = {
  status: number;
  code: string;
  errors: ApiFieldError[];
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; problem: ApiProblem };

export { callerFrom, type CallerHeaders } from "./caller";

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  accessToken?: string;
  sessionId?: string;
  caller?: CallerHeaders;
  /** Extra request headers, e.g. `If-Match` on a field review. */
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** A non-JSON body sent as is, e.g. an uploaded workbook. */
  raw?: { body: Uint8Array; contentType: string };
};

export async function apiRequest<T>(
  path: string,
  {
    method = "POST",
    body,
    accessToken,
    sessionId,
    caller,
    headers: extra,
    timeoutMs = TIMEOUT_MS,
    raw,
  }: RequestOptions = {},
): Promise<ApiResult<T>> {
  const headers = new Headers({ Accept: "application/json" });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (raw) headers.set("Content-Type", raw.contentType);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (sessionId) headers.set("X-ZZ-Session", sessionId);
  for (const [name, value] of Object.entries(caller ?? {})) headers.set(name, value);
  for (const [name, value] of Object.entries(extra ?? {})) headers.set(name, value);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: raw ? (raw.body as BodyInit) : body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, problem: { status: 0, code: "network", errors: [] } };
  }

  if (response.status === 204) return { ok: true, data: undefined as T };

  const payload: unknown = await response.json().catch(() => null);
  if (response.ok) return { ok: true, data: payload as T };
  return { ok: false, problem: toProblem(response.status, payload) };
}

function toProblem(status: number, payload: unknown): ApiProblem {
  const body = (payload ?? {}) as { code?: unknown; errors?: unknown };
  const errors = Array.isArray(body.errors)
    ? body.errors
        .filter((e): e is ApiFieldError => typeof e?.field === "string" && typeof e?.type === "string")
        .map(({ field, type }) => ({ field, type }))
    : [];
  return { status, code: typeof body.code === "string" ? body.code : "unknown", errors };
}

/**
 * The raw upstream response, for the two route handlers that must pass bytes
 * through untouched (the SSE stream and the xlsx workbook). Same address, same
 * bearer, same caller headers as `apiRequest`; no timeout unless one is given,
 * because a live stream is meant to stay open.
 */
export async function apiFetchRaw(
  path: string,
  {
    accessToken,
    sessionId,
    caller,
    accept,
    signal,
  }: {
    accessToken: string;
    sessionId?: string;
    caller?: CallerHeaders;
    accept: string;
    signal?: AbortSignal;
  },
): Promise<Response | null> {
  const headers = new Headers({ Accept: accept, Authorization: `Bearer ${accessToken}` });
  if (sessionId) headers.set("X-ZZ-Session", sessionId);
  for (const [name, value] of Object.entries(caller ?? {})) headers.set(name, value);
  try {
    return await fetch(`${API_URL}${path}`, { headers, cache: "no-store", signal });
  } catch {
    return null;
  }
}
