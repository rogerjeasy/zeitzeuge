import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { callerFrom } from "../caller";

describe("callerFrom", () => {
  it("forwards CloudFront's viewer address, which a browser cannot forge", () => {
    const caller = callerFrom(
      new Headers({
        "CloudFront-Viewer-Address": "198.51.100.10:46532",
        "CloudFront-Viewer-Country": "CH",
        "User-Agent": "Mozilla/5.0",
      }),
    );
    assert.deepEqual(caller, {
      "cloudfront-viewer-address": "198.51.100.10:46532",
      "cloudfront-viewer-country": "CH",
      "user-agent": "Mozilla/5.0",
    });
  });

  it("never passes on credentials or anything it does not know", () => {
    const caller = callerFrom(
      new Headers({ Authorization: "Bearer stolen", Cookie: "zz_at=x", "X-ZZ-Session": "s", Host: "evil" }),
    );
    assert.deepEqual(caller, {});
  });
});
