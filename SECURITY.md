# Security

## Reporting a vulnerability

Please report security issues privately through [GitHub security advisories](https://github.com/VrajVed/mcpkit/security/advisories/new) rather than in a public issue. Include steps to reproduce and the version you used.

## What the tool does on your machine

Worth knowing before you point it at a server:

- **It runs the server command you give it** (for stdio servers), with your environment plus any `--env` values.
- **It calls tools only when asked.** `--probe-calls` calls only tools that declare `readOnlyHint: true`, and skips any that also claim to be destructive or are named like writes. `call <tool>` calls exactly the tool you name. Annotations are hints from the server, so only probe servers you trust.
- **`upgrade --apply` runs package manager commands** in the server's project. Versions from package registries are validated before they are used in a command. Major upgrades need `--major`.
- **`oauth login` stores tokens** in `~/.config/mcp-use-compat/oauth.json` with permissions 0600. `oauth logout` deletes them.
- **Network requests:** the server itself, the OAuth well-known URLs of HTTP servers, and package registries (npm, PyPI, the Go proxy, crates.io) for SDK versions. Use `--offline` to skip registry lookups and `--no-auth-probe` to skip the OAuth probes.
