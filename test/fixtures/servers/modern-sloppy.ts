/** Answers 2026-07-28 requests but omits resultType, ttlMs/cacheScope and serverInfo, and accepts any version. */
import { serve } from "./raw.js";

await serve({
  rejectInitialize: true,
  capabilities: { tools: {} },
  discover: { supportedVersions: ["2026-07-28"], capabilities: { tools: {} } },
  modern: { conformant: false },
  tools: [{ name: "ping", description: "Health check that returns pong.", inputSchema: { type: "object", properties: {} } }],
});
