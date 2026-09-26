import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyze, metaValidate, schemaChecks } from "../../src/checks/schema.js";
import { byId, goodTool, list, profile, runCheck, snapshot, src } from "./builders.js";

const check = (id: string) => byId(schemaChecks, id);
const withSchema = (inputSchema: unknown, extra: Record<string, unknown> = {}) =>
  snapshot({ lists: { tools: list([{ ...goodTool(), inputSchema, ...extra }]) } });

describe("schema helpers", () => {
  it("metaValidate picks the dialect from $schema", () => {
    assert.deepEqual(metaValidate({ type: "object" }), []);
    assert.deepEqual(metaValidate({ $schema: "http://json-schema.org/draft-07/schema#", type: "object" }), []);
    assert.ok(metaValidate({ type: "objekt" })!.length > 0);
    assert.equal(metaValidate({ $schema: "http://json-schema.org/draft-04/schema#", type: "object" }), undefined);
  });

  it("analyze collects keywords, depth and untyped properties", () => {
    const stats = analyze({
      type: "object",
      properties: { a: { type: "object", properties: { b: { description: "no type" } } }, c: { $ref: "#/$defs/x" } },
      $defs: { x: { type: "string" } },
    });
    assert.ok(stats.keywords.has("$ref"));
    assert.ok(stats.keywords.has("$defs"));
    assert.equal(stats.depth, 2);
    assert.deepEqual(stats.untypedProperties, ["a.b"]);
  });
});

describe("schema checks", () => {
  it("SCHEMA_MISSING", () => {
    assert.deepEqual(runCheck(check("SCHEMA_MISSING"), snapshot()), []);
    assert.equal(runCheck(check("SCHEMA_MISSING"), withSchema(undefined)).length, 1);
    assert.equal(runCheck(check("SCHEMA_MISSING"), withSchema("string")).length, 1);
  });

  it("SCHEMA_NOT_OBJECT checks input and output schemas", () => {
    assert.deepEqual(runCheck(check("SCHEMA_NOT_OBJECT"), snapshot()), []);
    assert.equal(runCheck(check("SCHEMA_NOT_OBJECT"), withSchema({ type: "string" })).length, 1);
    const [f] = runCheck(
      check("SCHEMA_NOT_OBJECT"),
      withSchema({ type: "object" }, { outputSchema: { type: "array" } })
    );
    assert.match(f.message, /outputSchema/);
  });

  it("SCHEMA_INVALID", () => {
    assert.deepEqual(runCheck(check("SCHEMA_INVALID"), snapshot()), []);
    const [f] = runCheck(
      check("SCHEMA_INVALID"),
      withSchema({ type: "object", properties: { a: { type: "strin" } } })
    );
    assert.equal(f.severity, "error");
  });

  it("SCHEMA_REQUIRED_UNKNOWN", () => {
    assert.deepEqual(runCheck(check("SCHEMA_REQUIRED_UNKNOWN"), snapshot()), []);
    const [f] = runCheck(
      check("SCHEMA_REQUIRED_UNKNOWN"),
      withSchema({ type: "object", properties: { a: { type: "string" } }, required: ["a", "b"] })
    );
    assert.match(f.message, /"b"/);
  });

  it("SCHEMA_TOP_LEVEL_COMBINATOR", () => {
    assert.deepEqual(runCheck(check("SCHEMA_TOP_LEVEL_COMBINATOR"), snapshot()), []);
    assert.equal(
      runCheck(check("SCHEMA_TOP_LEVEL_COMBINATOR"), withSchema({ type: "object", anyOf: [{}, {}] })).length,
      1
    );
  });

  it("SCHEMA_UNSUPPORTED_KEYWORD is per client", () => {
    const p = profile({ limits: { schemaUnsupported: { value: ["$ref"], ...src } } });
    assert.deepEqual(runCheck(check("SCHEMA_UNSUPPORTED_KEYWORD"), snapshot(), { profiles: [p] }), []);
    const s = withSchema({ type: "object", properties: { a: { $ref: "#/$defs/a" } }, $defs: { a: { type: "string" } } });
    const [f] = runCheck(check("SCHEMA_UNSUPPORTED_KEYWORD"), s, { profiles: [p] });
    assert.equal(f.client, "test-client");
    assert.deepEqual(runCheck(check("SCHEMA_UNSUPPORTED_KEYWORD"), s, { profiles: [profile()] }), []);
  });

  it("SCHEMA_PROPERTY_NO_TYPE", () => {
    assert.deepEqual(runCheck(check("SCHEMA_PROPERTY_NO_TYPE"), snapshot()), []);
    assert.equal(
      runCheck(check("SCHEMA_PROPERTY_NO_TYPE"), withSchema({ type: "object", properties: { a: {} } })).length,
      1
    );
  });

  it("SCHEMA_TOO_DEEP", () => {
    assert.deepEqual(runCheck(check("SCHEMA_TOO_DEEP"), snapshot()), []);
    let deep: Record<string, unknown> = { type: "string" };
    for (let i = 0; i < 7; i++) deep = { type: "object", properties: { x: deep } };
    assert.equal(runCheck(check("SCHEMA_TOO_DEEP"), withSchema(deep)).length, 1);
  });
});
