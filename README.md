# mcp-use-compat

Check an MCP server for problems that break it in specific MCP clients (Claude, ChatGPT, Cursor, VS Code, OpenCode) before your users find them.

It connects to your server once, records what the server actually exposes, and runs checks against that. Client-specific results come from per-client profiles where every fact links to its source (docs, source code, or maintainer statements), so a report tells you *what* breaks, *where*, and *how we know*.

```
npx mcp-use-compat -- node dist/server.js
```

## What it finds

A few real examples from the checks:

- `description: null` on a tool: allowed to be absent, not null. The TypeScript SDK rejects the **whole** `tools/list` response, so SDK-based clients see no tools at all.
- `files.read` and `files_read` in the same server: Cursor, VS Code and OpenCode replace `.` with `_`, so the two tools collide and one disappears.
- A 60+ character tool name: Cursor and VS Code count their server prefix too, then truncate the name the model sees.
- A top-level argument called `"start time"`: Claude Code can drop the whole tool (behind a flag since v2.1.216).
- Logs on stdout: SDK clients drop the lines, and a log write without a newline corrupts the next protocol message.
- An OAuth server without `code_challenge_methods_supported`: spec-following clients must refuse to connect, and ChatGPT does.
- A UI tool linked only via `openai/outputTemplate`: VS Code only reads `_meta.ui.resourceUri` and shows no UI.

## Usage

```bash
# stdio: pass the full command after --
npx mcp-use-compat -- node dist/server.js
npx mcp-use-compat -- uv run server.py
npx mcp-use-compat --env API_KEY=test -- npx -y @acme/mcp-server

# Streamable HTTP
npx mcp-use-compat --url https://example.com/mcp
npx mcp-use-compat --url https://example.com/mcp --header "Authorization: Bearer $TOKEN"

# Only some clients (ids or aliases: claude, vscode, ...)
npx mcp-use-compat --clients cursor,vscode -- node dist/server.js

# Save what the server exposed, re-check it later without running it
npx mcp-use-compat --save-snapshot snap.json -- node dist/server.js
npx mcp-use-compat --from-snapshot snap.json

# Also try every published protocol version
npx mcp-use-compat --version-matrix -- node dist/server.js
```

### Other commands

```bash
# Compare two snapshots: breaking vs non-breaking changes, plus new compatibility failures
npx mcp-use-compat check --save-snapshot before.json -- node old/server.js
npx mcp-use-compat check --save-snapshot after.json -- node dist/server.js
npx mcp-use-compat diff before.json after.json          # exits 1 on breaking changes

# Call one tool yourself and check its result
npx mcp-use-compat call get_quote --args '{"symbol":"INFY"}' -- node dist/server.js

# OAuth-protected servers: log in once (browser), then check with the stored token
npx mcp-use-compat oauth login --url https://example.com/mcp
npx mcp-use-compat check --oauth --url https://example.com/mcp
npx mcp-use-compat oauth status
npx mcp-use-compat oauth logout --url https://example.com/mcp

# Why does a check exist, and which client facts does it use?
npx mcp-use-compat explain TOOL_NAME_TOO_LONG

npx mcp-use-compat list-checks
npx mcp-use-compat list-clients
```

`oauth login` runs the flow MCP clients use and reports each step: discovery, client registration (CIMD, DCR, or `--client-id` for a pre-registered client), the authorization request (PKCE S256, `resource`), the callback (`state`, `iss`), the token exchange, and an authenticated `tools/list`. Credentials are stored in `~/.config/mcp-use-compat/oauth.json`, readable only by you. Runs with `--oauth` never register a client or open a browser; they refresh stored tokens or tell you to log in again.

`diff` treats as breaking: removed tools, resources, templates, prompts or capabilities; new required arguments; arguments that become required or change type; removed enum values; removed or no-longer-guaranteed output fields; and compatibility errors that are new in the second snapshot. Description and annotation changes are reported as notable.

| Option | Default | |
|---|---|---|
| `--url <url>` | | Streamable HTTP endpoint instead of a stdio command |
| `-c, --clients <list>` | all | Comma-separated client ids or aliases |
| `-f, --format <md\|json\|github>` | `md` | `json` follows [`schema/report.schema.json`](schema/report.schema.json); `github` prints workflow annotations and writes a job summary |
| `-o, --out <file>` | stdout | Write the report to a file |
| `--fail-on <spec>` | `error` | `error`, `warn`, `none`, or check ids / globs / areas (`TOOL_*,auth`) |
| `--timeout <ms>` | `10000` | Per request; startup gets twice this |
| `--env KEY=VAL` | | Environment for the stdio server (repeatable) |
| `--header "Name: Value"` | | HTTP header for `--url` (repeatable) |
| `--cwd <dir>` | `.` | Working directory for the stdio server |
| `--no-auth-probe` | | Skip the unauthenticated OAuth discovery requests |
| `--save-snapshot <file>` / `--from-snapshot <file>` | | Save or re-check a snapshot |
| `--probe-calls` | | Call read-only tools (see below) and check their results: valid result shape, `structuredContent` matching `outputSchema`, a text fallback |
| `--oauth` | | Use credentials from `oauth login` (with `--url`) |
| `--version-matrix` | | Also connect with each published handshake version (2024-11-05 to 2025-11-25), one session each; 2026-07-28 is always probed |

Exit codes: `0` nothing matched `--fail-on` · `1` something did · `2` usage error · `3` the server could not be started or reached.

### What it sends to your server

`initialize`, the `tools`, `resources`, resource template and `prompts` list methods, `resources/read` for UI resources that tools link to, and `server/discover` (with `--version-matrix`, one extra `initialize` + `tools/list` per protocol version). Over HTTP it also makes one unauthenticated `initialize` POST and GETs the OAuth well-known metadata URLs.

It only calls tools when you ask: `--probe-calls` calls tools that explicitly declare `readOnlyHint: true` (never ones that also claim to be destructive or are named like writes, e.g. `place_order`), with the minimal arguments their schema requires; `call <tool>` calls exactly the tool you name.

## In CI

Copy [`examples/github-workflow.yml`](examples/github-workflow.yml). With `--format github`, findings show up as annotations on the pull request.

## Example report (excerpt)

```markdown
| Status | Check | Subject | Message |
|---|---|---|---|
| ❌ FAIL | `TOOL_NAME_CLIENT_COLLISION` | files.read, files_read | "files.read" and "files_read" both become "files_read" in Cursor, so only one of them is usable. |
| ⚠️ WARN | `TOOL_NAME_TOO_LONG` | create_calendar_event_… | With Cursor's server prefix ("bad-tools", …) the name is 68 characters; the limit is 60 and Cursor truncates it and appends a hash, so the model sees a mangled name. |
```

## How results are decided

- **FAIL / WARN only for what the server was seen doing**: a null description, a colliding name, a missing OAuth field. A client limitation that your server doesn't trigger is never reported as a failure.
- **Client-specific results cite a source.** If a client's behaviour is unknown, the check doesn't guess; it passes.
- **INFO** covers things worth knowing that break nothing today (e.g. no `server/discover` yet).

## Clients

<!-- clients:start -->
| Client | stdio | HTTP | Tool list refresh | Resources | Prompts | OAuth | CIMD | MCP Apps UI | Limits |
|---|---|---|---|---|---|---|---|---|---|
| Claude Desktop / claude.ai | [✅](https://claude.com/docs/connectors/building/mcpb) | [✅](https://claude.com/docs/connectors/building/index) | ? | [✅](https://claude.com/docs/connectors/building/index) | [✅](https://claude.com/docs/connectors/building/index) | [✅](https://claude.com/docs/connectors/building/index) | [✅](https://claude.com/docs/connectors/building/authentication) | [✅](https://claude.com/docs/connectors/building/mcp-apps/getting-started) | chars `[A-Za-z0-9_-]` (unknown) |
| Claude Code | [✅](https://code.claude.com/docs/en/mcp) | [✅](https://code.claude.com/docs/en/mcp) | [✅](https://code.claude.com/docs/en/mcp) | [✅](https://code.claude.com/docs/en/mcp) | [✅](https://code.claude.com/docs/en/mcp) | [✅](https://code.claude.com/docs/en/mcp) | [✅](https://code.claude.com/docs/en/mcp) | [❌](https://code.claude.com/docs/en/mcp) | prefix `mcp__{server}__`; name ≤ 128 (unknown); chars `[A-Za-z0-9_-]` (unknown); descriptions ≤ 2048 chars |
| ChatGPT (Apps SDK / connectors) | [⚠️](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt) | [✅](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt) | [❌](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt) | ? | ? | [✅](https://developers.openai.com/apps-sdk/build/auth) | [✅](https://developers.openai.com/apps-sdk/build/auth) | [✅](https://developers.openai.com/apps-sdk/reference) | – |
| Cursor | [✅](https://cursor.com/docs/mcp) | [✅](https://cursor.com/docs/mcp) | [⚠️](https://forum.cursor.com/t/mcp-server-regression-does-not-reload-tools-disconnect-does-nothing-ignores-mcp-json-changes-etc/166216) | [✅](https://cursor.com/docs/mcp) | [✅](https://cursor.com/docs/mcp) | [✅](https://cursor.com/docs/mcp) | ? | [✅](https://cursor.com/docs/mcp) | prefix `{server}`; name ≤ 60 (truncateWithHash); chars `[A-Za-z0-9_-]` (replace) |
| VS Code (GitHub Copilot) | [✅](https://code.visualstudio.com/api/extension-guides/ai/mcp) | [✅](https://code.visualstudio.com/api/extension-guides/ai/mcp) | [✅](https://github.com/microsoft/vscode/blob/a460613c57b4c1eb2bc8edc97be694e05ae286b2/src/vs/workbench/contrib/mcp/common/mcpServer.ts#L1224-L1227) | [✅](https://code.visualstudio.com/api/extension-guides/ai/mcp) | [✅](https://code.visualstudio.com/api/extension-guides/ai/mcp) | [✅](https://code.visualstudio.com/api/extension-guides/ai/mcp) | [✅](https://github.com/microsoft/vscode/blob/a460613c57b4c1eb2bc8edc97be694e05ae286b2/src/vs/workbench/api/browser/mainThreadAuthentication.ts#L178-L192) | [✅](https://code.visualstudio.com/api/extension-guides/ai/mcp) | prefix `mcp_{server}_`; name ≤ 64 (truncate); chars `[A-Za-z0-9_-]` (replace); ≤ 128 tools |
| OpenCode | [✅](https://opencode.ai/docs/mcp-servers/) | [✅](https://github.com/anomalyco/opencode/blob/a42f393c850bec0c0f395fb91bf19b1ee8b31666/packages/opencode/src/mcp/index.ts#L268-L283) | [✅](https://github.com/anomalyco/opencode/blob/a42f393c850bec0c0f395fb91bf19b1ee8b31666/packages/opencode/src/mcp/index.ts#L461-L471) | [✅](https://github.com/anomalyco/opencode/blob/a42f393c850bec0c0f395fb91bf19b1ee8b31666/packages/opencode/src/mcp/catalog.ts#L130-L134) | [✅](https://github.com/anomalyco/opencode/blob/a42f393c850bec0c0f395fb91bf19b1ee8b31666/packages/opencode/src/mcp/catalog.ts#L122-L126) | [✅](https://opencode.ai/docs/mcp-servers/) | ? | [❌](https://github.com/anomalyco/opencode/blob/a42f393c850bec0c0f395fb91bf19b1ee8b31666/packages/opencode/src/mcp/) | prefix `{server}_`; chars `[A-Za-z0-9_-]` (replace) |

✅ supported · ❌ not supported · ⚠️ partial or unreliable · ? unknown. Every mark links to its source. Facts verified 2026-09-26; run `mcp-use-compat --list-clients` for details.
<!-- clients:end -->

Client behaviour changes quickly. If a fact is wrong or stale, please open an issue or PR against `src/profiles/` with a source.

## Checks

<!-- checks:start -->
**transport**

| Check | What it verifies |
|---|---|
| `TRANSPORT_CONNECT_FAILED` | The server starts and answers initialize |
| `TRANSPORT_AUTH_REQUIRED` | Notes when an HTTP server needs credentials before initialize |
| `TRANSPORT_STDOUT_POLLUTION` | stdout carries only JSON-RPC messages |
| `TRANSPORT_SLOW_STARTUP` | initialize answers within 5s of launch |
| `TRANSPORT_SLOW_LIST` | list requests answer within 3s |
| `TRANSPORT_STDERR_ERRORS` | stderr shows no errors during the session |

**protocol**

| Check | What it verifies |
|---|---|
| `PROTOCOL_MODERN_ONLY` | Server still accepts the initialize handshake most clients use |
| `PROTOCOL_DISCOVER_MISSING` | Server implements server/discover (required from protocol 2026-07-28) |
| `PROTOCOL_MODERN_RESULT_TYPE` | 2026-07-28 results carry a valid resultType |
| `PROTOCOL_MODERN_CACHE_FIELDS` | 2026-07-28 list and discover results carry ttlMs and cacheScope |
| `PROTOCOL_MODERN_SERVERINFO` | 2026-07-28 results identify the server in _meta |
| `PROTOCOL_MODERN_VERSION_ERROR` | 2026-07-28 servers reject unsupported versions with UnsupportedProtocolVersion (-32022) |
| `PROTOCOL_MODERN_SURFACE_DIFFERS` | Tools are the same over the initialize handshake and 2026-07-28 |
| `PROTOCOL_VERSION_UNSUPPORTED` | Negotiated protocol version is one the SDK supports |
| `PROTOCOL_VERSION_OLD` | Server speaks the latest protocol version |
| `PROTOCOL_VERSIONS_REJECTED` | Server handles every published protocol version clients may request (--version-matrix) |
| `PROTOCOL_VERSION_SURFACE_DIFFERS` | The tool list is the same whichever protocol version a client negotiates |
| `PROTOCOL_SERVERINFO_MISSING` | initialize returns serverInfo with name and version |
| `PROTOCOL_CAPABILITY_UNDECLARED` | Every feature the server serves is declared in capabilities |
| `PROTOCOL_CAPABILITY_BROKEN` | Every declared capability's list method works |
| `PROTOCOL_PAGINATION_BROKEN` | List pagination terminates |

**tools**

| Check | What it verifies |
|---|---|
| `TOOL_NONE` | A server declaring tools exposes at least one |
| `TOOL_NAME_INVALID` | Tool names match the MCP spec format (A-Z a-z 0-9 _ - ., 1-128 chars) |
| `TOOL_NAME_DUPLICATE` | Tool names are unique |
| `TOOL_NAME_CLIENT_CHARS` | Tool names use only characters each client accepts as-is |
| `TOOL_NAME_TOO_LONG` | Prefixed tool names fit each client's length limit |
| `TOOL_NAME_CLIENT_COLLISION` | Tool names stay unique after a client renames or truncates them |
| `TOOL_COUNT_OVER_LIMIT` | Tool count fits each client's limit |
| `TOOL_DESCRIPTION_MISSING` | Every tool has a non-empty description |
| `TOOL_DESCRIPTION_SHORT` | Tool descriptions are at least 20 characters |
| `TOOL_DESCRIPTION_TRUNCATED` | Tool descriptions and server instructions fit each client's length limit |
| `TOOL_STRUCTURED_OUTPUT_HANDLING` | Notes how each client passes structured tool output to the model |
| `TOOL_ANNOTATIONS_CONFLICT` | Tool annotations are consistent with each other and with the tool's name |
| `TOOL_ANNOTATIONS_MISSING` | Read-only tools declare readOnlyHint |

**schema**

| Check | What it verifies |
|---|---|
| `SCHEMA_MISSING` | Every tool has an inputSchema object |
| `SCHEMA_NOT_OBJECT` | inputSchema and outputSchema have type "object" at the root |
| `SCHEMA_INVALID` | Schemas are valid JSON Schema |
| `SCHEMA_REQUIRED_UNKNOWN` | required only lists declared properties |
| `SCHEMA_TOP_LEVEL_COMBINATOR` | inputSchema has no root-level oneOf/anyOf/allOf/not |
| `SCHEMA_UNSUPPORTED_KEYWORD` | Schemas avoid keywords a client rejects or drops |
| `SCHEMA_PROPERTY_NAME_REJECTED` | Top-level input property names match each client's rules |
| `SCHEMA_PROPERTY_NO_TYPE` | Every input property declares a type |
| `SCHEMA_TOO_DEEP` | inputSchema nests at most 5 levels |

**discovery**

| Check | What it verifies |
|---|---|
| `DISCOVERY_TOOLS_LIST_CHANGED` | Notes clients that ignore tools/list_changed when the server declares it |
| `DISCOVERY_RESOURCES_LIST_CHANGED` | Notes clients that ignore resources/list_changed when the server declares it |
| `DISCOVERY_PROMPTS_LIST_CHANGED` | Notes clients that ignore prompts/list_changed when the server declares it |
| `DISCOVERY_RESOURCES_UNSUPPORTED` | Clients without resources support are flagged when the server exposes resources |
| `DISCOVERY_PROMPTS_UNSUPPORTED` | Clients without prompts support are flagged when the server exposes prompts |

**resources**

| Check | What it verifies |
|---|---|
| `RESOURCE_URI_INVALID` | Resource URIs are absolute and parse |
| `RESOURCE_URI_DUPLICATE` | Resource URIs are unique |
| `RESOURCE_NAME_MISSING` | Resources and templates have a name (required by the spec) |
| `RESOURCE_MIME_MISSING` | Resources declare a mimeType |
| `RESOURCE_TEMPLATE_INVALID` | Resource templates are valid RFC 6570 URI templates |

**ui**

| Check | What it verifies |
|---|---|
| `UI_RESOURCE_MIME` | UI resources use text/html;profile=mcp-app |
| `UI_RESOURCE_SCHEME` | UI resources use the ui:// scheme |
| `UI_TOOL_LINK_BROKEN` | UI resources that tools link to can be read |
| `UI_TOOL_LINK_KEY` | Tools link UI with _meta.ui.resourceUri |
| `UI_CSP_LOCAL_ORIGIN` | A remote server's UI resources don't point their CSP at localhost |
| `UI_CSP_INSECURE` | UI resource CSP origins use HTTPS |
| `UI_VISIBILITY_INVALID` | Tool _meta.ui.visibility only uses "model" and "app" |
| `UI_UNSUPPORTED` | Clients that don't render MCP Apps are flagged when tools rely on UI |

**auth**

| Check | What it verifies |
|---|---|
| `AUTH_CHALLENGE_MISSING` | 401 responses carry a WWW-Authenticate challenge |
| `AUTH_PRM_MISSING` | Protected resource metadata (RFC 9728) is discoverable |
| `AUTH_PRM_INVALID` | Protected resource metadata names the resource and its authorization servers |
| `AUTH_ASM_MISSING` | Authorization server metadata (RFC 8414 / OIDC) is discoverable |
| `AUTH_ISSUER_MISMATCH` | Authorization server metadata issuer matches the advertised issuer |
| `AUTH_PKCE_S256_MISSING` | Authorization server advertises PKCE S256 |
| `AUTH_CLIENT_REGISTRATION` | Clients can register themselves (CIMD or DCR) |
| `AUTH_INSECURE_URL` | Remote servers and OAuth endpoints use HTTPS |

**calls**

| Check | What it verifies |
|---|---|
| `CALL_RESULT_INVALID` | tools/call results match the MCP result schema |
| `CALL_OUTPUT_SCHEMA_MISMATCH` | Tools with an outputSchema return matching structuredContent |
| `CALL_STRUCTURED_WITHOUT_TEXT` | Structured results also carry a text copy |
| `CALL_FAILED` | Reports tool calls that errored |
<!-- checks:end -->

## Protocol versions

The checks run over the `initialize` handshake, which is what current clients use. Every published revision is covered:

- **2024-11-05 → 2025-11-25** (the `initialize` handshake): checks run over the latest; `--version-matrix` also connects once per revision and reports versions the server rejects, answers incorrectly, or serves different tools on.
- **2026-07-28** (stateless): always probed in a separate session with the `_meta` envelope and required HTTP headers. For servers that speak it, the tool checks `resultType`, `ttlMs`/`cacheScope`, `serverInfo` in `_meta`, the `-32022` unsupported-version error, and whether tools match the handshake's. Servers that *only* speak 2026-07-28 get every check run over the new protocol.

With `--version-matrix` the report shows a line like `Protocol versions: 2024-11-05 ✅ · 2025-03-26 ✅ · 2025-06-18 ✅ · 2025-11-25 ✅ · 2026-07-28 ❌`.

## Development

```bash
npm install
npm test          # unit, fixture and end-to-end tests
npm run readme    # regenerate the Clients and Checks sections above
```

## License

MIT
