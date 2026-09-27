import { readFileSync, writeFileSync } from "node:fs";
import { ALL_CHECKS } from "./checks/index.js";
import { UsageError, type DiffOptions } from "./cli.js";
import { evaluate } from "./evaluate.js";
import { ALL_PROFILES } from "./profiles/index.js";
import { cell } from "./reporters/escape.js";
import type { RawItem, ServerSnapshot } from "./snapshot.js";

export type ChangeLevel = "breaking" | "change" | "notable";

export interface Change {
  level: ChangeLevel;
  kind: "tool" | "resource" | "resourceTemplate" | "prompt" | "capability" | "protocol" | "compat";
  subject: string;
  message: string;
}

export interface DiffReport {
  before: string;
  after: string;
  changes: Change[];
  summary: Record<ChangeLevel, number>;
}

type Schema = Record<string, unknown>;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const byKey = (items: RawItem[] | undefined, key: string) =>
  new Map((items ?? []).filter((i) => typeof i[key] === "string").map((i) => [i[key] as string, i]));

/** Compares two snapshots of the same server. */
export function diffSnapshots(before: ServerSnapshot, after: ServerSnapshot): Change[] {
  const changes: Change[] = [];
  const add = (c: Change) => changes.push(c);

  // Tools
  const oldTools = byKey(before.lists.tools?.items, "name");
  const newTools = byKey(after.lists.tools?.items, "name");
  for (const [name, tool] of oldTools) {
    const next = newTools.get(name);
    if (!next) {
      add({ level: "breaking", kind: "tool", subject: name, message: "Tool removed." });
      continue;
    }
    compareSchema([], schemaOf(tool.inputSchema), schemaOf(next.inputSchema), "input", add, name);
    if (isObject(tool.outputSchema) && !isObject(next.outputSchema)) {
      add({ level: "breaking", kind: "tool", subject: name, message: "outputSchema removed; consumers of structuredContent lose their contract." });
    } else if (!isObject(tool.outputSchema) && isObject(next.outputSchema)) {
      add({ level: "change", kind: "tool", subject: name, message: "outputSchema added." });
    } else if (isObject(tool.outputSchema) && isObject(next.outputSchema)) {
      compareSchema([], tool.outputSchema, next.outputSchema, "output", add, name);
    }
    if (tool.description !== next.description) {
      add({ level: "notable", kind: "tool", subject: name, message: "Description changed; models may use the tool differently." });
    }
    compareAnnotations(name, tool.annotations, next.annotations, add);
  }
  for (const name of newTools.keys()) {
    if (!oldTools.has(name)) add({ level: "change", kind: "tool", subject: name, message: "Tool added." });
  }

  // Resources, templates, prompts
  compareSet(byKey(before.lists.resources?.items, "uri"), byKey(after.lists.resources?.items, "uri"), "resource", add);
  compareSet(
    byKey(before.lists.resourceTemplates?.items, "uriTemplate"),
    byKey(after.lists.resourceTemplates?.items, "uriTemplate"),
    "resourceTemplate",
    add
  );
  const oldPrompts = byKey(before.lists.prompts?.items, "name");
  const newPrompts = byKey(after.lists.prompts?.items, "name");
  compareSet(oldPrompts, newPrompts, "prompt", add);
  for (const [name, prompt] of oldPrompts) {
    const next = newPrompts.get(name);
    if (!next) continue;
    const args = (p: RawItem) => (Array.isArray(p.arguments) ? p.arguments.filter(isObject) : []);
    const oldArgs = new Map(args(prompt).map((a) => [String(a.name), a]));
    for (const a of args(next)) {
      const was = oldArgs.get(String(a.name));
      if (!was && a.required === true) {
        add({ level: "breaking", kind: "prompt", subject: name, message: `New required argument "${String(a.name)}".` });
      } else if (was && was.required !== true && a.required === true) {
        add({ level: "breaking", kind: "prompt", subject: name, message: `Argument "${String(a.name)}" became required.` });
      }
    }
    for (const argName of oldArgs.keys()) {
      if (!args(next).some((a) => String(a.name) === argName)) {
        add({ level: "breaking", kind: "prompt", subject: name, message: `Argument "${argName}" removed.` });
      }
    }
  }

  // Capabilities and protocol
  const oldCaps = before.initialize?.capabilities ?? {};
  const newCaps = after.initialize?.capabilities ?? {};
  for (const cap of Object.keys(oldCaps)) {
    if (!(cap in newCaps)) add({ level: "breaking", kind: "capability", subject: cap, message: "Capability no longer declared." });
  }
  for (const cap of Object.keys(newCaps)) {
    if (!(cap in oldCaps)) add({ level: "change", kind: "capability", subject: cap, message: "Capability added." });
  }
  const oldVersion = before.initialize?.negotiatedProtocolVersion;
  const newVersion = after.initialize?.negotiatedProtocolVersion;
  if (oldVersion !== newVersion) {
    add({ level: "notable", kind: "protocol", subject: "protocolVersion", message: `Negotiated protocol changed from ${oldVersion ?? "none"} to ${newVersion ?? "none"}.` });
  }

  // Compatibility regressions: failures and warnings that are new in `after`.
  const key = (f: { checkId: string; client?: string; subject?: string }) => `${f.checkId}|${f.client ?? ""}|${f.subject ?? ""}`;
  const oldFindings = new Set(evaluate(before, ALL_CHECKS, ALL_PROFILES).findings.map(key));
  for (const f of evaluate(after, ALL_CHECKS, ALL_PROFILES).findings) {
    if (f.severity === "info" || oldFindings.has(key(f))) continue;
    add({
      level: f.severity === "error" ? "breaking" : "notable",
      kind: "compat",
      subject: [f.checkId, f.client, f.subject].filter(Boolean).join(" · "),
      message: `New ${f.severity}: ${f.message}`,
    });
  }

  const order: Record<ChangeLevel, number> = { breaking: 0, change: 1, notable: 2 };
  return changes.sort((a, b) => order[a.level] - order[b.level] || a.kind.localeCompare(b.kind) || a.subject.localeCompare(b.subject));
}

function schemaOf(value: unknown): Schema {
  return isObject(value) ? value : {};
}

function compareSet(before: Map<string, RawItem>, after: Map<string, RawItem>, kind: Change["kind"], add: (c: Change) => void) {
  for (const k of before.keys()) if (!after.has(k)) add({ level: "breaking", kind, subject: k, message: `${label(kind)} removed.` });
  for (const k of after.keys()) if (!before.has(k)) add({ level: "change", kind, subject: k, message: `${label(kind)} added.` });
}

function label(kind: Change["kind"]): string {
  return { resource: "Resource", resourceTemplate: "Resource template", prompt: "Prompt" }[kind as string] ?? kind;
}

function typeOf(schema: Schema): string | undefined {
  if (Array.isArray(schema.type)) return [...schema.type].sort().join("|");
  return typeof schema.type === "string" ? schema.type : undefined;
}

/**
 * Walks object properties. For inputs, callers are the model/clients, so
 * removing or requiring things breaks them; for outputs, consumers read the
 * result, so removing fields breaks them. `at` is the property path so far.
 */
function compareSchema(
  at: string[],
  before: Schema,
  after: Schema,
  direction: "input" | "output",
  add: (c: Change) => void,
  tool: string
): void {
  if (at.length > 8) return;
  const quote = (path: string[]) => `"${path.join(".")}"`;
  const noun = direction === "input" ? "Argument" : "Output field";
  const change = (level: ChangeLevel, message: string) => add({ level, kind: "tool", subject: tool, message });

  const oldType = typeOf(before);
  const newType = typeOf(after);
  if (at.length > 0 && oldType && newType && oldType !== newType) {
    change("breaking", `${noun} ${quote(at)} changed type from ${oldType} to ${newType}.`);
    return;
  }

  const oldEnum = Array.isArray(before.enum) ? (before.enum as unknown[]) : undefined;
  const newEnum = Array.isArray(after.enum) ? (after.enum as unknown[]) : undefined;
  if (oldEnum && newEnum) {
    const where = at.length ? ` for ${quote(at)}` : "";
    const list = (values: unknown[]) => values.map((v) => JSON.stringify(v)).join(", ");
    const removed = oldEnum.filter((v) => !newEnum.includes(v));
    const added = newEnum.filter((v) => !oldEnum.includes(v));
    // Inputs: fewer accepted values breaks callers. Outputs: new values can surprise consumers.
    if (removed.length) change(direction === "input" ? "breaking" : "change", `Enum value(s) ${list(removed)} removed${where}.`);
    if (added.length) change(direction === "output" ? "notable" : "change", `Enum value(s) ${list(added)} added${where}.`);
  }

  const oldProps = isObject(before.properties) ? before.properties : {};
  const newProps = isObject(after.properties) ? after.properties : {};
  const oldRequired = new Set(Array.isArray(before.required) ? before.required : []);
  const newRequired = new Set(Array.isArray(after.required) ? after.required : []);

  for (const prop of Object.keys(oldProps)) {
    if (!(prop in newProps)) change("breaking", `${noun} ${quote([...at, prop])} removed.`);
  }
  for (const prop of Object.keys(newProps)) {
    const path = [...at, prop];
    const isNew = !(prop in oldProps);
    if (direction === "input") {
      if (isNew && newRequired.has(prop)) change("breaking", `New required argument ${quote(path)}.`);
      else if (isNew) change("change", `New optional argument ${quote(path)}.`);
      else if (!oldRequired.has(prop) && newRequired.has(prop)) change("breaking", `Argument ${quote(path)} became required.`);
      else if (oldRequired.has(prop) && !newRequired.has(prop)) change("change", `Argument ${quote(path)} became optional.`);
    } else if (isNew) {
      change("change", `New output field ${quote(path)}.`);
    } else if (oldRequired.has(prop) && !newRequired.has(prop)) {
      change("breaking", `Output field ${quote(path)} is no longer guaranteed (was required).`);
    }
    if (!isNew && isObject(oldProps[prop]) && isObject(newProps[prop])) {
      compareSchema(path, oldProps[prop] as Schema, newProps[prop] as Schema, direction, add, tool);
    }
  }
  if (isObject(before.items) && isObject(after.items)) {
    compareSchema([...at, "[]"], before.items, after.items, direction, add, tool);
  }
}

function compareAnnotations(tool: string, before: unknown, after: unknown, add: (c: Change) => void) {
  const a = isObject(before) ? before : {};
  const b = isObject(after) ? after : {};
  for (const hint of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"]) {
    if (a[hint] !== b[hint]) {
      add({ level: "notable", kind: "tool", subject: tool, message: `${hint} changed from ${JSON.stringify(a[hint] ?? null)} to ${JSON.stringify(b[hint] ?? null)}; clients may prompt for confirmation differently.` });
    }
  }
}

export function loadDiffInput(path: string): ServerSnapshot {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new UsageError(`${path}: ${(err as Error).message}`);
  }
  if (data.snapshotVersion === 1) return data as unknown as ServerSnapshot;
  if (data.schemaVersion !== undefined) {
    throw new UsageError(`${path} is a report, not a snapshot. Create snapshots with: check --save-snapshot <file> ...`);
  }
  throw new UsageError(`${path} is not an mcp-use-compat snapshot.`);
}

export function buildDiff(beforePath: string, afterPath: string): DiffReport {
  const changes = diffSnapshots(loadDiffInput(beforePath), loadDiffInput(afterPath));
  const summary: Record<ChangeLevel, number> = { breaking: 0, change: 0, notable: 0 };
  for (const c of changes) summary[c.level]++;
  return { before: beforePath, after: afterPath, changes, summary };
}

const LEVEL_LABEL: Record<ChangeLevel, string> = { breaking: "❌ breaking", change: "➕ change", notable: "⚠️ notable" };

export function renderDiffMarkdown(report: DiffReport): string {
  const { summary } = report;
  const lines = [
    `# MCP Surface Diff`,
    "",
    `\`${report.before}\` → \`${report.after}\`: ${summary.breaking} breaking, ${summary.change} non-breaking, ${summary.notable} notable.`,
    "",
  ];
  if (report.changes.length === 0) return lines.concat("_No changes._", "").join("\n");
  lines.push("| Level | Kind | Subject | Change |", "|---|---|---|---|");
  for (const c of report.changes) lines.push(`| ${LEVEL_LABEL[c.level]} | ${c.kind} | ${cell(c.subject)} | ${cell(c.message)} |`);
  return lines.concat("").join("\n");
}

export function renderDiffGithub(report: DiffReport): string {
  return report.changes
    .filter((c) => c.level !== "change")
    .map((c) => `::${c.level === "breaking" ? "error" : "warning"} title=${c.kind}: ${c.subject.replace(/[:,\n]/g, " ")}::${c.message.replace(/\n/g, "%0A")}`)
    .join("\n")
    .concat(report.changes.some((c) => c.level !== "change") ? "\n" : "");
}

export function runDiff(options: DiffOptions): number {
  const report = buildDiff(options.before, options.after);
  const output =
    options.format === "json"
      ? JSON.stringify(report, null, 2) + "\n"
      : options.format === "github"
        ? renderDiffGithub(report)
        : renderDiffMarkdown(report);
  if (options.out) writeFileSync(options.out, output);
  else process.stdout.write(output);

  const failed =
    options.failOn === "any" ? report.changes.length > 0 : options.failOn === "breaking" ? report.summary.breaking > 0 : false;
  console.error(
    failed
      ? `\n✖ ${report.summary.breaking} breaking change(s)${options.failOn === "any" ? ` and ${report.changes.length - report.summary.breaking} other change(s)` : ""}.`
      : `\n✔ No changes matched --fail-on=${options.failOn}.`
  );
  return failed ? 1 : 0;
}
