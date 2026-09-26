/** Logs to stdout, which corrupts the stdio protocol stream. */
import { serve } from "./raw.js";

await serve({
  capabilities: { tools: {} },
  stdoutNoise: "[info] handling request",
  tools: [
    { name: "ping", description: "Health check that returns pong.", inputSchema: { type: "object", properties: {} } },
  ],
});
