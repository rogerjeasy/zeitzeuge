import type { NextRequest } from "next/server";
import { investigationPaths } from "@/lib/api/investigation";
import { apiFetchRaw } from "@/lib/api/server";
import { authorise, problem, upstreamProblem } from "@/lib/investigation/route-gate";

/**
 * The batch's Excel workbook, generated live by the API from the head
 * versions and passed through byte for byte with its own filename.
 */
export const dynamic = "force-dynamic";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await authorise(params);
  if (!gate.ok) return gate.response;

  const upstream = await apiFetchRaw(investigationPaths.export(gate.id), {
    ...gate.auth,
    accept: XLSX,
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]),
  });
  if (!upstream) return problem(502, "network");
  if (!upstream.ok || !upstream.body) return upstreamProblem(upstream);

  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") ?? XLSX,
    "Cache-Control": "no-store",
  });
  const disposition = upstream.headers.get("content-disposition");
  headers.set("Content-Disposition", disposition ?? 'attachment; filename="zeitzeuge.xlsx"');
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  return new Response(upstream.body, { status: 200, headers });
}
