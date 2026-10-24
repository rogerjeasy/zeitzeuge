import type { NextRequest } from "next/server";
import { investigationPaths } from "@/lib/api/investigation";
import { apiFetchRaw } from "@/lib/api/server";
import { authorise, problem, upstreamProblem } from "@/lib/investigation/route-gate";

/**
 * Live batch progress: the API's Server-Sent Events, piped through untouched.
 *
 * The browser cannot hold the bearer, so `EventSource` connects here (same
 * origin, cookies attached) and this handler opens the upstream stream with
 * the token from the HttpOnly cookie. `response.body` is passed on as is — no
 * parsing, no buffering — and closing the tab aborts the upstream fetch.
 * `no-transform` keeps the server's gzip from holding events back.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await authorise(params);
  if (!gate.ok) return gate.response;

  const upstream = await apiFetchRaw(investigationPaths.stream(gate.id), {
    ...gate.auth,
    accept: "text/event-stream",
    signal: request.signal,
  });
  if (!upstream) return problem(502, "network");
  if (!upstream.ok || !upstream.body) return upstreamProblem(upstream);

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
