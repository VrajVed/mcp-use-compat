import type { ClientProfile } from "./types.js";

/** Generated from research notes (2026-09-27); every fact links to its source. */
export const windsurf: ClientProfile = {
  id: "windsurf",
  aliases: ["devin-desktop", "cascade"],
  displayName: "Windsurf / Devin Desktop",
  versionTested: "docs only (closed source)",
  supports: {
    stdio: {
      value: true,
      source: "https://docs.devin.ai/desktop/cascade/mcp",
      verifiedOn: "2026-09-27"
    },
    streamableHttp: {
      value: true,
      source: "https://docs.devin.ai/desktop/cascade/mcp",
      verifiedOn: "2026-09-27"
    },
    sse: {
      value: true,
      source: "https://docs.devin.ai/desktop/cascade/mcp",
      verifiedOn: "2026-09-27"
    },
    oauth: {
      value: true,
      source: "https://docs.devin.ai/desktop/cascade/mcp",
      verifiedOn: "2026-09-27",
      note: "'supports OAuth for each transport type'."
    },
    resources: {
      value: true,
      source: "https://docs.devin.ai/desktop/cascade/mcp",
      verifiedOn: "2026-09-27"
    },
    prompts: {
      value: true,
      source: "https://docs.devin.ai/desktop/cascade/mcp",
      verifiedOn: "2026-09-27"
    }
  },
  limits: {
    maxTools: {
      value: 100,
      source: "https://docs.devin.ai/desktop/cascade/mcp",
      verifiedOn: "2026-09-27",
      note: "'Cascade has a limit of 100 total tools'. docs.windsurf.com now redirects here; the page calls Cascade the legacy agent."
    }
  },
};
