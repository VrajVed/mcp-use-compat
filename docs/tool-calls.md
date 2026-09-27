# Testing tool calls

By default the tool never calls your tools. Two options change that.

## Probe read-only tools

```bash
npx mcpkit --probe-calls -- node dist/server.js
```

This calls every tool that declares `readOnlyHint: true`, up to 20, and skips any that:

- also declare `destructiveHint: true`, or
- are named like writes (`create_*`, `delete_*`, `place_*`, `send_*` and similar).

Arguments are the minimal values the tool's input schema requires: defaults, examples and enums when present, otherwise simple placeholders. The tool lists the tools it will call before calling them.

Annotations are hints from the server, so only probe servers you trust.

## Call one tool

```bash
npx mcpkit call get_quote --args '{"symbol":"INFY"}' -- node dist/server.js
npx mcpkit call get_quote --args '{"symbol":"INFY"}' --format json --url https://example.com/mcp
```

`call` runs exactly the tool you name, whatever its annotations, and prints the result and any problems. It exits `1` if the call failed or the result is invalid.

## What gets checked

| Check | Problem |
|---|---|
| `CALL_RESULT_INVALID` | The result doesn't match the MCP result schema; SDK clients throw instead of showing it |
| `CALL_OUTPUT_SCHEMA_MISMATCH` | The tool declares `outputSchema` but returns no `structuredContent`, or content that doesn't match; the TypeScript SDK client rejects it |
| `CALL_STRUCTURED_WITHOUT_TEXT` | Only `structuredContent`, no text copy; clients that only pass text (Gemini CLI, Goose, Continue) give the model nothing |
| `CALL_RESULT_TOO_LARGE` | The result is over a client's size limit and gets truncated or saved to a file |
| `CALL_SLOW` | The call takes more than half of a client's timeout |
| `CALL_FAILED` | The call returned an error (for probes, the generated arguments may be the reason) |
