import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALL_PROFILES, selectProfiles, UnknownClientError } from "../../src/profiles/index.js";
import type { Sourced } from "../../src/profiles/types.js";

const MAX_AGE_DAYS = 180;

function facts(): Array<[string, Sourced<unknown>]> {
  return ALL_PROFILES.flatMap((p) => [
    ...Object.entries(p.supports).map(([k, v]): [string, Sourced<unknown>] => [`${p.id}.supports.${k}`, v!]),
    ...Object.entries(p.limits).map(([k, v]): [string, Sourced<unknown>] => [`${p.id}.limits.${k}`, v!]),
  ]);
}

describe("client profiles", () => {
  it("have unique ids and aliases", () => {
    const names = ALL_PROFILES.flatMap((p) => [p.id, ...p.aliases]);
    assert.equal(new Set(names).size, names.length);
  });

  it("source every fact with an https URL and a valid date", () => {
    for (const [where, fact] of facts()) {
      assert.match(fact.source, /^https:\/\//, where);
      assert.match(fact.verifiedOn, /^\d{4}-\d{2}-\d{2}$/, where);
      assert.ok(!Number.isNaN(Date.parse(fact.verifiedOn)), where);
    }
  });

  it(`have no fact older than ${MAX_AGE_DAYS} days (re-verify and bump verifiedOn)`, () => {
    const stale = facts().filter(([, f]) => Date.now() - Date.parse(f.verifiedOn) > MAX_AGE_DAYS * 86_400_000);
    assert.deepEqual(
      stale.map(([where]) => where),
      []
    );
  });

  it("use regexes that compile", () => {
    for (const p of ALL_PROFILES) {
      const chars = p.limits.toolNameChars?.value.allowed;
      if (chars) new RegExp(`[^${chars}]`);
      const pattern = p.limits.inputPropertyNamePattern?.value;
      if (pattern) new RegExp(pattern);
    }
  });

  it("selectProfiles resolves ids and aliases, and rejects unknown ones", () => {
    assert.equal(selectProfiles(undefined).length, ALL_PROFILES.length);
    assert.deepEqual(
      selectProfiles(["Claude", "vscode"]).map((p) => p.id),
      ["claude-desktop", "vscode-copilot"]
    );
    assert.throws(() => selectProfiles(["netscape"]), UnknownClientError);
  });
});
