import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { ALL_CHECKS } from "../src/checks/index.js";
import { UsageError } from "../src/cli.js";
import { evaluate } from "../src/evaluate.js";
import { fixTools, loadTools } from "../src/fix.js";
import { goodTool, list, snapshot } from "./checks/builders.js";

const broken = [
  { name: "search", description: null, inputSchema: { type: "object", properties: { q: { type: "string" } } } },
  { name: "get_user", description: "Fetch a user by id.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id", "org"] } },
  { name: "list_orders", description: "List orders.", inputSchema: { properties: { side: { type: "string", enum: [] } }, required: false } },
  { name: "ping", description: "Health check." },
  { name: "export", description: "Export as CSV.", inputSchema: { type: "string" } },
  { name: "files.read", description: "Read a file.", inputSchema: { type: "object", properties: {} } },
  { name: "files_read", description: "Read a file (alias).", inputSchema: { type: "object", properties: {} } },
];

describe("fixTools", () => {
  it("applies only mechanical fixes and records each one", () => {
    const { tools, changes } = fixTools(broken, { rename: false });
    assert.equal("description" in tools[0], false);
    assert.deepEqual(tools[1].inputSchema, { type: "object", properties: { id: { type: "string" } }, required: ["id"] });
    assert.deepEqual(tools[2].inputSchema, { type: "object", properties: { side: { type: "string" } } });
    assert.deepEqual(tools[3].inputSchema, { type: "object", properties: {} });
    assert.deepEqual(tools[4].inputSchema, { type: "string" }, "type changes that alter semantics are left alone");
    assert.equal(tools[5].name, "files.read", "no renames without --rename");
    assert.ok(changes.some((c) => c.tool === "export" && /not changed automatically/.test(c.change) && c.todo));
    assert.equal(changes.some((c) => c.tool === "files.read"), false, "spec-valid names are left alone without --rename");
    assert.equal(broken[0].description, null, "input is not mutated");
  });

  it("renames with --rename, avoiding collisions", () => {
    const { tools } = fixTools(broken, { rename: true });
    assert.equal(tools[5].name, "files_read_2");
    assert.equal(tools[6].name, "files_read");
  });

  it("clears the error-level findings it claims to fix", () => {
    const before = evaluate(snapshot({ lists: { tools: list(broken.slice(0, 4)) } }), ALL_CHECKS, []);
    const { tools } = fixTools(broken.slice(0, 4), { rename: false });
    const after = evaluate(snapshot({ lists: { tools: list(tools) } }), ALL_CHECKS, []);
    const errors = (r: typeof before) => r.findings.filter((f) => f.severity === "error").map((f) => f.checkId);
    assert.ok(errors(before).length > 0);
    assert.deepEqual(errors(after).filter((id) => id !== "TOOL_DESCRIPTION_MISSING"), []);
  });

  it("leaves valid tools untouched", () => {
    const { tools, changes } = fixTools([goodTool()], { rename: false });
    assert.deepEqual(tools, [goodTool()]);
    assert.deepEqual(changes, []);
  });
});

describe("loadTools", () => {
  const dir = mkdtempSync(join(tmpdir(), "mcp-fix-"));
  const file = (name: string, data: unknown) => {
    const path = join(dir, name);
    writeFileSync(path, JSON.stringify(data));
    return path;
  };

  it("reads snapshots, { tools } objects and arrays", () => {
    assert.equal(loadTools(file("s.json", snapshot())).length, 1);
    assert.equal(loadTools(file("t.json", { tools: [goodTool(), goodTool("b")] })).length, 2);
    assert.equal(loadTools(file("a.json", [goodTool()])).length, 1);
    assert.throws(() => loadTools(file("x.json", { nope: 1 })), UsageError);
  });
});
