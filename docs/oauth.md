# OAuth-protected servers

## Check what clients see before logging in

Even without credentials, checking an HTTP server tests its OAuth discovery the way clients do:

```bash
npx mcpkit --url https://example.com/mcp
```

The `auth` checks cover the `WWW-Authenticate` challenge, protected resource metadata (RFC 9728), authorization server metadata (RFC 8414 and OpenID Connect), issuer matching, PKCE S256, and whether clients can register themselves (Client ID Metadata Documents or Dynamic Client Registration).

## Log in and check everything

```bash
npx mcpkit oauth login --url https://example.com/mcp
npx mcpkit check --oauth --url https://example.com/mcp
```

`oauth login` opens your browser and reports each step:

```
✔ Discovery: authorization server https://auth.example.com, protected resource metadata found
✔ Client registration: Dynamic Client Registration
✔ Authorization request: PKCE S256, resource=https://example.com/mcp
✔ Authorization: code received, iss matches issuer
✔ Token exchange: Bearer token, expires in 3600s, refresh token issued
✔ Authenticated MCP request: initialize + tools/list OK (12 tools)
```

A failed step tells you which part of the server's setup to fix.

## Options

```bash
--client-id <id> [--client-secret <secret>]   # use a pre-registered client
--callback-port 8787                          # fixed redirect port (pre-registered clients usually need one)
--client-metadata-url https://you.example/client.json   # your hosted Client ID Metadata Document
--scope "read write"                          # scopes to request
--no-browser                                  # print the login URL instead of opening it
```

## Stored credentials

Tokens are stored per server in `~/.config/mcpkit/oauth.json` (or under `$XDG_CONFIG_HOME`), readable only by you.

```bash
npx mcpkit oauth status
npx mcpkit oauth logout --url https://example.com/mcp
```

Runs with `--oauth` never register a new client or open a browser. They use the stored token, refresh it when needed, and otherwise tell you to run `oauth login` again.
