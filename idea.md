# mcp-use-compat

## Problem

MCP is a protocol, but every client implements it differently: transports, dynamic tool discovery (`listChanged`), OAuth/DCR, UI resources, tool-count and name-length limits, JSON Schema quirks. Devs build an MCP server, test it in one client, ship it — then users on other clients report breakage.

Manufact's own Launch HN: "Clients still have to consolidate behavior, some do dynamic tool discovery, some don't, some persist authentication properly some don't."

## Solution

A CLI that connects to an MCP server once, snapshots what it actually exposes, runs checks against that snapshot, and maps the findings onto sourced per-client capability profiles.

```bash
npx mcp-use-compat -- node ./dist/server.js --clients=claude,chatgpt,cursor
npx mcp-use-compat --url https://example.com/mcp
```

## Principle

> **Fail a server only for things we observed it do. Client limitations we didn't test are sourced WARN/INFO, never hardcoded FAILs.**

Every FAIL must be true and reproducible — otherwise the tool (and any outreach built on it) loses credibility.

## Plan

See [`plan.md`](./plan.md) for the architecture, check catalogue, CLI contract, test strategy, and phased task list.

## Known issues in v0.1.0 (to be fixed by the plan)

- No `initialize` handshake; `auth/callback` is not an MCP method, so auth results are meaningless on real servers.
- Many results are hardcoded (Cursor/OpenCode auth, UI for non-Claude clients), so `--fail-on=auth,ui` always fails.
- Startup detection needs a stdout write or "ready"/"Listening" on stderr; otherwise it crashes with an unhandled timeout.
- `sendJsonRpc` doesn't buffer partial lines; large responses time out.
- `--clients=<name>` is interpolated into an import path; `--clients=base` crashes.
- Markdown reporter: no WARN, unescaped `|`, ignores `opencodeLimitation`.
- Repo CI targets a nonexistent `./dist/server.js` and a non-generated `compat-report.md`; integration test has no assertions.

## Outputs

- Markdown report (GitHub-ready compatibility table)
- JSON report (CI parseable)
- GitHub annotations
- Exit codes (CI pass/fail)

## Why Manufact Cares

- Better docs (auto-generated "Known Client Limitations")
- Marketing ("Tested on N clients" badge)
- Fewer support tickets
- Product direction data

## Deliverable

Ship as open-source. Run against Manufact's `create-mcp-use-app` template. Find 2+ undocumented, reproducible edge cases. PR doc fixes. Cold DM Pietro Zullo with the repo and findings.
