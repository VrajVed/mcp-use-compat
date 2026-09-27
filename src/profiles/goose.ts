import type { ClientProfile } from "./types.js";

/** Generated from research notes (2026-09-27); every fact links to its source. */
export const goose: ClientProfile = {
  id: "goose",
  aliases: [],
  displayName: "Goose",
  versionTested: "block/goose @ 04ed836 (1.52.0)",
  supports: {
    stdio: {
      value: true,
      source: "https://github.com/block/goose/blob/04ed836c8cde23e540cc77d256992e00be99298b/crates/goose/src/agents/extension.rs#L157-L158",
      verifiedOn: "2026-09-27"
    },
    streamableHttp: {
      value: true,
      source: "https://github.com/block/goose/blob/04ed836c8cde23e540cc77d256992e00be99298b/crates/goose/src/agents/extension.rs#L207-L208",
      verifiedOn: "2026-09-27"
    },
    sse: {
      value: false,
      source: "https://github.com/block/goose/blob/04ed836c8cde23e540cc77d256992e00be99298b/crates/goose/src/agents/extension.rs#L156",
      verifiedOn: "2026-09-27",
      note: "No SSE variant in ExtensionConfig."
    },
    toolsListChanged: {
      value: true,
      source: "https://github.com/block/goose/blob/04ed836c8cde23e540cc77d256992e00be99298b/crates/goose/src/agents/mcp_client.rs#L377-L379",
      verifiedOn: "2026-09-27"
    },
    resources: {
      value: true,
      source: "https://github.com/block/goose/blob/04ed836c8cde23e540cc77d256992e00be99298b/crates/goose/src/agents/extension_manager/mod.rs#L1067",
      verifiedOn: "2026-09-27"
    },
    prompts: {
      value: true,
      source: "https://github.com/block/goose/blob/04ed836c8cde23e540cc77d256992e00be99298b/crates/goose/src/agents/extension_manager/mod.rs#L1450",
      verifiedOn: "2026-09-27"
    },
    sampling: {
      value: false,
      source: "https://github.com/block/goose/blob/04ed836c8cde23e540cc77d256992e00be99298b/crates/goose/src/agents/mcp_client.rs#L1516-L1521",
      verifiedOn: "2026-09-27",
      note: "A test asserts sampling is not advertised."
    },
    elicitation: {
      value: true,
      source: "https://github.com/block/goose/blob/04ed836c8cde23e540cc77d256992e00be99298b/crates/goose/src/agents/mcp_client.rs#L466-L472",
      verifiedOn: "2026-09-27"
    },
    oauth: {
      value: true,
      source: "https://github.com/block/goose/blob/04ed836c8cde23e540cc77d256992e00be99298b/crates/goose/src/oauth/mod.rs#L255-L276",
      verifiedOn: "2026-09-27"
    },
    cimd: {
      value: true,
      source: "https://github.com/block/goose/blob/04ed836c8cde23e540cc77d256992e00be99298b/crates/goose/src/oauth/mod.rs#L273-L275",
      verifiedOn: "2026-09-27",
      note: "Uses a client_metadata_url unless a static client is configured."
    },
    uiResources: {
      value: true,
      source: "https://github.com/block/goose/blob/04ed836c8cde23e540cc77d256992e00be99298b/crates/goose/src/agents/mcp_client.rs#L300-L311",
      verifiedOn: "2026-09-27",
      note: "The MCP Apps UI extension is advertised when the host sets mcpui."
    },
    structuredContent: {
      value: false,
      source: "https://github.com/block/goose/blob/04ed836c8cde23e540cc77d256992e00be99298b/crates/goose-provider-types/src/formats/anthropic.rs#L314-L404",
      verifiedOn: "2026-09-27",
      note: "Provider formatting reads result.content only."
    }
  },
  limits: {
    toolNamePrefix: {
      value: {
        format: "{server}__",
        lowercase: true
      },
      source: "https://github.com/block/goose/blob/04ed836c8cde23e540cc77d256992e00be99298b/crates/goose/src/agents/extension_manager/mod.rs#L850-L854",
      verifiedOn: "2026-09-27",
      note: "{server} is the extension key: name_to_key() lowercases, removes whitespace and replaces chars other than [A-Za-z0-9_-] with '_' (config/extensions.rs#L22-L32). The tool name itself is not sanitised. unprefixed extensions skip the prefix."
    },
    structuredContent: {
      value: "textOnly",
      source: "https://github.com/block/goose/blob/04ed836c8cde23e540cc77d256992e00be99298b/crates/goose-provider-types/src/formats/anthropic.rs#L314-L404",
      verifiedOn: "2026-09-27",
      note: "Provider formatting reads result.content only."
    },
    maxToolResult: {
      value: {
        max: 200000,
        unit: "chars",
        onExceed: "file"
      },
      source: "https://github.com/block/goose/blob/04ed836c8cde23e540cc77d256992e00be99298b/crates/goose/src/agents/large_response_handler.rs#L5-L50",
      verifiedOn: "2026-09-27",
      note: "Text blocks over 200,000 chars (GOOSE_MAX_TOOL_RESPONSE_SIZE) are written to a temp file and replaced by a pointer message."
    },
    toolTimeoutMs: {
      value: 300000,
      source: "https://github.com/block/goose/blob/04ed836c8cde23e540cc77d256992e00be99298b/crates/goose/src/config/extensions.rs#L10",
      verifiedOn: "2026-09-27",
      note: "Per-extension timeout, default 300 s."
    },
    readOnlySkipsApproval: {
      value: true,
      source: "https://github.com/block/goose/blob/04ed836c8cde23e540cc77d256992e00be99298b/crates/goose/src/permission/permission_inspector.rs#L52-L64",
      verifiedOn: "2026-09-27",
      note: "Smart-approve: readOnlyHint:true tools are treated as read-only (no prompt), and readOnlyHint:false tools are set to AskBefore."
    }
  },
};
