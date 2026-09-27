# Client profiles and how facts are sourced

Each supported client has a profile in `src/profiles/`. Checks read these profiles to decide what matters for which client. A profile never guesses: a fact without a source is left out, and a missing fact means the related check produces no finding for that client.

## Where facts come from

In order of preference:

1. Official documentation.
2. The client's source code, linked at a specific commit.
3. A maintainer statement in an official repository or forum.

Every fact records the URL and the date it was checked. `mcpkit list-clients` shows how fresh each profile is, and the test suite fails when a fact is older than 180 days.

## Fields

`supports` records features as `true`, `false` or `"partial"` (supported but unreliable, with a note):

`stdio`, `streamableHttp`, `sse`, `toolsListChanged`, `resourcesListChanged`, `promptsListChanged`, `resources`, `prompts`, `sampling`, `elicitation`, `oauth`, `dcr`, `cimd`, `uiResources`, `structuredContent`.

`limits` records behaviour that checks compare against:

| Field | Used by |
|---|---|
| `toolNamePrefix` `{ format, maxLength?, lowercase? }` | name length checks (`{server}` is the server's name) |
| `toolNameChars` `{ allowed, onInvalid }` | `TOOL_NAME_CLIENT_CHARS`, `TOOL_NAME_CLIENT_COLLISION` |
| `maxToolNameLength` `{ max, onExceed }` | `TOOL_NAME_TOO_LONG`, `TOOL_NAME_CLIENT_COLLISION` |
| `maxTools` | `TOOL_COUNT_OVER_LIMIT` |
| `maxDescriptionLength` | `TOOL_DESCRIPTION_TRUNCATED` |
| `inputPropertyNamePattern` | `SCHEMA_PROPERTY_NAME_REJECTED` |
| `schemaUnsupported`, `schemaDroppedKeywords`, `maxSchemaChars` | schema checks |
| `rootCombinatorNonObject`, `typeArraysRejected` | client-specific schema failures |
| `structuredContent` | `TOOL_STRUCTURED_OUTPUT_HANDLING`, `CALL_STRUCTURED_WITHOUT_TEXT` |
| `maxToolResult`, `toolTimeoutMs` | `CALL_RESULT_TOO_LARGE`, `CALL_SLOW` |
| `readOnlySkipsApproval` | `TOOL_ANNOTATIONS_MISSING` |

`onInvalid` and `onExceed` describe what the client does with a name it doesn't accept as-is: `reject`, `replace`, `replaceUnique` (replaced, clashes get a hash), `truncate`, `truncateWithHash`, `truncateMiddle`, or `unknown`.

## Updating a fact

See [CONTRIBUTING.md](../CONTRIBUTING.md#correcting-or-adding-a-client-fact). In short: change the value, link the exact source, set `verifiedOn` to today, run `npm test` and `npm run readme`.
