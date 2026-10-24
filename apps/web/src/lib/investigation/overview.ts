import "server-only";

import { cache } from "react";
import {
  investigationApi,
  resolveAuth,
  type BatchAsset,
  type BatchOut,
  type BatchSummary,
} from "@/lib/api/investigation";

export type ArchiveOverview =
  | { ok: true; summaries: BatchSummary[]; batches: BatchOut[] }
  | { ok: false; code: string };

/**
 * Every batch of this archive with its rows: `GET /batches`, then
 * `GET /batches/{id}` for each, in parallel. Fine for the brief's scale
 * (≤ 600 photographs); a batch that fails to load is left out rather than
 * failing the whole screen. Cached per request, so the dashboard and its
 * parts share one round of calls.
 */
export const loadArchiveOverview = cache(async (): Promise<ArchiveOverview> => {
  const auth = await resolveAuth({ refresh: false });
  if (!auth) return { ok: false, code: "unauthenticated" };
  const list = await investigationApi.listBatches(auth);
  if (!list.ok) return { ok: false, code: list.problem.code };
  const details = await Promise.all(list.data.map((b) => investigationApi.batch(auth, b.id)));
  const batches = details.flatMap((r) => (r.ok ? [r.data] : []));
  return { ok: true, summaries: list.data, batches };
});

const REVIEWED = new Set(["geprüft", "korrigiert"]);

/**
 * A photograph waiting for a human: its head record says «Prüfbedarf», or its
 * QC status is «offen», and nobody has confirmed or corrected it yet.
 */
export function needsReview(asset: BatchAsset): boolean {
  // A withdrawn photo is out of the review entirely (spec 2026-10-24 §1).
  if (asset.deleted_at || REVIEWED.has(asset.qc_status)) return false;
  return asset.status_label === "Prüfbedarf" || asset.qc_status === "offen";
}

export type ReviewItem = { asset: BatchAsset; batchId: string; batchLabel: string | null };

/** All rows that need review, least certain first. */
export function reviewItems(batches: BatchOut[]): ReviewItem[] {
  return batches
    .flatMap((b) =>
      b.assets.filter(needsReview).map((asset) => ({ asset, batchId: b.id, batchLabel: b.label })),
    )
    .sort(
      (a, b) => (a.asset.outcome_confidence ?? -1) - (b.asset.outcome_confidence ?? -1),
    );
}
