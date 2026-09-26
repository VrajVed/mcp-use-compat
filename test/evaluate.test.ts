import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defineCheck, type Finding } from "../src/checks/types.js";
import { evaluate, statusFor } from "../src/evaluate.js";
import { profile, snapshot, src } from "./checks/builders.js";

const finding = (f: Partial<Finding>): Finding => ({ checkId: "X", severity: "error", message: "m", ...f });

describe("statusFor (general findings)", () => {
  it("maps severity to status", () => {
    assert.equal(statusFor(finding({ severity: "error" }), profile()).status, "fail");
    assert.equal(statusFor(finding({ severity: "warn" }), profile()).status, "warn");
    assert.equal(statusFor(finding({ severity: "info" }), profile()).status, "info");
  });

  it("downgrades to info when the client supports none of the affected features", () => {
    const p = profile({ supports: { stdio: { value: false, ...src } } });
    const r = statusFor(finding({ affects: ["stdio"] }), p);
    assert.equal(r.status, "info");
    assert.equal(r.source, src.source);
  });

  it("keeps the severity when support is unknown or partial", () => {
    assert.equal(statusFor(finding({ affects: ["stdio"] }), profile()).status, "fail");
    const partial = profile({ supports: { stdio: { value: "partial", ...src } } });
    assert.equal(statusFor(finding({ affects: ["stdio"] }), partial).status, "fail");
  });

  it("keeps the severity when only some affected features are unsupported", () => {
    const p = profile({ supports: { oauth: { value: false, ...src } } });
    assert.equal(statusFor(finding({ affects: ["oauth", "dcr"] }), p).status, "fail");
  });
});

describe("evaluate", () => {
  const checks = [
    defineCheck({ id: "A_PASS", area: "tools", description: "passes", appliesTo: () => true, run: () => [] }),
    defineCheck({ id: "B_SKIP", area: "auth", description: "skipped", appliesTo: () => false, run: () => [] }),
    defineCheck({
      id: "C_GENERAL",
      area: "tools",
      description: "general",
      appliesTo: () => true,
      run: () => [finding({ checkId: "C_GENERAL", severity: "warn", subject: "t1" })],
    }),
    defineCheck({
      id: "D_CLIENT",
      area: "tools",
      description: "client specific",
      appliesTo: () => true,
      run: () => [finding({ checkId: "D_CLIENT", client: "one", source: src.source })],
    }),
  ];

  it("builds one row per check per client, with pass and skip rows", () => {
    const report = evaluate(snapshot(), checks, [profile({ id: "one" }), profile({ id: "two" })]);
    const rows = (id: string) => report.clients.find((c) => c.client === id)!.rows.map((r) => [r.checkId, r.status]);
    assert.deepEqual(rows("one"), [
      ["A_PASS", "pass"],
      ["B_SKIP", "skip"],
      ["C_GENERAL", "warn"],
      ["D_CLIENT", "fail"],
    ]);
    assert.deepEqual(rows("two"), [
      ["A_PASS", "pass"],
      ["B_SKIP", "skip"],
      ["C_GENERAL", "warn"],
      ["D_CLIENT", "pass"],
    ]);
    assert.deepEqual(report.clients[0].summary, { pass: 1, warn: 1, fail: 1, info: 0, skip: 1 });
  });

  it("records which checks ran and sorts findings by severity", () => {
    const report = evaluate(snapshot(), checks, []);
    assert.deepEqual(
      report.checks.map((c) => [c.id, c.ran]),
      [
        ["A_PASS", true],
        ["B_SKIP", false],
        ["C_GENERAL", true],
        ["D_CLIENT", true],
      ]
    );
    assert.deepEqual(
      report.findings.map((f) => f.checkId),
      ["D_CLIENT", "C_GENERAL"]
    );
    assert.equal(report.server.counts.tools, 1);
  });
});
