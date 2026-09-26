import type { ClientProfile } from "./types.js";

const REFERENCE = "https://developers.openai.com/apps-sdk/reference";
const CONNECT = "https://developers.openai.com/apps-sdk/deploy/connect-chatgpt";
const AUTH = "https://developers.openai.com/apps-sdk/build/auth";
const verifiedOn = "2026-09-26";

export const chatgpt: ClientProfile = {
  id: "chatgpt",
  aliases: ["openai", "chatgpt-apps"],
  displayName: "ChatGPT (Apps SDK / connectors)",
  supports: {
    streamableHttp: { value: true, source: CONNECT, verifiedOn },
    stdio: { value: "partial", source: CONNECT, verifiedOn, note: "Only through a Secure MCP Tunnel in developer mode." },
    toolsListChanged: {
      value: false,
      source: CONNECT,
      verifiedOn,
      note: "Inferred: after tool changes the docs require pressing Refresh on the connection and starting a new conversation.",
    },
    elicitation: { value: true, source: "https://developers.openai.com/apps-sdk/build/mcp-server", verifiedOn },
    oauth: { value: true, source: AUTH, verifiedOn, note: "Requires code_challenge_methods_supported with S256." },
    dcr: { value: true, source: AUTH, verifiedOn },
    cimd: { value: true, source: AUTH, verifiedOn, note: "Preferred when available." },
    uiResources: { value: true, source: REFERENCE, verifiedOn },
    structuredContent: { value: true, source: REFERENCE, verifiedOn },
  },
  limits: {
    structuredContent: { value: "alongsideText", source: REFERENCE, verifiedOn },
  },
};
