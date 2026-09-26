import type { RawItem, ServerSnapshot } from "../snapshot.js";
import { connected, itemLabel, items, str } from "./util.js";
import { defineCheck, type Finding } from "./types.js";

const hasResources = (s: ServerSnapshot) => connected(s) && items(s, "resources").length > 0;
const hasTemplates = (s: ServerSnapshot) => connected(s) && items(s, "resourceTemplates").length > 0;

function parsesAsUri(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

const VARSPEC = /^(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})(?:\.?(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2}))*(?::[1-9][0-9]{0,3}|\*)?$/;

/**
 * RFC 6570 syntax check. Returns undefined when valid, otherwise the problem.
 * `fatal` marks errors the TypeScript SDK's own parser throws on.
 */
export function uriTemplateProblem(template: string): { problem: string; fatal: boolean } | undefined {
  let depth = 0;
  for (const ch of template) {
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth > 1) return { problem: "nested '{'", fatal: false };
    if (depth < 0) return { problem: "unmatched '}'", fatal: false };
  }
  if (depth !== 0) return { problem: "unclosed '{' expression", fatal: true };

  for (const [, body] of template.matchAll(/\{([^}]*)\}/g)) {
    const op = /^[+#./;?&]/.test(body) ? body[0] : "";
    const vars = body.slice(op.length);
    if (/^[=,!@|]/.test(vars)) return { problem: `reserved operator in {${body}}`, fatal: false };
    if (vars === "") return { problem: "empty expression {}", fatal: false };
    for (const v of vars.split(",")) {
      if (!VARSPEC.test(v)) return { problem: `invalid variable ${JSON.stringify(v)} in {${body}}`, fatal: false };
    }
  }
  return undefined;
}

export const resourceChecks = [
  defineCheck({
    id: "RESOURCE_URI_INVALID",
    area: "resources",
    description: "Resource URIs are absolute and parse",
    appliesTo: hasResources,
    run: (s) =>
      items(s, "resources")
        .filter((r) => typeof r.uri !== "string" || !parsesAsUri(r.uri))
        .map((r) => ({
          checkId: "RESOURCE_URI_INVALID",
          severity: "error" as const,
          subject: itemLabel(r),
          message:
            typeof r.uri !== "string"
              ? "Resource has no string uri."
              : `${JSON.stringify(r.uri)} is not an absolute URI; clients can't read it back.`,
          fix: "Use a scheme, e.g. file:///path or myapp://items/1.",
        })),
  }),

  defineCheck({
    id: "RESOURCE_URI_DUPLICATE",
    area: "resources",
    description: "Resource URIs are unique",
    appliesTo: hasResources,
    run: (s) => {
      const counts = new Map<string, number>();
      for (const r of items(s, "resources")) {
        if (typeof r.uri === "string") counts.set(r.uri, (counts.get(r.uri) ?? 0) + 1);
      }
      return [...counts]
        .filter(([, n]) => n > 1)
        .map(([uri, n]) => ({
          checkId: "RESOURCE_URI_DUPLICATE",
          severity: "error" as const,
          subject: uri,
          message: `${n} resources share the URI ${uri}.`,
          fix: "Give every resource a unique URI.",
        }));
    },
  }),

  defineCheck({
    id: "RESOURCE_NAME_MISSING",
    area: "resources",
    description: "Resources and templates have a name (required by the spec)",
    appliesTo: (s) => hasResources(s) || hasTemplates(s),
    run: (s) =>
      [...items(s, "resources"), ...items(s, "resourceTemplates")]
        .filter((r: RawItem) => !str(r.name))
        .map((r) => ({
          checkId: "RESOURCE_NAME_MISSING",
          severity: "error" as const,
          subject: itemLabel(r),
          message: "Resource has no name; the spec requires one and the TypeScript SDK rejects the list.",
          fix: "Add a short name to every resource and template.",
        })),
  }),

  defineCheck({
    id: "RESOURCE_MIME_MISSING",
    area: "resources",
    description: "Resources declare a mimeType",
    appliesTo: hasResources,
    run: (s) => {
      const missing = items(s, "resources").filter((r) => !str(r.mimeType));
      if (missing.length === 0) return [];
      return [
        {
          checkId: "RESOURCE_MIME_MISSING",
          severity: "info",
          message: `${missing.length} resource(s) have no mimeType, so clients must guess how to display them.`,
          evidence: { resources: missing.slice(0, 10).map((r) => itemLabel(r)) },
          fix: "Set mimeType (e.g. text/markdown, application/json).",
        },
      ];
    },
  }),

  defineCheck({
    id: "RESOURCE_TEMPLATE_INVALID",
    area: "resources",
    description: "Resource templates are valid RFC 6570 URI templates",
    appliesTo: hasTemplates,
    run: (s) =>
      items(s, "resourceTemplates").flatMap((t): Finding[] => {
        const template = str(t.uriTemplate);
        const problem = template === undefined ? { problem: "missing uriTemplate", fatal: true } : uriTemplateProblem(template);
        if (!problem) return [];
        return [
          {
            checkId: "RESOURCE_TEMPLATE_INVALID",
            severity: problem.fatal ? "error" : "warn",
            subject: itemLabel(t),
            message: `uriTemplate ${JSON.stringify(template ?? null)}: ${problem.problem}.`,
            fix: "Use RFC 6570 syntax, e.g. users://{id}/profile.",
          },
        ];
      }),
  }),
];
