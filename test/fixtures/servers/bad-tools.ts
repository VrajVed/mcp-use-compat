/** A server with the tool defects real servers ship: every tool here trips at least one check. */
import { serve } from "./raw.js";

const obj = (properties: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  type: "object",
  properties,
  ...extra,
});

await serve({
  serverInfo: { name: "bad-tools", version: "0.0.1" },
  capabilities: { tools: { listChanged: true } },
  tools: [
    { name: "search", description: null, inputSchema: obj({ query: { type: "string" } }) },
    { name: "files.read", description: "Read a file from the workspace by path.", inputSchema: obj({ path: { type: "string" } }) },
    { name: "files_read", description: "Read a file (legacy alias kept for old prompts).", inputSchema: obj({ path: { type: "string" } }) },
    { name: "get_user", description: "Fetch a user.", inputSchema: obj({ id: { type: "string" } }, { required: ["id", "org"] }) },
    {
      name: "create_calendar_event_with_attendees_and_reminders_for_team",
      description: "Create a calendar event, invite attendees and set reminders in one call.",
      inputSchema: obj({ "start time": { type: "string" }, attendees: { type: "array", items: { type: "string" } } }),
    },
    { name: "run_query", description: "Run a read-only SQL query against the analytics database.", inputSchema: { type: "object", anyOf: [{ required: ["sql"] }, { required: ["saved_query_id"] }], properties: { sql: { type: "string" }, saved_query_id: { type: "string" } } } },
    { name: "export", description: "Export the current report as CSV.", inputSchema: { type: "string" } },
  ],
});
