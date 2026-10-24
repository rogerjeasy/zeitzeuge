import type { NextRequest } from "next/server";
import { EXPORT_IDS_MAX, investigationPaths, isUuid } from "@/lib/api/investigation";
import { apiFetchRaw } from "@/lib/api/server";
import { authorise, problem, upstreamProblem } from "@/lib/investigation/route-gate";

/**
 * The batch's Excel workbook, generated live by the API from the head
 * versions and passed through byte for byte with its own filename.
 *
 * `?asset_ids=<uuid>,<uuid>…` narrows it to a selection (spec §3); each id is
 * checked here, so nothing but UUIDs and commas reaches the upstream query.
 */
export const dynamic = "force-dynamic";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await authorise(params);
  if (!gate.ok) return gate.response;

  const raw = request.nextUrl.searchParams.get("asset_ids");
  const assetIds = raw ? [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))] : [];
  if (raw !== null && (assetIds.length === 0 || assetIds.length > EXPORT_IDS_MAX || !assetIds.every(isUuid))) {
    return problem(400, "invalid_request");
  }

  const upstream = await apiFetchRaw(investigationPaths.export(gate.id, assetIds), {
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
