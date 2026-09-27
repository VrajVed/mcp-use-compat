import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { toolChecks } from "../../src/checks/tools.js";
import { byId, goodTool, list, profile, runCheck, snapshot, src } from "./builders.js";

const check = (id: string) => byId(toolChecks, id);
const withTools = (...tools: Record<string, unknown>[]) => snapshot({ lists: { tools: list(tools) } });

describe("tool checks", () => {
  it("TOOL_NONE", () => {
    assert.deepEqual(runCheck(check("TOOL_NONE"), snapshot()), []);
    assert.equal(runCheck(check("TOOL_NONE"), withTools())[0].severity, "warn");
  });

  it("TOOL_NAME_INVALID", () => {
    assert.deepEqual(runCheck(check("TOOL_NAME_INVALID"), withTools(goodTool("a.b-c_1"))), []);
    const findings = runCheck(
      check("TOOL_NAME_INVALID"),
      withTools(goodTool("has space"), { ...goodTool(), name: 42 }, goodTool("x".repeat(129)))
    );
    assert.equal(findings.length, 3);
  });

  it("TOOL_NAME_DUPLICATE", () => {
    assert.deepEqual(runCheck(check("TOOL_NAME_DUPLICATE"), withTools(goodTool("a"), goodTool("b"))), []);
    const [f] = runCheck(check("TOOL_NAME_DUPLICATE"), withTools(goodTool("a"), goodTool("a")));
    assert.equal(f.subject, "a");
  });

  it("TOOL_NAME_CLIENT_CHARS maps reject/replace/unknown to severities", () => {
    const chars = (onInvalid: "reject" | "replace" | "unknown") =>
      profile({ id: onInvalid, limits: { toolNameChars: { value: { allowed: "A-Za-z0-9_-", onInvalid }, ...src } } });
    const profiles = [chars("reject"), chars("replace"), chars("unknown")];
    assert.deepEqual(runCheck(check("TOOL_NAME_CLIENT_CHARS"), withTools(goodTool("ok_name-1")), { profiles }), []);
    const findings = runCheck(check("TOOL_NAME_CLIENT_CHARS"), withTools(goodTool("files.read")), { profiles });
    assert.deepEqual(
      findings.map((f) => [f.client, f.severity]),
      [
        ["reject", "error"],
        ["replace", "warn"],
        ["unknown", "warn"],
      ]
    );
    assert.match(findings[1].message, /"files_read"/);
  });

  it("TOOL_NAME_TOO_LONG uses the prefix and server name", () => {
    const p = profile({
      limits: {
        maxToolNameLength: { value: { max: 30, onExceed: "truncate" }, ...src },
        toolNamePrefix: { value: { format: "mcp__{server}__" }, ...src },
      },
    });
    // "mcp__test-server__" is 18 chars; a 12-char name fits, 13 does not.
    assert.deepEqual(runCheck(check("TOOL_NAME_TOO_LONG"), withTools(goodTool("a".repeat(12))), { profiles: [p] }), []);
    const [f] = runCheck(check("TOOL_NAME_TOO_LONG"), withTools(goodTool("a".repeat(13))), { profiles: [p] });
    assert.equal(f.severity, "warn");
    assert.match(f.message, /is 31 characters/);
    assert.match(f.message, /truncates it to/);
  });

  it("TOOL_NAME_TOO_LONG applies lowercase and max prefix length", () => {
    const p = profile({
      limits: {
        maxToolNameLength: { value: { max: 20, onExceed: "reject" }, ...src },
        toolNamePrefix: { value: { format: "mcp_{server}_", maxLength: 8, lowercase: true }, ...src },
      },
    });
    // Prefix "mcp_test" (8) + 12 = 20 fits; 13 does not, and reject means error.
    assert.deepEqual(runCheck(check("TOOL_NAME_TOO_LONG"), withTools(goodTool("a".repeat(12))), { profiles: [p] }), []);
    assert.equal(
      runCheck(check("TOOL_NAME_TOO_LONG"), withTools(goodTool("a".repeat(13))), { profiles: [p] })[0].severity,
      "error"
    );
  });

  it("TOOL_NAME_TOO_LONG is silent without a known limit", () => {
    assert.deepEqual(
      runCheck(check("TOOL_NAME_TOO_LONG"), withTools(goodTool("a".repeat(100))), { profiles: [profile()] }),
      []
    );
  });

  it("TOOL_NAME_CLIENT_COLLISION after replacement and truncation", () => {
    const replacing = profile({
      id: "replacing",
      limits: { toolNameChars: { value: { allowed: "A-Za-z0-9_-", onInvalid: "replace" }, ...src } },
    });
    const [f] = runCheck(check("TOOL_NAME_CLIENT_COLLISION"), withTools(goodTool("files.read"), goodTool("files_read")), {
      profiles: [replacing],
    });
    assert.equal(f.severity, "error");
    assert.equal(f.client, "replacing");
    assert.match(f.message, /"files\.read" and "files_read" both become "files_read"/);

    const truncating = profile({ limits: { maxToolNameLength: { value: { max: 10, onExceed: "truncate" }, ...src } } });
    assert.equal(
      runCheck(check("TOOL_NAME_CLIENT_COLLISION"), withTools(goodTool("search_docs_v1"), goodTool("search_docs_v2")), {
        profiles: [truncating],
      }).length,
      1
    );
  });

  it("TOOL_NAME_CLIENT_COLLISION ignores hash-suffixed truncation and unknown handling", () => {
    const tools = withTools(goodTool("search_docs_v1"), goodTool("search_docs_v2"), goodTool("a.b"), goodTool("a_b"));
    const profiles = [
      profile({ limits: { maxToolNameLength: { value: { max: 10, onExceed: "truncateWithHash" }, ...src } } }),
      profile({ limits: { toolNameChars: { value: { allowed: "A-Za-z0-9_-", onInvalid: "unknown" }, ...src } } }),
    ];
    assert.deepEqual(runCheck(check("TOOL_NAME_CLIENT_COLLISION"), tools, { profiles }), []);
  });

  it("TOOL_COUNT_OVER_LIMIT", () => {
    const p = profile({ limits: { maxTools: { value: 2, ...src } } });
    assert.deepEqual(runCheck(check("TOOL_COUNT_OVER_LIMIT"), withTools(goodTool("a"), goodTool("b")), { profiles: [p] }), []);
    const [f] = runCheck(
      check("TOOL_COUNT_OVER_LIMIT"),
      withTools(goodTool("a"), goodTool("b"), goodTool("c")),
      { profiles: [p] }
    );
    assert.equal(f.client, "test-client");
  });

  it("TOOL_DESCRIPTION_MISSING", () => {
    assert.deepEqual(runCheck(check("TOOL_DESCRIPTION_MISSING"), snapshot()), []);
    const findings = runCheck(
      check("TOOL_DESCRIPTION_MISSING"),
      withTools(
        { ...goodTool("a"), description: null },
        { ...goodTool("b"), description: "  " },
        { name: "c", inputSchema: { type: "object" } }
      )
    );
    assert.deepEqual(
      findings.map((f) => f.subject),
      ["a", "b", "c"]
    );
    assert.match(findings[0].message, /null/);
  });

  it("TOOL_DESCRIPTION_SHORT", () => {
    assert.deepEqual(runCheck(check("TOOL_DESCRIPTION_SHORT"), snapshot()), []);
    assert.equal(runCheck(check("TOOL_DESCRIPTION_SHORT"), withTools({ ...goodTool(), description: "Weather" })).length, 1);
  });

  it("TOOL_DESCRIPTION_TRUNCATED covers tools and server instructions", () => {
    const p = profile({ limits: { maxDescriptionLength: { value: 50, ...src } } });
    assert.deepEqual(runCheck(check("TOOL_DESCRIPTION_TRUNCATED"), snapshot(), { profiles: [p] }), []);
    const s = snapshot({
      initialize: { instructions: "i".repeat(51) },
      lists: { tools: list([{ ...goodTool(), description: "d".repeat(51) }]) },
    });
    assert.deepEqual(
      runCheck(check("TOOL_DESCRIPTION_TRUNCATED"), s, { profiles: [p] }).map((f) => f.subject),
      ["get_weather", "(server instructions)"]
    );
  });

  it("TOOL_STRUCTURED_OUTPUT_HANDLING", () => {
    const handling = (value: "replacesText" | "alongsideText" | "fallbackOnly") =>
      profile({ id: value, limits: { structuredContent: { value, ...src } } });
    const profiles = [handling("replacesText"), handling("alongsideText"), handling("fallbackOnly")];
    assert.equal(check("TOOL_STRUCTURED_OUTPUT_HANDLING").appliesTo(snapshot()), false);
    const s = withTools({ ...goodTool(), outputSchema: { type: "object" } });
    assert.deepEqual(
      runCheck(check("TOOL_STRUCTURED_OUTPUT_HANDLING"), s, { profiles }).map((f) => [f.client, f.severity]),
      [
        ["replacesText", "info"],
        ["fallbackOnly", "info"],
      ]
    );
  });

  it("TOOL_ANNOTATIONS_CONFLICT", () => {
    assert.deepEqual(
      runCheck(check("TOOL_ANNOTATIONS_CONFLICT"), withTools({ ...goodTool(), annotations: { readOnlyHint: true } })),
      []
    );
    assert.equal(
      runCheck(
        check("TOOL_ANNOTATIONS_CONFLICT"),
        withTools({ ...goodTool(), annotations: { readOnlyHint: true, destructiveHint: true } })
      ).length,
      1
    );
  });

  it("TOOL_ANNOTATIONS_CONFLICT flags write-sounding tools marked read-only", () => {
    const [f] = runCheck(
      check("TOOL_ANNOTATIONS_CONFLICT"),
      withTools({ ...goodTool("place_order"), annotations: { readOnlyHint: true } })
    );
    assert.equal(f.severity, "warn");
    assert.match(f.message, /"place"/);
    assert.deepEqual(
      runCheck(check("TOOL_ANNOTATIONS_CONFLICT"), withTools({ ...goodTool("place_order"), annotations: { readOnlyHint: false } })),
      []
    );
  });

  it("TOOL_ANNOTATIONS_MISSING", () => {
    assert.deepEqual(
      runCheck(check("TOOL_ANNOTATIONS_MISSING"), withTools({ ...goodTool("get_quote"), annotations: { readOnlyHint: true } })),
      []
    );
    // Writes without annotations are safe (clients assume destructive), so only reads are reported.
    const [f] = runCheck(
      check("TOOL_ANNOTATIONS_MISSING"),
      withTools(goodTool("get_holdings"), goodTool("listOrders"), goodTool("place_order"), goodTool("sequentialthinking"))
    );
    assert.equal(f.severity, "info");
    assert.equal(f.subject, "get_holdings, listOrders");
    assert.match(f.message, /no annotations at all/);
  });

});

describe("SDK behaviour our messages rely on", () => {
  const parse = (tool: Record<string, unknown>) => ListToolsResultSchema.safeParse({ tools: [tool] }).success;

  it("rejects the whole tools/list for a null description", () => {
    assert.equal(parse({ ...goodTool(), description: null }), false);
  });

  it("rejects the whole tools/list for a missing or non-object inputSchema", () => {
    assert.equal(parse({ name: "a", description: "d" }), false);
    assert.equal(parse({ ...goodTool(), inputSchema: { type: "string" } }), false);
  });
});
