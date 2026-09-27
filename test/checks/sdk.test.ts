import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { protocolChecks } from "../../src/checks/protocol.js";
import { sdkChecks, upgradeHint } from "../../src/checks/sdk.js";
import type { DetectedSdk } from "../../src/project.js";
import { byId, runCheck, snapshot } from "./builders.js";

const withSdk = (over: Partial<DetectedSdk>, negotiated = "2025-11-25") =>
  snapshot({
    initialize: { negotiatedProtocolVersion: negotiated },
    project: { dir: "/p", sdks: [{ ecosystem: "npm", name: "mcp-use", manifest: "/p/package.json", manager: "npm", ...over }] },
  });

describe("SDK checks", () => {
  const check = byId(sdkChecks, "SDK_OUTDATED");

  it("SDK_OUTDATED does not apply without a detected project, and is silent when current", () => {
    assert.equal(check.appliesTo(snapshot()), false);
    assert.deepEqual(runCheck(check, withSdk({ installed: "2.7.0", latest: "2.7.0" })), []);
  });

  it("SDK_OUTDATED gives the command, and warns when the protocol is old too", () => {
    const [info] = runCheck(check, withSdk({ installed: "2.6.0", latest: "2.7.0" }));
    assert.equal(info.severity, "info");
    assert.equal(info.fix, "Run: npm install mcp-use@2.7.0");
    const [warn] = runCheck(check, withSdk({ installed: "2.6.0", latest: "2.7.0" }, "2025-03-26"));
    assert.equal(warn.severity, "warn");
    assert.match(warn.message, /negotiates 2025-03-26/);
  });

  it("SDK_OUTDATED suggests migrating @modelcontextprotocol/sdk only when 2026-07-28 is missing", () => {
    const s = withSdk({ name: "@modelcontextprotocol/sdk", installed: "1.30.1", latest: "1.30.1" });
    s.discover = { ok: false, error: { code: -32601, message: "Method not found" } };
    assert.match(runCheck(check, s)[0].fix ?? "", /@modelcontextprotocol\/server/);
    s.discover = { ok: true, result: {} };
    assert.deepEqual(runCheck(check, s), []);
  });

  it("protocol findings carry the concrete upgrade command", () => {
    const s = withSdk({ installed: "2.6.0", latest: "2.7.0" }, "2025-03-26");
    const [f] = runCheck(byId(protocolChecks, "PROTOCOL_VERSION_OLD"), s);
    assert.match(f.fix ?? "", /Run: npm install mcp-use@2\.7\.0/);
    assert.match(upgradeHint(snapshot()), /mcpkit upgrade/);
    assert.match(upgradeHint(withSdk({ installed: "2.7.0", latest: "2.7.0" })), /already the latest/);
  });
});
