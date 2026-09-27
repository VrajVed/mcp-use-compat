import type { ClientFeature, ClientProfile } from "../profiles/types.js";

type LimitKey = keyof ClientProfile["limits"];

export interface Explanation {
  /** Why the check exists, in one or two sentences. */
  why: string;
  /** Spec pages, RFCs or SDK source backing the check itself. */
  sources?: string[];
  /** Client profile limits the check reads; `explain` prints them per client. */
  limits?: LimitKey[];
  /** Client features the check depends on; `explain` prints them per client. */
  features?: ClientFeature[];
}

const SPEC = "https://modelcontextprotocol.io/specification/2025-11-25";
const MODERN = "https://modelcontextprotocol.io/specification/2026-07-28";
const SDK_TYPES = "https://unpkg.com/@modelcontextprotocol/sdk@1.30.1/dist/esm/types.js";
const APPS = "https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx";
const AUTH_DISCOVERY = `${MODERN}/basic/authorization/authorization-server-discovery`;
const AUTH_REGISTRATION = `${MODERN}/basic/authorization/client-registration`;

export const EXPLANATIONS: Record<string, Explanation> = {
  TRANSPORT_CONNECT_FAILED: {
    why: "Nothing else can be checked if the server doesn't start and answer initialize. The report includes the server's last stderr lines.",
    sources: [`${SPEC}/basic/lifecycle`],
  },
  TRANSPORT_AUTH_REQUIRED: {
    why: "An HTTP server that demands credentials before initialize can only have its auth discovery checked; pass --header to check the rest.",
    sources: [AUTH_DISCOVERY],
  },
  TRANSPORT_STDOUT_POLLUTION: {
    why: "On stdio, stdout carries only protocol messages. SDK clients drop other lines, and a log write without a newline corrupts the next message, so that request hangs.",
    sources: [`${SPEC}/basic/transports`, "https://unpkg.com/@modelcontextprotocol/sdk@1.30.1/dist/esm/shared/stdio.js"],
    features: ["stdio"],
  },
  TRANSPORT_SLOW_STARTUP: {
    why: "Clients wait a limited time for initialize. Heavy setup before answering (or a first-run npx/uvx install) can make the server look broken.",
  },
  TRANSPORT_SLOW_LIST: {
    why: "Clients list tools on every connect; slow listing delays every session and can hit client timeouts.",
  },
  TRANSPORT_STDERR_ERRORS: {
    why: "Error-looking stderr output during a healthy session often points at a problem the protocol doesn't surface.",
  },
  PROTOCOL_MODERN_ONLY: {
    why: "A server that rejects initialize and only answers server/discover (protocol 2026-07-28) is unreachable for clients still on the initialize handshake.",
    sources: [`${MODERN}/basic/lifecycle`],
  },
  PROTOCOL_DISCOVER_MISSING: {
    why: "Protocol 2026-07-28 requires server/discover. Today's clients still use initialize, so this is informational.",
    sources: [`${MODERN}/basic/lifecycle`],
  },
  PROTOCOL_MODERN_RESULT_TYPE: {
    why: "In 2026-07-28 every result carries resultType (complete or input_required) so clients know whether to answer an input request.",
    sources: [`${MODERN}/basic/index`],
  },
  PROTOCOL_MODERN_CACHE_FIELDS: {
    why: "2026-07-28 list and discover results must say how long they can be cached (ttlMs) and whether the cache is per-user (cacheScope).",
    sources: [`${MODERN}/changelog`, "https://github.com/modelcontextprotocol/modelcontextprotocol/blob/ab3a39c13bd23be691c2760e1c6c5c15a64582e1/schema/2026-07-28/schema.ts#L1081-L1110"],
  },
  PROTOCOL_MODERN_SERVERINFO: {
    why: "With no initialize, clients learn the server's name and version from _meta on each result.",
    sources: [`${MODERN}/basic/index`],
  },
  PROTOCOL_MODERN_VERSION_ERROR: {
    why: "Version negotiation in 2026-07-28 relies on the -32022 error listing supported versions; clients retry with one of them.",
    sources: [`${MODERN}/basic/versioning`],
  },
  PROTOCOL_MODERN_SURFACE_DIFFERS: {
    why: "A server that exposes different tools per protocol behaves differently depending on which protocol a client speaks.",
  },
  PROTOCOL_VERSION_UNSUPPORTED: {
    why: "SDK-based clients disconnect when the server answers initialize with a protocol version they don't know.",
    sources: [`${SPEC}/basic/lifecycle#version-negotiation`, SDK_TYPES],
  },
  PROTOCOL_VERSION_OLD: {
    why: "Servers on older revisions can't use features added later (e.g. structured output, elicitation).",
    sources: [`${SPEC}/basic/lifecycle#version-negotiation`],
  },
  PROTOCOL_VERSIONS_REJECTED: {
    why: "Clients request different protocol versions. A server should answer each supported version, and for unsupported ones reply with a version it does support instead of failing.",
    sources: [`${SPEC}/basic/lifecycle#version-negotiation`],
  },
  PROTOCOL_VERSION_SURFACE_DIFFERS: {
    why: "Clients negotiate different protocol versions; a server that lists different tools per version behaves differently per client.",
    sources: [`${SPEC}/basic/lifecycle#version-negotiation`],
  },
  PROTOCOL_SERVERINFO_MISSING: {
    why: "Clients show serverInfo in their UI and logs; the spec requires name and version.",
    sources: [`${SPEC}/basic/lifecycle#initialization`],
  },
  PROTOCOL_CAPABILITY_UNDECLARED: {
    why: "Clients that follow the spec only call tools/resources/prompts methods when the capability is declared, so undeclared features are invisible to them.",
    sources: [`${SPEC}/basic/lifecycle#capability-negotiation`],
  },
  PROTOCOL_CAPABILITY_BROKEN: {
    why: "A declared capability whose list method fails makes clients show an error or an empty list.",
    sources: [`${SPEC}/basic/lifecycle#capability-negotiation`],
  },
  PROTOCOL_PAGINATION_BROKEN: {
    why: "A cursor that repeats makes clients loop forever or stop with a partial list.",
    sources: [`${SPEC}/server/utilities/pagination`],
  },
  TOOL_NONE: {
    why: "Declaring the tools capability with no tools usually means tools are registered after the transport connects, so clients list an empty set.",
  },
  TOOL_NAME_INVALID: {
    why: "The spec restricts tool names to A-Z a-z 0-9 _ - . and 1-128 characters; clients handle other names unpredictably.",
    sources: [`${SPEC}/server/tools#tool-names`],
  },
  TOOL_NAME_DUPLICATE: {
    why: "Two tools with one name: clients keep one of them or reject the list.",
    sources: [`${SPEC}/server/tools#tool-names`],
  },
  TOOL_NAME_CLIENT_CHARS: {
    why: "Several clients accept fewer characters than the spec (notably no dots) and reject or rename such tools.",
    limits: ["toolNameChars"],
  },
  TOOL_NAME_TOO_LONG: {
    why: "Clients prefix tool names with the server name and cap the total length; long names are rejected or truncated.",
    limits: ["toolNamePrefix", "maxToolNameLength"],
  },
  TOOL_NAME_CLIENT_COLLISION: {
    why: "When a client renames or truncates names, two distinct tools can end up with the same name and one becomes unusable.",
    limits: ["toolNameChars", "maxToolNameLength", "toolNamePrefix"],
  },
  TOOL_COUNT_OVER_LIMIT: {
    why: "Some clients cap how many tools a request can carry.",
    limits: ["maxTools"],
  },
  TOOL_DESCRIPTION_MISSING: {
    why: "Models choose tools by description. A null description is also invalid: the TypeScript SDK rejects the whole tools/list response.",
    sources: [`${SPEC}/server/tools`, SDK_TYPES],
  },
  TOOL_DESCRIPTION_SHORT: {
    why: "Very short descriptions give the model little to decide with.",
  },
  TOOL_DESCRIPTION_TRUNCATED: {
    why: "Some clients truncate long descriptions and server instructions; the model never sees the end.",
    limits: ["maxDescriptionLength"],
  },
  TOOL_STRUCTURED_OUTPUT_HANDLING: {
    why: "Clients differ in whether the model sees structuredContent, the text content, or both.",
    limits: ["structuredContent"],
  },
  TOOL_ANNOTATIONS_CONFLICT: {
    why: "readOnlyHint: true on a tool that also says it's destructive misleads clients that skip confirmation for read-only tools.",
    sources: [`${SPEC}/server/tools#tool-annotations`],
  },
  TOOL_TITLE_MISSING: {
    why: "Clients such as VS Code show the title instead of the raw tool name, and Anthropic's connector directory requires one.",
    sources: [
      "https://github.com/microsoft/vscode/blob/43dd9070f75d527ab38035c0562acbfe9de4209b/src/vs/workbench/contrib/mcp/common/mcpLanguageModelToolContribution.ts#L149",
      "https://claude.com/docs/connectors/building/review-criteria",
    ],
  },
  TOOL_ANNOTATIONS_MISSING: {
    why: "Without annotations the spec tells clients to assume a tool may be destructive and open-world, so read-only tools get needless confirmations and nothing distinguishes real writes.",
    sources: [
      "https://github.com/modelcontextprotocol/modelcontextprotocol/blob/ab3a39c13bd23be691c2760e1c6c5c15a64582e1/schema/2025-11-25/schema.ts#L1168-L1222",
    ],
    limits: ["readOnlySkipsApproval"],
  },
  SCHEMA_MISSING: {
    why: "Every tool needs an inputSchema object; the TypeScript SDK rejects the whole tools/list response otherwise.",
    sources: [`${SPEC}/server/tools`, SDK_TYPES],
  },
  SCHEMA_NOT_OBJECT: {
    why: 'MCP requires "type": "object" at the root of inputSchema and outputSchema; the TypeScript SDK rejects anything else.',
    sources: [`${SPEC}/server/tools`, SDK_TYPES],
  },
  SCHEMA_INVALID: {
    why: "Clients validate or transform schemas; invalid JSON Schema breaks that or gets the tool dropped (e.g. Codex skips tools whose schema it can't parse, such as required: false).",
    sources: [
      "https://json-schema.org/draft/2020-12",
      "https://github.com/openai/codex/blob/8f195c93d7e7acfef95acf273f0e49cce917e291/codex-rs/core/src/mcp_tool_exposure.rs#L116-L121",
    ],
  },
  SCHEMA_REQUIRED_UNKNOWN: {
    why: "A required argument that isn't in properties has no type, so the model can't fill it correctly.",
  },
  SCHEMA_TOP_LEVEL_COMBINATOR: {
    why: "Root-level oneOf/anyOf/allOf/not is valid JSON Schema, but clients handle it differently: Claude Code rewrites it, Cline may drop the server's tools.",
    sources: ["https://code.claude.com/docs/en/mcp"],
  },
  SCHEMA_UNSUPPORTED_KEYWORD: {
    why: "Some clients reject or drop specific JSON Schema keywords.",
    limits: ["schemaUnsupported"],
  },
  SCHEMA_PROPERTY_NAME_REJECTED: {
    why: "Some clients drop tools whose argument names don't match their naming rule.",
    limits: ["inputPropertyNamePattern"],
  },
  SCHEMA_EMPTY_ENUM: {
    why: "An empty enum can't be satisfied, so no call to the tool can be valid.",
    sources: ["https://json-schema.org/draft/2020-12/json-schema-validation#section-6.1.2"],
  },
  SCHEMA_ROOT_COMBINATOR_CLIENT: {
    why: "Some clients reject root-level unions that aren't clearly object-shaped, and drop the server's tools.",
    limits: ["rootCombinatorNonObject"],
  },
  SCHEMA_TYPE_ARRAY_CLIENT: {
    why: "Type arrays are valid JSON Schema, but some clients' argument validation fails on them.",
    limits: ["typeArraysRejected"],
  },
  SCHEMA_KEYWORDS_DROPPED: {
    why: "Some clients strip JSON Schema keywords they don't model, so constraints like pattern or minimum never reach the model.",
    limits: ["schemaDroppedKeywords"],
  },
  SCHEMA_TOO_LARGE: {
    why: "Some clients compact large schemas, removing descriptions and nested definitions the model needs.",
    limits: ["maxSchemaChars"],
  },
  SCHEMA_PROPERTY_NO_TYPE: {
    why: "Arguments without a type leave the model guessing what to send.",
  },
  SCHEMA_TOO_DEEP: {
    why: "Models fill deeply nested arguments unreliably.",
  },
  DISCOVERY_TOOLS_LIST_CHANGED: {
    why: "Clients that ignore tools/list_changed never see tools added during a session.",
    features: ["toolsListChanged"],
  },
  DISCOVERY_RESOURCES_LIST_CHANGED: {
    why: "Clients that ignore resources/list_changed never see resources added during a session.",
    features: ["resourcesListChanged"],
  },
  DISCOVERY_PROMPTS_LIST_CHANGED: {
    why: "Clients that ignore prompts/list_changed never see prompts added during a session.",
    features: ["promptsListChanged"],
  },
  DISCOVERY_RESOURCES_UNSUPPORTED: {
    why: "Clients without resource support can't reach anything only exposed as a resource.",
    features: ["resources"],
  },
  DISCOVERY_PROMPTS_UNSUPPORTED: {
    why: "Clients without prompt support can't reach anything only exposed as a prompt.",
    features: ["prompts"],
  },
  RESOURCE_URI_INVALID: {
    why: "Clients read resources back by URI; a URI that doesn't parse can't be read.",
    sources: [`${SPEC}/server/resources`],
  },
  RESOURCE_URI_DUPLICATE: {
    why: "Two resources with one URI: clients show one of them.",
    sources: [`${SPEC}/server/resources`],
  },
  RESOURCE_NAME_MISSING: {
    why: "The spec requires a name on resources and templates, and the TypeScript SDK rejects the list without one.",
    sources: [`${SPEC}/server/resources`, SDK_TYPES],
  },
  RESOURCE_MIME_MISSING: {
    why: "Without mimeType, clients must guess how to display the resource.",
    sources: [`${SPEC}/server/resources`],
  },
  RESOURCE_TEMPLATE_INVALID: {
    why: "Resource templates are RFC 6570 URI templates; the TypeScript SDK throws on unclosed expressions.",
    sources: ["https://www.rfc-editor.org/rfc/rfc6570", `${SPEC}/server/resources#resource-templates`],
  },
  UI_RESOURCE_MIME: {
    why: "MCP Apps hosts only render UI resources served as text/html;profile=mcp-app.",
    sources: [APPS],
    features: ["uiResources"],
  },
  UI_RESOURCE_SCHEME: {
    why: "MCP Apps require UI resources to use the ui:// scheme.",
    sources: [APPS],
  },
  UI_TOOL_LINK_BROKEN: {
    why: "A tool whose UI resource can't be read shows no UI in any host. This check reads the linked resource to be sure.",
    sources: [APPS],
  },
  UI_TOOL_LINK_KEY: {
    why: "MCP Apps hosts read _meta.ui.resourceUri; the flat key is deprecated and openai/outputTemplate is ChatGPT-only.",
    sources: [APPS, "https://developers.openai.com/apps-sdk/reference"],
  },
  UI_CSP_LOCAL_ORIGIN: {
    why: "Hosts sandbox MCP Apps views with the CSP the server declares. Loopback origins from a dev setup leak into production and point users' browsers at their own machine.",
    sources: [APPS],
  },
  UI_CSP_INSECURE: {
    why: "Hosts serve views over HTTPS; browsers block plain-HTTP subresources as mixed content.",
    sources: [APPS],
  },
  UI_VISIBILITY_INVALID: {
    why: 'MCP Apps define visibility as a list of "model" and "app"; other values are undefined behaviour across hosts.',
    sources: [APPS],
  },
  UI_UNSUPPORTED: {
    why: "Clients that don't render MCP Apps show only the text content of UI tools.",
    features: ["uiResources"],
  },
  AUTH_CHALLENGE_MISSING: {
    why: "The WWW-Authenticate challenge tells clients where the protected resource metadata is.",
    sources: [AUTH_DISCOVERY],
    features: ["oauth"],
  },
  AUTH_PRM_MISSING: {
    why: "Without protected resource metadata (RFC 9728) clients can't find the authorization server.",
    sources: [AUTH_DISCOVERY, "https://www.rfc-editor.org/rfc/rfc9728"],
    features: ["oauth"],
  },
  AUTH_PRM_INVALID: {
    why: "The metadata must name the resource (matching the server URL) and its authorization servers, or clients reject it.",
    sources: [AUTH_DISCOVERY, "https://www.rfc-editor.org/rfc/rfc9728#section-3.3"],
    features: ["oauth"],
  },
  AUTH_ASM_MISSING: {
    why: "Clients need authorization server metadata (RFC 8414 or OIDC) to find the authorize and token endpoints.",
    sources: [AUTH_DISCOVERY, "https://www.rfc-editor.org/rfc/rfc8414"],
    features: ["oauth"],
  },
  AUTH_ISSUER_MISMATCH: {
    why: "Clients must reject authorization server metadata whose issuer differs from the advertised one.",
    sources: [AUTH_DISCOVERY],
    features: ["oauth"],
  },
  AUTH_PKCE_S256_MISSING: {
    why: "MCP clients must refuse to proceed unless the authorization server advertises PKCE S256.",
    sources: [AUTH_DISCOVERY, "https://developers.openai.com/apps-sdk/build/auth"],
    features: ["oauth"],
  },
  AUTH_CLIENT_REGISTRATION: {
    why: "Without Client ID Metadata Documents or Dynamic Client Registration, every user must create OAuth credentials by hand. DCR alone is deprecated in 2026-07-28.",
    sources: [AUTH_REGISTRATION],
    features: ["cimd", "dcr"],
  },
  AUTH_INSECURE_URL: {
    why: "OAuth 2.1 requires HTTPS outside loopback, and hosted clients refuse plain HTTP.",
    sources: ["https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1"],
  },
  CALL_RESULT_INVALID: {
    why: "SDK-based clients validate tools/call results; an invalid one is an error in the client, not a result the model sees.",
    sources: [`${SPEC}/server/tools#tool-result`, SDK_TYPES],
  },
  CALL_OUTPUT_SCHEMA_MISMATCH: {
    why: "A tool that declares outputSchema must return structuredContent that conforms to it; SDK clients check this and fail the call otherwise.",
    sources: [`${SPEC}/server/tools#output-schema`],
  },
  CALL_STRUCTURED_WITHOUT_TEXT: {
    why: "Clients that don't read structuredContent only see the text content; the spec recommends a serialized copy.",
    sources: [`${SPEC}/server/tools#structured-content`],
    limits: ["structuredContent"],
  },
  CALL_RESULT_TOO_LARGE: {
    why: "Clients cap how much of a tool result the model sees and truncate or offload the rest.",
    limits: ["maxToolResult"],
  },
  CALL_SLOW: {
    why: "Clients cancel tool calls after a timeout; calls near the limit fail under load.",
    limits: ["toolTimeoutMs"],
  },
  SDK_OUTDATED: {
    why: "Most protocol and compatibility fixes arrive through SDK releases. The tool reads the server's project to find its SDK and installed version, looks up the latest release, and prints the upgrade command for your package manager.",
    sources: ["https://unpkg.com/@modelcontextprotocol/sdk@1.30.1/dist/esm/types.js", "https://pypi.org/project/mcp-types/2.2.0/"],
  },
  CALL_FAILED: {
    why: "Calls that error are listed for context. With --probe-calls the arguments are generated from the schema, so errors may be expected.",
  },
};
