import { readFileSync, writeFileSync } from "node:fs";
import { SPEC_TOOL_NAME } from "./checks/tools.js";
import { UsageError, type FixOptions } from "./cli.js";
import type { RawItem } from "./snapshot.js";

export interface FixChange {
  tool: string;
  change: string;
  /** Needs a human: we removed something invalid but can't write the replacement. */
  todo?: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Reads tools from a snapshot, a { tools: [...] } object, or a bare array. */
export function loadTools(path: string): RawItem[] {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new UsageError(`${path}: ${(err as Error).message}`);
  }
  if (Array.isArray(data)) return data.filter(isObject);
  if (isObject(data) && isObject(data.lists) && isObject(data.lists.tools) && Array.isArray(data.lists.tools.items)) {
    return data.lists.tools.items.filter(isObject);
  }
  if (isObject(data) && Array.isArray(data.tools)) return data.tools.filter(isObject);
  throw new UsageError(`${path}: expected a snapshot, { "tools": [...] }, or an array of tools.`);
}

/** Applies mechanical, behaviour-preserving fixes. Never invents content. */
export function fixTools(tools: RawItem[], options: { rename: boolean }): { tools: RawItem[]; changes: FixChange[] } {
  const changes: FixChange[] = [];
  const names = new Set(tools.map((t) => t.name).filter((n): n is string => typeof n === "string"));

  const fixed = tools.map((original) => {
    const tool = clone(original);
    const name = typeof tool.name === "string" ? tool.name : "(unnamed)";
    const note = (change: string, todo?: string) => changes.push({ tool: name, change, ...(todo ? { todo } : {}) });

    if (tool.description === null || (typeof tool.description === "string" && tool.description.trim() === "")) {
      delete tool.description;
      note("Removed null/empty description (absent is valid; null breaks SDK clients).", "Write a description of what the tool does and when to use it.");
    }

    if (!isObject(tool.inputSchema)) {
      tool.inputSchema = { type: "object", properties: {} };
      note('Added inputSchema { "type": "object", "properties": {} }.', "If the tool takes arguments, describe them.");
    } else {
      fixSchema(tool.inputSchema, "inputSchema", note, true);
    }
    if (isObject(tool.outputSchema)) fixSchema(tool.outputSchema, "outputSchema", note, true);

    if (options.rename && typeof tool.name === "string" && !/^[A-Za-z0-9_-]{1,64}$/.test(tool.name)) {
      let renamed = tool.name.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64) || "tool";
      while (names.has(renamed) && renamed !== tool.name) renamed = `${renamed.slice(0, 62)}_2`;
      names.add(renamed);
      note(`Renamed to "${renamed}" (letters, digits, _ and - only; ≤ 64 characters).`, "Update callers, prompts and docs that use the old name.");
      tool.name = renamed;
    } else if (typeof tool.name === "string" && !SPEC_TOOL_NAME.test(tool.name)) {
      note("Name is not a valid MCP tool name.", "Rename it, or run fix with --rename.");
    }
    return tool;
  });

  return { tools: fixed, changes };
}

function fixSchema(
  schema: Record<string, unknown>,
  path: string,
  note: (change: string, todo?: string) => void,
  root: boolean
): void {
  if (root && schema.type !== "object") {
    if (isObject(schema.properties)) {
      note(`${path}: set root type to "object" (was ${JSON.stringify(schema.type ?? null)}).`);
      schema.type = "object";
    } else {
      note(
        `${path}: root type is ${JSON.stringify(schema.type ?? null)}, but MCP requires "object"; not changed automatically.`,
        'Wrap the argument in an object, e.g. { "type": "object", "properties": { "value": <old schema> }, "required": ["value"] }, and update the handler.'
      );
    }
  }
  if ("required" in schema && !Array.isArray(schema.required)) {
    note(`${path}: removed invalid required: ${JSON.stringify(schema.required)} (must be a list of property names).`);
    delete schema.required;
  }
  const props = isObject(schema.properties) ? schema.properties : undefined;
  if (Array.isArray(schema.required) && props) {
    const unknown = schema.required.filter((r) => typeof r !== "string" || !(r in props));
    if (unknown.length) {
      schema.required = schema.required.filter((r) => typeof r === "string" && r in props);
      note(`${path}: removed ${unknown.map((u) => JSON.stringify(u)).join(", ")} from required (not in properties).`, "If they are real arguments, add them to properties instead.");
    }
  }
  if (Array.isArray(schema.enum) && schema.enum.length === 0) {
    delete schema.enum;
    note(`${path}: removed an empty enum (no value could satisfy it).`, "List the allowed values if there are any.");
  }
  if (props) {
    for (const [name, sub] of Object.entries(props)) if (isObject(sub)) fixSchema(sub, `${path}.${name}`, note, false);
  }
  if (isObject(schema.items)) fixSchema(schema.items, `${path}[]`, note, false);
}

export function runFix(options: FixOptions): number {
  const { tools, changes } = fixTools(loadTools(options.input), { rename: options.rename });
  const output = JSON.stringify({ tools }, null, 2) + "\n";
  if (options.out) writeFileSync(options.out, output);
  else if (options.format === "json") process.stdout.write(output);

  if (changes.length === 0) {
    console.error("✔ Nothing to fix mechanically.");
  } else {
    console.error(`${changes.length} change(s)${options.out ? ` written to ${options.out}` : ""}:`);
    for (const c of changes) console.error(`  ${c.tool}: ${c.change}${c.todo ? `\n    → TODO: ${c.todo}` : ""}`);
    console.error(
      options.out
        ? "\nApply these to your server code; the corrected definitions are in the output file."
        : options.format === "json"
          ? "\nApply these to your server code; the corrected definitions are on stdout."
          : "\nApply these to your server code. Use --json or --out <file> to get the corrected definitions."
    );
  }
  return 0;
}
