import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { connect } from "../src/connect/index.js";
import { CredentialStore, defaultStorePath, describeCredentials, oauthLogin, StoredOAuthProvider } from "../src/oauth.js";
import { startHttpFixture } from "./helpers.js";

const tempStore = () => new CredentialStore(join(mkdtempSync(join(tmpdir(), "mcp-oauth-")), "oauth.json"));

/** Plays the user's browser: follow the authorize redirect back to our callback server. */
const fakeBrowser = (url: string) => {
  void (async () => {
    const res = await fetch(url, { redirect: "manual" });
    const location = res.headers.get("location");
    if (location) await fetch(location);
  })();
};

async function login(url: string, store: CredentialStore) {
  const logs: string[] = [];
  const steps = await oauthLogin({
    url,
    callbackPort: 0,
    openBrowser: true,
    browser: fakeBrowser,
    timeoutMs: 10000,
    store,
    log: (m) => logs.push(m),
    verify: async (provider) => {
      const s = await connect({ target: { kind: "http", url, headers: {}, authProvider: provider }, timeoutMs: 5000, authProbe: false });
      if (!s.connect.ok) throw new Error(s.connect.error);
      return `${s.lists.tools?.items.length} tools`;
    },
  });
  return { steps, logs };
}

describe("oauth login", () => {
  it("completes discovery, DCR, PKCE authorization, token exchange and an authenticated call", async () => {
    const server = await startHttpFixture("oauth");
    const store = tempStore();
    try {
      const { steps } = await login(server.url, store);
      assert.deepEqual(
        steps.map((s) => [s.step, s.ok]),
        [
          ["Discovery", true],
          ["Client registration", true],
          ["Authorization request", true],
          ["Authorization", true],
          ["Token exchange", true],
          ["Authenticated MCP request", true],
        ]
      );
      assert.match(steps[1].detail, /Dynamic Client Registration/);
      assert.match(steps[2].detail, /PKCE S256, resource=http:\/\/127\.0\.0\.1:\d+\/mcp/);
      assert.match(steps[3].detail, /iss matches issuer/);
      assert.match(steps[4].detail, /refresh token issued/);
      assert.equal(steps[5].detail, "1 tools");

      const saved = store.get(server.url);
      assert.equal(saved.registration, "dcr");
      assert.match(saved.tokens?.access_token ?? "", /^tok-/);
      assert.equal(statSync(store.path).mode & 0o777, 0o600);
      assert.match(describeCredentials(server.url, saved), /dcr client client-\d+ · valid until/);
    } finally {
      server.stop();
    }
  });

  it("reuses stored credentials non-interactively", async () => {
    const server = await startHttpFixture("oauth");
    const store = tempStore();
    try {
      await login(server.url, store);
      const provider = new StoredOAuthProvider(server.url, store);
      const s = await connect({ target: { kind: "http", url: server.url, headers: {}, authProvider: provider }, timeoutMs: 5000, authProbe: false });
      assert.equal(s.connect.ok, true);
      assert.equal(s.lists.tools?.items.length, 1);
    } finally {
      server.stop();
    }
  });

  it("tells the user to log in when there are no credentials", async () => {
    const server = await startHttpFixture("oauth");
    try {
      const provider = new StoredOAuthProvider(server.url, tempStore());
      const s = await connect({ target: { kind: "http", url: server.url, headers: {}, authProvider: provider }, timeoutMs: 5000, authProbe: false });
      assert.equal(s.connect.ok, false);
      assert.match(s.connect.error ?? "", /oauth login --url/);
    } finally {
      server.stop();
    }
  });

  it("reports a failed discovery step for a server without OAuth metadata", async () => {
    const server = await startHttpFixture("oauth-broken");
    try {
      const { steps } = await login(server.url, tempStore());
      assert.equal(steps.at(-1)?.ok, false);
      assert.match(steps.at(-1)?.step ?? "", /Discovery/);
    } finally {
      server.stop();
    }
  });
});

describe("credential store location", () => {
  it("moves credentials saved under the old mcp-use-compat name", () => {
    const base = mkdtempSync(join(tmpdir(), "mcp-xdg-"));
    mkdirSync(join(base, "mcp-use-compat"));
    writeFileSync(join(base, "mcp-use-compat", "oauth.json"), '{"https://x.example/mcp":{}}');
    const previous = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = base;
    try {
      const path = defaultStorePath();
      assert.equal(path, join(base, "mcpkit", "oauth.json"));
      assert.equal(readFileSync(path, "utf8"), '{"https://x.example/mcp":{}}');
      assert.equal(statSync(path).mode & 0o777, 0o600);
    } finally {
      if (previous === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = previous;
    }
  });
});

