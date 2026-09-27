import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defineCheck, type Finding } from "../src/checks/types.js";
import { evaluate } from "../src/evaluate.js";
import { groupFindings, prettyReporter } from "../src/reporters/pretty.js";
import { visible } from "../src/term.js";
import { profile, snapshot, src } from "./checks/builders.js";

const findings: Finding[] = [
  { checkId: "GENERAL_ERROR", severity: "error", message: "Something every client hits.", fix: "Fix it." },
  { checkId: "CLIENT_WARN", severity: "warn", subject: "files.read", client: "a", source: src.source, message: "Client A renames it." },
  { checkId: "CLIENT_WARN", severity: "error", subject: "files.read", client: "b", source: src.source, message: "Client B rejects it." },
  { checkId: "A_NOTE", severity: "info", message: "Just so you know." },
];
const checks = ["GENERAL_ERROR", "CLIENT_WARN", "A_NOTE"].map((id) =>
  defineCheck({ id, area: "tools", description: id, appliesTo: () => true, run: () => findings.filter((f) => f.checkId === id) })
);
const report = evaluate(snapshot(), checks, [profile({ id: "a", displayName: "Client A" }), profile({ id: "b", displayName: "Client B" })]);

describe("pretty reporter", () => {
  it("groups client findings by check and subject, taking the worst severity", () => {
    const groups = groupFindings(report);
    assert.deepEqual(
      groups.map((g) => [g.checkId, g.severity, g.clients.map((c) => c.name)]),
      [
        ["CLIENT_WARN", "error", ["Client A", "Client B"]],
        ["GENERAL_ERROR", "error", []],
        ["A_NOTE", "info", []],
      ]
    );
    // The client name is dropped from the start of each per-client line.
    assert.deepEqual(groups[0].clients.map((c) => c.message), ["renames it.", "rejects it."]);
  });

  it("hides notes unless verbose, and has no colour codes when colour is off", () => {
    const text = prettyReporter(report, { color: false, width: 100 });
    assert.doesNotMatch(text, /\x1b/);
    assert.match(text, /✖ FAIL {2}CLIENT_WARN · files\.read {2}Client A, Client B/);
    assert.match(text, /› Client A +renames it\./);
    assert.match(text, /fix {2}Fix it\./);
    assert.match(text, /src {2}example\.com\/docs/);
    assert.doesNotMatch(text, /A_NOTE/);
    assert.match(text, /1 informational note hidden; run with -v to show/);
    assert.match(prettyReporter(report, { color: false, width: 100, verbose: true }), /ℹ INFO {2}A_NOTE/);
  });

  it("keeps lines within the width", () => {
    const text = prettyReporter(report, { color: true, width: 70 });
    for (const line of text.split("\n")) assert.ok(visible(line) <= 72, line);
  });

  it("reports a server that could not be reached", () => {
    const down = evaluate(snapshot({ connect: { ok: false, error: "spawn x ENOENT" } }), [], []);
    assert.match(prettyReporter(down, { color: false, width: 100 }), /✖ not connected/);
  });
});
