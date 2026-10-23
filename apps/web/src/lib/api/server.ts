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
};

export async function apiRequest<T>(
  path: string,
  { method = "POST", body, accessToken, sessionId, caller }: RequestOptions = {},
): Promise<ApiResult<T>> {
  const headers = new Headers({ Accept: "application/json" });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (sessionId) headers.set("X-ZZ-Session", sessionId);
  for (const [name, value] of Object.entries(caller ?? {})) headers.set(name, value);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
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
