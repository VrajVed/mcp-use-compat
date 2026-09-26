import type { ClientProfile } from "./types.js";

const DOCS = "https://claude.com/docs/connectors/building/index";
const verifiedOn = "2026-09-26";

export const claudeDesktop: ClientProfile = {
  id: "claude-desktop",
  aliases: ["claude", "claude-ai", "claude.ai"],
  displayName: "Claude Desktop / claude.ai",
  supports: {
    stdio: { value: true, source: "https://claude.com/docs/connectors/building/mcpb", verifiedOn },
    streamableHttp: {
      value: true,
      source: DOCS,
      verifiedOn,
      note: "Remote connectors are reached from Anthropic's cloud, so the server must be publicly reachable.",
    },
    sse: { value: true, source: DOCS, verifiedOn, note: "Legacy HTTP+SSE, being deprecated." },
    resources: { value: true, source: DOCS, verifiedOn },
    prompts: { value: true, source: DOCS, verifiedOn },
    sampling: { value: false, source: DOCS, verifiedOn },
    oauth: { value: true, source: DOCS, verifiedOn },
    dcr: { value: true, source: "https://claude.com/docs/connectors/building/authentication", verifiedOn },
    cimd: {
      value: true,
      source: "https://claude.com/docs/connectors/building/authentication",
      verifiedOn,
      note: "Preferred when AS metadata has client_id_metadata_document_supported and 'none' in token_endpoint_auth_methods_supported.",
    },
    uiResources: { value: true, source: "https://claude.com/docs/connectors/building/mcp-apps/getting-started", verifiedOn },
  },
  limits: {
    toolNameChars: {
      value: { allowed: "A-Za-z0-9_-", onInvalid: "unknown" },
      source: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use",
      verifiedOn,
      note: "Claude API tool-name rule; how MCP names with other characters are mapped is not documented.",
    },
  },
};
