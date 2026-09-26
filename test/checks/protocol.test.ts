import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { protocolChecks } from "../../src/checks/protocol.js";
import { byId, failedList, goodTool, list, runCheck, snapshot } from "./builders.js";

const check = (id: string) => byId(protocolChecks, id);

describe("protocol checks", () => {
  it("PROTOCOL_MODERN_ONLY", () => {
    assert.equal(check("PROTOCOL_MODERN_ONLY").appliesTo(snapshot()), false);
    assert.deepEqual(
      runCheck(check("PROTOCOL_MODERN_ONLY"), snapshot({ discover: { ok: false, error: { code: -32601, message: "nope" } } })),
      []
    );
    const [f] = runCheck(
      check("PROTOCOL_MODERN_ONLY"),
      snapshot({
        connect: { ok: false, error: "Method not found: initialize" },
        discover: { ok: true, result: { supportedVersions: ["2026-07-28"], capabilities: {} } },
      })
    );
    assert.equal(f.severity, "error");
    assert.match(f.message, /2026-07-28/);
  });

  it("PROTOCOL_DISCOVER_MISSING", () => {
    assert.equal(check("PROTOCOL_DISCOVER_MISSING").appliesTo(snapshot()), false);
    assert.deepEqual(
      runCheck(check("PROTOCOL_DISCOVER_MISSING"), snapshot({ discover: { ok: true, result: { supportedVersions: [] } } })),
      []
    );
    const [f] = runCheck(
      check("PROTOCOL_DISCOVER_MISSING"),
      snapshot({ discover: { ok: false, error: { code: -32601, message: "Method not found" } } })
    );
    assert.equal(f.severity, "info");
  });

  it("PROTOCOL_VERSION_UNSUPPORTED", () => {
    assert.deepEqual(runCheck(check("PROTOCOL_VERSION_UNSUPPORTED"), snapshot()), []);
    const [f] = runCheck(
      check("PROTOCOL_VERSION_UNSUPPORTED"),
      snapshot({ initialize: { negotiatedProtocolVersion: "1.0" } })
    );
    assert.equal(f.severity, "error");
    assert.equal(
      runCheck(check("PROTOCOL_VERSION_UNSUPPORTED"), snapshot({ initialize: { negotiatedProtocolVersion: undefined } }))
        .length,
      1
    );
  });

  it("PROTOCOL_VERSION_OLD", () => {
    assert.deepEqual(runCheck(check("PROTOCOL_VERSION_OLD"), snapshot()), []);
    assert.equal(
      runCheck(check("PROTOCOL_VERSION_OLD"), snapshot({ initialize: { negotiatedProtocolVersion: "2024-11-05" } }))[0]
        .severity,
      "warn"
    );
    assert.equal(
      runCheck(check("PROTOCOL_VERSION_OLD"), snapshot({ initialize: { negotiatedProtocolVersion: "2025-06-18" } }))[0]
        .severity,
      "info"
    );
  });

  it("PROTOCOL_SERVERINFO_MISSING", () => {
    assert.deepEqual(runCheck(check("PROTOCOL_SERVERINFO_MISSING"), snapshot()), []);
    const [f] = runCheck(check("PROTOCOL_SERVERINFO_MISSING"), snapshot({ initialize: { serverInfo: { name: "x" } } }));
    assert.match(f.message, /version/);
  });

  it("PROTOCOL_CAPABILITY_UNDECLARED", () => {
    assert.deepEqual(runCheck(check("PROTOCOL_CAPABILITY_UNDECLARED"), snapshot()), []);
    const [f] = runCheck(
      check("PROTOCOL_CAPABILITY_UNDECLARED"),
      snapshot({ initialize: { capabilities: {} }, lists: { tools: list([goodTool()]) } })
    );
    assert.equal(f.subject, "tools");
    assert.equal(f.severity, "error");
  });

  it("PROTOCOL_CAPABILITY_BROKEN", () => {
    assert.deepEqual(runCheck(check("PROTOCOL_CAPABILITY_BROKEN"), snapshot()), []);
    const findings = runCheck(
      check("PROTOCOL_CAPABILITY_BROKEN"),
      snapshot({
        initialize: { capabilities: { tools: {}, resources: {} } },
        lists: {
          tools: failedList(-32603, "boom"),
          resources: list([]),
          resourceTemplates: failedList(-32601, "Method not found"),
        },
      })
    );
    assert.deepEqual(
      findings.map((f) => [f.subject, f.severity]),
      [
        ["tools", "error"],
        ["resourceTemplates", "warn"],
      ]
    );
  });

  it("PROTOCOL_CAPABILITY_BROKEN ignores undeclared capabilities", () => {
    const s = snapshot({ lists: { tools: list([goodTool()]), prompts: failedList(-32601, "Method not found") } });
    assert.deepEqual(runCheck(check("PROTOCOL_CAPABILITY_BROKEN"), s), []);
  });

  it("PROTOCOL_PAGINATION_BROKEN", () => {
    assert.deepEqual(runCheck(check("PROTOCOL_PAGINATION_BROKEN"), snapshot()), []);
    const [f] = runCheck(
      check("PROTOCOL_PAGINATION_BROKEN"),
      snapshot({ lists: { tools: list([goodTool()], { cursorLoop: true }) } })
    );
    assert.equal(f.subject, "tools");
  });
});
