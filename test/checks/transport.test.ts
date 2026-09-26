import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { transportChecks } from "../../src/checks/transport.js";
import { byId, runCheck, snapshot } from "./builders.js";

const check = (id: string) => byId(transportChecks, id);

describe("transport checks", () => {
  it("TRANSPORT_CONNECT_FAILED", () => {
    assert.deepEqual(runCheck(check("TRANSPORT_CONNECT_FAILED"), snapshot()), []);
    const [f] = runCheck(
      check("TRANSPORT_CONNECT_FAILED"),
      snapshot({ connect: { ok: false, error: "spawn x ENOENT" } })
    );
    assert.equal(f.severity, "error");
    assert.match(f.message, /ENOENT/);
  });

  it("TRANSPORT_CONNECT_FAILED does not apply when HTTP auth is required", () => {
    const s = snapshot({
      target: { kind: "http", url: "https://x.example/mcp" },
      connect: { ok: false, error: "401" },
      http: { unauthenticated: { url: "", status: 401 }, protectedResource: [], authorizationServer: [] },
    });
    assert.equal(check("TRANSPORT_CONNECT_FAILED").appliesTo(s), false);
    assert.equal(runCheck(check("TRANSPORT_AUTH_REQUIRED"), s)[0].severity, "info");
  });

  it("TRANSPORT_AUTH_REQUIRED is silent for open HTTP servers", () => {
    const s = snapshot({
      target: { kind: "http", url: "https://x.example/mcp" },
      http: { unauthenticated: { url: "", status: 200 }, protectedResource: [], authorizationServer: [] },
    });
    assert.deepEqual(runCheck(check("TRANSPORT_AUTH_REQUIRED"), s), []);
  });

  it("TRANSPORT_STDOUT_POLLUTION warns on log lines", () => {
    assert.deepEqual(runCheck(check("TRANSPORT_STDOUT_POLLUTION"), snapshot()), []);
    const [f] = runCheck(
      check("TRANSPORT_STDOUT_POLLUTION"),
      snapshot({ io: { stdoutNonJsonLines: ["Server started"], stderrTail: [] } })
    );
    assert.equal(f.severity, "warn");
    assert.deepEqual(f.affects, ["stdio"]);
  });

  it("TRANSPORT_STDOUT_POLLUTION errors when a JSON-RPC message was corrupted", () => {
    const [f] = runCheck(
      check("TRANSPORT_STDOUT_POLLUTION"),
      snapshot({ io: { stdoutNonJsonLines: ['loading...{"jsonrpc":"2.0","id":2,"result":{}}'], stderrTail: [] } })
    );
    assert.equal(f.severity, "error");
    assert.match(f.message, /corrupted 1 JSON-RPC message/);
  });

  it("TRANSPORT_CONNECT_FAILED does not apply to modern-only servers", () => {
    const s = snapshot({ connect: { ok: false, error: "Method not found" }, discover: { ok: true, result: {} } });
    assert.equal(check("TRANSPORT_CONNECT_FAILED").appliesTo(s), false);
  });

  it("TRANSPORT_STDOUT_POLLUTION does not apply over HTTP", () => {
    assert.equal(
      check("TRANSPORT_STDOUT_POLLUTION").appliesTo(snapshot({ target: { kind: "http", url: "https://x" } })),
      false
    );
  });

  it("TRANSPORT_SLOW_STARTUP", () => {
    assert.deepEqual(runCheck(check("TRANSPORT_SLOW_STARTUP"), snapshot()), []);
    const [f] = runCheck(check("TRANSPORT_SLOW_STARTUP"), snapshot({ connect: { ok: true, startupMs: 8000 } }));
    assert.equal(f.severity, "warn");
  });

  it("TRANSPORT_SLOW_LIST", () => {
    assert.deepEqual(runCheck(check("TRANSPORT_SLOW_LIST"), snapshot()), []);
    const findings = runCheck(
      check("TRANSPORT_SLOW_LIST"),
      snapshot({ lists: { tools: { ok: true, items: [], pages: 1, durationMs: 4000 } } })
    );
    assert.equal(findings.length, 1);
    assert.equal(findings[0].subject, "tools");
  });

  it("TRANSPORT_STDERR_ERRORS", () => {
    assert.deepEqual(
      runCheck(check("TRANSPORT_STDERR_ERRORS"), snapshot({ io: { stdoutNonJsonLines: [], stderrTail: ["ready"] } })),
      []
    );
    const [f] = runCheck(
      check("TRANSPORT_STDERR_ERRORS"),
      snapshot({ io: { stdoutNonJsonLines: [], stderrTail: ["Traceback (most recent call last):"] } })
    );
    assert.equal(f.severity, "info");
  });
});
