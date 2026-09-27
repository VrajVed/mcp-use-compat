import { LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import { LIST_KINDS, type ListKind, type ModernPageMeta, type ServerSnapshot } from "../snapshot.js";
import { connected, declared, str } from "./util.js";
import { upgradeHint } from "./sdk.js";
import { defineCheck, type Finding } from "./types.js";

const KINDS = Object.keys(LIST_KINDS) as ListKind[];

const MODERN = "2026-07-28";
const SPEC_MODERN = `https://modelcontextprotocol.io/specification/${MODERN}`;

/** Server rejected initialize but speaks 2026-07-28 (older snapshots: discover worked, connect failed). */
export function modernOnly(s: ServerSnapshot): boolean {
  return s.era === "modern" || (!s.connect.ok && !!s.discover?.ok);
}

const legacyConnected = (s: ServerSnapshot) => connected(s) && s.era !== "modern";
const modernSupported = (s: ServerSnapshot) => !!s.modern?.supported && !!s.modern.lists;

const VALID_RESULT_TYPES = new Set(["complete", "input_required"]);

/** Every modern result we saw, labelled by where it came from. */
function modernResults(s: ServerSnapshot): Array<[string, ModernPageMeta]> {
  const out: Array<[string, ModernPageMeta]> = [];
  if (s.modern?.discoverMeta) out.push(["server/discover", s.modern.discoverMeta]);
  for (const kind of KINDS) {
    for (const meta of s.modern?.pagesMeta?.[kind] ?? []) out.push([LIST_KINDS[kind].method, meta]);
  }
  return out;
}

function supportedVersions(s: ServerSnapshot): string[] {
  const v = s.discover?.result?.supportedVersions;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export const protocolChecks = [
  defineCheck({
    id: "PROTOCOL_MODERN_ONLY",
    area: "protocol",
    description: "Server still accepts the initialize handshake most clients use",
    appliesTo: (s) => !!s.discover,
    run: (s) =>
      modernOnly(s)
        ? [
            {
              checkId: "PROTOCOL_MODERN_ONLY",
              severity: "error",
              message: `Server rejects initialize and only answers server/discover (versions: ${supportedVersions(s).join(", ") || "none listed"}). Clients that still use the initialize handshake (protocol 2025-11-25 and older) cannot connect.`,
              evidence: { initializeError: s.connect.legacyError ?? s.connect.error, discover: s.discover?.result },
              fix: "Keep accepting initialize alongside server/discover until your target clients support the new revision.",
            },
          ]
        : [],
  }),

  defineCheck({
    id: "PROTOCOL_DISCOVER_MISSING",
    area: "protocol",
    description: `Server implements server/discover (required from protocol ${MODERN})`,
    appliesTo: (s) => connected(s) && !!s.discover,
    run: (s) =>
      s.discover!.ok
        ? []
        : [
            {
              checkId: "PROTOCOL_DISCOVER_MISSING",
              severity: "info",
              message: `server/discover failed (${s.discover!.error?.message ?? "unknown error"}), so the server only speaks the initialize-based protocol. That works with today's clients; clients on revision ${MODERN} have to fall back to initialize.`,
              fix: `When your target clients support ${MODERN}: ${upgradeHint(s, true)}`,
            },
          ],
  }),

  defineCheck({
    id: "PROTOCOL_MODERN_RESULT_TYPE",
    area: "protocol",
    description: `${MODERN} results carry a valid resultType`,
    appliesTo: modernSupported,
    run: (s) => {
      const results = modernResults(s);
      const missing = results.filter(([, m]) => m.resultType === undefined).map(([where]) => where);
      const invalid = results.filter(([, m]) => m.resultType !== undefined && !VALID_RESULT_TYPES.has(String(m.resultType)));
      const findings: Finding[] = [];
      if (missing.length) {
        findings.push({
          checkId: "PROTOCOL_MODERN_RESULT_TYPE",
          severity: "warn",
          subject: [...new Set(missing)].join(", "),
          message: `${MODERN} requires resultType on every result; it's missing from ${[...new Set(missing)].join(", ")}. The v2 SDK treats a missing value as "complete", but stricter clients may not.`,
          source: `${SPEC_MODERN}/basic/index`,
          fix: 'Upgrade to an SDK that implements 2026-07-28, or add resultType: "complete".',
        });
      }
      for (const [where, meta] of invalid) {
        findings.push({
          checkId: "PROTOCOL_MODERN_RESULT_TYPE",
          severity: "error",
          subject: where,
          message: `resultType ${JSON.stringify(meta.resultType)} is not "complete" or "input_required"; clients must treat the result as invalid.`,
          source: `${SPEC_MODERN}/basic/index`,
        });
      }
      return findings;
    },
  }),

  defineCheck({
    id: "PROTOCOL_MODERN_CACHE_FIELDS",
    area: "protocol",
    description: `${MODERN} list and discover results carry ttlMs and cacheScope`,
    appliesTo: modernSupported,
    run: (s) => {
      const bad = modernResults(s).filter(
        ([, m]) => typeof m.ttlMs !== "number" || m.ttlMs < 0 || (m.cacheScope !== "public" && m.cacheScope !== "private")
      );
      if (bad.length === 0) return [];
      const where = [...new Set(bad.map(([w]) => w))];
      return [
        {
          checkId: "PROTOCOL_MODERN_CACHE_FIELDS",
          severity: "warn",
          subject: where.join(", "),
          message: `${MODERN} requires ttlMs (≥ 0) and cacheScope ("public" or "private") on ${where.join(", ")}, but they're missing or invalid (e.g. ttlMs=${JSON.stringify(bad[0][1].ttlMs ?? null)}, cacheScope=${JSON.stringify(bad[0][1].cacheScope ?? null)}). Clients can't tell how long to cache the list, or whether it's per-user.`,
          source: `${SPEC_MODERN}/changelog`,
          fix: 'Return e.g. ttlMs: 60000, cacheScope: "private" (use "private" when the list depends on who is authorized).',
        },
      ];
    },
  }),

  defineCheck({
    id: "PROTOCOL_MODERN_SERVERINFO",
    area: "protocol",
    description: `${MODERN} results identify the server in _meta`,
    appliesTo: modernSupported,
    run: (s) => {
      const missing = modernResults(s).filter(([, m]) => !m.serverInfo);
      if (missing.length === 0) return [];
      return [
        {
          checkId: "PROTOCOL_MODERN_SERVERINFO",
          severity: "info",
          message: `Without initialize, results SHOULD carry _meta["io.modelcontextprotocol/serverInfo"]; ${missing.length} result(s) don't, so clients can't show which server answered.`,
          source: `${SPEC_MODERN}/basic/index`,
        },
      ];
    },
  }),

  defineCheck({
    id: "PROTOCOL_MODERN_VERSION_ERROR",
    area: "protocol",
    description: `${MODERN} servers reject unsupported versions with UnsupportedProtocolVersion (-32022)`,
    appliesTo: (s) => modernSupported(s) && !!s.modern?.unsupportedVersion,
    run: (s) => {
      const r = s.modern!.unsupportedVersion!;
      const data = r.data as { supported?: unknown } | undefined;
      if (!r.answered && r.code === -32022 && Array.isArray(data?.supported)) return [];
      return [
        {
          checkId: "PROTOCOL_MODERN_VERSION_ERROR",
          severity: "warn",
          message: r.answered
            ? "A request with an unsupported protocol version (1999-01-01) was answered normally. Clients rely on the -32022 error to retry with a version both sides support."
            : r.code !== -32022
              ? `An unsupported protocol version got error ${r.code ?? "(none)"} ("${r.message}") instead of -32022, so clients won't know to retry with another version.`
              : "The -32022 error has no data.supported list, so clients can't pick a version to retry with.",
          evidence: { answered: r.answered, code: r.code, data: r.data },
          source: `${SPEC_MODERN}/basic/versioning`,
          fix: 'Answer unknown versions with { code: -32022, data: { supported: ["2026-07-28", ...], requested } }.',
        },
      ];
    },
  }),

  defineCheck({
    id: "PROTOCOL_MODERN_SURFACE_DIFFERS",
    area: "protocol",
    description: `Tools are the same over the initialize handshake and ${MODERN}`,
    appliesTo: (s) => s.era === "both" && !!s.modern?.lists?.tools?.ok && !!s.lists.tools?.ok,
    run: (s) => {
      const names = (items: Array<Record<string, unknown>>) => new Set(items.flatMap((t) => (typeof t.name === "string" ? [t.name] : [])));
      const legacy = names(s.lists.tools!.items);
      const modern = names(s.modern!.lists!.tools!.items);
      const onlyLegacy = [...legacy].filter((n) => !modern.has(n));
      const onlyModern = [...modern].filter((n) => !legacy.has(n));
      if (!onlyLegacy.length && !onlyModern.length) return [];
      return [
        {
          checkId: "PROTOCOL_MODERN_SURFACE_DIFFERS",
          severity: "info",
          message: `Tool lists differ by protocol: only over initialize: ${onlyLegacy.join(", ") || "none"}; only over ${MODERN}: ${onlyModern.join(", ") || "none"}. Clients see different tools depending on which protocol they speak.`,
          evidence: { onlyLegacy, onlyModern },
          fix: "Expose the same tools on both, unless the difference is intentional.",
        },
      ];
    },
  }),

  defineCheck({
    id: "PROTOCOL_VERSION_UNSUPPORTED",
    area: "protocol",
    description: "Negotiated protocol version is one the SDK supports",
    appliesTo: legacyConnected,
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
      legacyConnected(s) && SUPPORTED_PROTOCOL_VERSIONS.includes(s.initialize?.negotiatedProtocolVersion ?? ""),
    run: (s) => {
      const v = s.initialize!.negotiatedProtocolVersion!;
      if (v === LATEST_PROTOCOL_VERSION) return [];
      return [
        {
          checkId: "PROTOCOL_VERSION_OLD",
          severity: v.startsWith("2024-") ? "warn" : "info",
          message: `Server negotiated ${v}; latest is ${LATEST_PROTOCOL_VERSION}. Features added in later spec revisions are unavailable to clients.`,
          evidence: { negotiated: v, latest: LATEST_PROTOCOL_VERSION },
          fix: upgradeHint(s),
        },
      ];
    },
  }),

  defineCheck({
    id: "PROTOCOL_VERSIONS_REJECTED",
    area: "protocol",
    description: "Server handles every published protocol version clients may request (--version-matrix)",
    appliesTo: (s) => connected(s) && !!s.versionMatrix?.length,
    run: (s) =>
      s.versionMatrix!.flatMap((probe): Finding[] => {
        if (!probe.ok) {
          return [
            {
              checkId: "PROTOCOL_VERSIONS_REJECTED",
              severity: "warn",
              subject: probe.requested,
              message: `initialize with protocolVersion ${probe.requested} failed (${probe.error}). The spec says to answer with a version the server supports, so clients can decide; failing instead cuts off clients that start at ${probe.requested}.`,
              fix: "On an unsupported version, respond with your latest supported version instead of an error.",
            },
          ];
        }
        if (probe.negotiated && !SUPPORTED_PROTOCOL_VERSIONS.includes(probe.negotiated)) {
          return [
            {
              checkId: "PROTOCOL_VERSIONS_REJECTED",
              severity: "error",
              subject: probe.requested,
              message: `Asked for ${probe.requested}, server answered with unknown version "${probe.negotiated}".`,
              fix: "Answer with a published protocol version.",
            },
          ];
        }
        // Answering with an older version is correct negotiation; answering with a newer one
        // (versions are dates, so they compare as strings) leaves an older client unable to talk.
        if (probe.negotiated && probe.negotiated > probe.requested) {
          return [
            {
              checkId: "PROTOCOL_VERSIONS_REJECTED",
              severity: "info",
              subject: probe.requested,
              message: `Asked for ${probe.requested}, server answered the newer ${probe.negotiated}; clients that only speak ${probe.requested} will disconnect.`,
              fix: `Support ${probe.requested} too if you need older clients (most SDKs do by default).`,
            },
          ];
        }
        return [];
      }),
  }),

  defineCheck({
    id: "PROTOCOL_VERSION_SURFACE_DIFFERS",
    area: "protocol",
    description: "The tool list is the same whichever protocol version a client negotiates",
    appliesTo: (s) => connected(s) && (s.versionMatrix?.filter((p) => p.tools).length ?? 0) > 1,
    run: (s) => {
      const probes = s.versionMatrix!.filter((p) => p.tools);
      const all = new Set(probes.flatMap((p) => p.tools!));
      return probes.flatMap((p): Finding[] => {
        const missing = [...all].filter((t) => !p.tools!.includes(t));
        if (missing.length === 0) return [];
        return [
          {
            checkId: "PROTOCOL_VERSION_SURFACE_DIFFERS",
            severity: "info",
            subject: p.requested,
            message: `Clients negotiating ${p.negotiated ?? p.requested} don't get ${missing.length} tool(s) other versions get: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? ", …" : ""}.`,
            evidence: { missing },
            fix: "If intentional (features that need newer protocol), document it; otherwise expose the same tools on every version.",
          },
        ];
      });
    },
  }),

  defineCheck({
    id: "PROTOCOL_SERVERINFO_MISSING",
    area: "protocol",
    description: "initialize returns serverInfo with name and version",
    appliesTo: legacyConnected,
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
