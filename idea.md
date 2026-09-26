# mcp-use-compat

## Problem

MCP is a protocol, but every client implements it differently. Claude Desktop supports dynamic tool discovery, auth persistence, and MCP UI components. ChatGPT doesn't. Cursor has a static tool list. Devs build an MCP server, test it in Claude, ship it — then users on other clients report breakage.

Manufact's own Launch HN: "Clients still have to consolidate behavior, some do dynamic tool discovery, some don't, some persist authentication properly some don't."

## Solution

A CLI + test harness that simulates each client environment and reports exactly what breaks.

```bash
npx mcp-use-compat ./my-mcp-server --clients=claude,chatgpt,cursor
```

## Tests

- **discovery**: Does the client see all tools/resources?
- **auth**: Does auth persist across sessions?
- **ui**: Do MCP UI components render?
- **edge-cases**: Malformed input handling

## Outputs

- Markdown report (GitHub-ready compatibility table)
- JSON report (CI parseable)
- Exit codes (CI pass/fail)

## GitHub Action

```yaml
- uses: mcp-use-compat/action@v1
  with:
    server-path: ./dist/server.js
    clients: claude,chatgpt,cursor
    fail-on: auth,ui
```

## Why Manufact Cares

- Better docs (auto-generated "Known Client Limitations")
- Marketing ("Tested on 4 clients" badge)
- Fewer support tickets
- Product direction data

## Deliverable

Ship as open-source. Run against Manufact's `create-mcp-use-app` template. Find 2+ undocumented edge cases. PR doc fixes. Cold DM Pietro Zullo with the repo.
