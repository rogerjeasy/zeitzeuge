import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { summariseBulk } from "../bulk";

describe("summariseBulk", () => {
  it("separates what worked from why the rest was skipped", () => {
    const summary = summariseBulk({
      action: "delete",
      requested: 4,
      succeeded: 2,
      results: [
        { asset_id: "a", ok: true, detail: null },
        { asset_id: "b", ok: false, detail: "already_withdrawn" },
        { asset_id: "c", ok: true, detail: null },
        { asset_id: "d", ok: false, detail: "something_new" },
      ],
    });
    assert.deepEqual(summary, {
      requested: 4,
      succeeded: 2,
      okIds: ["a", "c"],
      skipped: { already_withdrawn: 1, other: 1 },
    });
  });
});
