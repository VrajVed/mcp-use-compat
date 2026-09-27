# Changelog

## 0.4.1

- Renamed from `mcp-use-compat` to `@vrajved/mcpkit` (the unscoped `mcpkit` name is blocked by npm as too similar to an existing package). Install with `npm install -g @vrajved/mcpkit`; the command is `mcpkit`. Stored OAuth credentials move to `~/.config/mcpkit/oauth.json` automatically.
- 0.4.0 was tagged but never published.

## 0.3.1

- Repository moved to github.com/VrajVed/mcpkit; package links updated. No code changes.

## 0.3.0

- Commands: `check` (default), `upgrade`, `diff`, `call`, `oauth`, `fix`, `explain`, `list-checks`, `list-clients`.
- Twelve clients: Claude Desktop, Claude Code, ChatGPT, Cursor, VS Code (GitHub Copilot), OpenCode, Codex CLI, Gemini CLI, Cline, Goose, Continue and Windsurf. Every fact links to its source.
- All published protocol versions: `--version-matrix` for 2024-11-05 to 2025-11-25, and full support for the stateless 2026-07-28 revision.
- `upgrade` detects the server's MCP SDK, shows installed and latest versions, prints the command for your package manager, and with `--apply` upgrades and re-checks the server.
- Tool calls: `--probe-calls` (read-only tools only) and `call <tool>`, with result, output schema, size and timeout checks.
- `oauth login` runs and reports the full OAuth flow; `--oauth` reuses the stored token.
- `diff` classifies breaking changes between two snapshots.
- `fix` applies safe mechanical fixes to tool definitions.
- Rules from other linters were verified against client source before being adopted.

## 0.2.0

- Real connection layer for stdio and Streamable HTTP, replacing the simulated clients of 0.1.
- Checks run on what the server actually returns; client-specific results come from sourced client profiles.
- Markdown, JSON and GitHub annotation reports, `--fail-on`, snapshots.

## 0.1.0

- First prototype.
