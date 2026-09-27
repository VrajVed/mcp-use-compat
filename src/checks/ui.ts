import type { ServerSnapshot } from "../snapshot.js";
import { linkedUiUris, MCP_APP_MIME, normalizeMime, SKYBRIDGE_MIME, uiLinks } from "../ui.js";
import { connected, featureGap, itemLabel, items, str } from "./util.js";
import { defineCheck, type Finding } from "./types.js";

const SPEC = "https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx";

const uiTools = (s: ServerSnapshot) => items(s, "tools").filter((t) => linkedUiUris(t).length > 0);
const uiResources = (s: ServerSnapshot) =>
  items(s, "resources").filter((r) => str(r.uri)?.startsWith("ui://") || isUiMime(str(r.mimeType)));
const isUiMime = (mime: string | undefined) =>
  !!mime && [MCP_APP_MIME, SKYBRIDGE_MIME].includes(normalizeMime(mime));
const usesUi = (s: ServerSnapshot) => connected(s) && (uiTools(s).length > 0 || uiResources(s).length > 0);

function mimeFinding(subject: string, mime: string | undefined, where: string): Finding | undefined {
  if (mime && normalizeMime(mime) === MCP_APP_MIME) return undefined;
  const legacy = mime && normalizeMime(mime) === SKYBRIDGE_MIME;
  return {
    checkId: "UI_RESOURCE_MIME",
    severity: legacy ? "warn" : "error",
    subject,
    message: legacy
      ? `${where} uses the legacy ChatGPT type ${SKYBRIDGE_MIME}; MCP Apps hosts expect ${MCP_APP_MIME}.`
      : `${where} has mimeType ${JSON.stringify(mime ?? null)}; MCP Apps require ${MCP_APP_MIME}, so hosts won't render it.`,
    source: SPEC,
    fix: `Serve UI resources with mimeType "${MCP_APP_MIME}" (the ext-apps SDK's RESOURCE_MIME_TYPE).`,
  };
}

const CSP_KEYS = ["connectDomains", "resourceDomains", "frameDomains", "baseUriDomains"];
const LOOPBACK = /^(https?:\/\/)?(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0)(:\d+)?(\/|$)/i;

function uiMeta(item: Record<string, unknown>): Record<string, unknown> {
  const meta = item._meta;
  if (typeof meta !== "object" || meta === null) return {};
  const ui = (meta as Record<string, unknown>).ui;
  return typeof ui === "object" && ui !== null ? (ui as Record<string, unknown>) : {};
}

/** All CSP origins a UI resource declares, as [key, origin]. */
function cspOrigins(resource: Record<string, unknown>): Array<[string, string]> {
  const csp = uiMeta(resource).csp;
  if (typeof csp !== "object" || csp === null) return [];
  return CSP_KEYS.flatMap((key) => {
    const list = (csp as Record<string, unknown>)[key];
    return Array.isArray(list) ? list.filter((o): o is string => typeof o === "string").map((o): [string, string] => [key, o]) : [];
  });
}

const remoteTarget = (s: ServerSnapshot) => s.target.kind === "http" && !LOOPBACK.test(s.target.url);

export const uiChecks = [
  defineCheck({
    id: "UI_RESOURCE_MIME",
    area: "ui",
    description: `UI resources use ${MCP_APP_MIME}`,
    appliesTo: usesUi,
    run: (s) => {
      const findings: Finding[] = [];
      const seen = new Set<string>();
      for (const r of uiResources(s)) {
        const uri = itemLabel(r, "uri");
        seen.add(uri);
        const f = mimeFinding(uri, str(r.mimeType), "Listed UI resource");
        if (f) findings.push(f);
      }
      for (const [uri, read] of Object.entries(s.uiReads ?? {})) {
        if (!read.ok || seen.has(uri)) continue;
        const f = mimeFinding(uri, read.mimeType, "UI resource content");
        if (f) findings.push(f);
      }
      return findings;
    },
  }),

  defineCheck({
    id: "UI_RESOURCE_SCHEME",
    area: "ui",
    description: "UI resources use the ui:// scheme",
    appliesTo: usesUi,
    run: (s) => {
      const uris = [
        ...uiResources(s).map((r) => str(r.uri)),
        ...uiTools(s).flatMap((t) => linkedUiUris(t)),
      ].filter((u): u is string => !!u && !u.startsWith("ui://"));
      return [...new Set(uris)].map((uri) => ({
        checkId: "UI_RESOURCE_SCHEME",
        severity: "error" as const,
        subject: uri,
        message: "MCP Apps require UI resource URIs to use the ui:// scheme.",
        source: SPEC,
        fix: "Register the UI resource as ui://<app>/<view>.",
      }));
    },
  }),

  defineCheck({
    id: "UI_TOOL_LINK_BROKEN",
    area: "ui",
    description: "UI resources that tools link to can be read",
    appliesTo: (s) => connected(s) && !!s.uiReads,
    run: (s) =>
      uiTools(s).flatMap((t) =>
        linkedUiUris(t)
          .filter((uri) => s.uiReads?.[uri] && !s.uiReads[uri].ok)
          .map((uri) => ({
            checkId: "UI_TOOL_LINK_BROKEN",
            severity: "error" as const,
            subject: itemLabel(t),
            message: `Tool links to ${uri}, but resources/read failed: ${s.uiReads![uri].error}. Hosts show no UI.`,
            fix: "Register the resource under exactly the URI the tool's _meta points to.",
          }))
      ),
  }),

  defineCheck({
    id: "UI_TOOL_LINK_KEY",
    area: "ui",
    description: "Tools link UI with _meta.ui.resourceUri",
    appliesTo: (s) => connected(s) && uiTools(s).length > 0,
    run: (s) =>
      uiTools(s).flatMap((t): Finding[] => {
        const links = uiLinks(t);
        if (links.current) return [];
        const used = links.flat ? '_meta["ui/resourceUri"] (deprecated)' : '_meta["openai/outputTemplate"] (ChatGPT only)';
        return [
          {
            checkId: "UI_TOOL_LINK_KEY",
            severity: "warn",
            subject: itemLabel(t),
            message: `Tool links its UI only via ${used}. Hosts following MCP Apps (e.g. VS Code) read _meta.ui.resourceUri and show no UI.`,
            source: SPEC,
            fix: "Set _meta.ui.resourceUri (you can keep the old key too for older hosts).",
          },
        ];
      }),
  }),

  defineCheck({
    id: "UI_CSP_LOCAL_ORIGIN",
    area: "ui",
    description: "A remote server's UI resources don't point their CSP at localhost",
    appliesTo: (s) => usesUi(s) && remoteTarget(s),
    run: (s) =>
      uiResources(s).flatMap((r): Finding[] => {
        const local = cspOrigins(r).filter(([, origin]) => LOOPBACK.test(origin));
        if (local.length === 0) return [];
        return [
          {
            checkId: "UI_CSP_LOCAL_ORIGIN",
            severity: "warn",
            subject: itemLabel(r, "uri"),
            message: `CSP allows ${local.map(([k, o]) => `${o} (${k})`).join(", ")}, but the server is remote; in users' hosts the view would try to reach their own machine.`,
            source: SPEC,
            fix: "Derive CSP origins from the public server URL (or configure the production base URL) instead of the dev address.",
          },
        ];
      }),
  }),

  defineCheck({
    id: "UI_CSP_INSECURE",
    area: "ui",
    description: "UI resource CSP origins use HTTPS",
    appliesTo: usesUi,
    run: (s) =>
      uiResources(s).flatMap((r): Finding[] => {
        const insecure = cspOrigins(r).filter(([, o]) => /^http:\/\//i.test(o) && !LOOPBACK.test(o));
        if (insecure.length === 0) return [];
        return [
          {
            checkId: "UI_CSP_INSECURE",
            severity: "warn",
            subject: itemLabel(r, "uri"),
            message: `CSP allows plain-HTTP origins ${insecure.map(([, o]) => o).join(", ")}; hosts serve views over HTTPS and browsers block mixed content.`,
            fix: "Use https:// origins.",
          },
        ];
      }),
  }),

  defineCheck({
    id: "UI_VISIBILITY_INVALID",
    area: "ui",
    description: 'Tool _meta.ui.visibility only uses "model" and "app"',
    appliesTo: (s) => connected(s) && uiTools(s).length > 0,
    run: (s) =>
      items(s, "tools").flatMap((t): Finding[] => {
        const visibility = uiMeta(t).visibility;
        if (visibility === undefined) return [];
        const valid = Array.isArray(visibility) && visibility.length > 0 && visibility.every((v) => v === "model" || v === "app");
        if (valid) return [];
        return [
          {
            checkId: "UI_VISIBILITY_INVALID",
            severity: "error",
            subject: itemLabel(t),
            message: `_meta.ui.visibility is ${JSON.stringify(visibility)}; it must be a non-empty list of "model" and/or "app".`,
            source: SPEC,
            fix: 'Use ["model", "app"] (default), ["app"] for app-only tools, or omit it.',
          },
        ];
      }),
  }),

  defineCheck({
    id: "UI_UNSUPPORTED",
    area: "ui",
    description: "Clients that don't render MCP Apps are flagged when tools rely on UI",
    appliesTo: (s) => connected(s) && uiTools(s).length > 0,
    run: (s, { profiles }) =>
      featureGap(profiles, "uiResources", (p, partial) => ({
        checkId: "UI_UNSUPPORTED",
        severity: "warn",
        message: partial
          ? `${uiTools(s).length} tool(s) return UI, but ${p.displayName} only partly renders MCP Apps; some users only get the text content.`
          : `${uiTools(s).length} tool(s) return UI, but ${p.displayName} doesn't render MCP Apps; users only get the text content.`,
        fix: "Make each UI tool's text content useful on its own.",
      })),
  }),
];
