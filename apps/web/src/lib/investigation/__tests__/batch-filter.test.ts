import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { BatchAsset } from "../../api/investigation-types";
import {
  DEFAULT_FILTER,
  applyFilter,
  facetCounts,
  filterParams,
  isDefaultFilter,
  isFinished,
  parseFilter,
  statusBucket,
} from "../batch-filter";

const row = (over: Partial<BatchAsset> & { external_ref: string }): BatchAsset => ({
  asset_id: over.external_ref,
  priority: null,
  status: "done",
  stage: null,
  run_id: "r",
  run_status: "awaiting_review",
  error: null,
  outcome_confidence: null,
  record_id: "rec",
  status_label: "Prüfbedarf",
  qc_status: "offen",
  fields: {},
  preview_url: null,
  deleted_at: null,
  deletion_reason: null,
  captured_at: null,
  ...over,
});

const assets = [
  row({ external_ref: "IMG_10.jpg", status_label: "übernahmefähig", qc_status: "maschinell", outcome_confidence: 0.95 }),
  row({ external_ref: "IMG_2.jpg", outcome_confidence: 0.6 }),
  row({ external_ref: "IMG_17.3.jpg", status_label: "unbestimmt", outcome_confidence: 0.3 }),
  row({ external_ref: "IMG_1.jpg", status: "analysing", run_status: "running", status_label: null, record_id: null }),
  row({ external_ref: "IMG_5.jpg", status: "error", run_status: "failed", status_label: null, record_id: null }),
  row({ external_ref: "IMG_3.jpg", qc_status: "geprüft", deleted_at: "2026-10-24T06:00:00Z" }),
];

describe("parseFilter / filterParams", () => {
  it("round-trips a filter through the URL query", () => {
    const filter = parseFilter(new URLSearchParams("status=review&qc=open&q=17.3&sort=conf_asc"));
    assert.deepEqual(filter, { status: "review", qc: "open", q: "17.3", sort: "conf_asc" });
    assert.equal(filterParams(filter).toString(), "status=review&qc=open&q=17.3&sort=conf_asc");
  });

  it("drops defaults so a plain view has a plain URL", () => {
    assert.equal(filterParams(DEFAULT_FILTER).toString(), "");
    assert.ok(isDefaultFilter(parseFilter({ sort: "status" })));
  });

  it("falls back on anything it does not know", () => {
    assert.deepEqual(parseFilter({ status: "evil", qc: ["machine", "x"], sort: "drop table" }), {
      ...DEFAULT_FILTER,
      qc: "machine",
    });
    assert.equal(parseFilter({ q: "x".repeat(500) }).q.length, 120);
  });
});

describe("statusBucket", () => {
  it("puts queued and running photos «in Arbeit» and failures under «Fehlgeschlagen»", () => {
    assert.equal(statusBucket(assets[3]), "working");
    assert.equal(statusBucket(assets[4]), "failed");
    assert.equal(statusBucket(row({ external_ref: "u", status: "uploading", run_status: null, status_label: null })), "working");
    assert.equal(statusBucket(row({ external_ref: "c", run_status: "cancelled", status_label: null })), "other");
  });
});

describe("applyFilter", () => {
  const names = (list: BatchAsset[]) => list.map((a) => a.external_ref);

  it("sorts file names naturally and never lists withdrawn photos", () => {
    assert.deepEqual(names(applyFilter(assets, DEFAULT_FILTER)), [
      "IMG_1.jpg",
      "IMG_2.jpg",
      "IMG_5.jpg",
      "IMG_10.jpg",
      "IMG_17.3.jpg",
    ]);
  });

  it("filters by status, QC and file name together", () => {
    assert.deepEqual(names(applyFilter(assets, { ...DEFAULT_FILTER, status: "review", qc: "open" })), ["IMG_2.jpg"]);
    assert.deepEqual(names(applyFilter(assets, { ...DEFAULT_FILTER, q: "17.3" })), ["IMG_17.3.jpg"]);
    assert.deepEqual(names(applyFilter(assets, { ...DEFAULT_FILTER, q: "img_1" })), [
      "IMG_1.jpg",
      "IMG_10.jpg",
      "IMG_17.3.jpg",
    ]);
  });

  it("sorts by confidence both ways, unknown confidence last", () => {
    assert.deepEqual(names(applyFilter(assets, { ...DEFAULT_FILTER, sort: "conf_asc" })), [
      "IMG_17.3.jpg",
      "IMG_2.jpg",
      "IMG_10.jpg",
      "IMG_1.jpg",
      "IMG_5.jpg",
    ]);
    assert.deepEqual(names(applyFilter(assets, { ...DEFAULT_FILTER, sort: "conf_desc" })).slice(0, 3), [
      "IMG_10.jpg",
      "IMG_2.jpg",
      "IMG_17.3.jpg",
    ]);
  });

  it("sorts by status with what needs a human first", () => {
    assert.deepEqual(names(applyFilter(assets, { ...DEFAULT_FILTER, sort: "status" })), [
      "IMG_5.jpg",
      "IMG_2.jpg",
      "IMG_17.3.jpg",
      "IMG_1.jpg",
      "IMG_10.jpg",
    ]);
  });

  it("does not reorder its input", () => {
    const before = names(assets);
    applyFilter(assets, { ...DEFAULT_FILTER, sort: "conf_desc" });
    assert.deepEqual(names(assets), before);
  });
});

describe("facetCounts", () => {
  it("counts each facet under the other facet and the search", () => {
    const all = facetCounts(assets, DEFAULT_FILTER);
    assert.deepEqual(all.status, { all: 5, accept: 1, review: 1, undetermined: 1, working: 1, failed: 1 });
    assert.deepEqual(all.qc, { all: 5, open: 4, machine: 1, confirmed: 0, corrected: 0 });

    const open = facetCounts(assets, { ...DEFAULT_FILTER, qc: "open" });
    assert.equal(open.status.all, 4);
    assert.equal(open.status.accept, 0);
    assert.equal(open.qc.machine, 1, "the QC facet itself is not narrowed by the QC choice");
  });
});

describe("isFinished", () => {
  it("is true only for photos with a record whose run is not still going", () => {
    assert.equal(isFinished(assets[0]), true);
    assert.equal(isFinished(assets[3]), false);
    assert.equal(isFinished(assets[4]), false);
  });
});
