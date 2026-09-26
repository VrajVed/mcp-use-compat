import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { README, render } from "../scripts/readme.js";

describe("README", () => {
  it("generated sections are up to date (run `npm run readme`)", () => {
    const current = readFileSync(README, "utf8");
    assert.equal(render(current), current);
  });
});
