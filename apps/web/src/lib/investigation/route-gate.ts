import "server-only";

import { isUuid, resolveAuth, type ApiAuth } from "@/lib/api/investigation";

/**
 * Shared by the two route handlers under `/bff/batches/[id]/*`.
 *
 * These sit outside the `[locale]` segment, and `proxy.ts` skips `/api/*`
 * entirely (its matcher), so neither the locale negotiation nor the session
 * gate runs for them. Each handler therefore checks for itself: no session
 * cookie, no upstream call. The API then verifies the token as it does for
 * every other request, and decides what this archive may see.
 */
export async function authorise(
  params: Promise<{ id: string }>,
): Promise<{ ok: true; auth: ApiAuth; id: string } | { ok: false; response: Response }> {
  const { id } = await params;
  if (!isUuid(id)) return { ok: false, response: problem(404, "not_found") };
  const auth = await resolveAuth({ refresh: true });
  if (!auth) return { ok: false, response: problem(401, "unauthenticated") };
  return { ok: true, auth, id };
}

export function problem(status: number, code: string): Response {
  return Response.json(
    { status, code },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/** Pass the API's own problem body through, so the client sees its `code`. */
export async function upstreamProblem(response: Response): Promise<Response> {
  const body = (await response.json().catch(() => null)) as { code?: unknown } | null;
  return problem(response.status, typeof body?.code === "string" ? body.code : "upstream_error");
}
