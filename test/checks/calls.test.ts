import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { callChecks, validateStructured } from "../../src/checks/calls.js";
import type { CallProbe } from "../../src/snapshot.js";
import { byId, goodTool, list, profile, runCheck, snapshot, src } from "./builders.js";

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
    const textOnly = profile({ id: "text-only", limits: { structuredContent: { value: "textOnly", ...src } } });
    const alongside = profile({ id: "alongside", limits: { structuredContent: { value: "alongsideText", ...src } } });
    const findings = runCheck(
      check("CALL_STRUCTURED_WITHOUT_TEXT"),
      withCalls([probe("t", { content: [], structuredContent: { price: 1 } })]),
      { profiles: [textOnly, alongside] }
    );
    assert.deepEqual(findings.map((f) => [f.client, f.severity]), [[undefined, "warn"], ["text-only", "error"]]);
    assert.match(findings[1].message, /empty result/);
  });

  it("CALL_RESULT_TOO_LARGE compares chars, estimated tokens and bytes", () => {
    const big = { ...probe("t", { content: [text("x")] }), resultChars: 120_000 };
    const limit = (max: number, unit: "chars" | "tokens" | "bytes") =>
      profile({ id: `${unit}-${max}`, limits: { maxToolResult: { value: { max, unit, onExceed: "file" }, ...src } } });
    const findings = runCheck(check("CALL_RESULT_TOO_LARGE"), withCalls([big]), {
      profiles: [limit(150_000, "chars"), limit(100_000, "chars"), limit(25_000, "tokens"), limit(40_000, "tokens")],
    });
    // 120k chars ≈ 30k tokens: over 25k tokens and 100k chars, under 40k tokens and 150k chars.
    assert.deepEqual(findings.map((f) => f.client), ["chars-100000", "tokens-25000"]);
    assert.match(findings[1].message, /about 30,000 tokens \(estimated\)/);
  });

  it("CALL_SLOW warns past half the timeout and errors past it", () => {
    const p = profile({ limits: { toolTimeoutMs: { value: 10_000, ...src } } });
    const at = (ms: number) => ({ ...probe("t", { content: [text("x")] }), durationMs: ms });
    assert.deepEqual(runCheck(check("CALL_SLOW"), withCalls([at(4000)]), { profiles: [p] }), []);
    assert.equal(runCheck(check("CALL_SLOW"), withCalls([at(6000)]), { profiles: [p] })[0].severity, "warn");
    assert.equal(runCheck(check("CALL_SLOW"), withCalls([at(12000)]), { profiles: [p] })[0].severity, "error");
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
