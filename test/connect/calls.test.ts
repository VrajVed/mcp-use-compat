import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeToProbe, synthesizeArgs } from "../../src/connect/calls.js";
import { connect } from "../../src/connect/index.js";
import { fixture } from "../helpers.js";

describe("safeToProbe", () => {
  const tool = (name: string, annotations?: Record<string, unknown>) => ({ name, annotations });

  it("only allows tools that explicitly declare readOnlyHint: true", () => {
    assert.equal(safeToProbe(tool("get_quote", { readOnlyHint: true })), true);
    assert.equal(safeToProbe(tool("get_quote")), false);
    assert.equal(safeToProbe(tool("get_quote", { readOnlyHint: false })), false);
  });

  it("refuses read-only tools that also look destructive", () => {
    assert.equal(safeToProbe(tool("get_quote", { readOnlyHint: true, destructiveHint: true })), false);
    assert.equal(safeToProbe(tool("place_order", { readOnlyHint: true })), false);
    assert.equal(safeToProbe(tool("deleteAll", { readOnlyHint: true })), false);
  });
});

describe("synthesizeArgs", () => {
  it("fills only required properties with minimal valid values", () => {
    assert.deepEqual(
      synthesizeArgs({
        type: "object",
        properties: {
          symbol: { type: "string" },
          limit: { type: "integer", minimum: 5 },
          side: { type: "string", enum: ["buy", "sell"] },
          from: { type: "string", format: "date" },
          tags: { type: "array", items: { type: "string" }, minItems: 1 },
          filter: { type: "object", properties: { active: { type: "boolean" } }, required: ["active"] },
          mode: { type: "string", default: "fast" },
          optional: { type: "string" },
        },
        required: ["symbol", "limit", "side", "from", "tags", "filter", "mode"],
      }),
      {
        symbol: "test",
        limit: 5,
        side: "buy",
        from: "2026-01-02",
        tags: ["test"],
        filter: { active: false },
        mode: "fast",
      }
    );
  });

  it("returns {} for schemas without required properties or no schema", () => {
    assert.deepEqual(synthesizeArgs({ type: "object", properties: { a: { type: "string" } } }), {});
    assert.deepEqual(synthesizeArgs(undefined), {});
  });
});

describe("connect with --probe-calls", () => {
  it("calls only safe tools and records results and errors", async () => {
    const logs: string[] = [];
    const s = await connect({
      target: fixture("calls"),
      timeoutMs: 10000,
      authProbe: false,
      probeCalls: true,
      log: (m) => logs.push(m),
    });
    const called = s.calls!.map((c) => c.tool);
    assert.deepEqual(called, ["get_fine", "get_price", "get_status", "get_summary", "list_items", "get_broken"]);
    assert.ok(!s.io.stderrTail.some((l) => /CALLED (place_order|delete_all)/.test(l)), "must never call unsafe tools");
    assert.match(logs[0], /calling 6 read-only tool/);
    const broken = s.calls!.find((c) => c.tool === "get_broken")!;
    assert.deepEqual(broken.error, { code: -32603, message: "upstream API down" });
    assert.deepEqual(s.calls![0].args, { symbol: "test" });
  });

  it("makes explicit calls regardless of annotations", async () => {
    const s = await connect({
      target: fixture("calls"),
      timeoutMs: 10000,
      authProbe: false,
      calls: [{ tool: "delete_all", args: { symbol: "x" } }],
    });
    assert.deepEqual(s.calls?.map((c) => [c.tool, c.origin]), [["delete_all", "explicit"]]);
  });
});
