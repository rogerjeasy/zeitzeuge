import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const load = (locale: string) =>
  JSON.parse(readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8")) as Record<string, unknown>;

const keys = (value: unknown, prefix = ""): string[] =>
  value && typeof value === "object"
    ? Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => keys(v, `${prefix}${k}.`))
    : [prefix.slice(0, -1)];

describe("message catalogues", () => {
  const de = new Set(keys(load("de")));
  for (const locale of ["en", "fr"]) {
    it(`${locale} has exactly the keys de has`, () => {
      const other = new Set(keys(load(locale)));
      assert.deepEqual([...de].filter((k) => !other.has(k)), [], `missing in ${locale}`);
      assert.deepEqual([...other].filter((k) => !de.has(k)), [], `only in ${locale}`);
    });
  }
});
