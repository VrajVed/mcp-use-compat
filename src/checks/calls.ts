import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { Ajv } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { CallProbe, ServerSnapshot } from "../snapshot.js";
import { isObject, items } from "./util.js";
import { defineCheck, type Finding } from "./types.js";

const ajv2020 = new Ajv2020({ strict: false, allErrors: false, logger: false });
const ajv07 = new Ajv({ strict: false, allErrors: false, logger: false });

const answered = (s: ServerSnapshot) => (s.calls ?? []).filter((c) => c.result);
const hasCalls = (s: ServerSnapshot) => (s.calls?.length ?? 0) > 0;
const isToolError = (c: CallProbe) => c.result?.isError === true;

function outputSchemaFor(s: ServerSnapshot, tool: string): Record<string, unknown> | undefined {
  const t = items(s, "tools").find((t) => t.name === tool);
  return t && isObject(t.outputSchema) ? t.outputSchema : undefined;
}

/** Validates structuredContent against outputSchema; undefined if the schema can't be compiled. */
export function validateStructured(schema: Record<string, unknown>, value: unknown): string[] | undefined {
  const validator = /draft-0[67]/.test(String(schema.$schema ?? "")) ? ajv07 : ajv2020;
  let validate;
  try {
    validate = validator.compile(schema);
  } catch {
    return undefined;
  }
  if (validate(value)) return [];
  return (validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? "is invalid"}`);
}

const call = (c: CallProbe) => `${c.tool}(${JSON.stringify(c.args)})`;

export const callChecks = [
  defineCheck({
    id: "CALL_RESULT_INVALID",
    area: "calls",
    description: "tools/call results match the MCP result schema",
    appliesTo: hasCalls,
    run: (s) =>
      answered(s).flatMap((c): Finding[] => {
        const parsed = CallToolResultSchema.safeParse(c.result);
        if (parsed.success) return [];
        const issue = parsed.error.issues[0];
        return [
          {
            checkId: "CALL_RESULT_INVALID",
            severity: "error",
            subject: c.tool,
            message: `Result of ${call(c)} is not a valid CallToolResult (${issue?.path.join(".") || "result"}: ${issue?.message}); SDK-based clients throw instead of showing it.`,
            evidence: { issues: parsed.error.issues.slice(0, 5) },
            fix: 'Return { content: [{ type: "text", text: "..." }] } (plus structuredContent/isError as needed).',
          },
        ];
      }),
  }),

  defineCheck({
    id: "CALL_OUTPUT_SCHEMA_MISMATCH",
    area: "calls",
    description: "Tools with an outputSchema return matching structuredContent",
    appliesTo: (s) => answered(s).some((c) => outputSchemaFor(s, c.tool)),
    run: (s) =>
      answered(s).flatMap((c): Finding[] => {
        const schema = outputSchemaFor(s, c.tool);
        if (!schema || isToolError(c)) return [];
        if (!("structuredContent" in c.result!)) {
          return [
            {
              checkId: "CALL_OUTPUT_SCHEMA_MISMATCH",
              severity: "error",
              subject: c.tool,
              message: `${c.tool} declares an outputSchema but ${call(c)} returned no structuredContent; the spec requires it, and SDK clients reject the result.`,
              fix: "Return structuredContent matching outputSchema (and keep a text copy for older clients).",
            },
          ];
        }
        const errors = validateStructured(schema, c.result!.structuredContent);
        if (!errors?.length) return [];
        return [
          {
            checkId: "CALL_OUTPUT_SCHEMA_MISMATCH",
            severity: "error",
            subject: c.tool,
            message: `structuredContent from ${call(c)} doesn't match outputSchema: ${errors.slice(0, 3).join("; ")}. SDK clients reject such results.`,
            evidence: { errors },
            fix: "Make the returned data match outputSchema, or update the schema.",
          },
        ];
      }),
  }),

  defineCheck({
    id: "CALL_STRUCTURED_WITHOUT_TEXT",
    area: "calls",
    description: "Structured results also carry a text copy",
    appliesTo: (s) => answered(s).some((c) => c.result && "structuredContent" in c.result),
    run: (s) =>
      answered(s).flatMap((c): Finding[] => {
        const content = Array.isArray(c.result!.content) ? c.result!.content : [];
        if (!("structuredContent" in c.result!) || content.some((i) => isObject(i) && i.type === "text")) return [];
        return [
          {
            checkId: "CALL_STRUCTURED_WITHOUT_TEXT",
            severity: "warn",
            subject: c.tool,
            message: `${call(c)} returned structuredContent with no text content. The spec says tools SHOULD also return the JSON as text for clients that don't read structuredContent.`,
            affects: ["structuredContent"],
            fix: "Add { type: \"text\", text: JSON.stringify(structuredContent) } to content.",
          },
        ];
      }),
  }),

  defineCheck({
    id: "CALL_FAILED",
    area: "calls",
    description: "Reports tool calls that errored",
    appliesTo: hasCalls,
    run: (s) =>
      (s.calls ?? [])
        .filter((c) => c.error || isToolError(c))
        .map((c): Finding => {
          const text = Array.isArray(c.result?.content)
            ? c.result!.content.map((i) => (isObject(i) && typeof i.text === "string" ? i.text : "")).join(" ").slice(0, 200)
            : "";
          return {
            checkId: "CALL_FAILED",
            severity: "info",
            subject: c.tool,
            message: c.error
              ? `${call(c)} failed with a protocol error${c.error.code !== undefined ? ` ${c.error.code}` : ""}: ${c.error.message}${c.origin === "probe" ? " (arguments were generated from the schema, so this may be expected)" : ""}.`
              : `${call(c)} returned isError: ${text}`,
          };
        }),
  }),
];
