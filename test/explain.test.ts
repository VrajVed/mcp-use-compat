import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALL_CHECKS } from "../src/checks/index.js";
import { EXPLANATIONS } from "../src/checks/explanations.js";
import { UsageError } from "../src/cli.js";
import { renderExplanation } from "../src/explain.js";

describe("explain", () => {
  it("every check has an explanation, and every explanation is a check", () => {
    const ids = new Set(ALL_CHECKS.map((c) => c.id));
    assert.deepEqual(ALL_CHECKS.map((c) => c.id).filter((id) => !EXPLANATIONS[id]), []);
    assert.deepEqual(Object.keys(EXPLANATIONS).filter((id) => !ids.has(id)), []);
  });

  it("sources are https URLs", () => {
    for (const [id, e] of Object.entries(EXPLANATIONS)) {
      for (const s of e.sources ?? []) assert.match(s, /^https:\/\//, id);
    }
  });

  it("renders the rationale and the client facts the check uses", () => {
    const text = renderExplanation("tool_name_too_long");
    assert.match(text, /^TOOL_NAME_TOO_LONG {2}\(tools\)/);
    assert.match(text, /Clients prefix tool names with the server name/);
    assert.match(text, /Cursor: maxToolNameLength = \{"max":60/);
    assert.match(text, /forum\.cursor\.com/);
  });

  it("suggests similar ids for an unknown one", () => {
    assert.throws(() => renderExplanation("TOOL_NAME_TOOLONG"), (err: Error) => err instanceof UsageError && /TOOL_NAME/.test(err.message));
  });
});
