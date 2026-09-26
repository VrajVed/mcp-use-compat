import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, it } from "node:test";
import { defineCheck, type Finding } from "../src/checks/types.js";
import { evaluate } from "../src/evaluate.js";
import { cell } from "../src/reporters/escape.js";
import { githubReporter } from "../src/reporters/github.js";
import { jsonReporter } from "../src/reporters/json.js";
import { markdownReporter } from "../src/reporters/markdown.js";
import { ALL_CHECKS } from "../src/checks/index.js";
import { ALL_PROFILES } from "../src/profiles/index.js";
import { goodTool, list, profile, snapshot, src } from "./checks/builders.js";

const findings: Finding[] = [
  { checkId: "GEN", severity: "error", message: "bad | pipe\nnewline", subject: "tool_a", fix: "fix it" },
  { checkId: "CLI", severity: "warn", message: "client thing", client: "test-client", source: src.source },
  { checkId: "NOTE", severity: "info", message: "fyi" },
];
const checks = ["GEN", "CLI", "NOTE"].map((id) =>
  defineCheck({
    id,
    area: "tools",
    description: id,
    appliesTo: () => true,
    run: () => findings.filter((f) => f.checkId === id),
  })
);
const report = evaluate(snapshot(), checks, [profile()]);

describe("escape", () => {
  it("escapes pipes, backslashes and newlines", () => {
    assert.equal(cell("a|b\\c\nd"), "a\\|b\\\\c<br>d");
    assert.equal(cell(undefined), "");
  });
});

describe("markdown reporter", () => {
  const md = markdownReporter(report);

  it("has summary, server issues and a client section", () => {
    assert.match(md, /^# MCP Compatibility Report: test-server 1\.0\.0/);
    assert.match(md, /\| Test Client \| 0 \| 1 \| 1 \| 1 \| 0 \|/);
    assert.match(md, /## Server issues \(all clients\)/);
    assert.match(md, /## Test Client/);
    assert.match(md, /\[source\]\(https:\/\/example\.com\/docs\)/);
  });

  it("escapes table cells", () => {
    assert.match(md, /bad \\\| pipe<br>newline/);
  });

  it("keeps every table row on one line with a consistent column count", () => {
    for (const line of md.split("\n").filter((l) => l.startsWith("| "))) {
      const cols = line.replace(/\\\|/g, "").split("|").length;
      assert.ok(cols === 7 || cols === 8, line);
    }
  });
});

describe("json reporter", () => {
  it("matches the published schema", () => {
    const schema = JSON.parse(readFileSync(resolve(import.meta.dirname, "../schema/report.schema.json"), "utf8"));
    const ajv = new Ajv2020({ allErrors: true });
    addFormats.default(ajv);
    const validate = ajv.compile(schema);
    const real = evaluate(
      snapshot({
        lists: { tools: list([{ ...goodTool("files.read"), description: null }, goodTool("files_read")]) },
        io: { stdoutNonJsonLines: ["log"], stderrTail: [] },
      }),
      ALL_CHECKS,
      ALL_PROFILES
    );
    assert.ok(real.findings.length > 3);
    assert.ok(validate(JSON.parse(jsonReporter(real))), JSON.stringify(validate.errors));
  });

  it("round-trips the report", () => {
    const parsed = JSON.parse(jsonReporter(report));
    assert.equal(parsed.schemaVersion, 1);
    assert.equal(parsed.findings.length, 3);
    assert.equal(parsed.clients[0].client, "test-client");
  });
});

describe("github reporter", () => {
  it("emits one annotation per error/warning, escaped", () => {
    const lines = githubReporter(report).trim().split("\n");
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^::error title=GEN \(tool_a\)::bad \| pipe%0Anewline Fix: fix it$/);
    assert.match(lines[1], /^::warning title=CLI \(test-client\)::client thing$/);
  });
});
