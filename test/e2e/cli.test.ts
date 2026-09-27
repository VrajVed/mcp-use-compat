import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { ROOT, TSX } from "../helpers.js";

const CLI = resolve(ROOT, "src/index.ts");
const fixturePath = (name: string) => resolve(ROOT, "test/fixtures/servers", `${name}.ts`);

function cli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((done) => {
    const child = spawn(TSX, [CLI, ...args], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => done({ code: code ?? -1, stdout, stderr }));
  });
}

const json = async (...args: string[]) => {
  const r = await cli(["--format", "json", ...args]);
  return { ...r, report: JSON.parse(r.stdout) };
};

describe("cli end to end", () => {
  it("passes a clean SDK server", async () => {
    const { code, report } = await json("--", TSX, fixturePath("clean"));
    assert.equal(code, 0, JSON.stringify(report.findings.filter((f: { severity: string }) => f.severity === "error")));
    assert.equal(report.server.name, "clean-fixture");
    assert.equal(report.clients.length, 6);
  });

  it("fails a server with broken tools and names the problems", async () => {
    const { code, report } = await json("--", TSX, fixturePath("bad-tools"));
    assert.equal(code, 1);
    const ids = new Set(report.findings.map((f: { checkId: string }) => f.checkId));
    for (const id of [
      "TOOL_DESCRIPTION_MISSING",
      "TOOL_NAME_CLIENT_COLLISION",
      "TOOL_NAME_TOO_LONG",
      "SCHEMA_REQUIRED_UNKNOWN",
      "SCHEMA_TOP_LEVEL_COMBINATOR",
      "SCHEMA_NOT_OBJECT",
      "SCHEMA_PROPERTY_NAME_REJECTED",
      "DISCOVERY_TOOLS_LIST_CHANGED",
    ]) {
      assert.ok(ids.has(id), `expected ${id}`);
    }
  });

  it("exits 0 with --fail-on none", async () => {
    const { code } = await cli(["--fail-on", "none", "--", TSX, fixturePath("bad-tools")]);
    assert.equal(code, 0);
  });

  it("exits 3 when the server cannot start", async () => {
    const { code, stderr } = await cli(["--", TSX, fixturePath("crash")]);
    assert.equal(code, 3);
    assert.match(stderr, /Could not connect/);
  });

  it("exits 2 on an unknown client", async () => {
    const { code, stderr } = await cli(["--clients", "netscape", "--", TSX, fixturePath("clean")]);
    assert.equal(code, 2);
    assert.match(stderr, /Known clients: claude-desktop/);
  });

  it("limits the report to selected clients, resolving aliases", async () => {
    const { report } = await json("--clients", "claude,vscode", "--", TSX, fixturePath("clean"));
    assert.deepEqual(
      report.clients.map((c: { client: string }) => c.client),
      ["claude-desktop", "vscode-copilot"]
    );
  });

  it("saves a snapshot and re-checks it offline with the same result", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-use-compat-"));
    const file = join(dir, "snap.json");
    const live = await json("--save-snapshot", file, "--", TSX, fixturePath("bad-tools"));
    const offline = await json("--from-snapshot", file);
    assert.equal(offline.code, live.code);
    assert.deepEqual(offline.report.findings, live.report.findings);
    assert.equal(JSON.parse(readFileSync(file, "utf8")).snapshotVersion, 1);
  });

  it("reports a modern-only server without crashing", async () => {
    const { code, report } = await json("--", TSX, fixturePath("modern-only"));
    assert.equal(code, 1);
    assert.ok(report.findings.some((f: { checkId: string }) => f.checkId === "PROTOCOL_MODERN_ONLY"));
    assert.ok(!report.findings.some((f: { checkId: string }) => f.checkId === "TRANSPORT_CONNECT_FAILED"));
  });

  it("prints markdown by default", async () => {
    const { stdout } = await cli(["--", TSX, fixturePath("ui")]);
    assert.match(stdout, /^# MCP Compatibility Report: raw-fixture/);
    assert.match(stdout, /UI_TOOL_LINK_BROKEN/);
  });

  it("call runs one tool and fails on an invalid result", async () => {
    const ok = await cli(["call", "get_fine", "--args", '{"symbol":"X"}', "--format", "json", "--", TSX, fixturePath("calls")]);
    assert.equal(ok.code, 0);
    assert.deepEqual(JSON.parse(ok.stdout).call.result.structuredContent, { price: 12 });
    const bad = await cli(["call", "get_price", "--", TSX, fixturePath("calls")]);
    assert.equal(bad.code, 1);
    assert.match(bad.stdout, /CALL_OUTPUT_SCHEMA_MISMATCH/);
  });

  it("check --probe-calls reports call problems", async () => {
    const { report } = await json("--probe-calls", "--clients", "cursor", "--", TSX, fixturePath("calls"));
    const ids = new Set(report.findings.map((f: { checkId: string }) => f.checkId));
    for (const id of ["CALL_RESULT_INVALID", "CALL_OUTPUT_SCHEMA_MISMATCH", "CALL_STRUCTURED_WITHOUT_TEXT", "CALL_FAILED"]) {
      assert.ok(ids.has(id), id);
    }
  });

  it("lists checks and clients", async () => {
    const checks = await cli(["--list-checks"]);
    assert.match(checks.stdout, /TRANSPORT_STDOUT_POLLUTION/);
    const clients = await cli(["--list-clients"]);
    assert.match(clients.stdout, /cursor/);
  });
});
