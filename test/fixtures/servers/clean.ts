/** Well-behaved server built on the official SDK. Every check should pass. */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "clean-fixture", version: "1.0.0" });

server.registerTool(
  "create_event",
  {
    description: "Create a calendar event with a title and ISO start time.",
    inputSchema: { title: z.string(), start: z.string().describe("ISO 8601 start time") },
    annotations: { readOnlyHint: false },
  },
  async ({ title }) => ({ content: [{ type: "text", text: `Created ${title}` }] })
);

server.registerTool(
  "list_events",
  {
    description: "List upcoming calendar events, newest first.",
    inputSchema: { limit: z.number().int().min(1).max(50).optional() },
    outputSchema: { events: z.array(z.string()) },
    annotations: { readOnlyHint: true },
  },
  async () => {
    const structuredContent = { events: ["Standup", "Retro"] };
    return { content: [{ type: "text", text: JSON.stringify(structuredContent) }], structuredContent };
  }
);

server.registerResource(
  "readme",
  "docs://readme",
  { description: "Server readme", mimeType: "text/markdown" },
  async (uri) => ({ contents: [{ uri: uri.href, text: "# Clean fixture" }] })
);

server.registerPrompt(
  "summarize",
  { description: "Summarize upcoming events", argsSchema: { days: z.string() } },
  ({ days }) => ({ messages: [{ role: "user", content: { type: "text", text: `Summarize ${days} days` } }] })
);

await server.connect(new StdioServerTransport());
console.error("clean-fixture running on stdio");
