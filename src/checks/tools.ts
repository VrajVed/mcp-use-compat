import type { RawItem, ServerSnapshot } from "../snapshot.js";
import { connected, declared, isObject, items, str } from "./util.js";
import { defineCheck, type Finding } from "./types.js";

/** Tool name format from the MCP spec (SEP-986), as enforced by the SDK. */
export const SPEC_TOOL_NAME = /^[A-Za-z0-9._-]{1,128}$/;
const SHORT_DESCRIPTION = 20;
const LONG_DESCRIPTION = 1024;

const hasTools = (s: ServerSnapshot) => connected(s) && items(s, "tools").length > 0;
const toolName = (t: RawItem) => str(t.name) ?? "(unnamed)";

export const toolChecks = [
  defineCheck({
    id: "TOOL_NONE",
    area: "tools",
    description: "A server declaring tools exposes at least one",
    appliesTo: (s) => connected(s) && declared(s, "tools") && !!s.lists.tools?.ok,
    run: (s) =>
      items(s, "tools").length > 0
        ? []
        : [
            {
              checkId: "TOOL_NONE",
              severity: "warn",
              message: 'Server declares the "tools" capability but tools/list is empty.',
              fix: "Register tools before connecting the transport, or drop the capability.",
            },
          ],
  }),

  defineCheck({
    id: "TOOL_NAME_INVALID",
    area: "tools",
    description: "Tool names match the MCP spec format (A-Z a-z 0-9 _ - ., 1-128 chars)",
    appliesTo: hasTools,
    run: (s) =>
      items(s, "tools")
        .filter((t) => typeof t.name !== "string" || !SPEC_TOOL_NAME.test(t.name))
        .map((t) => ({
          checkId: "TOOL_NAME_INVALID",
          severity: "error" as const,
          subject: toolName(t),
          message:
            typeof t.name !== "string"
              ? "Tool has no string name."
              : `Tool name ${JSON.stringify(t.name)} is not a valid MCP tool name.`,
          fix: "Use only letters, digits, underscore, dash and dot (max 128 characters).",
        })),
  }),

  defineCheck({
    id: "TOOL_NAME_DUPLICATE",
    area: "tools",
    description: "Tool names are unique",
    appliesTo: hasTools,
    run: (s) => {
      const counts = new Map<string, number>();
      for (const t of items(s, "tools")) {
        if (typeof t.name === "string") counts.set(t.name, (counts.get(t.name) ?? 0) + 1);
      }
      return [...counts]
        .filter(([, n]) => n > 1)
        .map(([name, n]) => ({
          checkId: "TOOL_NAME_DUPLICATE",
          severity: "error" as const,
          subject: name,
          message: `${n} tools are named ${JSON.stringify(name)}; clients keep only one or reject the list.`,
          fix: "Give every tool a unique name.",
        }));
    },
  }),

  defineCheck({
    id: "TOOL_NAME_REJECTED_BY_CLIENT",
    area: "tools",
    description: "Tool names match each client's stricter naming rules",
    appliesTo: hasTools,
    run: (s, { profiles }) =>
      profiles.flatMap((p) => {
        const rule = p.limits.toolNamePattern;
        if (!rule) return [];
        const pattern = new RegExp(rule.value);
        return items(s, "tools")
          .filter((t) => typeof t.name === "string" && !pattern.test(t.name))
          .map(
            (t): Finding => ({
              checkId: "TOOL_NAME_REJECTED_BY_CLIENT",
              severity: "error",
              subject: toolName(t),
              client: p.id,
              source: rule.source,
              message: `${p.displayName} requires tool names to match /${rule.value}/.`,
              fix: "Rename the tool using only letters, digits, underscores and dashes.",
            })
          );
      }),
  }),

  defineCheck({
    id: "TOOL_NAME_TOO_LONG",
    area: "tools",
    description: "Prefixed tool names fit each client's length limit",
    appliesTo: hasTools,
    run: (s, { profiles }) => {
      const serverName = str(s.initialize?.serverInfo?.name) ?? "server";
      return profiles.flatMap((p) => {
        const limit = p.limits.maxToolNameLength;
        if (!limit) return [];
        const prefix = (p.limits.toolNamePrefix?.value ?? "").replace("{server}", serverName);
        return items(s, "tools")
          .filter((t) => typeof t.name === "string" && prefix.length + t.name.length > limit.value)
          .map(
            (t): Finding => ({
              checkId: "TOOL_NAME_TOO_LONG",
              severity: "warn",
              subject: toolName(t),
              client: p.id,
              source: limit.source,
              message: `"${prefix}${t.name as string}" is ${prefix.length + (t.name as string).length} characters; ${p.displayName} allows ${limit.value}${prefix ? ` including its "${p.limits.toolNamePrefix!.value}" prefix (assuming the server is registered as "${serverName}")` : ""}.`,
              fix: "Shorten the tool name (and recommend a short server name in your install docs).",
            })
          );
      });
    },
  }),

  defineCheck({
    id: "TOOL_COUNT_OVER_LIMIT",
    area: "tools",
    description: "Tool count fits each client's limit",
    appliesTo: hasTools,
    run: (s, { profiles }) => {
      const count = items(s, "tools").length;
      return profiles.flatMap((p): Finding[] => {
        const limit = p.limits.maxTools;
        if (!limit || count <= limit.value) return [];
        return [
          {
            checkId: "TOOL_COUNT_OVER_LIMIT",
            severity: "warn",
            client: p.id,
            source: limit.source,
            message: `Server exposes ${count} tools; ${p.displayName} uses at most ${limit.value}${limit.note ? ` (${limit.note})` : ""}.`,
            fix: "Consolidate tools, or split the server so users can enable only what they need.",
          },
        ];
      });
    },
  }),

  defineCheck({
    id: "TOOL_DESCRIPTION_MISSING",
    area: "tools",
    description: "Every tool has a non-empty description",
    appliesTo: hasTools,
    run: (s) =>
      items(s, "tools")
        .filter((t) => typeof t.description !== "string" || t.description.trim() === "")
        .map((t) => ({
          checkId: "TOOL_DESCRIPTION_MISSING",
          severity: "error" as const,
          subject: toolName(t),
          message:
            t.description === null
              ? "description is null. The spec allows omitting it, not null; the TypeScript SDK's result schema rejects the whole tools/list response, so SDK-based clients see no tools at all."
              : "Tool has no description, so the model has to guess when to use it.",
          evidence: { description: t.description ?? "(absent)" },
          fix: "Describe what the tool does and when to use it.",
        })),
  }),

  defineCheck({
    id: "TOOL_DESCRIPTION_SHORT",
    area: "tools",
    description: `Tool descriptions are at least ${SHORT_DESCRIPTION} characters`,
    appliesTo: hasTools,
    run: (s) =>
      items(s, "tools")
        .filter((t) => typeof t.description === "string" && t.description.trim() !== "")
        .filter((t) => (t.description as string).trim().length < SHORT_DESCRIPTION)
        .map((t) => ({
          checkId: "TOOL_DESCRIPTION_SHORT",
          severity: "info" as const,
          subject: toolName(t),
          message: `Description ${JSON.stringify(t.description)} is very short; models pick tools from descriptions.`,
          fix: "Say what the tool does, what it returns, and when to prefer it over similar tools.",
        })),
  }),

  defineCheck({
    id: "TOOL_DESCRIPTION_LONG",
    area: "tools",
    description: `Tool descriptions are under ${LONG_DESCRIPTION} characters`,
    appliesTo: hasTools,
    run: (s) =>
      items(s, "tools")
        .filter((t) => typeof t.description === "string" && t.description.length > LONG_DESCRIPTION)
        .map((t) => ({
          checkId: "TOOL_DESCRIPTION_LONG",
          severity: "info" as const,
          subject: toolName(t),
          message: `Description is ${(t.description as string).length} characters; it is sent with every request and some clients truncate long descriptions.`,
          fix: "Move reference material into a resource or the tool result.",
        })),
  }),

  defineCheck({
    id: "TOOL_ANNOTATIONS_CONFLICT",
    area: "tools",
    description: "Tool annotations are consistent",
    appliesTo: hasTools,
    run: (s) =>
      items(s, "tools")
        .filter((t) => isObject(t.annotations))
        .filter((t) => {
          const a = t.annotations as Record<string, unknown>;
          return a.readOnlyHint === true && (a.destructiveHint === true || a.idempotentHint === false);
        })
        .map((t) => ({
          checkId: "TOOL_ANNOTATIONS_CONFLICT",
          severity: "warn" as const,
          subject: toolName(t),
          message: "readOnlyHint is true but destructiveHint/idempotentHint describe a writing tool; clients may skip confirmation prompts.",
          evidence: { annotations: t.annotations },
          fix: "Set readOnlyHint: false for tools that modify anything.",
        })),
  }),
];
