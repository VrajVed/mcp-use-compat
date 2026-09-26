import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { ALL_CHECKS } from "../../src/checks/index.js";

describe("check registry", () => {
  it("has unique ids in SCREAMING_SNAKE_CASE", () => {
    const ids = ALL_CHECKS.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, /^[A-Z]+(_[A-Z0-9]+)+$/);
  });

  it("every check is referenced by at least one test", () => {
    const dir = resolve(import.meta.dirname);
    const tests = readdirSync(dir)
      .filter((f) => f.endsWith(".test.ts") && f !== "registry.test.ts")
      .map((f) => readFileSync(resolve(dir, f), "utf8"))
      .join("\n");
    const untested = ALL_CHECKS.map((c) => c.id).filter((id) => !tests.includes(`"${id}"`));
    assert.deepEqual(untested, []);
  });
});
