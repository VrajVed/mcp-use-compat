import { LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import { LIST_KINDS, type ListKind } from "../snapshot.js";
import { connected, declared, str } from "./util.js";
import { defineCheck, type Finding } from "./types.js";

const KINDS = Object.keys(LIST_KINDS) as ListKind[];

export const protocolChecks = [
  defineCheck({
    id: "PROTOCOL_VERSION_UNSUPPORTED",
    area: "protocol",
    description: "Negotiated protocol version is one the SDK supports",
    appliesTo: connected,
    run: (s) => {
      const v = s.initialize?.negotiatedProtocolVersion;
      if (v && SUPPORTED_PROTOCOL_VERSIONS.includes(v)) return [];
      return [
        {
          checkId: "PROTOCOL_VERSION_UNSUPPORTED",
          severity: "error",
          message: v
            ? `Server answered with protocol version "${v}", which SDK-based clients reject.`
            : "initialize result has no protocolVersion.",
          evidence: { negotiated: v ?? null, supported: SUPPORTED_PROTOCOL_VERSIONS },
          fix: `Return the client's requested version (${LATEST_PROTOCOL_VERSION}) if you support it, otherwise the latest version you do support.`,
        },
      ];
    },
  }),

  defineCheck({
    id: "PROTOCOL_VERSION_OLD",
    area: "protocol",
    description: "Server speaks the latest protocol version",
    appliesTo: (s) =>
      connected(s) && SUPPORTED_PROTOCOL_VERSIONS.includes(s.initialize?.negotiatedProtocolVersion ?? ""),
    run: (s) => {
      const v = s.initialize!.negotiatedProtocolVersion!;
      if (v === LATEST_PROTOCOL_VERSION) return [];
      return [
        {
          checkId: "PROTOCOL_VERSION_OLD",
          severity: v.startsWith("2024-") ? "warn" : "info",
          message: `Server negotiated ${v}; latest is ${LATEST_PROTOCOL_VERSION}. Features added in later spec revisions are unavailable to clients.`,
          evidence: { negotiated: v, latest: LATEST_PROTOCOL_VERSION },
          fix: "Upgrade your MCP SDK.",
        },
      ];
    },
  }),

  defineCheck({
    id: "PROTOCOL_SERVERINFO_MISSING",
    area: "protocol",
    description: "initialize returns serverInfo with name and version",
    appliesTo: connected,
    run: (s) => {
      const info = s.initialize?.serverInfo;
      const missing = ["name", "version"].filter((k) => !str(info?.[k]));
      if (missing.length === 0) return [];
      return [
        {
          checkId: "PROTOCOL_SERVERINFO_MISSING",
          severity: "warn",
          message: `serverInfo is missing ${missing.join(" and ")}.`,
          fix: "Pass name and version when constructing the server.",
        },
      ];
    },
  }),

  defineCheck({
    id: "PROTOCOL_CAPABILITY_UNDECLARED",
    area: "protocol",
    description: "Every feature the server serves is declared in capabilities",
    appliesTo: connected,
    run: (s) =>
      KINDS.flatMap((kind): Finding[] => {
        const list = s.lists[kind];
        const cap = LIST_KINDS[kind].capability;
        if (!list?.ok || list.items.length === 0 || declared(s, cap)) return [];
        return [
          {
            checkId: "PROTOCOL_CAPABILITY_UNDECLARED",
            severity: "error",
            subject: kind,
            message: `Server answers ${LIST_KINDS[kind].method} with ${list.items.length} item(s) but doesn't declare the "${cap}" capability, so spec-following clients never ask for them.`,
            fix: `Declare "${cap}": {} in the server capabilities.`,
          },
        ];
      }),
  }),

  defineCheck({
    id: "PROTOCOL_CAPABILITY_BROKEN",
    area: "protocol",
    description: "Every declared capability's list method works",
    appliesTo: connected,
    run: (s) =>
      KINDS.flatMap((kind): Finding[] => {
        const list = s.lists[kind];
        const cap = LIST_KINDS[kind].capability;
        if (!list || list.ok || !declared(s, cap)) return [];
        // resources/templates/list is optional-ish in practice; many servers skip it.
        const severity = kind === "resourceTemplates" ? "warn" : "error";
        return [
          {
            checkId: "PROTOCOL_CAPABILITY_BROKEN",
            severity,
            subject: kind,
            message: `"${cap}" is declared but ${LIST_KINDS[kind].method} failed: ${list.error?.message ?? "unknown error"}`,
            evidence: { error: list.error },
            fix:
              kind === "resourceTemplates"
                ? "Implement resources/templates/list (an empty list is fine)."
                : `Implement ${LIST_KINDS[kind].method} or stop declaring "${cap}".`,
          },
        ];
      }),
  }),

  defineCheck({
    id: "PROTOCOL_PAGINATION_BROKEN",
    area: "protocol",
    description: "List pagination terminates",
    appliesTo: connected,
    run: (s) =>
      KINDS.filter((kind) => s.lists[kind]?.cursorLoop).map((kind) => ({
        checkId: "PROTOCOL_PAGINATION_BROKEN",
        severity: "error" as const,
        subject: kind,
        message: `${LIST_KINDS[kind].method} returned a nextCursor it had already returned; clients loop forever or stop early.`,
        fix: "Return a new cursor per page and omit nextCursor on the last page.",
      })),
  }),
];
