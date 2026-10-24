import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseSubjectPoint, swisstopoEmbedUrl, swisstopoOpenUrl } from "../geo";
import { capabilitiesFor } from "../permissions";

describe("parseSubjectPoint", () => {
  it("reads the typed LV95 pair, or the «E / N» text", () => {
    assert.deepEqual(parseSubjectPoint({ typed_value: { lv95: [2692480.4, 1208912.6] } }), { e: 2692480, n: 1208913 });
    assert.deepEqual(parseSubjectPoint({ typed_value: null, value: "2692480 / 1208913" }), { e: 2692480, n: 1208913 });
  });
  it("refuses what is not a Swiss LV95 point", () => {
    assert.equal(parseSubjectPoint(undefined), null);
    assert.equal(parseSubjectPoint({ typed_value: { lv95: [8.65, 47.02] } }), null);
    assert.equal(parseSubjectPoint({ value: "unbekannt" }), null);
  });
});

describe("swisstopo URLs", () => {
  it("builds the spec's embed URL and the full-viewer link", () => {
    const p = { e: 2692480, n: 1208913 };
    assert.equal(
      swisstopoEmbedUrl(p, "de"),
      "https://map.geo.admin.ch/#/embed?lang=de&center=2692480,1208913&z=9&crosshair=marker&bgLayer=ch.swisstopo.pixelkarte-farbe",
    );
    assert.ok(swisstopoOpenUrl(p, "fr").startsWith("https://map.geo.admin.ch/#/map?lang=fr&center=2692480,1208913"));
    assert.ok(swisstopoEmbedUrl(p, "xx").includes("lang=de"));
  });
});

describe("capabilitiesFor", () => {
  it("mirrors the API's role checks", () => {
    const all = { canApprove: true, canReview: true, canWrite: true };
    const none = { canApprove: false, canReview: false, canWrite: false };
    assert.deepEqual(capabilitiesFor("archivist"), all);
    assert.deepEqual(capabilitiesFor("admin"), all);
    assert.deepEqual(capabilitiesFor("reviewer"), { canApprove: false, canReview: true, canWrite: true });
    // The operator may re-run, but not accept or correct (API commit 9cc759f).
    assert.deepEqual(capabilitiesFor("operator"), { canApprove: false, canReview: false, canWrite: true });
    assert.deepEqual(capabilitiesFor("reader"), none);
    assert.deepEqual(capabilitiesFor("guest"), none);
    assert.deepEqual(capabilitiesFor(undefined), none);
  });
});
