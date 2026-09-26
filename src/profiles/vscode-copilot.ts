import type { ClientProfile } from "./types.js";

const GUIDE = "https://code.visualstudio.com/api/extension-guides/ai/mcp";
const SRC = "https://github.com/microsoft/vscode/blob/a460613c57b4c1eb2bc8edc97be694e05ae286b2/src/vs/workbench/contrib/mcp/common";
const verifiedOn = "2026-09-26";

export const vscodeCopilot: ClientProfile = {
  id: "vscode-copilot",
  aliases: ["vscode", "copilot"],
  displayName: "VS Code (GitHub Copilot)",
  versionTested: "microsoft/vscode @ a460613 (1.140.0)",
  supports: {
    stdio: { value: true, source: GUIDE, verifiedOn },
    streamableHttp: { value: true, source: GUIDE, verifiedOn },
    sse: { value: true, source: GUIDE, verifiedOn },
    toolsListChanged: { value: true, source: `${SRC}/mcpServer.ts#L1224-L1227`, verifiedOn },
    promptsListChanged: { value: true, source: `${SRC}/mcpServer.ts#L1229-L1232`, verifiedOn },
    resourcesListChanged: {
      value: "partial",
      source: `${SRC}/mcpServerRequestHandler.ts#L368-L370`,
      verifiedOn,
      note: "The notification is parsed but nothing listens to it; resources are listed on demand.",
    },
    resources: { value: true, source: GUIDE, verifiedOn },
    prompts: { value: true, source: GUIDE, verifiedOn },
    sampling: { value: true, source: GUIDE, verifiedOn },
    elicitation: { value: true, source: `${SRC}/mcpServerRequestHandler.ts#L120-L134`, verifiedOn },
    oauth: { value: true, source: GUIDE, verifiedOn },
    dcr: { value: true, source: GUIDE, verifiedOn },
    cimd: {
      value: true,
      source: "https://github.com/microsoft/vscode/blob/a460613c57b4c1eb2bc8edc97be694e05ae286b2/src/vs/workbench/api/browser/mainThreadAuthentication.ts#L178-L192",
      verifiedOn,
    },
    uiResources: { value: true, source: GUIDE, verifiedOn },
    structuredContent: { value: true, source: `${SRC}/mcpLanguageModelToolContribution.ts#L331-L392`, verifiedOn },
  },
  limits: {
    maxTools: {
      value: 128,
      source: "https://code.visualstudio.com/docs/agents/run/tools",
      verifiedOn,
      note: "per chat request, across all servers",
    },
    toolNamePrefix: {
      value: { format: "mcp_{server}_", maxLength: 18, lowercase: true },
      source: `${SRC}/mcpServer.ts#L232-L252`,
      verifiedOn,
    },
    toolNameChars: {
      value: { allowed: "A-Za-z0-9_-", onInvalid: "replace" },
      source: `${SRC}/mcpServer.ts#L1086-L1089`,
      verifiedOn,
      note: "Other characters are replaced with '_' and a warning is logged.",
    },
    maxToolNameLength: {
      value: { max: 64, onExceed: "truncate" },
      source: `${SRC}/mcpServer.ts#L1333`,
      verifiedOn,
    },
    structuredContent: {
      value: "replacesText",
      source: `${SRC}/mcpLanguageModelToolContribution.ts#L331-L392`,
      verifiedOn,
    },
  },
};
