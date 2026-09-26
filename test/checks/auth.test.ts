import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { authChecks } from "../../src/checks/auth.js";
import type { HttpProbe, HttpResponseProbe, ServerSnapshot } from "../../src/snapshot.js";
import { byId, runCheck, snapshot } from "./builders.js";

const check = (id: string) => byId(authChecks, id);

const URL_ = "https://mcp.example.com/mcp";
const ISSUER = "https://auth.example.com";
const PRM_URL = "https://mcp.example.com/.well-known/oauth-protected-resource/mcp";
const ASM_URL = "https://auth.example.com/.well-known/oauth-authorization-server";

const goodPrm = { resource: URL_, authorization_servers: [ISSUER] };
const goodAsm = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: `${ISSUER}/token`,
  code_challenge_methods_supported: ["S256"],
  client_id_metadata_document_supported: true,
};

const unauthorized: HttpResponseProbe = {
  url: URL_,
  status: 401,
  headers: { "www-authenticate": `Bearer resource_metadata="${PRM_URL}"` },
};
const ok = (url: string, json: unknown): HttpResponseProbe => ({ url, status: 200, json });
const notFound = (url: string): HttpResponseProbe => ({ url, status: 404 });

/** An HTTP snapshot of a protected server; override pieces of the probe. */
function http(probe: Partial<HttpProbe> = {}, url = URL_): ServerSnapshot {
  return snapshot({
    target: { kind: "http", url },
    http: {
      unauthenticated: unauthorized,
      protectedResource: [ok(PRM_URL, goodPrm)],
      authorizationServer: [ok(ASM_URL, goodAsm)],
      ...probe,
    },
  });
}
const withPrm = (prm: unknown) => http({ protectedResource: [ok(PRM_URL, prm)] });
const withAsm = (asm: unknown) => http({ authorizationServer: [ok(ASM_URL, asm)] });

describe("auth checks", () => {
  it("only AUTH_INSECURE_URL applies to an open or stdio server", () => {
    const open = http({ unauthenticated: { url: URL_, status: 200 } });
    const stdio = snapshot();
    for (const c of authChecks) {
      assert.equal(c.appliesTo(open), c.id === "AUTH_INSECURE_URL", c.id);
      assert.equal(c.appliesTo(stdio), false, c.id);
    }
    assert.equal(check("AUTH_PRM_MISSING").appliesTo(http({ unauthenticated: { url: URL_, status: 403 } })), true);
  });

  it("a well-configured server has no findings", () => {
    for (const c of authChecks) assert.deepEqual(runCheck(c, http()), [], c.id);
  });

  it("AUTH_CHALLENGE_MISSING", () => {
    const [f] = runCheck(check("AUTH_CHALLENGE_MISSING"), http({ unauthenticated: { url: URL_, status: 401, headers: {} } }));
    assert.equal(f.severity, "warn");
    assert.deepEqual(f.affects, ["oauth"]);
    assert.match(f.message, /HTTP 401/);
    assert.equal(
      runCheck(check("AUTH_CHALLENGE_MISSING"), http({ unauthenticated: { url: URL_, status: 403 } })).length,
      1,
      "missing headers object"
    );
  });

  it("AUTH_PRM_MISSING", () => {
    const c = check("AUTH_PRM_MISSING");
    // Falls through to a later well-known location.
    assert.deepEqual(runCheck(c, http({ protectedResource: [notFound(PRM_URL), ok(`${PRM_URL}-root`, goodPrm)] })), []);
    const [f] = runCheck(
      c,
      http({
        protectedResource: [
          notFound(PRM_URL),
          { url: "https://mcp.example.com/.well-known/oauth-protected-resource", error: "ECONNRESET" },
          ok("https://x/array", [goodPrm]),
          { url: "https://x/html", status: 200 },
        ],
      })
    );
    assert.equal(f.severity, "error");
    assert.deepEqual(f.evidence, {
      tried: [
        `${PRM_URL} → 404`,
        "https://mcp.example.com/.well-known/oauth-protected-resource → ECONNRESET",
        "https://x/array → 200",
        "https://x/html → 200",
      ],
    });
  });

  it("AUTH_PRM_INVALID", () => {
    const c = check("AUTH_PRM_INVALID");
    assert.equal(c.appliesTo(http({ protectedResource: [notFound(PRM_URL)] })), false);
    assert.deepEqual(runCheck(c, withPrm({ ...goodPrm, resource: `${URL_}/` })), [], "trailing slash tolerated");

    const [noServers] = runCheck(c, withPrm({ resource: URL_ }));
    assert.equal(noServers.severity, "error");
    assert.match(noServers.message, /authorization_servers/);
    assert.equal(runCheck(c, withPrm({ resource: URL_, authorization_servers: [] })).length, 1);
    assert.equal(runCheck(c, withPrm({ resource: URL_, authorization_servers: ISSUER })).length, 1);

    const [noResource] = runCheck(c, withPrm({ authorization_servers: [ISSUER] }));
    assert.match(noResource.message, /no resource/);
    assert.match(noResource.fix!, new RegExp(URL_));

    const [mismatch] = runCheck(c, withPrm({ ...goodPrm, resource: "https://other.example.com/mcp" }));
    assert.equal(mismatch.severity, "error");
    assert.equal(mismatch.subject, "https://other.example.com/mcp");

    assert.equal(runCheck(c, withPrm({})).length, 2);
  });

  it("AUTH_ASM_MISSING", () => {
    const c = check("AUTH_ASM_MISSING");
    assert.equal(c.appliesTo(http({ authorizationServer: [] })), false, "nothing tried → skip");
    assert.deepEqual(runCheck(c, http({ authorizationServer: [notFound(ASM_URL), ok(`${ISSUER}/.well-known/openid-configuration`, goodAsm)] })), []);
    const [f] = runCheck(c, http({ authorizationServer: [notFound(ASM_URL), { url: "https://y", error: "timeout" }] }));
    assert.equal(f.severity, "error");
    assert.deepEqual(f.evidence, { tried: [`${ASM_URL} → 404`, "https://y → timeout"] });
  });

  it("AUTH_ISSUER_MISMATCH", () => {
    const c = check("AUTH_ISSUER_MISMATCH");
    assert.equal(c.appliesTo(http({ authorizationServer: [notFound(ASM_URL)] })), false);
    assert.deepEqual(runCheck(c, withAsm({ ...goodAsm, issuer: `${ISSUER}/` })), [], "trailing slash tolerated");
    assert.deepEqual(runCheck(c, http({ protectedResource: [notFound(PRM_URL)] })), [], "no advertised issuer to compare");

    const [f] = runCheck(c, withAsm({ ...goodAsm, issuer: "https://evil.example.com" }));
    assert.equal(f.severity, "error");
    assert.match(f.message, /evil\.example\.com/);
    assert.match(f.message, new RegExp(ISSUER));

    const [missing] = runCheck(c, withAsm({ ...goodAsm, issuer: undefined }));
    assert.match(missing.message, /null/);
  });

  it("AUTH_ISSUER_MISMATCH tolerates malformed authorization_servers (reported by AUTH_PRM_INVALID)", () => {
    const c = check("AUTH_ISSUER_MISMATCH");
    for (const servers of [ISSUER, { url: ISSUER }, 42]) {
      assert.deepEqual(runCheck(c, withPrm({ resource: URL_, authorization_servers: servers })), [], String(servers));
    }
  });

  it("AUTH_PKCE_S256_MISSING", () => {
    const c = check("AUTH_PKCE_S256_MISSING");
    assert.deepEqual(runCheck(c, withAsm({ ...goodAsm, code_challenge_methods_supported: ["plain", "S256"] })), []);
    const [plain] = runCheck(c, withAsm({ ...goodAsm, code_challenge_methods_supported: ["plain"] }));
    assert.equal(plain.severity, "error");
    assert.match(plain.message, /\["plain"\] without S256/);
    const [omitted] = runCheck(c, withAsm({ ...goodAsm, code_challenge_methods_supported: undefined }));
    assert.equal(omitted.severity, "error");
    assert.match(omitted.message, /omits code_challenge_methods_supported/);
  });

  it("AUTH_CLIENT_REGISTRATION", () => {
    const c = check("AUTH_CLIENT_REGISTRATION");
    assert.deepEqual(
      runCheck(c, withAsm({ ...goodAsm, registration_endpoint: `${ISSUER}/register` })),
      [],
      "CIMD with DCR"
    );
    const base = { ...goodAsm, client_id_metadata_document_supported: undefined };
    const [dcr] = runCheck(c, withAsm({ ...base, registration_endpoint: `${ISSUER}/register` }));
    assert.equal(dcr.severity, "info");
    assert.equal(dcr.affects, undefined);
    const [none] = runCheck(c, withAsm(base));
    assert.equal(none.severity, "warn");
    assert.deepEqual(none.affects, ["oauth"]);
    assert.equal(runCheck(c, withAsm({ ...base, client_id_metadata_document_supported: "true" }))[0].severity, "warn");
  });

  it("AUTH_INSECURE_URL", () => {
    const c = check("AUTH_INSECURE_URL");
    for (const u of ["http://localhost:3000/mcp", "http://127.0.0.1/mcp", "http://[::1]:8080/mcp"]) {
      assert.deepEqual(runCheck(c, http({}, u)), [], u);
    }
    const [server] = runCheck(c, http({}, "http://mcp.example.com/mcp"));
    assert.equal(server.severity, "warn");
    assert.equal(server.subject, "http://mcp.example.com/mcp");

    const findings = runCheck(
      c,
      withAsm({
        ...goodAsm,
        token_endpoint: "http://auth.example.com/token",
        registration_endpoint: "http://auth.example.com/token",
        jwks_uri: "http://auth.example.com/jwks",
        revocation_endpoint: "not a url",
      })
    );
    assert.deepEqual(
      findings.map((f) => f.subject),
      ["http://auth.example.com/token"],
      "only *_endpoint fields, deduplicated"
    );
    // Applies to open servers too.
    const open = snapshot({
      target: { kind: "http", url: "http://mcp.example.com/mcp" },
      http: { unauthenticated: { url: "http://mcp.example.com/mcp", status: 200 }, protectedResource: [], authorizationServer: [] },
    });
    assert.equal(runCheck(c, open).length, 1);
  });
});
