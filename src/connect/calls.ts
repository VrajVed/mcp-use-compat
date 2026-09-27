import type { CallProbe, RawItem } from "../snapshot.js";
import { nameIntent } from "../checks/tools.js";
import { RpcError, type RpcSession } from "./session.js";

const MAX_PROBES = 20;
const MAX_TEXT = 4000;

type Schema = Record<string, unknown>;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Tools --probe-calls may call: explicitly readOnlyHint: true, not also marked
 * destructive, and not named like a write. Anything else is never called.
 */
export function safeToProbe(tool: RawItem): boolean {
  const a = isObject(tool.annotations) ? tool.annotations : {};
  if (a.readOnlyHint !== true || a.destructiveHint === true) return false;
  return typeof tool.name === "string" && nameIntent(tool.name) !== "write";
}

/** Minimal arguments that satisfy the schema's required properties. */
export function synthesizeArgs(schema: unknown): Record<string, unknown> {
  const value = synthesizeValue(schema, 0);
  return isObject(value) ? value : {};
}

function synthesizeValue(schema: unknown, depth: number): unknown {
  if (!isObject(schema) || depth > 6) return undefined;
  if ("default" in schema) return schema.default;
  if (Array.isArray(schema.examples) && schema.examples.length) return schema.examples[0];
  if ("const" in schema) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  for (const key of ["anyOf", "oneOf"]) {
    if (Array.isArray(schema[key]) && (schema[key] as unknown[]).length) return synthesizeValue((schema[key] as unknown[])[0], depth + 1);
  }
  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== "null") : schema.type;
  switch (type) {
    case "string":
      return stringFor(schema);
    case "integer":
    case "number":
      return typeof schema.minimum === "number" ? schema.minimum : typeof schema.exclusiveMinimum === "number" ? schema.exclusiveMinimum + 1 : 1;
    case "boolean":
      return false;
    case "array": {
      const min = typeof schema.minItems === "number" ? schema.minItems : 0;
      return Array.from({ length: min }, () => synthesizeValue(schema.items, depth + 1));
    }
    case "null":
      return null;
    default: {
      const out: Record<string, unknown> = {};
      const props = isObject(schema.properties) ? schema.properties : {};
      for (const name of Array.isArray(schema.required) ? schema.required : []) {
        if (typeof name === "string") out[name] = synthesizeValue(props[name] ?? { type: "string" }, depth + 1);
      }
      return out;
    }
  }
}

function stringFor(schema: Schema): string {
  switch (schema.format) {
    case "date":
      return "2026-01-02";
    case "date-time":
      return "2026-01-02T03:04:05Z";
    case "email":
      return "test@example.com";
    case "uri":
    case "url":
      return "https://example.com";
    case "uuid":
      return "00000000-0000-4000-8000-000000000000";
  }
  const min = typeof schema.minLength === "number" ? schema.minLength : 1;
  return "test".padEnd(min, "x");
}

export async function callTool(
  session: RpcSession,
  tool: string,
  args: Record<string, unknown>,
  origin: CallProbe["origin"],
  timeoutMs: number
): Promise<CallProbe> {
  const started = performance.now();
  try {
    const result = await session.request("tools/call", { name: tool, arguments: args }, timeoutMs);
    const raw = isObject(result) ? result : { __nonObjectResult: result };
    return {
      tool,
      args,
      origin,
      durationMs: Math.round(performance.now() - started),
      result: truncateResult(raw),
      resultChars: JSON.stringify(raw).length,
    };
  } catch (err) {
    return {
      tool,
      args,
      origin,
      durationMs: Math.round(performance.now() - started),
      error: { code: err instanceof RpcError ? err.code : undefined, message: (err as Error).message },
    };
  }
}

/** Keeps structure (for validation) but caps long text so snapshots stay small. */
function truncateResult(result: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(result.content)) return result;
  return {
    ...result,
    content: result.content.map((c) =>
      isObject(c) && typeof c.text === "string" && c.text.length > MAX_TEXT
        ? { ...c, text: c.text.slice(0, MAX_TEXT), __truncatedFrom: c.text.length }
        : isObject(c) && typeof c.data === "string" && c.data.length > MAX_TEXT
          ? { ...c, data: c.data.slice(0, 64), __truncatedFrom: c.data.length }
          : c
    ),
  };
}

/** Calls up to MAX_PROBES safe tools with synthesized arguments. */
export async function probeCalls(
  session: RpcSession,
  tools: RawItem[],
  timeoutMs: number,
  log: (msg: string) => void,
  progress?: (stage: string) => void
): Promise<CallProbe[]> {
  const safe = tools.filter(safeToProbe).slice(0, MAX_PROBES);
  if (safe.length === 0) {
    log("--probe-calls: no tools declare readOnlyHint: true, so nothing was called.");
    return [];
  }
  log(`--probe-calls: calling ${safe.length} read-only tool(s): ${safe.map((t) => t.name).join(", ")}`);
  const results: CallProbe[] = [];
  for (const tool of safe) {
    progress?.(`calling ${String(tool.name)}`);
    results.push(await callTool(session, tool.name as string, synthesizeArgs(tool.inputSchema), "probe", timeoutMs));
  }
  return results;
}
