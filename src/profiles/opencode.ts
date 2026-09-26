import type { ClientProfile } from "./types.js";

const DOCS = "https://opencode.ai/docs/mcp-servers/";
const SRC = "https://github.com/anomalyco/opencode/blob/a42f393c850bec0c0f395fb91bf19b1ee8b31666/packages/opencode/src/mcp";
const verifiedOn = "2026-09-26";

export const opencode: ClientProfile = {
  id: "opencode",
  aliases: [],
  displayName: "OpenCode",
  versionTested: "opencode-ai 1.18.32 (anomalyco/opencode @ a42f393)",
  supports: {
    stdio: { value: true, source: DOCS, verifiedOn },
    streamableHttp: { value: true, source: `${SRC}/index.ts#L268-L283`, verifiedOn },
    sse: { value: true, source: `${SRC}/index.ts#L268-L283`, verifiedOn },
    toolsListChanged: { value: true, source: `${SRC}/index.ts#L461-L471`, verifiedOn },
    promptsListChanged: { value: false, source: `${SRC}/index.ts`, verifiedOn, note: "No handler in the client source." },
    resourcesListChanged: { value: false, source: `${SRC}/index.ts`, verifiedOn, note: "No handler in the client source." },
    resources: { value: true, source: `${SRC}/catalog.ts#L130-L134`, verifiedOn },
    prompts: { value: true, source: `${SRC}/catalog.ts#L122-L126`, verifiedOn },
    sampling: { value: false, source: `${SRC}/index.ts#L39-L49`, verifiedOn },
    elicitation: { value: false, source: `${SRC}/index.ts#L39-L49`, verifiedOn },
    oauth: { value: true, source: DOCS, verifiedOn },
    dcr: { value: true, source: DOCS, verifiedOn },
    uiResources: { value: false, source: `${SRC}/`, verifiedOn, note: "No MCP Apps handling in the source." },
    structuredContent: { value: "partial", source: `${SRC}/catalog.ts#L75-L80`, verifiedOn },
  },
  limits: {
    toolNamePrefix: { value: { format: "{server}_" }, source: `${SRC}/catalog.ts#L117-L119`, verifiedOn },
    toolNameChars: {
      value: { allowed: "A-Za-z0-9_-", onInvalid: "replace" },
      source: `${SRC}/catalog.ts#L117`,
      verifiedOn,
    },
    structuredContent: { value: "fallbackOnly", source: `${SRC}/catalog.ts#L75-L80`, verifiedOn },
  },
};
