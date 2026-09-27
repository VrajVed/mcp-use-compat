# Comparing releases with snapshots and diff

A snapshot is everything the tool learned about a server in one run: its tools, resources, prompts, capabilities and protocol details. Snapshots let you re-check without running the server, share exactly what you saw in a bug report, and compare releases.

## Save and re-check

```bash
mcpkit --save-snapshot snap.json -- node dist/server.js
mcpkit --from-snapshot snap.json
mcpkit --from-snapshot snap.json --clients cursor
```

## Compare two versions

```bash
git stash && npm run build
mcpkit --fail-on none --save-snapshot before.json -- node dist/server.js
git stash pop && npm run build
mcpkit --fail-on none --save-snapshot after.json -- node dist/server.js

mcpkit diff before.json after.json
```

`diff` sorts changes into three levels:

- **Breaking:** removed tools, resources, templates, prompts or capabilities; new required arguments; arguments that became required or changed type; removed enum values; output fields that were removed or are no longer guaranteed; and compatibility errors that are new in the second snapshot.
- **Change:** additions, arguments that became optional, new output fields.
- **Notable:** description changes (models may use the tool differently), annotation changes (clients may prompt differently), and a different negotiated protocol version.

Options:

```bash
mcpkit diff before.json after.json --fail-on breaking   # default: exit 1 on breaking changes
mcpkit diff before.json after.json --fail-on any        # exit 1 on any change
mcpkit diff before.json after.json --format json --out diff.json
```

`diff` needs snapshots, not `--format json` reports, because reports don't contain the full tool schemas.
