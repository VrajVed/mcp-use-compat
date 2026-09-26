import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { authServerMetadataUrls, parseResourceMetadataParam, wellKnownUrls } from "../../src/connect/http.js";

describe("well-known URL construction", () => {
  it("tries the path-suffixed protected resource URL first", () => {
    assert.deepEqual(wellKnownUrls("https://api.example.com/v1/mcp", "oauth-protected-resource"), [
      "https://api.example.com/.well-known/oauth-protected-resource/v1/mcp",
      "https://api.example.com/.well-known/oauth-protected-resource",
    ]);
  });

  it("uses only the root URL when the resource has no path", () => {
    assert.deepEqual(wellKnownUrls("https://api.example.com/", "oauth-protected-resource"), [
      "https://api.example.com/.well-known/oauth-protected-resource",
    ]);
  });

  it("builds auth server metadata URLs for issuers with and without a path", () => {
    assert.deepEqual(authServerMetadataUrls("https://auth.example.com"), [
      "https://auth.example.com/.well-known/oauth-authorization-server",
      "https://auth.example.com/.well-known/openid-configuration",
    ]);
    assert.deepEqual(authServerMetadataUrls("https://auth.example.com/tenant1"), [
      "https://auth.example.com/.well-known/oauth-authorization-server/tenant1",
      "https://auth.example.com/.well-known/openid-configuration/tenant1",
      "https://auth.example.com/tenant1/.well-known/openid-configuration",
    ]);
  });

  it("parses quoted and unquoted resource_metadata params", () => {
    assert.equal(
      parseResourceMetadataParam('Bearer realm="x", resource_metadata="https://a.example/.well-known/x"'),
      "https://a.example/.well-known/x"
    );
    assert.equal(parseResourceMetadataParam("Bearer resource_metadata=https://a.example/m"), "https://a.example/m");
    assert.equal(parseResourceMetadataParam('Bearer realm="x"'), undefined);
  });
});
