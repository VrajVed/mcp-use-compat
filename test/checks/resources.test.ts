import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ListResourcesResultSchema, ListResourceTemplatesResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { resourceChecks, uriTemplateProblem } from "../../src/checks/resources.js";
import { byId, list, runCheck, snapshot } from "./builders.js";

const check = (id: string) => byId(resourceChecks, id);
const good = { name: "readme", uri: "docs://readme", mimeType: "text/markdown" };
const withResources = (...resources: Record<string, unknown>[]) => snapshot({ lists: { resources: list(resources) } });
const withTemplates = (...templates: Record<string, unknown>[]) =>
  snapshot({ lists: { resourceTemplates: list(templates) } });

describe("uriTemplateProblem", () => {
  it("accepts valid templates", () => {
    for (const t of ["file:///{path}", "users://{id}/profile", "x://{+path}{?q,r}", "x://{var:3}{list*}", "plain://x"]) {
      assert.equal(uriTemplateProblem(t), undefined, t);
    }
  });

  it("flags invalid templates, marking the one the SDK throws on as fatal", () => {
    assert.deepEqual(uriTemplateProblem("x://{a"), { problem: "unclosed '{' expression", fatal: true });
    for (const t of ["x://{}", "x://{a b}", "x://a}", "x://{=a}", "x://{{a}}"]) {
      const p = uriTemplateProblem(t);
      assert.ok(p, t);
      assert.equal(p.fatal, false, t);
    }
  });
});

describe("resource checks", () => {
  it("RESOURCE_URI_INVALID", () => {
    assert.deepEqual(runCheck(check("RESOURCE_URI_INVALID"), withResources(good)), []);
    assert.equal(
      runCheck(check("RESOURCE_URI_INVALID"), withResources({ ...good, uri: "readme.md" }, { name: "x" })).length,
      2
    );
  });

  it("RESOURCE_URI_DUPLICATE", () => {
    assert.deepEqual(runCheck(check("RESOURCE_URI_DUPLICATE"), withResources(good)), []);
    assert.equal(runCheck(check("RESOURCE_URI_DUPLICATE"), withResources(good, good)).length, 1);
  });

  it("RESOURCE_NAME_MISSING covers resources and templates", () => {
    assert.deepEqual(runCheck(check("RESOURCE_NAME_MISSING"), withResources(good)), []);
    assert.equal(runCheck(check("RESOURCE_NAME_MISSING"), withResources({ uri: "x://a" })).length, 1);
    assert.equal(runCheck(check("RESOURCE_NAME_MISSING"), withTemplates({ uriTemplate: "x://{a}" })).length, 1);
  });

  it("RESOURCE_MIME_MISSING", () => {
    assert.deepEqual(runCheck(check("RESOURCE_MIME_MISSING"), withResources(good)), []);
    assert.equal(runCheck(check("RESOURCE_MIME_MISSING"), withResources({ name: "a", uri: "x://a" }))[0].severity, "info");
  });

  it("RESOURCE_TEMPLATE_INVALID", () => {
    assert.deepEqual(runCheck(check("RESOURCE_TEMPLATE_INVALID"), withTemplates({ name: "u", uriTemplate: "u://{id}" })), []);
    assert.equal(
      runCheck(check("RESOURCE_TEMPLATE_INVALID"), withTemplates({ name: "u", uriTemplate: "u://{id" }))[0].severity,
      "error"
    );
    assert.equal(
      runCheck(check("RESOURCE_TEMPLATE_INVALID"), withTemplates({ name: "u", uriTemplate: "u://{}" }))[0].severity,
      "warn"
    );
  });
});

describe("SDK behaviour our messages rely on", () => {
  it("rejects resources and templates without a name", () => {
    assert.equal(ListResourcesResultSchema.safeParse({ resources: [{ uri: "x://a" }] }).success, false);
    assert.equal(ListResourceTemplatesResultSchema.safeParse({ resourceTemplates: [{ uriTemplate: "x://{a}" }] }).success, false);
  });
});
