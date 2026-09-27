# Getting started

## Install

You need Node.js 20 or newer. The server you test can be written in any language.

```bash
# Run without installing
npx mcp-use-compat --help

# Or install globally
npm install -g mcp-use-compat

# Or add it to a project (for CI)
npm install --save-dev mcp-use-compat
```

To use the latest code before a release:

```bash
npm install -g github:VrajVed/mcpkit
```

## Check a local server (stdio)

Put the command that starts your server after `--`, exactly as you would type it:

```bash
npx mcp-use-compat -- node dist/server.js
npx mcp-use-compat -- uv run server.py
npx mcp-use-compat -- python -m my_server
npx mcp-use-compat -- npx -y @acme/mcp-server
```

If the server needs environment variables or a different working directory:

```bash
npx mcp-use-compat --env API_KEY=test --env REGION=eu --cwd ./server -- node dist/index.js
```

## Check a remote server (Streamable HTTP)

```bash
npx mcp-use-compat --url https://example.com/mcp
npx mcp-use-compat --url https://example.com/mcp --header "Authorization: Bearer $TOKEN"
```

For servers that use OAuth, see [OAuth-protected servers](oauth.md).

## Read the result

The default output is a Markdown report:

1. A **summary** table with pass, warn, fail, info and skip counts per client.
2. **Server issues**: problems that affect every client, with a fix for each.
3. One section **per client** with issues specific to it, each linking to the source of the client fact.

The process exits `0` when nothing matched `--fail-on` (default: any FAIL), `1` when something did, `2` on a usage error and `3` when the server couldn't be started or reached. See [Reading reports](reading-reports.md) for the details.

## Common next steps

```bash
# Only the clients you care about (ids or aliases: claude, vscode, gemini, ...)
npx mcp-use-compat --clients claude-desktop,cursor,vscode -- node dist/server.js

# Ask why a check exists and which client facts it uses
npx mcp-use-compat explain TOOL_NAME_TOO_LONG

# Also try every protocol version and call read-only tools
npx mcp-use-compat --version-matrix --probe-calls -- node dist/server.js

# Is the SDK up to date?
npx mcp-use-compat upgrade -- node dist/server.js
```

Guides:

- [Reading reports](reading-reports.md)
- [Using it in CI](ci.md)
- [Comparing releases with snapshots and diff](snapshots-and-diff.md)
- [Upgrading your MCP SDK](upgrading-sdks.md)
- [Testing tool calls](tool-calls.md)
- [OAuth-protected servers](oauth.md)
- [Client profiles and how facts are sourced](client-profiles.md)

## Troubleshooting

**"Could not connect" (exit 3).** The report shows the last lines the server wrote to stderr. Usually the command, working directory or an environment variable is wrong. Try running the exact command yourself first.

**The server needs a while to start.** Raise the timeout: `--timeout 30000` (startup gets twice this).

**Slow first run with `npx -y`.** The first run downloads the package, which can trigger `TRANSPORT_SLOW_STARTUP`. Run it again, or install the server first.

**Behind a firewall or offline.** Add `--offline` to skip the package registry lookup for SDK versions.
