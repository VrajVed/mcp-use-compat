# Using it in CI

## GitHub Actions

Copy [`examples/github-workflow.yml`](../examples/github-workflow.yml) into `.github/workflows/` and change the command after `--` to however your server starts. The key step:

```yaml
- name: Check MCP client compatibility
  run: npx mcpkit@0.4 --format github -- node dist/index.js
```

`--format github` turns findings into annotations on the pull request and writes the Markdown report to the job summary.

## Choosing what fails the build

```bash
npx mcpkit --fail-on error -- node dist/index.js    # default
npx mcpkit --fail-on warn -- node dist/index.js     # stricter
npx mcpkit --fail-on TOOL_*,SCHEMA_* -- node dist/index.js
npx mcpkit --clients claude-desktop,chatgpt -- node dist/index.js   # only the clients you ship to
```

Start with the default and the clients you support, then tighten.

## Keeping a report as an artifact

```yaml
- run: npx mcpkit@0.4 --fail-on none --out mcpkit-report.md -- node dist/index.js
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: mcpkit-report
    path: mcpkit-report.md
```

## Blocking breaking changes

Save a snapshot from the main branch and compare it with the pull request. See [Comparing releases](snapshots-and-diff.md):

```bash
npx mcpkit --fail-on none --save-snapshot after.json -- node dist/index.js
npx mcpkit diff baseline.json after.json --format github
```

## Other CI systems

Any CI that runs Node 20+ works. Use `--format json` for machine-readable output, and rely on the exit code: `0` pass, `1` failed checks, `2` usage error, `3` server didn't start.

## Avoiding network lookups

In locked-down CI, add `--offline` so the SDK version check doesn't contact package registries.
