import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_FILTER } from "../batch-filter";
import { locate, originListHref, parseOrigin, reviewHref } from "../review-nav";

const BATCH = "0f9c2a4e-3b1d-4c6e-9a8b-7d5e4f3c2b1a";

describe("parseOrigin", () => {
  it("reads a batch or the queue, and nothing else", () => {
    assert.deepEqual(parseOrigin({ from: `batch:${BATCH}` }), { kind: "batch", batchId: BATCH });
    assert.deepEqual(parseOrigin(new URLSearchParams("from=queue")), { kind: "queue" });
    assert.equal(parseOrigin({ from: "batch:../../etc" }), null);
    assert.equal(parseOrigin({ from: "https://evil.example" }), null);
    assert.equal(parseOrigin({}), null);
  });
});

describe("reviewHref / originListHref", () => {
  it("carries the origin and the list's filter", () => {
    const filter = { ...DEFAULT_FILTER, status: "review" as const, sort: "conf_asc" as const };
    assert.equal(
      reviewHref("a1", { kind: "batch", batchId: BATCH }, filter),
      `/records/a1?from=batch%3A${BATCH}&status=review&sort=conf_asc`,
    );
    assert.equal(reviewHref("a1", { kind: "queue" }), "/records/a1?from=queue");
    assert.equal(reviewHref("a1", null), "/records/a1");
    assert.equal(originListHref({ kind: "batch", batchId: BATCH }, filter), `/batches/${BATCH}?status=review&sort=conf_asc`);
    assert.equal(originListHref({ kind: "queue" }), "/queue");
  });
});

describe("locate", () => {
  const ids = ["a", "b", "c"];
  it("gives the position and both neighbours", () => {
    assert.deepEqual(locate(ids, "b"), { position: 2, total: 3, prevId: "a", nextId: "c" });
    assert.deepEqual(locate(ids, "a"), { position: 1, total: 3, prevId: null, nextId: "b" });
    assert.deepEqual(locate(ids, "c"), { position: 3, total: 3, prevId: "b", nextId: null });
  });
  it("keeps the walk going when the photo has left the list", () => {
    assert.deepEqual(locate(ids, "z"), { position: null, total: 3, prevId: null, nextId: "a" });
    assert.deepEqual(locate([], "z"), { position: null, total: 0, prevId: null, nextId: null });
  });
});

describe("queue defaults", () => {
  it("keeps the queue's least-certain-first order out of the URL, and names a change", async () => {
    const { originFilter } = await import("../review-nav");
    assert.equal(originListHref({ kind: "queue" }, { ...DEFAULT_FILTER, sort: "conf_asc" }), "/queue");
    assert.equal(reviewHref("a1", { kind: "queue" }, DEFAULT_FILTER), "/records/a1?from=queue&sort=name");
    assert.equal(originFilter({ from: "queue" }, { kind: "queue" }).sort, "conf_asc");
    assert.equal(originFilter({ from: "queue", sort: "name" }, { kind: "queue" }).sort, "name");
  });
});
