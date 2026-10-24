/**
 * The batch view's filter, search and sort (spec 2026-10-24 batch management
 * §4), as pure functions over `BatchAsset` rows, plus its round trip through
 * the URL query (`?status=review&qc=open&q=17.3&sort=conf_asc`).
 *
 * No React, no Next, no server-only import: the batch view, the queue, the
 * review screen's previous/next and the unit tests all share this one module,
 * so «the list the user came from» is computed the same way everywhere.
 */

import type { BatchAsset } from "../api/investigation-types";

export const STATUS_FILTERS = ["all", "accept", "review", "undetermined", "working", "failed"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const QC_FILTERS = ["all", "open", "machine", "confirmed", "corrected"] as const;
export type QcFilter = (typeof QC_FILTERS)[number];

export const SORT_KEYS = ["name", "conf_asc", "conf_desc", "status"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export type BatchFilter = { status: StatusFilter; qc: QcFilter; q: string; sort: SortKey };

export const DEFAULT_FILTER: BatchFilter = { status: "all", qc: "all", q: "", sort: "name" };
/** The queue keeps its old order by default: least certain first. */
export const QUEUE_DEFAULT_FILTER: BatchFilter = { ...DEFAULT_FILTER, sort: "conf_asc" };

/** The longest search string kept from a URL; a file name is never longer. */
const MAX_QUERY = 120;

/** The row's status bucket; `other` (e.g. a cancelled run) only shows under «Alle». */
export type StatusBucket = Exclude<StatusFilter, "all"> | "other";
export type QcBucket = Exclude<QcFilter, "all">;

const WORKING_ASSET = new Set(["queued", "uploading", "uploaded", "analysing"]);
const WORKING_RUN = new Set(["queued", "running"]);
const LABEL_BUCKET: Record<string, StatusBucket> = {
  übernahmefähig: "accept",
  Prüfbedarf: "review",
  unbestimmt: "undetermined",
};
const QC_BUCKET: Record<string, QcBucket> = {
  offen: "open",
  maschinell: "machine",
  geprüft: "confirmed",
  korrigiert: "corrected",
};

/** «In Arbeit» covers queued, running and uploading; a failure wins over a stale label. */
export function statusBucket(asset: BatchAsset): StatusBucket {
  if (asset.status === "error" || asset.run_status === "failed") return "failed";
  if (WORKING_RUN.has(String(asset.run_status)) || WORKING_ASSET.has(asset.status)) return "working";
  return (asset.status_label && LABEL_BUCKET[asset.status_label]) || "other";
}

export function qcBucket(asset: BatchAsset): QcBucket {
  return QC_BUCKET[asset.qc_status] ?? "machine";
}

/** Withdrawn rows are never part of a filtered list; the Papierkorb shows them apart. */
export const isWithdrawn = (asset: Pick<BatchAsset, "deleted_at">): boolean => Boolean(asset.deleted_at);

type Query = URLSearchParams | Record<string, string | string[] | undefined>;

function read(query: Query, key: string): string | undefined {
  if (query instanceof URLSearchParams) return query.get(key) ?? undefined;
  const value = query[key];
  return Array.isArray(value) ? value[0] : value;
}

const pick = <T extends string>(allowed: readonly T[], value: string | undefined, fallback: T): T =>
  value !== undefined && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

/** Anything unknown in the URL falls back to the default; it never throws. */
export function parseFilter(query: Query, defaults: BatchFilter = DEFAULT_FILTER): BatchFilter {
  return {
    status: pick(STATUS_FILTERS, read(query, "status"), defaults.status),
    qc: pick(QC_FILTERS, read(query, "qc"), defaults.qc),
    q: (read(query, "q") ?? "").trim().slice(0, MAX_QUERY),
    sort: pick(SORT_KEYS, read(query, "sort"), defaults.sort),
  };
}

/** The filter's query parameters, defaults left out so a plain view has a plain URL. */
export function filterParams(filter: BatchFilter, defaults: BatchFilter = DEFAULT_FILTER): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.status !== defaults.status) params.set("status", filter.status);
  if (filter.qc !== defaults.qc) params.set("qc", filter.qc);
  const q = filter.q.trim();
  if (q) params.set("q", q);
  if (filter.sort !== defaults.sort) params.set("sort", filter.sort);
  return params;
}

export const isDefaultFilter = (filter: BatchFilter): boolean =>
  filter.status === "all" && filter.qc === "all" && !filter.q.trim();

function matchesSearch(asset: BatchAsset, q: string): boolean {
  if (!q) return true;
  return asset.external_ref.toLocaleLowerCase("de-CH").includes(q.toLocaleLowerCase("de-CH"));
}

export function matches(asset: BatchAsset, filter: BatchFilter): boolean {
  if (isWithdrawn(asset)) return false;
  if (filter.status !== "all" && statusBucket(asset) !== filter.status) return false;
  if (filter.qc !== "all" && qcBucket(asset) !== filter.qc) return false;
  return matchesSearch(asset, filter.q.trim());
}

/** Natural order: «IMG_2» before «IMG_10». */
const collator = new Intl.Collator("de-CH", { numeric: true, sensitivity: "base" });
export const naturalCompare = (a: string, b: string): number => collator.compare(a, b);

/** Status order for `sort=status`: what needs a human first, finished work last. */
const STATUS_ORDER: Record<StatusBucket, number> = {
  failed: 0,
  review: 1,
  undetermined: 2,
  working: 3,
  other: 4,
  accept: 5,
};

function compare(a: BatchAsset, b: BatchAsset, sort: SortKey): number {
  const byName = naturalCompare(a.external_ref, b.external_ref);
  if (sort === "name") return byName;
  if (sort === "status") return STATUS_ORDER[statusBucket(a)] - STATUS_ORDER[statusBucket(b)] || byName;
  // No confidence yet sorts last in both directions: it is not «low», it is unknown.
  const ca = a.outcome_confidence;
  const cb = b.outcome_confidence;
  if (ca === null && cb === null) return byName;
  if (ca === null) return 1;
  if (cb === null) return -1;
  return (sort === "conf_asc" ? ca - cb : cb - ca) || byName;
}

/** Filter, then sort. A new array; the input is never reordered. */
export function applyFilter<T extends BatchAsset>(assets: readonly T[], filter: BatchFilter): T[] {
  return assets.filter((a) => matches(a, filter)).sort((a, b) => compare(a, b, filter.sort));
}

export type FacetCounts = { status: Record<StatusFilter, number>; qc: Record<QcFilter, number> };

/**
 * Live counts for the chips. Each facet is counted under the *other* facet
 * and the search, so a chip says how many rows clicking it would show.
 */
export function facetCounts(assets: readonly BatchAsset[], filter: BatchFilter): FacetCounts {
  const status = Object.fromEntries(STATUS_FILTERS.map((k) => [k, 0])) as Record<StatusFilter, number>;
  const qc = Object.fromEntries(QC_FILTERS.map((k) => [k, 0])) as Record<QcFilter, number>;
  const q = filter.q.trim();
  for (const asset of assets) {
    if (isWithdrawn(asset) || !matchesSearch(asset, q)) continue;
    const s = statusBucket(asset);
    const c = qcBucket(asset);
    if (filter.qc === "all" || c === filter.qc) {
      status.all += 1;
      if (s !== "other") status[s] += 1;
    }
    if (filter.status === "all" || s === filter.status) {
      qc.all += 1;
      qc[c] += 1;
    }
  }
  return { status, qc };
}

/** A photo whose run finished with a result: something «Bestätigen» can act on. */
export function isFinished(asset: BatchAsset): boolean {
  return Boolean(asset.record_id) && statusBucket(asset) !== "working";
}
