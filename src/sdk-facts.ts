import { compareVersions, majorOf, SAFE_VERSION, upgradeCommand, type DetectedSdk } from "./project.js";

/** What we verified (by reading the SDK's source) about protocol support. */
export interface SdkFact {
  /** First version that speaks the stateless 2026-07-28 protocol, or false if this package never will. */
  modernFrom: string | false;
  /** What to do when modernFrom is false. */
  migrateTo?: string;
  note?: string;
  source: string;
}

export const SDK_FACTS: Record<string, SdkFact> = {
  "@modelcontextprotocol/sdk": {
    modernFrom: false,
    migrateTo: "@modelcontextprotocol/server",
    note: "v1 supports protocol versions up to 2025-11-25; 2026-07-28 is only in the v2 packages (@modelcontextprotocol/server), which is a migration, not an update.",
    source: "https://unpkg.com/@modelcontextprotocol/sdk@1.30.1/dist/esm/types.js",
  },
  "@modelcontextprotocol/server": {
    modernFrom: "2.0.0",
    note: "v2 implements server/discover and the 2026-07-28 request envelope.",
    source: "https://unpkg.com/@modelcontextprotocol/server@2.1.0/",
  },
  mcp: {
    modernFrom: "2.0.0",
    note: "mcp 1.x supports up to 2025-11-25; mcp 2.x adds 2026-07-28 (see mcp_types.version).",
    source: "https://pypi.org/project/mcp-types/2.2.0/",
  },
};

export { SAFE_VERSION } from "./project.js";

export type UpgradeKind = "current" | "minor" | "major" | "migrate" | "unknown";

export interface UpgradeAdvice {
  sdk: DetectedSdk;
  kind: UpgradeKind;
  /** Command to run, when an upgrade applies. */
  command?: string;
  /** One-line human summary. */
  summary: string;
  /** Upgrading adds protocol 2026-07-28. */
  addsModern: boolean;
  /** A requirements file pinning the old version with ==, which must be edited too. */
  pinnedFile?: string;
}

export function adviseUpgrade(sdk: DetectedSdk): UpgradeAdvice {
  const fact = SDK_FACTS[sdk.name];
  const current = sdk.installed ?? cleanDeclared(sdk.declared);
  const latest = sdk.latest && SAFE_VERSION.test(sdk.latest) ? sdk.latest : undefined;
  const hasModern = (v?: string) => !!v && !!fact?.modernFrom && compareVersions(v, fact.modernFrom) >= 0;

  if (!current || !latest) {
    return {
      sdk,
      kind: "unknown",
      command: upgradeCommand(sdk, latest),
      summary: `${sdk.name}${current ? ` ${current}` : ""}: couldn't compare with the latest release${latest ? "" : " (offline?)"}.`,
      addsModern: false,
    };
  }
  if (compareVersions(current, latest) >= 0) {
    const migrate = fact?.modernFrom === false && fact.migrateTo;
    return {
      sdk,
      kind: migrate ? "migrate" : "current",
      summary: migrate
        ? `${sdk.name} ${current} is the latest, but ${fact!.note}`
        : `${sdk.name} ${current} is the latest release.`,
      addsModern: false,
    };
  }
  const major = majorOf(current) !== majorOf(latest);
  const addsModern = !hasModern(current) && hasModern(latest);
  const pinnedFile = sdk.manager === "pip" && sdk.declared?.startsWith("==") ? sdk.manifest : undefined;
  return {
    sdk,
    kind: major ? "major" : "minor",
    command: upgradeCommand(sdk, latest),
    summary: `${sdk.name} ${current} → ${latest}${major ? " (major version: check the changelog for breaking changes)" : ""}${addsModern ? "; adds protocol 2026-07-28" : ""}.${pinnedFile ? ` Also change the pin in ${pinnedFile} to ${sdk.name}==${latest}.` : ""}`,
    addsModern,
    pinnedFile,
  };
}

/** "^1.29.0" → "1.29.0"; ranges we can't reduce to one version → undefined. */
function cleanDeclared(declared?: string): string | undefined {
  const m = declared ? /^[\^~=>v]*\s*([0-9][0-9.]*)/.exec(declared.trim()) : null;
  return m?.[1];
}
