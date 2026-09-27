import type { ClientProfile } from "./types.js";

/** Generated from research notes (2026-09-27); every fact links to its source. */
export const geminiCli: ClientProfile = {
  id: "gemini-cli",
  aliases: ["gemini"],
  displayName: "Gemini CLI",
  versionTested: "google-gemini/gemini-cli @ 2fe7c2d (0.63.0-nightly.20260923)",
  supports: {
    stdio: {
      value: true,
      source: "https://github.com/google-gemini/gemini-cli/blob/2fe7c2d3f065dc40ad573d50b2091116f8a4aa18/docs/tools/mcp-server.md#L55-L61",
      verifiedOn: "2026-09-27"
    },
    sse: {
      value: true,
      source: "https://github.com/google-gemini/gemini-cli/blob/2fe7c2d3f065dc40ad573d50b2091116f8a4aa18/docs/tools/mcp-server.md#L55-L61",
      verifiedOn: "2026-09-27",
      note: "`url` config maps to SSEClientTransport."
    },
    streamableHttp: {
      value: true,
      source: "https://github.com/google-gemini/gemini-cli/blob/2fe7c2d3f065dc40ad573d50b2091116f8a4aa18/docs/tools/mcp-server.md#L55-L61",
      verifiedOn: "2026-09-27",
      note: "`httpUrl` config."
    },
    toolsListChanged: {
      value: true,
      source: "https://github.com/google-gemini/gemini-cli/blob/2fe7c2d3f065dc40ad573d50b2091116f8a4aa18/packages/core/src/tools/mcp-client.ts#L417",
      verifiedOn: "2026-09-27"
    },
    resourcesListChanged: {
      value: true,
      source: "https://github.com/google-gemini/gemini-cli/blob/2fe7c2d3f065dc40ad573d50b2091116f8a4aa18/packages/core/src/tools/mcp-client.ts#L439",
      verifiedOn: "2026-09-27"
    },
    promptsListChanged: {
      value: true,
      source: "https://github.com/google-gemini/gemini-cli/blob/2fe7c2d3f065dc40ad573d50b2091116f8a4aa18/packages/core/src/tools/mcp-client.ts#L461",
      verifiedOn: "2026-09-27"
    },
    resources: {
      value: true,
      source: "https://github.com/google-gemini/gemini-cli/blob/2fe7c2d3f065dc40ad573d50b2091116f8a4aa18/docs/tools/mcp-server.md#L63-L88",
      verifiedOn: "2026-09-27"
    },
    prompts: {
      value: true,
      source: "https://github.com/google-gemini/gemini-cli/blob/2fe7c2d3f065dc40ad573d50b2091116f8a4aa18/docs/tools/mcp-server.md#L1030-L1105",
      verifiedOn: "2026-09-27",
      note: "Exposed as slash commands."
    },
    sampling: {
      value: false,
      source: "https://github.com/google-gemini/gemini-cli/blob/2fe7c2d3f065dc40ad573d50b2091116f8a4aa18/packages/core/src/tools/mcp-client.ts#L1858-L1862",
      verifiedOn: "2026-09-27",
      note: "Only `roots` capability is registered."
    },
    elicitation: {
      value: false,
      source: "https://github.com/google-gemini/gemini-cli/blob/2fe7c2d3f065dc40ad573d50b2091116f8a4aa18/packages/core/src/tools/mcp-client.ts#L1858-L1862",
      verifiedOn: "2026-09-27",
      note: "Only `roots` capability is registered."
    },
    oauth: {
      value: true,
      source: "https://github.com/google-gemini/gemini-cli/blob/2fe7c2d3f065dc40ad573d50b2091116f8a4aa18/docs/tools/mcp-server.md#L271-L300",
      verifiedOn: "2026-09-27"
    },
    dcr: {
      value: true,
      source: "https://github.com/google-gemini/gemini-cli/blob/2fe7c2d3f065dc40ad573d50b2091116f8a4aa18/docs/tools/mcp-server.md#L296",
      verifiedOn: "2026-09-27"
    },
    uiResources: {
      value: false,
      source: "https://github.com/google-gemini/gemini-cli/blob/2fe7c2d3f065dc40ad573d50b2091116f8a4aa18/packages/core/src/tools/",
      verifiedOn: "2026-09-27",
      note: "No MCP Apps / ui:// handling found in source."
    },
    structuredContent: {
      value: false,
      source: "https://github.com/google-gemini/gemini-cli/blob/2fe7c2d3f065dc40ad573d50b2091116f8a4aa18/packages/core/src/tools/mcp-tool.ts#L644-L676",
      verifiedOn: "2026-09-27",
      note: "Only `content` blocks are turned into model parts; structuredContent is never sent to the model. mcp-compliance-transport.ts only back-fills it for SDK output validation."
    }
  },
  limits: {
    toolNamePrefix: {
      value: {
        format: "mcp_{server}_"
      },
      source: "https://github.com/google-gemini/gemini-cli/blob/2fe7c2d3f065dc40ad573d50b2091116f8a4aa18/packages/core/src/tools/mcp-tool.ts#L518-L524",
      verifiedOn: "2026-09-27",
      note: "Docs warn not to use '_' in server names (breaks policy parsing)."
    },
    toolNameChars: {
      value: {
        allowed: "A-Za-z0-9_.:-",
        onInvalid: "replace"
      },
      source: "https://github.com/google-gemini/gemini-cli/blob/2fe7c2d3f065dc40ad573d50b2091116f8a4aa18/packages/core/src/tools/mcp-tool.ts#L725-L736",
      verifiedOn: "2026-09-27",
      note: "Replaced with '_'; must start with letter or '_' (else '_' is prepended)."
    },
    maxToolNameLength: {
      value: {
        max: 63,
        onExceed: "truncateMiddle"
      },
      source: "https://github.com/google-gemini/gemini-cli/blob/2fe7c2d3f065dc40ad573d50b2091116f8a4aa18/packages/core/src/tools/mcp-tool.ts#L738-L747",
      verifiedOn: "2026-09-27",
      note: "Applies to the full mcp_{server}_{tool} name. Middle truncation: first 30 + '...' + last 30 chars; no hash, so collisions are possible."
    },
    structuredContent: {
      value: "textOnly",
      source: "https://github.com/google-gemini/gemini-cli/blob/2fe7c2d3f065dc40ad573d50b2091116f8a4aa18/packages/core/src/tools/mcp-tool.ts#L644-L676",
      verifiedOn: "2026-09-27",
      note: "Only `content` blocks are turned into model parts; structuredContent is never sent to the model. mcp-compliance-transport.ts only back-fills it for SDK output validation."
    },
    maxToolResult: {
      value: {
        max: 40000,
        unit: "chars",
        onExceed: "file"
      },
      source: "https://github.com/google-gemini/gemini-cli/blob/2fe7c2d3f065dc40ad573d50b2091116f8a4aa18/packages/core/src/scheduler/tool-executor.ts#L261-L300",
      verifiedOn: "2026-09-27",
      note: "Single-text-part MCP results longer than min(40,000 chars, 4 x remaining context tokens) are truncated, and the full output is saved to a temp file."
    },
    toolTimeoutMs: {
      value: 600000,
      source: "https://github.com/google-gemini/gemini-cli/blob/2fe7c2d3f065dc40ad573d50b2091116f8a4aa18/packages/core/src/tools/mcp-client.ts#L96",
      verifiedOn: "2026-09-27",
      note: "600,000 ms (10 min) default, per-server `timeout`."
    }
  },
};
