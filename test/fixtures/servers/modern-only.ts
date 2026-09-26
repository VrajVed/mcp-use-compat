/** Speaks only protocol 2026-07-28: rejects initialize, answers server/discover. */
import { serve } from "./raw.js";

await serve({
  rejectInitialize: true,
  discover: { supportedVersions: ["2026-07-28"], capabilities: { tools: {} }, serverInfo: { name: "modern", version: "1.0.0" } },
});
