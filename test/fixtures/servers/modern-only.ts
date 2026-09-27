/** A conformant 2026-07-28-only server: rejects initialize, answers server/discover and enveloped requests. */
import { serve } from "./raw.js";

await serve({
  rejectInitialize: true,
  serverInfo: { name: "modern", version: "1.0.0" },
  capabilities: { tools: {} },
  discover: { supportedVersions: ["2026-07-28"], capabilities: { tools: {} } },
  modern: { conformant: true },
  tools: [
    { name: "get_weather", description: "Get the current weather for a city.", inputSchema: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } },
    { name: "bad.name", description: null, inputSchema: { type: "object", properties: {} } },
  ],
});
