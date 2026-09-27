import type { ClientProfile } from "./types.js";

/** Generated from research notes (2026-09-27); every fact links to its source. */
export const continueDev: ClientProfile = {
  id: "continue",
  aliases: ["continue-dev"],
  displayName: "Continue",
  versionTested: "continuedev/continue @ 5522c6f (last commit 2026-07-20)",
  supports: {
    stdio: {
      value: true,
      source: "https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/context/mcp/MCPConnection.ts#L391",
      verifiedOn: "2026-09-27"
    },
    sse: {
      value: true,
      source: "https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/context/mcp/MCPConnection.ts#L500-L520",
      verifiedOn: "2026-09-27"
    },
    streamableHttp: {
      value: true,
      source: "https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/context/mcp/MCPConnection.ts#L535-L550",
      verifiedOn: "2026-09-27"
    },
    toolsListChanged: {
      value: false,
      source: "https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/context/mcp/MCPConnection.ts#L286",
      verifiedOn: "2026-09-27",
      note: "Notification handler is commented out."
    },
    resources: {
      value: true,
      source: "https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/context/mcp/MCPConnection.ts#L292-L300",
      verifiedOn: "2026-09-27"
    },
    prompts: {
      value: true,
      source: "https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/context/mcp/MCPConnection.ts#L343-L350",
      verifiedOn: "2026-09-27"
    },
    sampling: {
      value: false,
      source: "https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/context/mcp/MCPConnection.ts#L94",
      verifiedOn: "2026-09-27",
      note: "capabilities: {}."
    },
    elicitation: {
      value: false,
      source: "https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/context/mcp/MCPConnection.ts#L94",
      verifiedOn: "2026-09-27",
      note: "capabilities: {}."
    },
    oauth: {
      value: true,
      source: "https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/context/mcp/MCPOauth.ts",
      verifiedOn: "2026-09-27"
    },
    uiResources: {
      value: "partial",
      source: "https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/tools/callTool.ts#L115-L142",
      verifiedOn: "2026-09-27",
      note: "Reads _meta.ui.resourceUri and fetches the resource. Only a single content item is supported."
    },
    structuredContent: {
      value: false,
      source: "https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/tools/callTool.ts#L145-L181",
      verifiedOn: "2026-09-27",
      note: "Only `content` items become context items."
    }
  },
  limits: {
    toolNamePrefix: {
      value: {
        format: "{server}_",
        lowercase: true
      },
      source: "https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/tools/mcpToolName.ts#L6-L18",
      verifiedOn: "2026-09-27",
      note: "Server name: runs of non [a-z0-9] become '_', trimmed. Skipped if the tool name already starts with that prefix. The tool name is not sanitised."
    },
    structuredContent: {
      value: "textOnly",
      source: "https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/tools/callTool.ts#L145-L181",
      verifiedOn: "2026-09-27",
      note: "Only `content` items become context items."
    },
    toolTimeoutMs: {
      value: 60000,
      source: "https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/tools/callTool.ts#L108",
      verifiedOn: "2026-09-27",
      note: "Per-server `timeout` passed to callTool, else the MCP TS SDK default of 60 s. The 20 s DEFAULT_MCP_TIMEOUT covers connection only."
    }
  },
};
