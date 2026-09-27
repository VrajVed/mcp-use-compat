import type { ClientProfile } from "./types.js";

/** Generated from research notes (2026-09-27); every fact links to its source. */
export const cline: ClientProfile = {
  id: "cline",
  aliases: [],
  displayName: "Cline",
  versionTested: "cline/cline @ 252082b",
  supports: {
    stdio: {
      value: true,
      source: "https://github.com/cline/cline/blob/252082b9e93b4f91253876391e35b4c13326f5e6/apps/vscode/src/services/mcp/constants.ts#L4",
      verifiedOn: "2026-09-27"
    },
    sse: {
      value: true,
      source: "https://github.com/cline/cline/blob/252082b9e93b4f91253876391e35b4c13326f5e6/apps/vscode/src/services/mcp/constants.ts#L4",
      verifiedOn: "2026-09-27"
    },
    streamableHttp: {
      value: true,
      source: "https://github.com/cline/cline/blob/252082b9e93b4f91253876391e35b4c13326f5e6/apps/vscode/src/services/mcp/constants.ts#L4",
      verifiedOn: "2026-09-27"
    },
    toolsListChanged: {
      value: true,
      source: "https://github.com/cline/cline/blob/252082b9e93b4f91253876391e35b4c13326f5e6/apps/vscode/src/services/mcp/McpHub.ts#L767-L769",
      verifiedOn: "2026-09-27"
    },
    resourcesListChanged: {
      value: true,
      source: "https://github.com/cline/cline/blob/252082b9e93b4f91253876391e35b4c13326f5e6/apps/vscode/src/services/mcp/McpHub.ts#L770-L772",
      verifiedOn: "2026-09-27"
    },
    promptsListChanged: {
      value: true,
      source: "https://github.com/cline/cline/blob/252082b9e93b4f91253876391e35b4c13326f5e6/apps/vscode/src/services/mcp/McpHub.ts#L773-L775",
      verifiedOn: "2026-09-27"
    },
    resources: {
      value: true,
      source: "https://github.com/cline/cline/blob/252082b9e93b4f91253876391e35b4c13326f5e6/apps/vscode/src/services/mcp/McpHub.ts#L915-L930",
      verifiedOn: "2026-09-27"
    },
    prompts: {
      value: true,
      source: "https://github.com/cline/cline/blob/252082b9e93b4f91253876391e35b4c13326f5e6/apps/vscode/src/services/mcp/McpHub.ts#L974-L990",
      verifiedOn: "2026-09-27"
    },
    sampling: {
      value: false,
      source: "https://github.com/cline/cline/blob/252082b9e93b4f91253876391e35b4c13326f5e6/apps/vscode/src/services/mcp/McpHub.ts#L464-L472",
      verifiedOn: "2026-09-27",
      note: "Client declares capabilities: {}."
    },
    elicitation: {
      value: false,
      source: "https://github.com/cline/cline/blob/252082b9e93b4f91253876391e35b4c13326f5e6/apps/vscode/src/services/mcp/McpHub.ts#L464-L472",
      verifiedOn: "2026-09-27",
      note: "Client declares capabilities: {}."
    },
    oauth: {
      value: true,
      source: "https://github.com/cline/cline/blob/252082b9e93b4f91253876391e35b4c13326f5e6/apps/vscode/src/services/mcp/McpOAuthManager.ts",
      verifiedOn: "2026-09-27"
    },
    structuredContent: {
      value: true,
      source: "https://github.com/cline/cline/blob/252082b9e93b4f91253876391e35b4c13326f5e6/sdk/packages/core/src/session/persisted-tool-result-content.ts#L9-L24",
      verifiedOn: "2026-09-27",
      note: "Inferred from code path: McpHub returns the whole CallToolResult, which is JSON-stringified into the tool_result."
    }
  },
  limits: {
    toolNamePrefix: {
      value: {
        format: "{server}__"
      },
      source: "https://github.com/cline/cline/blob/252082b9e93b4f91253876391e35b4c13326f5e6/sdk/packages/core/src/extensions/mcp/name-transform.ts#L24",
      verifiedOn: "2026-09-27"
    },
    toolNameChars: {
      value: {
        allowed: "A-Za-z0-9_-",
        onInvalid: "truncateWithHash"
      },
      source: "https://github.com/cline/cline/blob/252082b9e93b4f91253876391e35b4c13326f5e6/sdk/packages/core/src/extensions/mcp/name-transform.ts#L7-L35",
      verifiedOn: "2026-09-27",
      note: "Invalid runs become '_', then an 8-hex sha1 suffix is appended whenever the name changed."
    },
    maxToolNameLength: {
      value: {
        max: 64,
        onExceed: "truncateWithHash"
      },
      source: "https://github.com/cline/cline/blob/252082b9e93b4f91253876391e35b4c13326f5e6/sdk/packages/core/src/extensions/mcp/name-transform.ts#L6-L35",
      verifiedOn: "2026-09-27",
      note: "Base is cut to 55 chars, then '_' + 8-hex hash."
    },
    rootCombinatorNonObject: {
      value: "dropsServerTools",
      source: "https://github.com/cline/cline/blob/252082b9e93b4f91253876391e35b4c13326f5e6/sdk/packages/shared/src/tools/create.ts#L5-L79",
      verifiedOn: "2026-09-27",
      note: "normalizeToolInputSchema throws; the error drops every tool of the server."
    },
    structuredContent: {
      value: "alongsideText",
      source: "https://github.com/cline/cline/blob/252082b9e93b4f91253876391e35b4c13326f5e6/sdk/packages/core/src/session/persisted-tool-result-content.ts#L9-L24",
      verifiedOn: "2026-09-27",
      note: "Model sees JSON.stringify of the whole result (content + structuredContent + isError). Inferred from code path."
    },
    toolTimeoutMs: {
      value: 60000,
      source: "https://github.com/cline/cline/blob/252082b9e93b4f91253876391e35b4c13326f5e6/sdk/packages/shared/src/mcp.ts#L10",
      verifiedOn: "2026-09-27",
      note: "60 s default per server (`timeout` in seconds)."
    }
  },
};
