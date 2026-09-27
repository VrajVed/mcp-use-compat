import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { protocolChecks } from "../../src/checks/protocol.js";
import type { ServerSnapshot } from "../../src/snapshot.js";
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

  it("PROTOCOL_MODERN_ONLY also recognises era: modern", () => {
    const [f] = runCheck(
      check("PROTOCOL_MODERN_ONLY"),
      snapshot({ era: "modern", connect: { ok: true, legacyError: "Method not found" }, discover: { ok: true, result: { supportedVersions: ["2026-07-28"] } } })
    );
    assert.equal(f.evidence?.initializeError, "Method not found");
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

  it("PROTOCOL_VERSIONS_REJECTED", () => {
    assert.equal(check("PROTOCOL_VERSIONS_REJECTED").appliesTo(snapshot()), false);
    const s = snapshot({
      versionMatrix: [
        { requested: "2024-11-05", ok: false, error: "Unsupported protocol version" },
        { requested: "2025-03-26", ok: true, negotiated: "2025-11-25" },
        { requested: "2025-06-18", ok: true, negotiated: "2025-06-18" },
        { requested: "2025-11-25", ok: true, negotiated: "2025-06-18" },
        { requested: "2099-01-01", ok: true, negotiated: "banana" },
      ],
    });
    assert.deepEqual(
      runCheck(check("PROTOCOL_VERSIONS_REJECTED"), s).map((f) => [f.subject, f.severity]),
      [
        ["2024-11-05", "warn"],
        ["2025-03-26", "info"],
        ["2099-01-01", "error"],
      ]
    );
  });

  it("PROTOCOL_VERSION_SURFACE_DIFFERS", () => {
    const same = snapshot({
      versionMatrix: [
        { requested: "2025-06-18", ok: true, negotiated: "2025-06-18", tools: ["a", "b"] },
        { requested: "2025-11-25", ok: true, negotiated: "2025-11-25", tools: ["a", "b"] },
      ],
    });
    assert.deepEqual(runCheck(check("PROTOCOL_VERSION_SURFACE_DIFFERS"), same), []);
    const differs = snapshot({
      versionMatrix: [
        { requested: "2025-06-18", ok: true, negotiated: "2025-06-18", tools: ["a"] },
        { requested: "2025-11-25", ok: true, negotiated: "2025-11-25", tools: ["a", "b"] },
      ],
    });
    const [f] = runCheck(check("PROTOCOL_VERSION_SURFACE_DIFFERS"), differs);
    assert.equal(f.subject, "2025-06-18");
    assert.match(f.message, /: b\.$/);
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

describe("2026-07-28 checks", () => {
  const good = { resultType: "complete", ttlMs: 60000, cacheScope: "public", serverInfo: { name: "s", version: "1" } };
  const modern = (overrides: Partial<NonNullable<ServerSnapshot["modern"]>> = {}, era: ServerSnapshot["era"] = "both") =>
    snapshot({
      era,
      modern: {
        version: "2026-07-28",
        supported: true,
        discover: { ok: true, result: { supportedVersions: ["2026-07-28"], capabilities: {} } },
        discoverMeta: good,
        lists: { tools: list([goodTool()]) },
        pagesMeta: { tools: [good] },
        unsupportedVersion: { answered: false, code: -32022, data: { supported: ["2026-07-28"] } },
        ...overrides,
      },
    });

  it("none apply to servers that don't speak 2026-07-28", () => {
    for (const id of ["PROTOCOL_MODERN_RESULT_TYPE", "PROTOCOL_MODERN_CACHE_FIELDS", "PROTOCOL_MODERN_SERVERINFO", "PROTOCOL_MODERN_VERSION_ERROR", "PROTOCOL_MODERN_SURFACE_DIFFERS"]) {
      assert.equal(check(id).appliesTo(snapshot()), false, id);
    }
  });

  it("a conformant server passes all of them", () => {
    for (const id of ["PROTOCOL_MODERN_RESULT_TYPE", "PROTOCOL_MODERN_CACHE_FIELDS", "PROTOCOL_MODERN_SERVERINFO", "PROTOCOL_MODERN_VERSION_ERROR", "PROTOCOL_MODERN_SURFACE_DIFFERS"]) {
      assert.deepEqual(runCheck(check(id), modern()), [], id);
    }
  });

  it("PROTOCOL_MODERN_RESULT_TYPE", () => {
    const missing = runCheck(check("PROTOCOL_MODERN_RESULT_TYPE"), modern({ pagesMeta: { tools: [{ ...good, resultType: undefined }] } }));
    assert.deepEqual(missing.map((f) => [f.severity, f.subject]), [["warn", "tools/list"]]);
    const invalid = runCheck(check("PROTOCOL_MODERN_RESULT_TYPE"), modern({ discoverMeta: { ...good, resultType: "partial" } }));
    assert.deepEqual(invalid.map((f) => [f.severity, f.subject]), [["error", "server/discover"]]);
  });

  it("PROTOCOL_MODERN_CACHE_FIELDS", () => {
    const [f] = runCheck(
      check("PROTOCOL_MODERN_CACHE_FIELDS"),
      modern({ pagesMeta: { tools: [{ ...good, ttlMs: -1 }] }, discoverMeta: { ...good, cacheScope: "shared" } })
    );
    assert.equal(f.severity, "warn");
    assert.equal(f.subject, "server/discover, tools/list");
  });

  it("PROTOCOL_MODERN_SERVERINFO", () => {
    const [f] = runCheck(check("PROTOCOL_MODERN_SERVERINFO"), modern({ pagesMeta: { tools: [{ ...good, serverInfo: undefined }] } }));
    assert.equal(f.severity, "info");
    assert.match(f.message, /1 result/);
  });

  it("PROTOCOL_MODERN_VERSION_ERROR", () => {
    const run = (unsupportedVersion: NonNullable<ServerSnapshot["modern"]>["unsupportedVersion"]) =>
      runCheck(check("PROTOCOL_MODERN_VERSION_ERROR"), modern({ unsupportedVersion }));
    assert.match(run({ answered: true })[0].message, /answered normally/);
    assert.match(run({ answered: false, code: -32602, message: "bad" })[0].message, /instead of -32022/);
    assert.match(run({ answered: false, code: -32022, data: {} })[0].message, /no data\.supported/);
  });

  it("PROTOCOL_MODERN_SURFACE_DIFFERS", () => {
    const s = modern({ lists: { tools: list([goodTool("search"), goodTool("search_v2")]) } });
    s.lists = { tools: list([goodTool("search"), goodTool("legacy_export")]) };
    const [f] = runCheck(check("PROTOCOL_MODERN_SURFACE_DIFFERS"), s);
    assert.deepEqual(f.evidence, { onlyLegacy: ["legacy_export"], onlyModern: ["search_v2"] });
    // Only compares when the server speaks both.
    assert.equal(check("PROTOCOL_MODERN_SURFACE_DIFFERS").appliesTo({ ...s, era: "modern" }), false);
  });

  it("version checks skip servers that only speak 2026-07-28", () => {
    const s = modern({}, "modern");
    s.initialize = { ...s.initialize!, negotiatedProtocolVersion: "2026-07-28" };
    assert.equal(check("PROTOCOL_VERSION_UNSUPPORTED").appliesTo(s), false);
    assert.equal(check("PROTOCOL_SERVERINFO_MISSING").appliesTo(s), false);
  });
});

