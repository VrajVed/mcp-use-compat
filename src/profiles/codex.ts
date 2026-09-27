import type { ClientProfile } from "./types.js";

/** Generated from research notes (2026-09-27); every fact links to its source. */
export const codex: ClientProfile = {
  id: "codex",
  aliases: ["codex-cli"],
  displayName: "OpenAI Codex CLI",
  versionTested: "openai/codex @ 8f195c9",
  supports: {
    stdio: {
      value: true,
      source: "https://learn.chatgpt.com/docs/extend/mcp?surface=cli",
      verifiedOn: "2026-09-27"
    },
    streamableHttp: {
      value: true,
      source: "https://learn.chatgpt.com/docs/extend/mcp?surface=cli",
      verifiedOn: "2026-09-27"
    },
    sse: {
      value: false,
      source: "https://learn.chatgpt.com/docs/extend/mcp?surface=cli",
      verifiedOn: "2026-09-27",
      note: "Docs list only STDIO and Streamable HTTP servers."
    },
    toolsListChanged: {
      value: false,
      source: "https://github.com/openai/codex/blob/8f195c93d7e7acfef95acf273f0e49cce917e291/codex-rs/rmcp-client/src/logging_client_handler.rs#L82-L92",
      verifiedOn: "2026-09-27",
      note: "list_changed notifications are only logged."
    },
    resourcesListChanged: {
      value: false,
      source: "https://github.com/openai/codex/blob/8f195c93d7e7acfef95acf273f0e49cce917e291/codex-rs/rmcp-client/src/logging_client_handler.rs#L82-L84",
      verifiedOn: "2026-09-27",
      note: "Only logged."
    },
    promptsListChanged: {
      value: false,
      source: "https://github.com/openai/codex/blob/8f195c93d7e7acfef95acf273f0e49cce917e291/codex-rs/rmcp-client/src/logging_client_handler.rs#L90-L92",
      verifiedOn: "2026-09-27",
      note: "Only logged."
    },
    resources: {
      value: true,
      source: "https://github.com/openai/codex/blob/8f195c93d7e7acfef95acf273f0e49cce917e291/codex-rs/core/src/tools/handlers/mcp_resource/read_mcp_resource.rs",
      verifiedOn: "2026-09-27",
      note: "Exposed to the model via list/read resource tools."
    },
    sampling: {
      value: false,
      source: "https://github.com/openai/codex/blob/8f195c93d7e7acfef95acf273f0e49cce917e291/codex-rs/codex-mcp/src/rmcp_client.rs#L1105-L1128",
      verifiedOn: "2026-09-27",
      note: "Only elicitation (+extensions) is declared."
    },
    elicitation: {
      value: true,
      source: "https://github.com/openai/codex/blob/8f195c93d7e7acfef95acf273f0e49cce917e291/codex-rs/codex-mcp/src/rmcp_client.rs#L1109-L1110",
      verifiedOn: "2026-09-27"
    },
    oauth: {
      value: true,
      source: "https://learn.chatgpt.com/docs/extend/mcp?surface=cli",
      verifiedOn: "2026-09-27",
      note: "`codex mcp login <server>`."
    },
    dcr: {
      value: true,
      source: "https://learn.chatgpt.com/docs/extend/mcp?surface=cli",
      verifiedOn: "2026-09-27"
    },
    cimd: {
      value: true,
      source: "https://learn.chatgpt.com/docs/extend/mcp?surface=cli",
      verifiedOn: "2026-09-27"
    },
    structuredContent: {
      value: true,
      source: "https://github.com/openai/codex/blob/8f195c93d7e7acfef95acf273f0e49cce917e291/codex-rs/protocol/src/models.rs#L2302-L2336",
      verifiedOn: "2026-09-27"
    }
  },
  limits: {
    toolNamePrefix: {
      value: {
        format: "mcp__{server}__"
      },
      source: "https://github.com/openai/codex/blob/8f195c93d7e7acfef95acf273f0e49cce917e291/codex-rs/codex-mcp/src/tools.rs#L222-L234",
      verifiedOn: "2026-09-27",
      note: "Default. The feature 'non_prefixed_mcp_tool_names' (under development, off by default) removes it."
    },
    toolNameChars: {
      value: {
        allowed: "A-Za-z0-9_",
        onInvalid: "replaceUnique"
      },
      source: "https://github.com/openai/codex/blob/8f195c93d7e7acfef95acf273f0e49cce917e291/codex-rs/codex-mcp/src/mcp/mod.rs#L572-L590",
      verifiedOn: "2026-09-27",
      note: "Hyphens and dots are replaced with '_' too."
    },
    maxToolNameLength: {
      value: {
        max: 128,
        onExceed: "truncateWithHash"
      },
      source: "https://github.com/openai/codex/blob/8f195c93d7e7acfef95acf273f0e49cce917e291/codex-rs/codex-mcp/src/tools.rs#L226-L290",
      verifiedOn: "2026-09-27",
      note: "12-hex sha1 suffix; also used to make colliding names unique."
    },
    schemaDroppedKeywords: {
      value: [
        "default",
        "format",
        "title",
        "pattern",
        "minimum",
        "maximum",
        "minLength",
        "maxLength",
        "maxItems",
        "not",
        "if",
        "then",
        "else",
        "patternProperties",
        "dependencies",
        "contentEncoding",
        "examples"
      ],
      source: "https://github.com/openai/codex/blob/8f195c93d7e7acfef95acf273f0e49cce917e291/codex-rs/tools/src/json_schema/types.rs#L35-L75",
      verifiedOn: "2026-09-27",
      note: "Anything outside Codex's JsonSchema model is dropped when it re-serialises the schema."
    },
    maxSchemaChars: {
      value: 5000,
      source: "https://github.com/openai/codex/blob/8f195c93d7e7acfef95acf273f0e49cce917e291/codex-rs/tools/src/json_schema/compaction.rs#L15-L38",
      verifiedOn: "2026-09-27",
      note: "Codex measures the bytes of its sanitized schema and compacts it: descriptions first, then $defs, then deep objects."
    },
    structuredContent: {
      value: "replacesText",
      source: "https://github.com/openai/codex/blob/8f195c93d7e7acfef95acf273f0e49cce917e291/codex-rs/protocol/src/models.rs#L2314-L2330",
      verifiedOn: "2026-09-27",
      note: "Non-null structuredContent is serialised as the whole output, and content is ignored unless it holds encrypted content."
    },
    maxToolResult: {
      value: {
        max: 10000,
        unit: "tokens",
        onExceed: "truncate"
      },
      source: "https://github.com/openai/codex/blob/8f195c93d7e7acfef95acf273f0e49cce917e291/codex-rs/models-manager/models.json",
      verifiedOn: "2026-09-27",
      note: "10,000 tokens per tool output for bundled models (truncation_policy). Configurable via tool_output_token_limit or per-server output limit. Fallback model info uses 10,000 bytes."
    },
    toolTimeoutMs: {
      value: 300000,
      source: "https://github.com/openai/codex/blob/8f195c93d7e7acfef95acf273f0e49cce917e291/codex-rs/codex-mcp/src/rmcp_client.rs#L105-L106",
      verifiedOn: "2026-09-27",
      note: "Code default 300 s (tool) / 30 s (startup). Docs say 60 s / 10 s."
    },
    readOnlySkipsApproval: {
      value: true,
      source: "https://github.com/openai/codex/blob/8f195c93d7e7acfef95acf273f0e49cce917e291/codex-rs/core/src/mcp_tool_call.rs#L2442-L2473",
      verifiedOn: "2026-09-27",
      note: "Default approval mode 'auto': destructiveHint:true means prompt. readOnlyHint:true means no prompt. Otherwise it prompts if destructiveHint or openWorldHint is unset/true (spec defaults applied). Mode 'writes' prompts unless readOnlyHint:true."
    }
  },
};
