import { authChecks } from "./auth.js";
import { discoveryChecks } from "./discovery.js";
import { protocolChecks } from "./protocol.js";
import { resourceChecks } from "./resources.js";
import { schemaChecks } from "./schema.js";
import { toolChecks } from "./tools.js";
import { transportChecks } from "./transport.js";
import { uiChecks } from "./ui.js";
import type { Check } from "./types.js";

export const ALL_CHECKS: Check[] = [
  ...transportChecks,
  ...protocolChecks,
  ...toolChecks,
  ...schemaChecks,
  ...discoveryChecks,
  ...resourceChecks,
  ...uiChecks,
  ...authChecks,
];
