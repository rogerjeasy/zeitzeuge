/**
 * Previous / next on the review screen: which list the archivist came from,
 * and where in it they are (spec §4, «12 von 31»).
 *
 * The origin rides in the query — `?from=batch:<id>&status=review&sort=…` or
 * `?from=queue&…` — so a review link carries its list with it and a reload
 * keeps the walk. Pure: the record page resolves the list on the server and
 * hands the result to the screen.
 */

import { isUuid } from "../api/investigation-types";
import {
  DEFAULT_FILTER,
  QUEUE_DEFAULT_FILTER,
  filterParams,
  parseFilter,
  type BatchFilter,
} from "./batch-filter";

export type ReviewOrigin = { kind: "batch"; batchId: string } | { kind: "queue" };

type Query = URLSearchParams | Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** `batch:<uuid>` or `queue`; anything else is no origin at all. */
export function parseOrigin(query: Query): ReviewOrigin | null {
  const from = query instanceof URLSearchParams ? query.get("from") : first(query.from);
  if (!from) return null;
  if (from === "queue") return { kind: "queue" };
  if (from.startsWith("batch:")) {
    const batchId = from.slice("batch:".length);
    if (isUuid(batchId)) return { kind: "batch", batchId };
  }
  return null;
}

export function originParam(origin: ReviewOrigin): string {
  return origin.kind === "queue" ? "queue" : `batch:${origin.batchId}`;
}

/** Each list's own default view (the queue sorts least certain first). */
export const defaultsFor = (origin: ReviewOrigin | null): BatchFilter =>
  origin?.kind === "queue" ? QUEUE_DEFAULT_FILTER : DEFAULT_FILTER;

/** The origin's filter as the review URL carries it. */
export const originFilter = (query: Query, origin: ReviewOrigin | null): BatchFilter =>
  parseFilter(query, defaultsFor(origin));

/** The query a review link carries: its origin, then the list's filter. */
export function originQuery(origin: ReviewOrigin, filter: BatchFilter = defaultsFor(origin)): string {
  const params = new URLSearchParams({ from: originParam(origin) });
  for (const [k, v] of filterParams(filter, defaultsFor(origin))) params.set(k, v);
  return params.toString();
}

export function reviewHref(assetId: string, origin: ReviewOrigin | null, filter?: BatchFilter): string {
  const path = `/records/${assetId}`;
  return origin ? `${path}?${originQuery(origin, filter)}` : path;
}

/** Back to the list as the archivist left it. */
export function originListHref(origin: ReviewOrigin, filter: BatchFilter = defaultsFor(origin)): string {
  const query = filterParams(filter, defaultsFor(origin)).toString();
  const path = origin.kind === "queue" ? "/queue" : `/batches/${origin.batchId}`;
  return query ? `${path}?${query}` : path;
}

export type ReviewNav = {
  origin: ReviewOrigin;
  filter: BatchFilter;
  /** 1-based; null when the photo is no longer in the list (e.g. just reviewed off the queue). */
  position: number | null;
  total: number;
  prevId: string | null;
  nextId: string | null;
};

/**
 * Where `currentId` sits in `ids`. A photo that has dropped out of the list
 * still gets a «next»: the first one, so the walk can go on.
 */
export function locate(ids: readonly string[], currentId: string): Pick<ReviewNav, "position" | "total" | "prevId" | "nextId"> {
  const index = ids.indexOf(currentId);
  if (index === -1) {
    return { position: null, total: ids.length, prevId: null, nextId: ids[0] ?? null };
  }
  return {
    position: index + 1,
    total: ids.length,
    prevId: index > 0 ? ids[index - 1] : null,
    nextId: index < ids.length - 1 ? ids[index + 1] : null,
  };
}
