# mcp-use-compat

Test MCP servers against simulated client environments. Find compatibility issues before your users do.

## Install

```bash
npm install -g mcp-use-compat
```

## Usage

```bash
# Test against all supported clients
mcp-use-compat ./dist/server.js

# Test specific clients
mcp-use-compat ./dist/server.js --clients=claude,chatgpt

# CI mode: fail on auth or UI failures
mcp-use-compat ./dist/server.js --fail-on=auth,ui --output=json
```

## Supported Clients

| Client | Dynamic Discovery | Auth Persistence | MCP UI | Notes |
|--------|-------------------|------------------|--------|-------|
| Claude Desktop | ✅ Yes | ✅ Yes | ✅ Yes | Reference implementation |
| ChatGPT / Codex | ❌ No | ⚠️ HTTPS only | ❌ No | Requires static manifest |
| Cursor | ❌ No | ❌ No | ❌ No | Static tool list; null descriptions crash |
| OpenCode | ✅ Yes | ❌ No | ❌ No | CLI-only |

## Example Output

```markdown
| Client  | Check      | Status  | Notes                                      |
|---------|------------|---------|--------------------------------------------|
| claude  | discovery  | ✅ PASS | Discovered 7 tools via dynamic enumeration |
| claude  | auth       | ✅ PASS | OAuth callback returned access token       |
| chatgpt | discovery  | ⚠️ WARN | Tools found, but ChatGPT requires manifest |
| chatgpt | auth       | ❌ FAIL | CRITICAL: ChatGPT rejects localhost URIs   |
| cursor  | edge-cases | ❌ FAIL | 2 tools have null descriptions             |
```

## GitHub Action

```yaml
- uses: mcp-use-compat/action@v1
  with:
    server-path: ./dist/server.js
    clients: claude,chatgpt,cursor
    fail-on: auth,ui
```

## Why?

MCP is a protocol, but every client implements it differently. This tool finds the gaps.

## License

MIT
