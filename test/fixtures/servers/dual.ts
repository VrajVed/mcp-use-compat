/** Speaks both the initialize handshake and 2026-07-28, but lists a different tool over the new protocol. */
import { serve } from "./raw.js";

const tool = (name: string) => ({ name, description: `The ${name} tool for testing.`, inputSchema: { type: "object", properties: {} } });

await serve({
  protocolVersion: "2025-11-25",
  capabilities: { tools: {} },
  discover: { supportedVersions: ["2025-11-25", "2026-07-28"], capabilities: { tools: {} } },
  modern: { conformant: true, tools: [tool("search"), tool("search_v2")] },
  tools: [tool("search"), tool("legacy_export")],
});
