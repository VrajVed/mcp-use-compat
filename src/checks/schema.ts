import { Ajv } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { RawItem, ServerSnapshot } from "../snapshot.js";
import { connected, isObject, items, str, withNote } from "./util.js";
import { defineCheck, type Finding } from "./types.js";

const MAX_DEPTH = 5;
const COMBINATORS = ["oneOf", "anyOf", "allOf", "not"];

const ajv2020 = new Ajv2020({ strict: false, validateSchema: false, logger: false });
const ajv07 = new Ajv({ strict: false, validateSchema: false, logger: false });

type SchemaKey = "inputSchema" | "outputSchema";

const hasTools = (s: ServerSnapshot) => connected(s) && items(s, "tools").length > 0;
const toolName = (t: RawItem) => str(t.name) ?? "(unnamed)";

/** Tools whose schema at `key` is an object (ignores missing/invalid ones). */
function schemas(s: ServerSnapshot, key: SchemaKey): Array<[RawItem, Record<string, unknown>]> {
  return items(s, "tools").flatMap((t) => (isObject(t[key]) ? [[t, t[key] as Record<string, unknown>]] : []));
}

/** Meta-validates against the draft named in $schema (2020-12 by default, per the MCP spec). */
export function metaValidate(schema: Record<string, unknown>): string[] | undefined {
  const dialect = str(schema.$schema) ?? "https://json-schema.org/draft/2020-12/schema";
  const validator = /draft-0[67]/.test(dialect) ? ajv07 : /2020-12/.test(dialect) ? ajv2020 : undefined;
  if (!validator) return undefined; // Unknown dialect: don't guess.
  const valid = validator.validateSchema(schema);
  if (valid) return [];
  return (validator.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? "is invalid"}`);
}

interface SchemaStats {
  keywords: Set<string>;
  depth: number;
  untypedProperties: string[];
  /** Paths of subschemas whose type is an array. */
  typeArrays: string[];
}

/** Walks subschemas and collects keywords, nesting depth, and properties without a type. */
export function analyze(schema: unknown): SchemaStats {
  const stats: SchemaStats = { keywords: new Set(), depth: 0, untypedProperties: [], typeArrays: [] };
  const visit = (node: unknown, depth: number, path: string) => {
    if (!isObject(node)) return;
    stats.depth = Math.max(stats.depth, depth);
    if (Array.isArray(node.type)) stats.typeArrays.push(path.replace(/\.$/, "") || "(root)");
    for (const key of Object.keys(node)) stats.keywords.add(key);
    if (isObject(node.properties)) {
      for (const [name, sub] of Object.entries(node.properties)) {
        const p = `${path}${name}`;
        if (isObject(sub) && !hasTypeInfo(sub)) stats.untypedProperties.push(p);
        visit(sub, depth + 1, `${p}.`);
      }
    }
    for (const key of ["items", "additionalProperties", "not", "if", "then", "else", "contains"]) {
      visit(node[key], depth + 1, `${path}${key}.`);
    }
    for (const key of ["anyOf", "oneOf", "allOf", "prefixItems"]) {
      if (Array.isArray(node[key])) (node[key] as unknown[]).forEach((sub) => visit(sub, depth + 1, path));
    }
    for (const key of ["$defs", "definitions", "patternProperties"]) {
      if (isObject(node[key])) Object.values(node[key]).forEach((sub) => visit(sub, depth, path));
    }
  };
  visit(schema, 0, "");
  return stats;
}

/** Every enum in the schema with its path. */
function enumPaths(schema: unknown, path = "", out: Array<[string, unknown[]]> = []): Array<[string, unknown[]]> {
  if (!isObject(schema)) return out;
  if (Array.isArray(schema.enum)) out.push([path || "(root)", schema.enum]);
  if (isObject(schema.properties)) {
    for (const [name, sub] of Object.entries(schema.properties)) enumPaths(sub, path ? `${path}.${name}` : name, out);
  }
  if (isObject(schema.items)) enumPaths(schema.items, `${path}[]`, out);
  for (const key of ["anyOf", "oneOf", "allOf"]) {
    if (Array.isArray(schema[key])) (schema[key] as unknown[]).forEach((sub) => enumPaths(sub, path, out));
  }
  return out;
}

/**
 * Mirrors Cline's normalizeToolInputSchema (sdk/packages/shared/src/tools/create.ts @ 252082b):
 * schemas with a string `type`, or with properties/required/additionalProperties, pass.
 * Otherwise the first non-empty root oneOf/anyOf/allOf decides: oneOf/anyOf need every
 * branch to be `type: "object"`, allOf needs at least one such branch.
 */
export function rootCombinatorBreaks(schema: Record<string, unknown>): boolean {
  if (typeof schema.type === "string") return false;
  if ("properties" in schema || "required" in schema || "additionalProperties" in schema) return false;
  const isObjectBranch = (b: unknown) => isObject(b) && b.type === "object";
  for (const key of ["oneOf", "anyOf", "allOf"]) {
    const branches = schema[key];
    if (!Array.isArray(branches) || branches.length === 0) continue;
    return key === "allOf" ? !branches.some(isObjectBranch) : !branches.every(isObjectBranch);
  }
  return false;
}

function hasTypeInfo(schema: Record<string, unknown>): boolean {
  return ["type", "enum", "const", "$ref", ...COMBINATORS].some((k) => k in schema);
}

export const schemaChecks = [
  defineCheck({
    id: "SCHEMA_MISSING",
    area: "schema",
    description: "Every tool has an inputSchema object",
    appliesTo: hasTools,
    run: (s) =>
      items(s, "tools")
        .filter((t) => !isObject(t.inputSchema))
        .map((t) => ({
          checkId: "SCHEMA_MISSING",
          severity: "error" as const,
          subject: toolName(t),
          message: "Tool has no inputSchema object. The spec requires one; the TypeScript SDK rejects the whole tools/list response, so SDK-based clients see no tools at all.",
          fix: 'Use { "type": "object", "properties": {} } for tools without arguments.',
        })),
  }),

  defineCheck({
    id: "SCHEMA_NOT_OBJECT",
    area: "schema",
    description: 'inputSchema and outputSchema have type "object" at the root',
    appliesTo: hasTools,
    run: (s) =>
      (["inputSchema", "outputSchema"] as const).flatMap((key) =>
        schemas(s, key)
          .filter(([, schema]) => schema.type !== "object")
          .map(([t, schema]) => ({
            checkId: "SCHEMA_NOT_OBJECT",
            severity: "error" as const,
            subject: toolName(t),
            message: `${key} root type is ${JSON.stringify(schema.type ?? null)}, but MCP requires "object"; the TypeScript SDK rejects the whole tools/list response.`,
            fix: 'Wrap arguments in an object schema: { "type": "object", "properties": { ... } }.',
          }))
      ),
  }),

  defineCheck({
    id: "SCHEMA_INVALID",
    area: "schema",
    description: "Schemas are valid JSON Schema",
    appliesTo: hasTools,
    run: (s) =>
      (["inputSchema", "outputSchema"] as const).flatMap((key) =>
        schemas(s, key).flatMap(([t, schema]): Finding[] => {
          const errors = metaValidate(schema);
          if (!errors || errors.length === 0) return [];
          return [
            {
              checkId: "SCHEMA_INVALID",
              severity: "error",
              subject: toolName(t),
              message: `${key} is not valid JSON Schema: ${errors.slice(0, 3).join("; ")}`,
              evidence: { errors },
              fix: "Generate schemas with your SDK's schema helper instead of writing them by hand.",
            },
          ];
        })
      ),
  }),

  defineCheck({
    id: "SCHEMA_REQUIRED_UNKNOWN",
    area: "schema",
    description: "required only lists declared properties",
    appliesTo: hasTools,
    run: (s) =>
      schemas(s, "inputSchema").flatMap(([t, schema]): Finding[] => {
        if (!Array.isArray(schema.required)) return [];
        const props = isObject(schema.properties) ? schema.properties : {};
        const unknown = schema.required.filter((r) => typeof r === "string" && !(r in props));
        if (unknown.length === 0) return [];
        return [
          {
            checkId: "SCHEMA_REQUIRED_UNKNOWN",
            severity: "warn",
            subject: toolName(t),
            message: `required lists ${unknown.map((u) => JSON.stringify(u)).join(", ")}, which ${unknown.length === 1 ? "is" : "are"} not in properties; the model can't know their type.`,
            fix: "Add the missing properties or remove them from required.",
          },
        ];
      }),
  }),

  defineCheck({
    id: "SCHEMA_TOP_LEVEL_COMBINATOR",
    area: "schema",
    description: "inputSchema has no root-level oneOf/anyOf/allOf/not",
    appliesTo: hasTools,
    run: (s) =>
      schemas(s, "inputSchema").flatMap(([t, schema]): Finding[] => {
        const used = COMBINATORS.filter((k) => k in schema);
        if (used.length === 0) return [];
        return [
          {
            checkId: "SCHEMA_TOP_LEVEL_COMBINATOR",
            severity: "info",
            subject: toolName(t),
            message: `inputSchema uses ${used.join("/")} at the root. Valid JSON Schema, but clients handle it differently: some rewrite it (Claude Code), and some fail on it (see client-specific results).`,
            fix: "Use one flat object schema; express variants with optional properties or an enum discriminator.",
          },
        ];
      }),
  }),

  defineCheck({
    id: "SCHEMA_UNSUPPORTED_KEYWORD",
    area: "schema",
    description: "Schemas avoid keywords a client rejects or drops",
    appliesTo: hasTools,
    run: (s, { profiles }) =>
      profiles.flatMap((p) => {
        const rule = p.limits.schemaUnsupported;
        if (!rule) return [];
        return schemas(s, "inputSchema").flatMap(([t, schema]): Finding[] => {
          const { keywords } = analyze(schema);
          const bad = rule.value.filter((k) => keywords.has(k));
          if (bad.length === 0) return [];
          return [
            {
              checkId: "SCHEMA_UNSUPPORTED_KEYWORD",
              severity: "warn",
              subject: toolName(t),
              client: p.id,
              source: rule.source,
              message: withNote(`inputSchema uses ${bad.join(", ")}, which ${p.displayName} does not support.`, rule.note),
              fix: "Inline definitions and simplify the schema for maximum compatibility.",
            },
          ];
        });
      }),
  }),

  defineCheck({
    id: "SCHEMA_PROPERTY_NAME_REJECTED",
    area: "schema",
    description: "Top-level input property names match each client's rules",
    appliesTo: hasTools,
    run: (s, { profiles }) =>
      profiles.flatMap((p) => {
        const rule = p.limits.inputPropertyNamePattern;
        if (!rule) return [];
        const pattern = new RegExp(rule.value);
        return schemas(s, "inputSchema").flatMap(([t, schema]): Finding[] => {
          const names = isObject(schema.properties) ? Object.keys(schema.properties) : [];
          const bad = names.filter((n) => !pattern.test(n));
          if (bad.length === 0) return [];
          return [
            {
              checkId: "SCHEMA_PROPERTY_NAME_REJECTED",
              severity: "warn",
              subject: toolName(t),
              client: p.id,
              source: rule.source,
              message: withNote(
                `Property name(s) ${bad.map((b) => JSON.stringify(b)).join(", ")} don't match /${rule.value}/, so ${p.displayName} may drop this tool.`,
                rule.note
              ),
              fix: "Rename arguments to 1-64 characters of letters, digits, _, - and .",
            },
          ];
        });
      }),
  }),

  defineCheck({
    id: "SCHEMA_EMPTY_ENUM",
    area: "schema",
    description: "enum lists have at least one value",
    appliesTo: hasTools,
    run: (s) =>
      schemas(s, "inputSchema").flatMap(([t, schema]): Finding[] => {
        const empty = enumPaths(schema).filter(([, values]) => values.length === 0).map(([path]) => path);
        if (empty.length === 0) return [];
        return [
          {
            checkId: "SCHEMA_EMPTY_ENUM",
            severity: "warn",
            subject: toolName(t),
            message: `Empty enum at ${empty.join(", ")}: no value can satisfy it, so the tool can never be called correctly.`,
            fix: "List the allowed values, or remove enum.",
          },
        ];
      }),
  }),

  defineCheck({
    id: "SCHEMA_ROOT_COMBINATOR_CLIENT",
    area: "schema",
    description: "Root-level oneOf/anyOf/allOf is shaped the way each client can handle",
    appliesTo: hasTools,
    run: (s, { profiles }) =>
      profiles.flatMap((p) => {
        const rule = p.limits.rootCombinatorNonObject;
        if (!rule) return [];
        const bad = schemas(s, "inputSchema").filter(([, schema]) => rootCombinatorBreaks(schema));
        if (bad.length === 0) return [];
        return [
          {
            checkId: "SCHEMA_ROOT_COMBINATOR_CLIENT",
            severity: "error",
            subject: bad.map(([t]) => toolName(t)).join(", "),
            client: p.id,
            source: rule.source,
            message: `${bad.length} tool(s) have no root type and a root-level oneOf/anyOf with a branch that isn't type: "object" (or an allOf without one); ${p.displayName} fails to register them and drops every tool from this server.`,
            fix: 'Add "type": "object" at the root (MCP requires it anyway), or make every branch type: "object".',
          },
        ];
      }),
  }),

  defineCheck({
    id: "SCHEMA_TYPE_ARRAY_CLIENT",
    area: "schema",
    description: 'Type arrays (e.g. ["string","null"]) avoided for clients that fail on them',
    appliesTo: hasTools,
    run: (s, { profiles }) =>
      profiles.flatMap((p) => {
        const rule = p.limits.typeArraysRejected;
        if (!rule?.value) return [];
        const bad = schemas(s, "inputSchema").filter(([, schema]) => analyze(schema).typeArrays.length > 0);
        if (bad.length === 0) return [];
        return [
          {
            checkId: "SCHEMA_TYPE_ARRAY_CLIENT",
            severity: "warn",
            subject: bad.map(([t]) => toolName(t)).join(", "),
            client: p.id,
            source: rule.source,
            message: withNote(`${bad.length} tool(s) use type arrays such as ["string","null"], which ${p.displayName}'s argument validation rejects.`, rule.note),
            fix: "Make the property optional instead of nullable, or use a single type.",
          },
        ];
      }),
  }),

  defineCheck({
    id: "SCHEMA_KEYWORDS_DROPPED",
    area: "schema",
    description: "Notes schema constraints a client removes before the model sees them",
    appliesTo: hasTools,
    run: (s, { profiles }) =>
      profiles.flatMap((p) => {
        const rule = p.limits.schemaDroppedKeywords;
        if (!rule) return [];
        const used = new Set(schemas(s, "inputSchema").flatMap(([, schema]) => [...analyze(schema).keywords]));
        const dropped = rule.value.filter((k) => used.has(k));
        if (dropped.length === 0) return [];
        return [
          {
            checkId: "SCHEMA_KEYWORDS_DROPPED",
            severity: "info",
            client: p.id,
            source: rule.source,
            message: `${p.displayName} silently removes ${dropped.join(", ")} from schemas, so the model never sees those constraints.`,
            fix: "Validate arguments on the server and state important constraints in descriptions.",
          },
        ];
      }),
  }),

  defineCheck({
    id: "SCHEMA_TOO_LARGE",
    area: "schema",
    description: "inputSchema fits each client's size limit",
    appliesTo: hasTools,
    run: (s, { profiles }) =>
      profiles.flatMap((p) => {
        const limit = p.limits.maxSchemaChars;
        if (!limit) return [];
        return schemas(s, "inputSchema")
          .map(([t, schema]): [string, number] => [toolName(t), JSON.stringify(schema).length])
          .filter(([, size]) => size > limit.value)
          .map(
            ([name, size]): Finding => ({
              checkId: "SCHEMA_TOO_LARGE",
              severity: "warn",
              subject: name,
              client: p.id,
              source: limit.source,
              message: withNote(`inputSchema is about ${size} characters; ${p.displayName} compacts schemas over ${limit.value}.`, limit.note),
              fix: "Trim long descriptions and nested definitions, or split the tool.",
            })
          );
      }),
  }),

  defineCheck({
    id: "SCHEMA_PROPERTY_NO_TYPE",
    area: "schema",
    description: "Every input property declares a type",
    appliesTo: hasTools,
    run: (s) =>
      schemas(s, "inputSchema").flatMap(([t, schema]): Finding[] => {
        const { untypedProperties } = analyze(schema);
        if (untypedProperties.length === 0) return [];
        return [
          {
            checkId: "SCHEMA_PROPERTY_NO_TYPE",
            severity: "info",
            subject: toolName(t),
            message: `Properties without a type: ${untypedProperties.slice(0, 5).join(", ")}${untypedProperties.length > 5 ? ", …" : ""}.`,
            fix: "Give every property a type so the model sends the right kind of value.",
          },
        ];
      }),
  }),

  defineCheck({
    id: "SCHEMA_TOO_DEEP",
    area: "schema",
    description: `inputSchema nests at most ${MAX_DEPTH} levels`,
    appliesTo: hasTools,
    run: (s) =>
      schemas(s, "inputSchema").flatMap(([t, schema]): Finding[] => {
        const { depth } = analyze(schema);
        if (depth <= MAX_DEPTH) return [];
        return [
          {
            checkId: "SCHEMA_TOO_DEEP",
            severity: "info",
            subject: toolName(t),
            message: `inputSchema nests ${depth} levels deep; models fill deeply nested arguments unreliably.`,
            fix: "Flatten the arguments where you can.",
          },
        ];
      }),
  }),
];
