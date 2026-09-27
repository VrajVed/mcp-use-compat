# Contributing

Thanks for helping. The most valuable contributions are usually **client facts**: how a specific MCP client really behaves. Code contributions are welcome too.

## Setup

```bash
git clone https://github.com/VrajVed/mcpkit.git
cd mcpkit
npm install        # also builds dist/
npm test           # unit, fixture and end-to-end tests
npm run typecheck
```

Run the CLI from source with `npx tsx src/index.ts <command>`, or build with `npm run build` and use `node dist/index.js`.

## The rule that matters

A check may only FAIL or WARN for something the server was seen doing. Anything about a client must come from a source: official docs, the client's source code at a pinned commit, or a maintainer statement in an official channel. Blog posts and guesses don't count. If a fact isn't known, leave it out; the checks treat unknown as "no finding".

## Correcting or adding a client fact

Client profiles live in `src/profiles/`. Each fact looks like this:

```ts
maxToolNameLength: {
  value: { max: 64, onExceed: "truncate" },
  source: "https://github.com/microsoft/vscode/blob/<commit>/src/vs/workbench/contrib/mcp/common/mcpServer.ts#L1333",
  verifiedOn: "2026-09-27",
  note: "Optional context shown in reports.",
},
```

1. Link the exact source. For source code, link a commit, not a branch.
2. Set `verifiedOn` to the day you checked it. Facts older than 180 days fail the test suite, which is how stale facts get noticed.
3. Run `npm test` and `npm run readme` (the client table in the README is generated).

See [docs/client-profiles.md](docs/client-profiles.md) for every field and how checks use it.

## Adding a check

1. Add it to the right file in `src/checks/` with `defineCheck`. Keep it a pure function of the snapshot.
2. Add an explanation in `src/checks/explanations.ts` (a test fails without one).
3. Add tests in `test/checks/` with at least one case that fires and one that doesn't (a test fails if the id isn't referenced).
4. If the check needs new server behaviour to test end to end, add a fixture in `test/fixtures/servers/`.
5. Run `npm run readme` to update the checks list.

## Pull requests

- Keep changes focused, with tests.
- Say where a client fact comes from in the PR description.
- `npm test` and `npm run typecheck` must pass.
