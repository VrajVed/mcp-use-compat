/** MCP Apps server: one correct UI tool, one with a broken link, one using only the legacy key. */
import { serve } from "./raw.js";

const schema = { type: "object", properties: {} };

await serve({
  capabilities: { tools: {}, resources: {} },
  tools: [
    { name: "show_dashboard", description: "Show the sales dashboard as an interactive view.", inputSchema: schema, _meta: { ui: { resourceUri: "ui://sales/dashboard" } } },
    { name: "show_missing", description: "Show a view whose resource is not registered.", inputSchema: schema, _meta: { ui: { resourceUri: "ui://sales/missing" } } },
    { name: "show_legacy", description: "Show a view linked only through the legacy key.", inputSchema: schema, _meta: { "openai/outputTemplate": "ui://sales/legacy" } },
  ],
  resources: [
    { name: "dashboard", uri: "ui://sales/dashboard", mimeType: "text/html;profile=mcp-app" },
    { name: "legacy", uri: "ui://sales/legacy", mimeType: "text/html+skybridge" },
  ],
  resourceTemplates: [],
  resourceContents: {
    "ui://sales/dashboard": { mimeType: "text/html;profile=mcp-app", text: "<html></html>" },
    "ui://sales/legacy": { mimeType: "text/html+skybridge", text: "<html></html>" },
  },
});
