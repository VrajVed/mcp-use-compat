# mcpkit

Find the problems that break an MCP server in specific MCP clients, before your users do.

MCP is one protocol, but every client reads it differently: Claude Desktop, Claude Code, ChatGPT, Cursor, VS Code, OpenCode, Codex, Gemini CLI, Cline, Goose, Continue and Windsurf each rename, truncate, validate, cache and render things their own way. `mcpkit` connects to your server, records what it actually exposes, and checks it against sourced facts about each client. Every client-specific result links to where the fact comes from (docs, pinned client source, or maintainer statements), so a report tells you what breaks, where, and how we know.

```bash
npx @vrajved/mcpkit -- node dist/server.js
```

## Installation

Requires Node.js 20 or newer. Your server can be written in any language.

```bash
npx @vrajved/mcpkit --help              # run without installing
npm install -g @vrajved/mcpkit          # install the CLI globally
npm install --save-dev @vrajved/mcpkit  # add it to a project, e.g. for CI
```

After installing, the command is `mcpkit`. To try the latest code from GitHub: `npm install -g github:VrajVed/mcpkit`.

## Quick start

```bash
# A local server: put its start command after --
mcpkit -- node dist/server.js
mcpkit -- uv run server.py

# A remote server
mcpkit --url https://example.com/mcp

# Is its MCP SDK up to date?
mcpkit upgrade -- node dist/server.js
```

You get a report per client, with a fix for every problem, and an exit code for CI. New here? Start with the [getting started guide](docs/getting-started.md).

## What it finds

Real examples:

- **`description: null` on a tool.** Absent is allowed, null is not: the TypeScript SDK rejects the whole `tools/list` response, so SDK-based clients see no tools at all.
- **`files.read` and `files_read` in one server.** Cursor, VS Code and OpenCode replace `.` with `_`, so the two collide and one tool disappears.
- **Long tool names.** Cursor, VS Code and Gemini CLI count their server prefix and then truncate, so the model sees a mangled name.
- **A large input schema.** Codex compacts schemas over 5,000 characters and strips your descriptions first.
- **A root-level `anyOf` without `"type": "object"`.** Cline fails to register it and drops every tool from the server.
- **Structured results without a text copy.** Gemini CLI, Goose and Continue only pass text to the model, so it gets an empty result.
- **Logs on stdout.** SDK clients drop the lines, and a log write without a newline corrupts the next protocol message.
- **OAuth metadata without PKCE S256.** Spec-following clients must refuse to connect, and ChatGPT does.
- **An outdated SDK.** `mcp` 1.27.2 when 2.2.0 is out: you get the exact upgrade command for your package manager, and `upgrade --apply` can run it and re-check the server.

## Commands

| Command | Short | What it does |
|---|---|---|
| `check` (default) | | Connect to a server and report issues per client |
| `upgrade` | `up` | Find the server's MCP SDK, compare with the latest release, print or apply the upgrade |
| `diff <before> <after>` | | Compare two snapshots: breaking changes and new compatibility failures |
| `call <tool>` | | Call one tool and check its result |
| `oauth login \| status \| logout` | | Log in to an OAuth-protected server and reuse the token |
| `fix <snapshot>` | | Apply safe mechanical fixes to tool definitions |
| `explain <CHECK_ID>` | `ex` | Why a check exists, its sources, and the client facts it uses |
| `list-checks`, `list-clients` | `checks`, `clients` | Print all checks, or the client profiles and how fresh their facts are |

Every option also has a short form (for example `-u` for `--url`, `-m` for `--version-matrix`); see the tables below or `mcpkit <command> --help`.

## Guides

- [Getting started](docs/getting-started.md): install, first check, troubleshooting
- [Reading reports](docs/reading-reports.md): statuses, `--fail-on`, output formats, the JSON report
- [Using it in CI](docs/ci.md): GitHub Actions, gating builds, artifacts
- [Comparing releases](docs/snapshots-and-diff.md): snapshots and `diff`
- [Upgrading your MCP SDK](docs/upgrading-sdks.md): `upgrade` and `--apply`
- [Testing tool calls](docs/tool-calls.md): `--probe-calls` and `call`
- [OAuth-protected servers](docs/oauth.md): `oauth login` and `--oauth`
- [Client profiles](docs/client-profiles.md): how client facts are sourced and used

## Checking a server

```bash
# stdio: pass the full command after --
mcpkit -- node dist/server.js
mcpkit -- uv run server.py
mcpkit --env API_KEY=test -- npx -y @acme/mcp-server

# Streamable HTTP
mcpkit --url https://example.com/mcp
mcpkit --url https://example.com/mcp --header "Authorization: Bearer $TOKEN"

# Only some clients (ids or aliases such as claude, vscode, gemini)
mcpkit --clients cursor,vscode,codex -- node dist/server.js

# Also try every published protocol version, and call read-only tools
mcpkit --version-matrix --probe-calls -- node dist/server.js

# Save what the server exposed and re-check it later without running it
mcpkit --save-snapshot snap.json -- node dist/server.js
mcpkit --from-snapshot snap.json
```

| Option | Short | Default | |
|---|---|---|---|
| `--url <url>` | `-u` | | Streamable HTTP endpoint instead of a stdio command |
| `--clients <list>` | `-c` | all | Comma-separated client ids or aliases |
| `--format <md\|json\|github>` | `-f` | `md` | `json` follows [`schema/report.schema.json`](schema/report.schema.json); `github` prints workflow annotations and a job summary |
| `--out <file>` | `-o` | stdout | Write the report to a file |
| `--fail-on <spec>` | `-F` | `error` | `error`, `warn`, `none`, or check ids, globs and areas (`TOOL_*,auth`) |
| `--timeout <ms>` | `-t` | `10000` | Per request; startup gets twice this |
| `--env KEY=VAL` | `-e` | | Environment for the stdio server (repeatable) |
| `--header "Name: Value"` | `-H` | | HTTP header for `--url` (repeatable) |
| `--cwd <dir>` | `-C` | `.` | Working directory for the stdio server |
| `--oauth` | `-A` | | Use credentials from `oauth login` (with `--url`) |
| `--probe-calls` | `-p` | | Call tools that declare `readOnlyHint: true` and check their results |
| `--version-matrix` | `-m` | | Also connect with each handshake version (2024-11-05 to 2025-11-25) |
| `--save-snapshot <file>` | `-s` | | Save what the server exposed |
| `--from-snapshot <file>` | `-r` | | Re-check a saved snapshot instead of connecting |
| `--no-auth-probe` | `-N` | | Skip the unauthenticated OAuth discovery requests |
| `--offline` | `-O` | | Don't look up the latest SDK versions |

Short flags combine like any CLI, for example `mcpkit -mp -c cursor,vscode -- node dist/server.js`.

Exit codes: `0` nothing matched `--fail-on`, `1` something did, `2` usage error, `3` the server could not be started or reached.

**What it sends to your server:** `initialize`, the tools, resources, resource templates and prompts list methods, `resources/read` for UI resources that tools link to, and a separate 2026-07-28 session (`server/discover` and the same list methods). Over HTTP it also makes one unauthenticated `initialize` POST and GETs the OAuth well-known URLs. For stdio servers it reads the project's manifest and lockfiles to find the MCP SDK, and looks up the latest SDK release on the package registry (skip with `--offline`).

**Tool calls happen only when you ask.** `--probe-calls` calls tools that explicitly declare `readOnlyHint: true`, never ones that also claim to be destructive or are named like writes (for example `place_order`), with the minimal arguments their schema requires. `call <tool>` calls exactly the tool you name:

```bash
mcpkit call get_quote --args '{"symbol":"INFY"}' -- node dist/server.js
```

## Keeping the SDK current

```bash
mcpkit upgrade -- node dist/server.js            # what to upgrade, and the command
mcpkit upgrade --apply -- node dist/server.js    # run it, then re-check the server
mcpkit upgrade --apply --major -- node dist/server.js
```

Options: `-a, --apply`, `-M, --major`, `-d, --dir <path>`, `-C, --cwd <dir>`, `-e, --env KEY=VAL`, `-O, --offline`, `-t, --timeout <ms>`. `up` is short for `upgrade`.

`upgrade` finds the server's project from its command and working directory and detects the MCP SDK it uses: `@modelcontextprotocol/sdk`, `@modelcontextprotocol/server`, `mcp-use`, `fastmcp` and others on npm, `mcp` and `fastmcp` on PyPI, the Go SDKs and `rmcp`. It reads the installed version (`node_modules`, the virtualenv, lockfiles), looks up the latest release, and prints the command for the package manager the project uses (npm, pnpm, yarn, bun, uv, poetry, pipenv, pip, go or cargo).

`--apply` runs minor upgrades, and major ones only with `--major`. It updates `==` pins in requirements files, and when you pass the server command it checks the server before and after, then reports the protocol change and any breaking changes to its tools. Moving from `@modelcontextprotocol/sdk` v1 to the v2 packages is a migration, so it is explained but never applied automatically.

`check` uses the same detection: when a server negotiates an old protocol version, the finding includes the exact upgrade command.

## Comparing versions

```bash
mcpkit check --save-snapshot before.json -- node old/server.js
mcpkit check --save-snapshot after.json -- node dist/server.js
mcpkit diff before.json after.json    # exits 1 on breaking changes
```

Options: `-F, --fail-on <breaking|any|none>`, `-f, --format <md|json|github>`, `-o, --out <file>`.

Breaking: removed tools, resources, templates, prompts or capabilities; new required arguments; arguments that become required or change type; removed enum values; removed or no-longer-guaranteed output fields; and compatibility errors that are new in the second snapshot. Description and annotation changes are reported as notable.

## OAuth-protected servers

```bash
mcpkit oauth login --url https://example.com/mcp
mcpkit check --oauth --url https://example.com/mcp
mcpkit oauth status
mcpkit oauth logout --url https://example.com/mcp
```

Options for `oauth login`: `-u, --url`, `-i, --client-id`, `-k, --client-secret`, `-P, --callback-port`, `-m, --client-metadata-url`, `-s, --scope`, `-n, --no-browser`, `-t, --timeout`.

`oauth login` runs the flow MCP clients use and reports each step: discovery, client registration (Client ID Metadata Documents, Dynamic Client Registration, or `--client-id` for a pre-registered client), the authorization request (PKCE S256 and `resource`), the callback (`state` and `iss`), the token exchange, and an authenticated `tools/list`. Credentials are stored in `~/.config/mcpkit/oauth.json`, readable only by you. Runs with `--oauth` never register a client or open a browser; they refresh stored tokens or tell you to log in again.

## Fixing tool definitions

```bash
mcpkit fix snap.json --out fixed-tools.json
mcpkit fix snap.json --rename    # also rename tools that clients would rewrite
```

Options: `-o, --out <file>`, `-j, --json`, `-r, --rename`.

`fix` never invents content. It removes `description: null`, adds a missing `inputSchema`, sets an object-shaped root to `"type": "object"`, drops `required` entries that aren't properties, and removes invalid `required` values and empty `enum`s. Anything that needs judgement, such as a non-object root schema or a missing description, is listed as a TODO. Tool definitions live in your code, so apply the listed changes there.

## In CI

Copy [`examples/github-workflow.yml`](examples/github-workflow.yml). With `--format github`, findings show up as annotations on the pull request, and `diff` can gate releases on breaking changes.

## How results are decided

- **FAIL and WARN only for what the server was seen doing:** a null description, a colliding name, a missing OAuth field. A client limitation your server doesn't trigger is never reported as a failure.
- **Client-specific results cite a source.** If a client's behaviour is unknown, the check doesn't guess; it passes.
- **INFO** covers things worth knowing that break nothing today, such as no `server/discover` yet.
- Rules borrowed from other linters were checked against client source before being adopted. Most were wrong or unsourced and were left out.

Example rows from a report:

```markdown
| Status | Check | Subject | Message |
|---|---|---|---|
| ❌ FAIL | `TOOL_NAME_CLIENT_COLLISION` | files.read, files_read | "files.read" and "files_read" both become "files_read" in Cursor, so only one of them is usable. |
| ⚠️ WARN | `SCHEMA_TOO_LARGE` | create_update_strategy | inputSchema is about 12540 characters; OpenAI Codex CLI compacts schemas over 5000. |
| ⚠️ WARN | `SDK_OUTDATED` | mcp | mcp 1.27.2 → 2.2.0 (major version: check the changelog for breaking changes); adds protocol 2026-07-28. |
```

## Clients

<!-- clients:start -->
| Client | stdio | HTTP | Tool list refresh | Resources | Prompts | OAuth | CIMD | MCP Apps UI | Limits |
|---|---|---|---|---|---|---|---|---|---|
| Claude Desktop / claude.ai | [✅](https://claude.com/docs/connectors/building/mcpb) | [✅](https://claude.com/docs/connectors/building/index) | ? | [✅](https://claude.com/docs/connectors/building/index) | [✅](https://claude.com/docs/connectors/building/index) | [✅](https://claude.com/docs/connectors/building/index) | [✅](https://claude.com/docs/connectors/building/authentication) | [✅](https://claude.com/docs/connectors/building/mcp-apps/getting-started) | chars `[A-Za-z0-9_-]` (unknown) |
| Claude Code | [✅](https://code.claude.com/docs/en/mcp) | [✅](https://code.claude.com/docs/en/mcp) | [✅](https://code.claude.com/docs/en/mcp) | [✅](https://code.claude.com/docs/en/mcp) | [✅](https://code.claude.com/docs/en/mcp) | [✅](https://code.claude.com/docs/en/mcp) | [✅](https://code.claude.com/docs/en/mcp) | [❌](https://code.claude.com/docs/en/mcp) | prefix `mcp__{server}__`; name ≤ 128 (unknown); chars `[A-Za-z0-9_-]` (unknown); descriptions ≤ 2048 chars |
| ChatGPT (Apps SDK / connectors) | [⚠️](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt) | [✅](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt) | [❌](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt) | ? | ? | [✅](https://developers.openai.com/apps-sdk/build/auth) | [✅](https://developers.openai.com/apps-sdk/build/auth) | [✅](https://developers.openai.com/apps-sdk/reference) | none |
| Cursor | [✅](https://cursor.com/docs/mcp) | [✅](https://cursor.com/docs/mcp) | [⚠️](https://forum.cursor.com/t/mcp-server-regression-does-not-reload-tools-disconnect-does-nothing-ignores-mcp-json-changes-etc/166216) | [✅](https://cursor.com/docs/mcp) | [✅](https://cursor.com/docs/mcp) | [✅](https://cursor.com/docs/mcp) | ? | [✅](https://cursor.com/docs/mcp) | prefix `{server}`; name ≤ 60 (truncateWithHash); chars `[A-Za-z0-9_-]` (replace) |
| VS Code (GitHub Copilot) | [✅](https://code.visualstudio.com/api/extension-guides/ai/mcp) | [✅](https://code.visualstudio.com/api/extension-guides/ai/mcp) | [✅](https://github.com/microsoft/vscode/blob/a460613c57b4c1eb2bc8edc97be694e05ae286b2/src/vs/workbench/contrib/mcp/common/mcpServer.ts#L1224-L1227) | [✅](https://code.visualstudio.com/api/extension-guides/ai/mcp) | [✅](https://code.visualstudio.com/api/extension-guides/ai/mcp) | [✅](https://code.visualstudio.com/api/extension-guides/ai/mcp) | [✅](https://github.com/microsoft/vscode/blob/a460613c57b4c1eb2bc8edc97be694e05ae286b2/src/vs/workbench/api/browser/mainThreadAuthentication.ts#L178-L192) | [✅](https://code.visualstudio.com/api/extension-guides/ai/mcp) | prefix `mcp_{server}_`; name ≤ 64 (truncate); chars `[A-Za-z0-9_-]` (replace); ≤ 128 tools |
| OpenCode | [✅](https://opencode.ai/docs/mcp-servers/) | [✅](https://github.com/anomalyco/opencode/blob/a42f393c850bec0c0f395fb91bf19b1ee8b31666/packages/opencode/src/mcp/index.ts#L268-L283) | [✅](https://github.com/anomalyco/opencode/blob/a42f393c850bec0c0f395fb91bf19b1ee8b31666/packages/opencode/src/mcp/index.ts#L461-L471) | [✅](https://github.com/anomalyco/opencode/blob/a42f393c850bec0c0f395fb91bf19b1ee8b31666/packages/opencode/src/mcp/catalog.ts#L130-L134) | [✅](https://github.com/anomalyco/opencode/blob/a42f393c850bec0c0f395fb91bf19b1ee8b31666/packages/opencode/src/mcp/catalog.ts#L122-L126) | [✅](https://opencode.ai/docs/mcp-servers/) | ? | [❌](https://github.com/anomalyco/opencode/blob/a42f393c850bec0c0f395fb91bf19b1ee8b31666/packages/opencode/src/mcp/) | prefix `{server}_`; chars `[A-Za-z0-9_-]` (replace) |
| OpenAI Codex CLI | [✅](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) | [✅](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) | [❌](https://github.com/openai/codex/blob/8f195c93d7e7acfef95acf273f0e49cce917e291/codex-rs/rmcp-client/src/logging_client_handler.rs#L82-L92) | [✅](https://github.com/openai/codex/blob/8f195c93d7e7acfef95acf273f0e49cce917e291/codex-rs/core/src/tools/handlers/mcp_resource/read_mcp_resource.rs) | ? | [✅](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) | [✅](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) | ? | prefix `mcp__{server}__`; name ≤ 128 (truncateWithHash); chars `[A-Za-z0-9_]` (replaceUnique) |
| Gemini CLI | [✅](https://github.com/google-gemini/gemini-cli/blob/2fe7c2d3f065dc40ad573d50b2091116f8a4aa18/docs/tools/mcp-server.md#L55-L61) | [✅](https://github.com/google-gemini/gemini-cli/blob/2fe7c2d3f065dc40ad573d50b2091116f8a4aa18/docs/tools/mcp-server.md#L55-L61) | [✅](https://github.com/google-gemini/gemini-cli/blob/2fe7c2d3f065dc40ad573d50b2091116f8a4aa18/packages/core/src/tools/mcp-client.ts#L417) | [✅](https://github.com/google-gemini/gemini-cli/blob/2fe7c2d3f065dc40ad573d50b2091116f8a4aa18/docs/tools/mcp-server.md#L63-L88) | [✅](https://github.com/google-gemini/gemini-cli/blob/2fe7c2d3f065dc40ad573d50b2091116f8a4aa18/docs/tools/mcp-server.md#L1030-L1105) | [✅](https://github.com/google-gemini/gemini-cli/blob/2fe7c2d3f065dc40ad573d50b2091116f8a4aa18/docs/tools/mcp-server.md#L271-L300) | ? | [❌](https://github.com/google-gemini/gemini-cli/blob/2fe7c2d3f065dc40ad573d50b2091116f8a4aa18/packages/core/src/tools/) | prefix `mcp_{server}_`; name ≤ 63 (truncateMiddle); chars `[A-Za-z0-9_.:-]` (replace) |
| Cline | [✅](https://github.com/cline/cline/blob/252082b9e93b4f91253876391e35b4c13326f5e6/apps/vscode/src/services/mcp/constants.ts#L4) | [✅](https://github.com/cline/cline/blob/252082b9e93b4f91253876391e35b4c13326f5e6/apps/vscode/src/services/mcp/constants.ts#L4) | [✅](https://github.com/cline/cline/blob/252082b9e93b4f91253876391e35b4c13326f5e6/apps/vscode/src/services/mcp/McpHub.ts#L767-L769) | [✅](https://github.com/cline/cline/blob/252082b9e93b4f91253876391e35b4c13326f5e6/apps/vscode/src/services/mcp/McpHub.ts#L915-L930) | [✅](https://github.com/cline/cline/blob/252082b9e93b4f91253876391e35b4c13326f5e6/apps/vscode/src/services/mcp/McpHub.ts#L974-L990) | [✅](https://github.com/cline/cline/blob/252082b9e93b4f91253876391e35b4c13326f5e6/apps/vscode/src/services/mcp/McpOAuthManager.ts) | ? | ? | prefix `{server}__`; name ≤ 64 (truncateWithHash); chars `[A-Za-z0-9_-]` (truncateWithHash) |
| Goose | [✅](https://github.com/block/goose/blob/04ed836c8cde23e540cc77d256992e00be99298b/crates/goose/src/agents/extension.rs#L157-L158) | [✅](https://github.com/block/goose/blob/04ed836c8cde23e540cc77d256992e00be99298b/crates/goose/src/agents/extension.rs#L207-L208) | [✅](https://github.com/block/goose/blob/04ed836c8cde23e540cc77d256992e00be99298b/crates/goose/src/agents/mcp_client.rs#L377-L379) | [✅](https://github.com/block/goose/blob/04ed836c8cde23e540cc77d256992e00be99298b/crates/goose/src/agents/extension_manager/mod.rs#L1067) | [✅](https://github.com/block/goose/blob/04ed836c8cde23e540cc77d256992e00be99298b/crates/goose/src/agents/extension_manager/mod.rs#L1450) | [✅](https://github.com/block/goose/blob/04ed836c8cde23e540cc77d256992e00be99298b/crates/goose/src/oauth/mod.rs#L255-L276) | [✅](https://github.com/block/goose/blob/04ed836c8cde23e540cc77d256992e00be99298b/crates/goose/src/oauth/mod.rs#L273-L275) | [✅](https://github.com/block/goose/blob/04ed836c8cde23e540cc77d256992e00be99298b/crates/goose/src/agents/mcp_client.rs#L300-L311) | prefix `{server}__` |
| Continue | [✅](https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/context/mcp/MCPConnection.ts#L391) | [✅](https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/context/mcp/MCPConnection.ts#L535-L550) | [❌](https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/context/mcp/MCPConnection.ts#L286) | [✅](https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/context/mcp/MCPConnection.ts#L292-L300) | [✅](https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/context/mcp/MCPConnection.ts#L343-L350) | [✅](https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/context/mcp/MCPOauth.ts) | ? | [⚠️](https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/tools/callTool.ts#L115-L142) | prefix `{server}_` |
| Windsurf / Devin Desktop | [✅](https://docs.devin.ai/desktop/cascade/mcp) | [✅](https://docs.devin.ai/desktop/cascade/mcp) | ? | [✅](https://docs.devin.ai/desktop/cascade/mcp) | [✅](https://docs.devin.ai/desktop/cascade/mcp) | [✅](https://docs.devin.ai/desktop/cascade/mcp) | ? | ? | ≤ 100 tools |

✅ supported · ❌ not supported · ⚠️ partial or unreliable · ? unknown. Every mark links to its source. Facts verified 2026-09-26 to 2026-09-27; run `mcpkit list-clients` for details.
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
| `TOOL_TITLE_MISSING` | Tools have a human-readable title |
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
| `SCHEMA_EMPTY_ENUM` | enum lists have at least one value |
| `SCHEMA_ROOT_COMBINATOR_CLIENT` | Root-level oneOf/anyOf/allOf is shaped the way each client can handle |
| `SCHEMA_TYPE_ARRAY_CLIENT` | Type arrays (e.g. ["string","null"]) avoided for clients that fail on them |
| `SCHEMA_KEYWORDS_DROPPED` | Notes schema constraints a client removes before the model sees them |
| `SCHEMA_TOO_LARGE` | inputSchema fits each client's size limit |
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
| `CALL_RESULT_TOO_LARGE` | Tool results fit each client's result size limit |
| `CALL_SLOW` | Tool calls finish well within each client's timeout |
| `CALL_FAILED` | Reports tool calls that errored |

**sdk**

| Check | What it verifies |
|---|---|
| `SDK_OUTDATED` | The server's MCP SDK is the latest release |
<!-- checks:end -->

## Protocol versions

Every published revision is covered:

- **2024-11-05 to 2025-11-25** (the `initialize` handshake, which current clients use): the checks run over the latest version the server supports. `--version-matrix` also connects once per revision and reports versions the server rejects, answers incorrectly, or serves different tools on.
- **2026-07-28** (stateless): always probed in a separate session with the `_meta` envelope and the required HTTP headers. For servers that speak it, the tool checks `resultType`, `ttlMs` and `cacheScope`, `serverInfo` in `_meta`, the `-32022` unsupported-version error, and whether the tools match the handshake's. Servers that only speak 2026-07-28 get every check run over the new protocol.

With `--version-matrix` the report shows a line like `Protocol versions: 2024-11-05 ✅ · 2025-03-26 ✅ · 2025-06-18 ✅ · 2025-11-25 ✅ · 2026-07-28 ❌`.

## Contributing

Corrections to client facts are the most useful contribution: client behaviour changes often. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, how facts must be sourced, and how to add a check.

```bash
npm install
npm test          # unit, fixture and end-to-end tests
npm run readme    # regenerate the Clients and Checks sections
```

Security issues: see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
