import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defineCheck, type Finding } from "../src/checks/types.js";
import { evaluate } from "../src/evaluate.js";
import { EXIT, exitCode, failures, parsePolicy, PolicyError } from "../src/policy.js";
import { profile, snapshot } from "./checks/builders.js";

const ids = ["TOOL_NAME_INVALID", "TOOL_DESCRIPTION_MISSING", "AUTH_PRM_MISSING"];
const areas = ["tools", "auth"] as const;

function reportWith(findings: Finding[], clients = [profile()]) {
  const checks = [...new Set(findings.map((f) => f.checkId))].map((id) =>
    defineCheck({
      id,
      area: id.startsWith("AUTH") ? "auth" : "tools",
      description: id,
      appliesTo: () => true,
      run: () => findings.filter((f) => f.checkId === id),
    })
  );
  return evaluate(snapshot(), checks, clients);
}

const err = (checkId: string): Finding => ({ checkId, severity: "error", message: "m" });
const warn = (checkId: string): Finding => ({ checkId, severity: "warn", message: "m" });

describe("parsePolicy", () => {
  it("parses keywords", () => {
    assert.deepEqual(parsePolicy("none", ids, [...areas]), { kind: "none" });
    assert.deepEqual(parsePolicy("error", ids, [...areas]), { kind: "severity", includeWarn: false });
    assert.deepEqual(parsePolicy("warn", ids, [...areas]), { kind: "severity", includeWarn: true });
  });

  it("rejects tokens that match nothing", () => {
    assert.throws(() => parsePolicy("NOPE_*", ids, [...areas]), PolicyError);
  });
});

describe("failures", () => {
  it("error policy fails on errors only", () => {
    assert.equal(failures(reportWith([warn("TOOL_NAME_INVALID")]), parsePolicy("error", ids, [...areas])).length, 0);
    assert.equal(failures(reportWith([err("TOOL_NAME_INVALID")]), parsePolicy("error", ids, [...areas])).length, 1);
  });

  it("warn policy also fails on warnings", () => {
    assert.equal(failures(reportWith([warn("TOOL_NAME_INVALID")]), parsePolicy("warn", ids, [...areas])).length, 1);
  });

  it("id, glob and area lists only fail on matching errors", () => {
    const report = reportWith([err("TOOL_NAME_INVALID"), err("AUTH_PRM_MISSING")]);
    assert.deepEqual(failures(report, parsePolicy("auth", ids, [...areas])), ["test-client AUTH_PRM_MISSING"]);
    assert.equal(failures(report, parsePolicy("TOOL_*", ids, [...areas])).length, 1);
    assert.equal(failures(report, parsePolicy("TOOL_DESCRIPTION_MISSING", ids, [...areas])).length, 0);
  });

  it("judges general findings by severity when no clients are selected", () => {
    assert.equal(failures(reportWith([err("TOOL_NAME_INVALID")], []), parsePolicy("error", ids, [...areas])).length, 1);
  });

  it("none never fails", () => {
    assert.equal(failures(reportWith([err("TOOL_NAME_INVALID")]), parsePolicy("none", ids, [...areas])).length, 0);
  });
});

describe("exitCode", () => {
  it("returns connectFailed unless the policy is none", () => {
    const report = reportWith([]);
    assert.equal(exitCode(report, parsePolicy("error", ids, [...areas]), true), EXIT.connectFailed);
    assert.equal(exitCode(report, parsePolicy("none", ids, [...areas]), true), EXIT.ok);
  });
});
