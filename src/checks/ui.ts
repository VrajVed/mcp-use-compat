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
