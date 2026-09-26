import type { ClientFeature } from "../profiles/types.js";
import type { ListKind } from "../snapshot.js";
import { connected, featureGap, isObject, items } from "./util.js";
import { defineCheck, type Check } from "./types.js";

function listChangedCheck(kind: "tools" | "resources" | "prompts", feature: ClientFeature): Check {
  const id = `DISCOVERY_${kind.toUpperCase()}_LIST_CHANGED`;
  return defineCheck({
    id,
    area: "discovery",
    description: `Clients that ignore ${kind}/list_changed are flagged when the server declares it`,
    appliesTo: (s) => {
      const cap = s.initialize?.capabilities?.[kind];
      return connected(s) && isObject(cap) && cap.listChanged === true;
    },
    run: (s, { profiles }) =>
      featureGap(profiles, feature, (p, partial) => ({
        checkId: id,
        severity: "warn",
        message: `Server declares ${kind}.listChanged, but ${p.displayName} ${partial ? "does not reliably refresh" : "does not refresh"} its ${kind} list during a session. If ${kind} change at runtime, users must reconnect to see them.`,
        fix: `Register all ${kind} at startup if you can; enable/disable them instead of adding new ones later.`,
      })),
  });
}

function unsupportedFeatureCheck(kind: ListKind & ("resources" | "prompts"), feature: ClientFeature): Check {
  const id = `DISCOVERY_${kind.toUpperCase()}_UNSUPPORTED`;
  return defineCheck({
    id,
    area: "discovery",
    description: `Clients without ${kind} support are flagged when the server exposes ${kind}`,
    appliesTo: (s) => connected(s) && items(s, kind).length > 0,
    run: (s, { profiles }) =>
      featureGap(profiles, feature, (p, partial) => ({
        checkId: id,
        severity: "warn",
        message: `Server exposes ${items(s, kind).length} ${kind}, but ${p.displayName} ${partial ? "only partly supports" : "does not support"} MCP ${kind}. Anything only reachable through them may be missing there.`,
        fix:
          kind === "prompts"
            ? "Don't rely on prompts for core functionality; mention workflows in tool descriptions too."
            : "Offer important resource content through a tool as well.",
      })),
  });
}

export const discoveryChecks = [
  listChangedCheck("tools", "toolsListChanged"),
  listChangedCheck("resources", "resourcesListChanged"),
  listChangedCheck("prompts", "promptsListChanged"),
  unsupportedFeatureCheck("resources", "resources"),
  unsupportedFeatureCheck("prompts", "prompts"),
];
