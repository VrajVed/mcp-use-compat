# Upgrading your MCP SDK

Most protocol and compatibility fixes arrive through SDK releases. `upgrade` finds the SDK your server uses and tells you, or does, the upgrade.

## See what's out of date

```bash
npx mcpkit upgrade -- node dist/server.js
npx mcpkit upgrade --dir path/to/server/project
```

Output:

```markdown
| SDK | Installed | Latest | Status | Command |
|---|---|---|---|---|
| mcp | 1.27.2 | 2.2.0 | ⚠️ major update | `.venv/bin/python -m pip install --upgrade "mcp>=2.2.0"` |
```

It finds the project by walking up from the server's working directory, script path and interpreter to the nearest `package.json`, `pyproject.toml`, `requirements.txt`, `go.mod` or `Cargo.toml`, and recognises:

| Ecosystem | Packages | Package managers |
|---|---|---|
| npm | `@modelcontextprotocol/sdk`, `@modelcontextprotocol/server`, `mcp-use`, `fastmcp`, `mcp-framework`, `mcp-handler` | npm, pnpm, yarn, bun (from the lockfile) |
| PyPI | `mcp`, `fastmcp` | uv, poetry, pipenv, pip (the server's own virtualenv) |
| Go | `github.com/modelcontextprotocol/go-sdk`, `github.com/mark3labs/mcp-go` | go |
| crates.io | `rmcp` | cargo |

The installed version comes from `node_modules`, the virtualenv's `site-packages`, `go.mod` or `Cargo.lock`. The latest version comes from the package registry.

## Apply it

```bash
npx mcpkit upgrade --apply -- node dist/server.js
```

With `--apply` the tool:

1. Checks the server as it is now.
2. Runs the upgrade commands in the project. Minor and patch updates only; add `--major` for major versions.
3. Updates `==` pins in requirements files, so the next install doesn't undo it.
4. Checks the server again and prints the protocol version before and after, plus any breaking changes to its tools.

It exits `1` if an upgrade command fails, the server no longer starts, or there are breaking changes. Commit or stash your work first so you can review the change with `git diff` or roll it back.

## Protocol support by SDK

These facts come from reading each SDK's source:

- **`@modelcontextprotocol/sdk` (TypeScript v1)** supports protocol versions up to 2025-11-25. The stateless 2026-07-28 revision is only in the v2 packages (`@modelcontextprotocol/server`). That move is a migration with code changes, so `upgrade` explains it but never applies it.
- **`mcp` (Python)**: 1.x supports up to 2025-11-25; 2.x adds 2026-07-28.

## In reports

`check` uses the same detection for stdio servers. When a server negotiates an old protocol version, or an SDK is behind, the finding includes the exact command. Remote HTTP servers can't be inspected this way; run `upgrade` in their project instead.
