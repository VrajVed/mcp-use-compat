import { adviseUpgrade, SDK_FACTS, type UpgradeAdvice } from "../sdk-facts.js";
import type { ServerSnapshot } from "../snapshot.js";
import { defineCheck, type Finding } from "./types.js";

const LATEST_HANDSHAKE = "2025-11-25";

export function adviceFor(s: ServerSnapshot): UpgradeAdvice[] {
  return (s.project?.sdks ?? []).map(adviseUpgrade);
}

const protocolIsOld = (s: ServerSnapshot) => {
  const v = s.initialize?.negotiatedProtocolVersion;
  return s.era !== "modern" && !!v && v < LATEST_HANDSHAKE;
};

/**
 * The concrete next step for protocol findings: the exact upgrade command when
 * we know the project, otherwise how to get one.
 */
export function upgradeHint(s: ServerSnapshot, wantModern = false): string {
  const advice = adviceFor(s);
  const actionable = advice.filter((a) => a.command && (a.kind === "minor" || a.kind === "major") && (!wantModern || a.addsModern));
  if (actionable.length) return actionable.map((a) => `${a.summary} Run: ${a.command}`).join(" ");
  const migrate = advice.find((a) => a.kind === "migrate");
  if (wantModern && migrate) return `${migrate.summary}`;
  if (advice.length && advice.every((a) => a.kind === "current")) {
    return "Your MCP SDK is already the latest release; check whether the server pins an older protocolVersion.";
  }
  return s.target.kind === "stdio"
    ? "Upgrade your MCP SDK. Run `mcp-use-compat upgrade -- <your server command>` in the server's project for the exact command."
    : "Upgrade the server's MCP SDK. Run `mcp-use-compat upgrade -- <server command>` in its project for the exact command.";
}

export const sdkChecks = [
  defineCheck({
    id: "SDK_OUTDATED",
    area: "sdk",
    description: "The server's MCP SDK is the latest release",
    appliesTo: (s) => (s.project?.sdks.length ?? 0) > 0,
    run: (s) =>
      adviceFor(s).flatMap((a): Finding[] => {
        if (a.kind === "current" || a.kind === "unknown") return [];
        const fact = SDK_FACTS[a.sdk.name];
        if (a.kind === "migrate") {
          if (s.discover?.ok) return [];
          return [
            {
              checkId: "SDK_OUTDATED",
              severity: "info",
              subject: a.sdk.name,
              message: a.summary,
              source: fact?.source,
              fix: `Plan a migration to ${fact?.migrateTo} when your target clients need 2026-07-28.`,
            },
          ];
        }
        return [
          {
            checkId: "SDK_OUTDATED",
            severity: protocolIsOld(s) ? "warn" : "info",
            subject: a.sdk.name,
            message: `${a.summary}${protocolIsOld(s) ? ` The server negotiates ${s.initialize!.negotiatedProtocolVersion}; upgrading is the usual fix.` : ""}`,
            evidence: { installed: a.sdk.installed, declared: a.sdk.declared, latest: a.sdk.latest, manifest: a.sdk.manifest, manager: a.sdk.manager },
            source: fact?.source,
            fix: `Run: ${a.command}${a.kind === "major" ? " (major upgrade: read the release notes first)" : ""}`,
          },
        ];
      }),
  }),
];
