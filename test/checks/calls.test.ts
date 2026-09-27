import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { callChecks, validateStructured } from "../../src/checks/calls.js";
import type { CallProbe } from "../../src/snapshot.js";
import { byId, goodTool, list, runCheck, snapshot } from "./builders.js";

const check = (id: string) => byId(callChecks, id);
const priceSchema = { type: "object", properties: { price: { type: "number" } }, required: ["price"] };
const probe = (tool: string, result?: Record<string, unknown>, error?: CallProbe["error"]): CallProbe => ({
  tool,
  args: {},
  origin: "probe",
  durationMs: 5,
  result,
  error,
});
const withCalls = (calls: CallProbe[], tools = [{ ...goodTool("t"), outputSchema: priceSchema }]) =>
  snapshot({ lists: { tools: list(tools) }, calls });
const text = (t: string) => ({ type: "text", text: t });

describe("call checks", () => {
  it("do not apply without calls", () => {
    for (const c of callChecks) assert.equal(c.appliesTo(snapshot()), false, c.id);
  });

  it("CALL_RESULT_INVALID", () => {
    assert.deepEqual(runCheck(check("CALL_RESULT_INVALID"), withCalls([probe("t", { content: [text("ok")] })])), []);
    const [f] = runCheck(check("CALL_RESULT_INVALID"), withCalls([probe("t", { content: "ok" })]));
    assert.equal(f.severity, "error");
    assert.match(f.message, /content: /);
    assert.equal(runCheck(check("CALL_RESULT_INVALID"), withCalls([probe("t", { content: [{ type: "markdown", text: "x" }] })])).length, 1);
  });

  it("CALL_OUTPUT_SCHEMA_MISMATCH", () => {
    const ok = probe("t", { content: [text("{}")], structuredContent: { price: 1 } });
    assert.deepEqual(runCheck(check("CALL_OUTPUT_SCHEMA_MISMATCH"), withCalls([ok])), []);
    const missing = runCheck(check("CALL_OUTPUT_SCHEMA_MISMATCH"), withCalls([probe("t", { content: [text("x")] })]));
    assert.match(missing[0].message, /returned no structuredContent/);
    const wrong = runCheck(check("CALL_OUTPUT_SCHEMA_MISMATCH"), withCalls([probe("t", { content: [], structuredContent: { price: "1" } })]));
    assert.match(wrong[0].message, /price must be number/);
    // Tool errors are exempt, per the spec.
    assert.deepEqual(runCheck(check("CALL_OUTPUT_SCHEMA_MISMATCH"), withCalls([probe("t", { content: [text("no")], isError: true })])), []);
  });

  it("CALL_STRUCTURED_WITHOUT_TEXT", () => {
    assert.deepEqual(
      runCheck(check("CALL_STRUCTURED_WITHOUT_TEXT"), withCalls([probe("t", { content: [text("{}")], structuredContent: { price: 1 } })])),
      []
    );
    const [f] = runCheck(check("CALL_STRUCTURED_WITHOUT_TEXT"), withCalls([probe("t", { content: [], structuredContent: { price: 1 } })]));
    assert.equal(f.severity, "warn");
    assert.deepEqual(f.affects, ["structuredContent"]);
  });

  it("CALL_FAILED reports protocol errors and isError results as info", () => {
    assert.deepEqual(runCheck(check("CALL_FAILED"), withCalls([probe("t", { content: [text("fine")] })])), []);
    const findings = runCheck(
      check("CALL_FAILED"),
      withCalls([probe("a", undefined, { code: -32602, message: "bad args" }), probe("b", { content: [text("nope")], isError: true })])
    );
    assert.deepEqual(findings.map((f) => [f.subject, f.severity]), [["a", "info"], ["b", "info"]]);
    assert.match(findings[0].message, /may be expected/);
  });

  it("validateStructured honours draft-07 schemas and reports uncompilable ones as undefined", () => {
    assert.deepEqual(validateStructured({ $schema: "http://json-schema.org/draft-07/schema#", ...priceSchema }, { price: 1 }), []);
    assert.equal(validateStructured({ type: "object", properties: { a: { $ref: "#/nope" } } }, {}), undefined);
  });
});
