import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { connect } from "../../src/connect/index.js";
import { fixture, startHttpFixture } from "../helpers.js";

const opts = { timeoutMs: 10000, authProbe: true };

describe("connect (stdio)", () => {
  it("snapshots a well-behaved SDK server", async () => {
    const s = await connect({ ...opts, target: fixture("clean") });
    assert.equal(s.connect.ok, true);
    assert.equal(s.initialize?.serverInfo?.name, "clean-fixture");
    assert.deepEqual(
      s.lists.tools?.items.map((t) => t.name),
      ["create_event", "list_events"]
    );
    assert.equal(s.lists.resources?.items.length, 1);
    assert.equal(s.lists.prompts?.items.length, 1);
    assert.deepEqual(s.io.stdoutNonJsonLines, []);
  });

  it("records a server that exits during startup instead of throwing", async () => {
    const s = await connect({ ...opts, target: fixture("crash") });
    assert.equal(s.connect.ok, false);
    assert.match(s.connect.error ?? "", /exited with code 1/);
    assert.deepEqual(s.io.stderrTail, ["Error: missing required env var API_KEY"]);
  });

  it("records a command that cannot be spawned", async () => {
    const s = await connect({
      ...opts,
      target: { kind: "stdio", command: "definitely-not-a-command-xyz", args: [], cwd: process.cwd(), env: {} },
    });
    assert.equal(s.connect.ok, false);
    assert.match(s.connect.error ?? "", /ENOENT/);
  });

  it("captures non-JSON-RPC lines written to stdout", async () => {
    const s = await connect({ ...opts, target: fixture("stdout-logger") });
    assert.equal(s.connect.ok, true);
    assert.ok(s.io.stdoutNonJsonLines.includes("[info] handling request"));
    assert.equal(s.lists.tools?.items.length, 1);
  });

  it("probes server/discover on handshake-only servers", async () => {
    const s = await connect({ ...opts, target: fixture("clean") });
    assert.equal(s.discover?.ok, false);
    assert.equal(s.discover?.error?.code, -32601);
  });

  it("recognises a server that only speaks the 2026-07-28 revision", async () => {
    const s = await connect({ ...opts, target: fixture("modern-only") });
    assert.equal(s.connect.ok, false);
    assert.equal(s.discover?.ok, true);
    assert.deepEqual(s.discover?.result?.supportedVersions, ["2026-07-28"]);
  });

  it("reads the UI resources tools link to", async () => {
    const s = await connect({ ...opts, target: fixture("ui") });
    assert.deepEqual(s.uiReads?.["ui://sales/dashboard"], { ok: true, mimeType: "text/html;profile=mcp-app" });
    assert.equal(s.uiReads?.["ui://sales/missing"]?.ok, false);
    assert.equal(s.uiReads?.["ui://sales/legacy"]?.mimeType, "text/html+skybridge");
  });

  it("records list errors per method without failing the connection", async () => {
    const s = await connect({ ...opts, target: fixture("stdout-logger") });
    assert.equal(s.lists.prompts?.ok, false);
    assert.equal(s.lists.prompts?.error?.code, -32601);
  });
});

describe("connect (http)", () => {
  it("snapshots an open Streamable HTTP server", async () => {
    const server = await startHttpFixture("open");
    try {
      const s = await connect({ ...opts, target: { kind: "http", url: server.url, headers: {} } });
      assert.equal(s.connect.ok, true);
      assert.equal(s.lists.tools?.items.length, 1);
      assert.equal(s.http?.unauthenticated.status, 200);
      assert.deepEqual(s.http?.protectedResource, []);
    } finally {
      server.stop();
    }
  });

  it("follows the OAuth discovery chain on 401", async () => {
    const server = await startHttpFixture("oauth");
    try {
      const s = await connect({ ...opts, target: { kind: "http", url: server.url, headers: {} } });
      assert.equal(s.connect.ok, false);
      assert.equal(s.http?.unauthenticated.status, 401);
      assert.match(s.http?.unauthenticated.headers?.["www-authenticate"] ?? "", /resource_metadata=/);
      assert.equal(s.http?.protectedResource.at(-1)?.status, 200);
      assert.equal(s.http?.authorizationServer.at(-1)?.status, 200);
    } finally {
      server.stop();
    }
  });

  it("skips auth probes when disabled", async () => {
    const server = await startHttpFixture("open");
    try {
      const s = await connect({ ...opts, authProbe: false, target: { kind: "http", url: server.url, headers: {} } });
      assert.equal(s.http, undefined);
    } finally {
      server.stop();
    }
  });
});
