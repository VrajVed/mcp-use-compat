import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseArgs, parseCommandLine, UsageError } from "../src/cli.js";

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

describe("parseCommandLine (subcommands)", () => {
  it("defaults to check, keeping v0.2 syntax", () => {
    assert.equal(parseCommandLine(["--", "node", "s.js"], quiet).command, "check");
    assert.equal(parseCommandLine(["--url", "https://x.example/mcp"], quiet).command, "check");
    const explicit = parseCommandLine(["check", "--version-matrix", "--", "node", "s.js"], quiet);
    assert.equal(explicit.command === "check" && explicit.options.versionMatrix, true);
  });

  it("parses diff with defaults and options", () => {
    assert.deepEqual(parseCommandLine(["diff", "a.json", "b.json"], quiet), {
      command: "diff",
      options: { before: "a.json", after: "b.json", format: "md", out: undefined, failOn: "breaking" },
    });
    const d = parseCommandLine(["diff", "a.json", "b.json", "--fail-on", "any", "-f", "json"], quiet);
    assert.equal(d.command === "diff" && d.options.failOn, "any");
    assert.throws(() => parseCommandLine(["diff", "a.json", "b.json", "--fail-on", "maybe"], quiet));
  });

  it("parses explain and the list commands, including the old flags", () => {
    assert.deepEqual(parseCommandLine(["explain", "tool_name_too_long"], quiet), {
      command: "explain",
      checkId: "tool_name_too_long",
    });
    assert.equal(parseCommandLine(["list-checks"], quiet).command, "list-checks");
    assert.equal(parseCommandLine(["--list-clients"], quiet).command, "list-clients");
  });

  it("does not treat a server command after -- as a subcommand", () => {
    const i = parseCommandLine(["--", "diff", "x"], quiet);
    assert.equal(i.command === "check" && i.options.target?.kind === "stdio" && i.options.target.command, "diff");
  });
});

