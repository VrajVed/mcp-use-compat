import type { ClientProfile } from "../profiles/types.js";
import type { RawItem, ServerSnapshot } from "../snapshot.js";
import { connected, declared, isObject, items, str, withNote } from "./util.js";
import { defineCheck, type Finding } from "./types.js";

/** Tool name format from the MCP spec (SEP-986), as enforced by the SDK. */
export const SPEC_TOOL_NAME = /^[A-Za-z0-9._-]{1,128}$/;
const SHORT_DESCRIPTION = 20;

const hasTools = (s: ServerSnapshot) => connected(s) && items(s, "tools").length > 0;
const toolName = (t: RawItem) => str(t.name) ?? "(unnamed)";
const toolNames = (s: ServerSnapshot) => items(s, "tools").flatMap((t) => (typeof t.name === "string" ? [t.name] : []));
const serverName = (s: ServerSnapshot) => str(s.initialize?.serverInfo?.name) ?? "server";

const READ_VERBS = new Set(
  "get list search find read fetch query describe show lookup count check view browse retrieve inspect preview download export".split(" ")
);
const WRITE_VERBS = new Set(
  "create add update edit delete remove place cancel modify send post write set move rename execute run deploy transfer buy sell pay charge drop insert upsert archive publish submit approve reject revoke grant invite kill stop start restart reset clear purge destroy close open merge push".split(" ")
);

/** The first word of a tool name, lowercased: get_user → get, createEvent → create, files.read → files. */
export function leadingVerb(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").split(/[_\-.\s]+/)[0]?.toLowerCase() ?? "";
}

/** "read" / "write" from the tool name's leading verb, or undefined if it doesn't say. */
export function nameIntent(name: string): "read" | "write" | undefined {
  const verb = leadingVerb(name);
  return READ_VERBS.has(verb) ? "read" : WRITE_VERBS.has(verb) ? "write" : undefined;
}

const annotations = (t: RawItem): Record<string, unknown> => (isObject(t.annotations) ? t.annotations : {});

/** Replaces characters outside the allowed class with "_". */
export function sanitize(name: string, allowed: string): string {
  return name.replace(new RegExp(`[^${allowed}]`, "g"), "_");
}

/** The prefix a client puts in front of this server's tool names ("" if none/unknown). */
export function clientPrefix(s: ServerSnapshot, p: ClientProfile): string {
  const rule = p.limits.toolNamePrefix?.value;
  if (!rule) return "";
  let server = serverName(s);
  if (rule.lowercase) server = server.toLowerCase();
  const allowed = p.limits.toolNameChars?.value;
  if (allowed?.onInvalid === "replace") server = sanitize(server, allowed.allowed);
  const prefix = rule.format.replace("{server}", server);
  return rule.maxLength ? prefix.slice(0, rule.maxLength) : prefix;
}

/** The name the client ends up using, applying only documented replace/truncate behaviour. */
export function clientToolName(s: ServerSnapshot, p: ClientProfile, name: string): string {
  const chars = p.limits.toolNameChars?.value;
  let result = clientPrefix(s, p) + (chars?.onInvalid === "replace" ? sanitize(name, chars.allowed) : name);
  const length = p.limits.maxToolNameLength?.value;
  if (length && result.length > length.max) {
    if (length.onExceed === "truncate") result = result.slice(0, length.max);
    if (length.onExceed === "truncateMiddle") result = truncateMiddle(result, length.max);
  }
  return result;
}

/** Start and end joined by "..." (Gemini CLI's scheme: 30 + "..." + 30 for a 63 limit). */
export function truncateMiddle(name: string, max: number): string {
  if (name.length <= max) return name;
  const keep = Math.floor((max - 3) / 2);
  return `${name.slice(0, keep)}...${name.slice(name.length - keep)}`;
}

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
    id: "TOOL_NAME_CLIENT_CHARS",
    area: "tools",
    description: "Tool names use only characters each client accepts as-is",
    appliesTo: hasTools,
    run: (s, { profiles }) =>
      profiles.flatMap((p) => {
        const rule = p.limits.toolNameChars;
        if (!rule) return [];
        return toolNames(s)
          .filter((name) => sanitize(name, rule.value.allowed) !== name)
          .map((name): Finding => {
            const { onInvalid } = rule.value;
            const renamed = sanitize(name, rule.value.allowed);
            return {
              checkId: "TOOL_NAME_CLIENT_CHARS",
              severity: onInvalid === "reject" ? "error" : "warn",
              subject: name,
              client: p.id,
              source: rule.source,
              message:
                onInvalid === "reject"
                  ? `${p.displayName} rejects tool names with characters outside [${rule.value.allowed}].`
                  : onInvalid === "replace"
                    ? `${p.displayName} renames it to "${renamed}" (only [${rule.value.allowed}] allowed).`
                    : onInvalid === "replaceUnique"
                      ? `${p.displayName} renames it to "${renamed}" (only [${rule.value.allowed}] allowed; clashing names get a hash suffix).`
                    : onInvalid === "truncateWithHash"
                      ? `${p.displayName} renames it to "${renamed}" plus a hash suffix (only [${rule.value.allowed}] allowed), so the model sees a mangled name.`
                      : withNote(`${p.displayName} only accepts [${rule.value.allowed}].`, rule.note),
              fix: "Use only letters, digits, underscores and dashes in tool names.",
            };
          });
      }),
  }),

  defineCheck({
    id: "TOOL_NAME_TOO_LONG",
    area: "tools",
    description: "Prefixed tool names fit each client's length limit",
    appliesTo: hasTools,
    run: (s, { profiles }) =>
      profiles.flatMap((p) => {
        const limit = p.limits.maxToolNameLength;
        if (!limit) return [];
        const prefix = clientPrefix(s, p);
        const { max, onExceed } = limit.value;
        return toolNames(s)
          .filter((name) => prefix.length + name.length > max)
          .map((name): Finding => {
            const full = prefix + name;
            const what =
              onExceed === "reject"
                ? "rejects it"
                : onExceed === "truncate"
                  ? `truncates it to "${full.slice(0, max)}"`
                  : onExceed === "truncateWithHash"
                    ? "truncates it and appends a hash, so the model sees a mangled name"
                    : onExceed === "truncateMiddle"
                      ? `shortens it to "${truncateMiddle(full, max)}"`
                      : "may reject or rewrite it";
            return {
              checkId: "TOOL_NAME_TOO_LONG",
              severity: onExceed === "reject" ? "error" : "warn",
              subject: name,
              client: p.id,
              source: limit.source,
              message: prefix
                ? `With ${p.displayName}'s server prefix ("${prefix}", assuming the server is registered as "${serverName(s)}") the name is ${full.length} characters; the limit is ${max} and ${p.displayName} ${what}.`
                : `The name is ${full.length} characters; ${p.displayName} allows ${max} and ${what}.`,
              fix: "Shorten the tool name, and suggest a short server name in your install instructions.",
            };
          });
      }),
  }),

  defineCheck({
    id: "TOOL_NAME_CLIENT_COLLISION",
    area: "tools",
    description: "Tool names stay unique after a client renames or truncates them",
    appliesTo: hasTools,
    run: (s, { profiles }) =>
      profiles.flatMap((p) => {
        const byClientName = new Map<string, string[]>();
        for (const name of new Set(toolNames(s))) {
          const sent = clientToolName(s, p, name);
          byClientName.set(sent, [...(byClientName.get(sent) ?? []), name]);
        }
        const chars = p.limits.toolNameChars;
        return [...byClientName]
          .filter(([, names]) => names.length > 1)
          .map(([sent, names]): Finding => {
            // Blame character replacement when it alone makes the names equal.
            const renamed = chars?.value.onInvalid === "replace" ? names.map((n) => sanitize(n, chars.value.allowed)) : names;
            const byReplacement = new Set(renamed).size === 1;
            const quoted = names.map((n) => `"${n}"`);
            const list = quoted.length === 2 ? quoted.join(" and ") : quoted.join(", ");
            return {
              checkId: "TOOL_NAME_CLIENT_COLLISION",
              severity: "error",
              subject: names.join(", "),
              client: p.id,
              source: (byReplacement ? chars : p.limits.maxToolNameLength)?.source,
              message: byReplacement
                ? `${list} ${names.length === 2 ? "both" : "all"} become "${renamed[0]}" in ${p.displayName}, so only one of them is usable.`
                : `${list} are truncated to the same name "${sent}" in ${p.displayName}, so only one of them is usable.`,
              fix: byReplacement
                ? "Use only letters, digits, _ and - in tool names."
                : "Make tool names differ within their first characters.",
            };
          });
      }),
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
            message: withNote(`Server exposes ${count} tools; ${p.displayName} uses at most ${limit.value}.`, limit.note),
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
    id: "TOOL_DESCRIPTION_TRUNCATED",
    area: "tools",
    description: "Tool descriptions and server instructions fit each client's length limit",
    appliesTo: connected,
    run: (s, { profiles }) =>
      profiles.flatMap((p) => {
        const limit = p.limits.maxDescriptionLength;
        if (!limit) return [];
        const texts: Array<[string, string]> = items(s, "tools")
          .filter((t) => typeof t.description === "string")
          .map((t) => [toolName(t), t.description as string]);
        if (s.initialize?.instructions) texts.push(["(server instructions)", s.initialize.instructions]);
        return texts
          .filter(([, text]) => text.length > limit.value)
          .map(
            ([subject, text]): Finding => ({
              checkId: "TOOL_DESCRIPTION_TRUNCATED",
              severity: "warn",
              subject,
              client: p.id,
              source: limit.source,
              message: `${text.length} characters; ${p.displayName} truncates after ${limit.value}, so the end is never seen by the model.`,
              fix: "Put the most important guidance first and move reference material into a resource or the tool result.",
            })
          );
      }),
  }),

  defineCheck({
    id: "TOOL_STRUCTURED_OUTPUT_HANDLING",
    area: "tools",
    description: "Notes how each client passes structured tool output to the model",
    appliesTo: (s) => connected(s) && items(s, "tools").some((t) => isObject(t.outputSchema)),
    run: (s, { profiles }) => {
      const tools = items(s, "tools").filter((t) => isObject(t.outputSchema)).map(toolName);
      return profiles.flatMap((p): Finding[] => {
        const rule = p.limits.structuredContent;
        if (!rule || rule.value === "alongsideText") return [];
        return [
          {
            checkId: "TOOL_STRUCTURED_OUTPUT_HANDLING",
            severity: "info",
            subject: tools.join(", "),
            client: p.id,
            source: rule.source,
            message:
              rule.value === "replacesText"
                ? `${p.displayName} sends the model JSON of structuredContent instead of the text content, so anything only in the text is lost.`
                : rule.value === "textOnly"
                  ? `${p.displayName} only ever sends the model the text content; structuredContent never reaches it.`
                  : `${p.displayName} sends the model only the text content (structuredContent is used only when content is empty).`,
            fix:
              rule.value === "replacesText"
                ? "Put everything the model needs into structuredContent."
                : "Keep the text content complete; don't rely on structuredContent alone.",
          },
        ];
      });
    },
  }),

  defineCheck({
    id: "TOOL_ANNOTATIONS_CONFLICT",
    area: "tools",
    description: "Tool annotations are consistent with each other and with the tool's name",
    appliesTo: hasTools,
    run: (s) =>
      items(s, "tools").flatMap((t): Finding[] => {
        const a = annotations(t);
        if (a.readOnlyHint !== true) return [];
        if (a.destructiveHint === true || a.idempotentHint === false) {
          return [
            {
              checkId: "TOOL_ANNOTATIONS_CONFLICT",
              severity: "warn",
              subject: toolName(t),
              message: "readOnlyHint is true but destructiveHint/idempotentHint describe a writing tool; clients may skip confirmation prompts.",
              evidence: { annotations: t.annotations },
              fix: "Set readOnlyHint: false for tools that modify anything.",
            },
          ];
        }
        if (typeof t.name === "string" && nameIntent(t.name) === "write") {
          return [
            {
              checkId: "TOOL_ANNOTATIONS_CONFLICT",
              severity: "warn",
              subject: t.name,
              message: `"${t.name}" sounds like it changes something ("${leadingVerb(t.name)}") but declares readOnlyHint: true, so clients may run it without asking.`,
              evidence: { annotations: t.annotations },
              fix: "If the tool modifies state, set readOnlyHint: false (and destructiveHint as appropriate).",
            },
          ];
        }
        return [];
      }),
  }),

  defineCheck({
    id: "TOOL_TITLE_MISSING",
    area: "tools",
    description: "Tools have a human-readable title",
    appliesTo: hasTools,
    run: (s) => {
      const untitled = items(s, "tools").filter((t) => !str(t.title) && !str(annotations(t).title));
      if (untitled.length === 0) return [];
      return [
        {
          checkId: "TOOL_TITLE_MISSING",
          severity: "info",
          subject: untitled.map(toolName).slice(0, 10).join(", ") + (untitled.length > 10 ? ", …" : ""),
          message: `${untitled.length} tool(s) have no title, so clients such as VS Code show the raw name; Anthropic's connector directory requires a title on every tool.`,
          evidence: { tools: untitled.map(toolName) },
          fix: 'Add title: "Get weather" (or annotations.title) to each tool.',
        },
      ];
    },
  }),

  defineCheck({
    id: "TOOL_ANNOTATIONS_MISSING",
    area: "tools",
    description: "Read-only tools declare readOnlyHint",
    appliesTo: hasTools,
    run: (s, { profiles }) => {
      const tools = items(s, "tools");
      const skipping = profiles.filter((p) => p.limits.readOnlySkipsApproval?.value === true).map((p) => p.displayName);
      const reads = tools.filter(
        (t) => typeof t.name === "string" && nameIntent(t.name) === "read" && annotations(t).readOnlyHint === undefined
      );
      if (reads.length === 0) return [];
      const none = tools.every((t) => !isObject(t.annotations));
      return [
        {
          checkId: "TOOL_ANNOTATIONS_MISSING",
          severity: "info",
          subject: reads.map(toolName).join(", "),
          message: `${reads.length} tool(s) look read-only but don't declare readOnlyHint${none ? " (the server sets no annotations at all)" : ""}. Without it the spec tells clients to assume they may be destructive${skipping.length ? `; ${skipping.join(", ")} ask for confirmation on every call to them` : ", so users get needless confirmations"}.`,
          evidence: { tools: reads.map(toolName) },
          fix: "Add annotations: { readOnlyHint: true } to read-only tools, and destructiveHint: false to writes that only add data.",
        },
      ];
    },
  }),
];
