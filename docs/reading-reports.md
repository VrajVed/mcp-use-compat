# Reading reports

## Statuses and severities

Each check produces findings with a severity, and each client gets a status per check:

| Status | Meaning |
|---|---|
| ❌ FAIL | The server does something that breaks this client (from an `error` finding) |
| ⚠️ WARN | Likely to cause problems or degrade behaviour (from a `warn` finding) |
| ℹ️ INFO | Worth knowing; breaks nothing today |
| ✅ PASS | The check ran and found nothing |
| ⏭️ SKIP | The check doesn't apply (for example, OAuth checks on a stdio server) |

A finding that only matters for a feature a client doesn't use is shown as INFO for that client. For example, stdout noise is irrelevant to a client that only connects over HTTP.

## Areas

Checks are grouped by area: `transport`, `protocol`, `tools`, `schema`, `discovery`, `resources`, `ui` (MCP Apps), `auth`, `calls` and `sdk`. Run `mcpkit list-checks` for the full list, or `mcpkit explain <CHECK_ID>` for one check's rationale, sources and the client facts it uses.

## Controlling the exit code

`--fail-on` decides what makes the run fail:

```bash
--fail-on error                  # default: any FAIL
--fail-on warn                   # FAIL or WARN
--fail-on none                   # never fail (report only)
--fail-on TOOL_*,auth            # only these check ids, globs or areas
```

When the server can't be started or reached, the exit code is `3` regardless (unless `--fail-on none`).

## Output formats

```bash
--format pretty   # coloured terminal view (default in a terminal)
--format md       # Markdown (default when piped or with --out), good for PR comments
--format json     # machine-readable; follows schema/report.schema.json
--format github   # GitHub Actions annotations, plus a Markdown job summary
--out report.md   # write to a file instead of stdout
-v                # terminal view: also show informational notes
--no-color        # no colours (NO_COLOR works too)
```

The JSON report contains:

- `server`: name, version, negotiated protocol, which protocol generation the checks ran over (`era`), and per-version results from `--version-matrix`.
- `checks`: every check and whether it ran.
- `findings`: everything found, with `checkId`, `severity`, `message`, `fix`, and for client-specific findings, `client` and `source`.
- `clients`: one row per check per client, with a status.

`schemaVersion` only changes on breaking changes to this format.
