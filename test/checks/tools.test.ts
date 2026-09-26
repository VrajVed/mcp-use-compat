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

  it("TOOL_NAME_REJECTED_BY_CLIENT", () => {
    const p = profile({ limits: { toolNamePattern: { value: "^[a-zA-Z0-9_-]{1,64}$", ...src } } });
    assert.deepEqual(runCheck(check("TOOL_NAME_REJECTED_BY_CLIENT"), withTools(goodTool("ok_name")), { profiles: [p] }), []);
    const [f] = runCheck(check("TOOL_NAME_REJECTED_BY_CLIENT"), withTools(goodTool("files.read")), { profiles: [p] });
    assert.equal(f.client, "test-client");
    assert.equal(f.source, src.source);
  });

  it("TOOL_NAME_TOO_LONG uses the prefix and server name", () => {
    const p = profile({
      limits: {
        maxToolNameLength: { value: 30, ...src },
        toolNamePrefix: { value: "mcp__{server}__", ...src },
      },
    });
    // "mcp__test-server__" is 18 chars; 12-char name fits, 13 does not.
    assert.deepEqual(runCheck(check("TOOL_NAME_TOO_LONG"), withTools(goodTool("a".repeat(12))), { profiles: [p] }), []);
    const [f] = runCheck(check("TOOL_NAME_TOO_LONG"), withTools(goodTool("a".repeat(13))), { profiles: [p] });
    assert.match(f.message, /31 characters/);
  });

  it("TOOL_NAME_TOO_LONG is silent without a known limit", () => {
    assert.deepEqual(
      runCheck(check("TOOL_NAME_TOO_LONG"), withTools(goodTool("a".repeat(100))), { profiles: [profile()] }),
      []
    );
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

  it("TOOL_DESCRIPTION_SHORT and TOOL_DESCRIPTION_LONG", () => {
    assert.deepEqual(runCheck(check("TOOL_DESCRIPTION_SHORT"), snapshot()), []);
    assert.deepEqual(runCheck(check("TOOL_DESCRIPTION_LONG"), snapshot()), []);
    assert.equal(runCheck(check("TOOL_DESCRIPTION_SHORT"), withTools({ ...goodTool(), description: "Weather" })).length, 1);
    assert.equal(
      runCheck(check("TOOL_DESCRIPTION_LONG"), withTools({ ...goodTool(), description: "x".repeat(1025) })).length,
      1
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
