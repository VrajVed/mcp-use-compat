import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseArgs, UsageError } from "../src/cli.js";

const quiet = () => {};

describe("parseArgs", () => {
  it("parses a stdio command after --", () => {
    const o = parseArgs(["--env", "A=1", "--env", "B=x=y", "--", "uv", "run", "server.py", "--port", "1"], quiet);
    assert.deepEqual(o.target, {
      kind: "stdio",
      command: "uv",
      args: ["run", "server.py", "--port", "1"],
      cwd: process.cwd(),
      env: { A: "1", B: "x=y" },
    });
  });

  it("parses --url with headers", () => {
    const o = parseArgs(["--url", "https://x.example/mcp", "--header", "Authorization: Bearer t"], quiet);
    assert.deepEqual(o.target, {
      kind: "http",
      url: "https://x.example/mcp",
      headers: { Authorization: "Bearer t" },
    });
    assert.equal(o.authProbe, true);
  });

  it("keeps v0.1 behaviour for a bare .js path, with a note", () => {
    const notes: string[] = [];
    const o = parseArgs(["./dist/server.js"], (m) => notes.push(m));
    assert.equal(o.target?.kind, "stdio");
    assert.deepEqual(o.target?.kind === "stdio" && o.target.args, ["./dist/server.js"]);
    assert.equal(notes.length, 1);
  });

  it("applies defaults", () => {
    const o = parseArgs(["--", "node", "s.js"], quiet);
    assert.equal(o.format, "md");
    assert.equal(o.failOn, "error");
    assert.equal(o.timeoutMs, 10000);
    assert.equal(o.probeCalls, false);
    assert.equal(o.clients, undefined);
  });

  it("splits --clients", () => {
    assert.deepEqual(parseArgs(["--clients", "cursor, chatgpt", "--", "x"], quiet).clients, ["cursor", "chatgpt"]);
  });

  it("requires exactly one source", () => {
    assert.throws(() => parseArgs([], quiet), UsageError);
    assert.throws(() => parseArgs(["--url", "https://a.example", "--", "x"], quiet), UsageError);
  });

  it("rejects an invalid URL and format", () => {
    assert.throws(() => parseArgs(["--url", "not a url"], quiet), UsageError);
    assert.throws(() => parseArgs(["--format", "xml", "--", "x"], quiet));
  });

  it("allows --list-checks without a source", () => {
    assert.equal(parseArgs(["--list-checks"], quiet).listChecks, true);
  });
});
