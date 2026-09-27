import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { UsageError } from "../src/cli.js";
import { buildDiff, diffSnapshots, renderDiffMarkdown, type Change } from "../src/diff.js";
import { goodTool, list, snapshot } from "./checks/builders.js";

const tool = (name: string, inputSchema: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  ...goodTool(name),
  inputSchema,
  ...extra,
});
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
const withTools = (...tools: Record<string, unknown>[]) => snapshot({ lists: { tools: list(tools) } });
const toolChanges = (a: Record<string, unknown>[], b: Record<string, unknown>[]) =>
  diffSnapshots(withTools(...a), withTools(...b))
    .filter((c) => c.kind === "tool")
    .map((c): [Change["level"], string] => [c.level, c.message]);

describe("diffSnapshots", () => {
  it("reports nothing for identical snapshots", () => {
    assert.deepEqual(diffSnapshots(snapshot(), snapshot()), []);
  });

  it("classifies removed and added tools", () => {
    assert.deepEqual(toolChanges([goodTool("a"), goodTool("b")], [goodTool("a"), goodTool("c")]), [
      ["breaking", "Tool removed."],
      ["change", "Tool added."],
    ]);
  });

  it("classifies input argument changes", () => {
    const before = tool("t", obj({ q: { type: "string" }, limit: { type: "number" }, old: { type: "string" } }, ["q"]));
    const after = tool("t", obj({ q: { type: "number" }, limit: { type: "number" }, org: { type: "string" }, tag: { type: "string" } }, ["limit", "org"]));
    assert.deepEqual(toolChanges([before], [after]).sort(), [
      ["breaking", 'Argument "limit" became required.'],
      ["breaking", 'Argument "old" removed.'],
      ["breaking", 'Argument "q" changed type from string to number.'],
      ["breaking", 'New required argument "org".'],
      ["change", 'Argument "q" became optional.'],
      ["change", 'New optional argument "tag".'],
    ]);
  });

  it("walks nested objects and arrays, and classifies enums by direction", () => {
    const before = tool("t", obj({ filter: obj({ side: { type: "string", enum: ["buy", "sell"] } }), ids: { type: "array", items: { type: "string" } } }));
    const after = tool("t", obj({ filter: obj({ side: { type: "string", enum: ["buy"] } }), ids: { type: "array", items: { type: "number" } } }));
    assert.deepEqual(toolChanges([before], [after]).sort(), [
      ["breaking", 'Argument "ids.[]" changed type from string to number.'],
      ["breaking", 'Enum value(s) "sell" removed for "filter.side".'],
    ]);
  });

  it("classifies output schema changes", () => {
    const out = (props: Record<string, unknown>, required: string[] = []) => ({ outputSchema: obj(props, required) });
    const before = tool("t", obj({}), out({ price: { type: "number" }, qty: { type: "number" } }, ["price"]));
    const after = tool("t", obj({}), out({ qty: { type: "number" }, currency: { type: "string" } }));
    assert.deepEqual(toolChanges([before], [after]).sort(), [
      ["breaking", 'Output field "price" removed.'],
      ["change", 'New output field "currency".'],
    ]);
    assert.deepEqual(toolChanges([before], [tool("t", obj({}))]), [
      ["breaking", "outputSchema removed; consumers of structuredContent lose their contract."],
    ]);
  });

  it("marks description and annotation changes as notable", () => {
    const before = { ...goodTool("t"), annotations: { readOnlyHint: true } };
    const after = { ...goodTool("t"), description: "Something else entirely.", annotations: { readOnlyHint: false } };
    assert.deepEqual(toolChanges([before], [after]).map(([level]) => level), ["notable", "notable"]);
  });

  it("covers resources, prompts, capabilities and protocol", () => {
    const before = snapshot({
      initialize: { capabilities: { tools: {}, prompts: {} }, negotiatedProtocolVersion: "2025-06-18" },
      lists: {
        tools: list([goodTool()]),
        resources: list([{ name: "r", uri: "x://r" }]),
        prompts: list([{ name: "p", arguments: [{ name: "a" }, { name: "gone" }] }]),
      },
    });
    const after = snapshot({
      initialize: { capabilities: { tools: {}, resources: {} }, negotiatedProtocolVersion: "2025-11-25" },
      lists: {
        tools: list([goodTool()]),
        resources: list([]),
        prompts: list([{ name: "p", arguments: [{ name: "a", required: true }, { name: "b", required: true }] }]),
      },
    });
    const summary = diffSnapshots(before, after)
      .filter((c) => c.kind !== "compat")
      .map((c) => `${c.level} ${c.kind} ${c.subject}: ${c.message}`);
    assert.deepEqual(summary, [
      "breaking capability prompts: Capability no longer declared.",
      "breaking prompt p: Argument \"a\" became required.",
      "breaking prompt p: New required argument \"b\".",
      "breaking prompt p: Argument \"gone\" removed.",
      "breaking resource x://r: Resource removed.",
      "change capability resources: Capability added.",
      "notable protocol protocolVersion: Negotiated protocol changed from 2025-06-18 to 2025-11-25.",
    ]);
  });

  it("reports new compatibility failures as regressions", () => {
    const changes = diffSnapshots(withTools(goodTool("files_read")), withTools(goodTool("files_read"), goodTool("files.read")));
    const compat = changes.filter((c) => c.kind === "compat");
    assert.ok(compat.some((c) => c.level === "breaking" && c.subject.startsWith("TOOL_NAME_CLIENT_COLLISION · cursor")));
  });
});

describe("diff files", () => {
  const dir = mkdtempSync(join(tmpdir(), "mcp-diff-"));
  const write = (name: string, data: unknown) => {
    const path = join(dir, name);
    writeFileSync(path, JSON.stringify(data));
    return path;
  };

  it("summarises and renders markdown", () => {
    const report = buildDiff(write("a.json", withTools(goodTool("a"))), write("b.json", withTools(goodTool("b"))));
    assert.deepEqual(report.summary, { breaking: 1, change: 1, notable: 0 });
    assert.match(renderDiffMarkdown(report), /\| ❌ breaking \| tool \| a \| Tool removed\. \|/);
  });

  it("rejects reports and unknown JSON with a helpful message", () => {
    assert.throws(() => buildDiff(write("r.json", { schemaVersion: 1 }), write("b2.json", snapshot())), (e: Error) => e instanceof UsageError && /--save-snapshot/.test(e.message));
    assert.throws(() => buildDiff(write("x.json", { hello: 1 }), write("b3.json", snapshot())), UsageError);
  });
});
