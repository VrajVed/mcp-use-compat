import type { ClientProfile } from "./types.js";

const DOCS = "https://code.claude.com/docs/en/mcp";
const verifiedOn = "2026-09-26";

export const claudeCode: ClientProfile = {
  id: "claude-code",
  aliases: [],
  displayName: "Claude Code",
  versionTested: "docs up to v2.1.283",
  supports: {
    stdio: { value: true, source: DOCS, verifiedOn },
    streamableHttp: { value: true, source: DOCS, verifiedOn },
    sse: { value: true, source: DOCS, verifiedOn, note: "Deprecated." },
    toolsListChanged: { value: true, source: DOCS, verifiedOn },
    resourcesListChanged: { value: true, source: DOCS, verifiedOn },
    promptsListChanged: { value: true, source: DOCS, verifiedOn },
    resources: { value: true, source: DOCS, verifiedOn },
    prompts: { value: true, source: DOCS, verifiedOn },
    elicitation: { value: true, source: DOCS, verifiedOn },
    oauth: { value: true, source: DOCS, verifiedOn },
    dcr: { value: true, source: DOCS, verifiedOn },
    cimd: { value: true, source: DOCS, verifiedOn },
    uiResources: {
      value: false,
      source: DOCS,
      verifiedOn,
      note: "UI resources are hidden from @-mentions and the resource list; no rendering is documented.",
    },
  },
  limits: {
    toolNamePrefix: { value: { format: "mcp__{server}__" }, source: "https://code.claude.com/docs/en/permissions", verifiedOn },
    toolNameChars: {
      value: { allowed: "A-Za-z0-9_-", onInvalid: "unknown" },
      source: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use",
      verifiedOn,
      note: "Claude API tool-name rule; how Claude Code maps other characters is not documented.",
    },
    maxToolNameLength: {
      value: { max: 128, onExceed: "unknown" },
      source: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use",
      verifiedOn,
      note: "Claude API limit, applied to the prefixed name; handling of longer names is not documented.",
    },
    maxDescriptionLength: {
      value: 2048,
      source: DOCS,
      verifiedOn,
      note: "Tool descriptions and server instructions (CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH, v2.1.280+).",
    },
    inputPropertyNamePattern: {
      value: "^[A-Za-z0-9_.-]{1,64}$",
      source: DOCS,
      verifiedOn,
      note: "Tools with other top-level property names are excluded (flag-gated, v2.1.216+).",
    },
    maxToolResult: {
      value: { max: 25000, unit: "tokens", onExceed: "file" },
      source: "https://code.claude.com/docs/en/mcp#mcp-output-limits-and-warnings",
      verifiedOn: "2026-09-27",
      note: "MAX_MCP_OUTPUT_TOKENS default; larger results are saved to disk and replaced by a file reference.",
    },
  },
};
