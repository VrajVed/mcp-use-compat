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

  it("parses call with JSON args and target options", () => {
    const c = parseCommandLine(["call", "get_quote", "--args", '{"symbol":"INFY"}', "--env", "K=V", "--", "node", "s.js"], quiet);
    assert.equal(c.command, "call");
    if (c.command !== "call") return;
    assert.equal(c.options.tool, "get_quote");
    assert.deepEqual(c.options.args, { symbol: "INFY" });
    assert.deepEqual(c.options.target, { kind: "stdio", command: "node", args: ["s.js"], cwd: process.cwd(), env: { K: "V" } });
    assert.throws(() => parseCommandLine(["call", "t", "--args", "[1]", "--", "node"], quiet));
    assert.throws(() => parseCommandLine(["call", "t", "--args", "{nope", "--", "node"], quiet));
  });

  it("parses fix", () => {
    assert.deepEqual(parseCommandLine(["fix", "snap.json", "--rename", "-o", "fixed.json"], quiet), {
      command: "fix",
      options: { input: "snap.json", out: "fixed.json", format: "summary", rename: true },
    });
    const j = parseCommandLine(["fix", "snap.json", "--json"], quiet);
    assert.equal(j.command === "fix" && j.options.format, "json");
  });

  it("parses the oauth commands", () => {
    const login = parseCommandLine(["oauth", "login", "--url", "https://m.example/mcp", "--callback-port", "8787", "--no-browser"], quiet);
    assert.equal(login.command, "oauth-login");
    if (login.command === "oauth-login") {
      assert.equal(login.options.url, "https://m.example/mcp");
      assert.equal(login.options.callbackPort, 8787);
      assert.equal(login.options.openBrowser, false);
      assert.equal(login.options.timeoutMs, 300000);
    }
    assert.deepEqual(parseCommandLine(["oauth", "status"], quiet), { command: "oauth-status" });
    assert.deepEqual(parseCommandLine(["oauth", "logout", "--url", "https://m.example/mcp"], quiet), {
      command: "oauth-logout",
      url: "https://m.example/mcp",
    });
    assert.throws(() => parseCommandLine(["oauth", "login"], quiet));
  });

  it("accepts --oauth only with --url", () => {
    const c = parseCommandLine(["--oauth", "--url", "https://m.example/mcp"], quiet);
    assert.equal(c.command === "check" && c.options.oauth, true);
    assert.throws(() => parseCommandLine(["--oauth", "--", "node", "s.js"], quiet), UsageError);
  });

  it("does not treat a server command after -- as a subcommand", () => {
    const i = parseCommandLine(["--", "diff", "x"], quiet);
    assert.equal(i.command === "check" && i.options.target?.kind === "stdio" && i.options.target.command, "diff");
  });
});

describe("short options and aliases", () => {
  it("check: short flags match their long forms", () => {
    const long = parseCommandLine(
      ["--url", "https://m.example/mcp", "--timeout", "5000", "--header", "A: 1", "--save-snapshot", "s.json", "--version-matrix", "--probe-calls", "--fail-on", "warn", "--oauth", "--offline", "--no-auth-probe"],
      quiet
    );
    const short = parseCommandLine(
      ["-u", "https://m.example/mcp", "-t", "5000", "-H", "A: 1", "-s", "s.json", "-m", "-p", "-F", "warn", "-A", "-O", "-N"],
      quiet
    );
    assert.deepEqual(short, long);
    assert.equal(short.command === "check" && short.options.authProbe, false);
  });

  it("check: -e, -C and -r", () => {
    const i = parseCommandLine(["-e", "K=V", "-C", "/srv", "--", "node", "s.js"], quiet);
    assert.deepEqual(i.command === "check" && i.options.target, { kind: "stdio", command: "node", args: ["s.js"], cwd: "/srv", env: { K: "V" } });
    const r = parseCommandLine(["-r", "snap.json"], quiet);
    assert.equal(r.command === "check" && r.options.fromSnapshot, "snap.json");
  });

  it("command aliases", () => {
    assert.equal(parseCommandLine(["up", "-a", "-M", "-O", "-d", "/p"], quiet).command, "upgrade");
    const up = parseCommandLine(["up", "-a", "-M", "-O", "-d", "/p"], quiet);
    assert.equal(up.command === "upgrade" && up.options.apply && up.options.major && up.options.offline && up.options.dir, "/p");
    assert.deepEqual(parseCommandLine(["ex", "TOOL_NAME_TOO_LONG"], quiet), { command: "explain", checkId: "TOOL_NAME_TOO_LONG" });
    assert.equal(parseCommandLine(["checks"], quiet).command, "list-checks");
    assert.equal(parseCommandLine(["clients"], quiet).command, "list-clients");
  });

  it("diff, fix and oauth short flags", () => {
    const d = parseCommandLine(["diff", "a.json", "b.json", "-F", "any"], quiet);
    assert.equal(d.command === "diff" && d.options.failOn, "any");
    const f = parseCommandLine(["fix", "s.json", "-j", "-r"], quiet);
    assert.deepEqual(f.command === "fix" && [f.options.format, f.options.rename], ["json", true]);
    const l = parseCommandLine(["oauth", "login", "-u", "https://m.example/mcp", "-P", "8787", "-i", "id", "-k", "sec", "-s", "read", "-n", "-t", "1000"], quiet);
    assert.deepEqual(
      l.command === "oauth-login" && [l.options.callbackPort, l.options.clientId, l.options.clientSecret, l.options.scope, l.options.openBrowser, l.options.timeoutMs],
      [8787, "id", "sec", "read", false, 1000]
    );
    assert.deepEqual(parseCommandLine(["oauth", "logout", "-u", "https://m.example/mcp"], quiet), { command: "oauth-logout", url: "https://m.example/mcp" });
  });

  it("an alias after -- is still treated as the server command", () => {
    const i = parseCommandLine(["--", "up", "x"], quiet);
    assert.equal(i.command === "check" && i.options.target?.kind === "stdio" && i.options.target.command, "up");
  });
});

