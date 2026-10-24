/**
 * What a `BulkResult` means for the person who clicked: how many worked,
 * which succeeded (for «Rückgängig»), and why the rest were skipped.
 */

import type { BulkResult } from "../api/investigation-types";

export const BULK_DETAILS = [
  "already_withdrawn",
  "not_withdrawn",
  "not_found",
  "running",
  "withdrawn",
  "no_record",
  "nothing_to_accept",
] as const;
export type KnownDetail = (typeof BULK_DETAILS)[number];

export type BulkSummary = {
  requested: number;
  succeeded: number;
  okIds: string[];
  /** Skipped photos per reason; unknown reasons are counted under `other`. */
  skipped: Partial<Record<KnownDetail | "other", number>>;
};

export function summariseBulk(result: BulkResult): BulkSummary {
  const okIds: string[] = [];
  const skipped: BulkSummary["skipped"] = {};
  for (const item of result.results ?? []) {
    if (item.ok) {
      okIds.push(item.asset_id);
      continue;
    }
    const key = (BULK_DETAILS as readonly string[]).includes(String(item.detail))
      ? (item.detail as KnownDetail)
      : "other";
    skipped[key] = (skipped[key] ?? 0) + 1;
  }
  return {
    requested: result.requested ?? result.results?.length ?? 0,
    succeeded: result.succeeded ?? okIds.length,
    okIds,
    skipped,
  };
}
