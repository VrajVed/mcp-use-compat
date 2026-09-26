#!/usr/bin/env node
/**
 * Fake MCP server for testing mcp-use-compat.
 * Responds to tools/list, resources/list, auth/callback with valid JSON-RPC.
 */

import { createInterface } from "readline";

const rl = createInterface({ input: process.stdin, output: process.stdout });

// Track state
let authToken: string | null = null;

const tools = [
  { name: "create_event", description: "Create a new event" },
  { name: "list_events", description: "List all events" },
  { name: "get_event_details", description: "Get event details with UI" },
];

const resources = [
  { uri: "dashboard://capacity", mimeType: "application/vnd.mcp-ui+json", name: "CapacityGauge" },
  { uri: "dashboard://timeline", mimeType: "text/plain", name: "Timeline" },
];

function sendResponse(id: string | number, result: unknown) {
  console.log(JSON.stringify({ jsonrpc: "2.0", id, result }));
}

function sendError(id: string | number, code: number, message: string) {
  console.log(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }));
}

rl.on("line", (line) => {
  try {
    const msg = JSON.parse(line);
    const { id, method, params } = msg;

    switch (method) {
      case "tools/list":
        sendResponse(id, { tools });
        break;

      case "resources/list": {
        const filter = params?.filter;
        let filtered = resources;
        if (filter?.mimeType) {
          filtered = resources.filter((r) => r.mimeType === filter.mimeType);
        }
        sendResponse(id, { resources: filtered });
        break;
      }

      case "auth/callback": {
        const { code, redirect_uri } = params || {};

        // Simulate ChatGPT localhost rejection
        if (redirect_uri && redirect_uri.startsWith("http://localhost")) {
          sendError(id, -32000, "OAuth redirect_uri must be HTTPS, not localhost");
          break;
        }

        if (code) {
          authToken = `token_${code.slice(0, 8)}`;
          sendResponse(id, { access_token: authToken, token_type: "Bearer" });
        } else {
          sendError(id, -32000, "Missing authorization code");
        }
        break;
      }

      default:
        sendError(id, -32601, `Method not found: ${method}`);
    }
  } catch {
    // Ignore non-JSON lines
  }
});

console.error("Fake MCP server ready (listening on stdin)");
