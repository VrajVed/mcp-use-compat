import type { ClientProfile } from "./types.js";

const DOCS = "https://cursor.com/docs/mcp";
const verifiedOn = "2026-09-26";

export const cursor: ClientProfile = {
  id: "cursor",
  aliases: [],
  displayName: "Cursor",
  versionTested: "docs; forum reports for 2.6–3.12",
  supports: {
    stdio: { value: true, source: DOCS, verifiedOn },
    streamableHttp: { value: true, source: DOCS, verifiedOn },
    sse: { value: true, source: DOCS, verifiedOn },
    toolsListChanged: {
      value: "partial",
      source: "https://forum.cursor.com/t/mcp-server-regression-does-not-reload-tools-disconnect-does-nothing-ignores-mcp-json-changes-etc/166216",
      verifiedOn,
      note: "Regression confirmed by Cursor staff: list_changed stopped triggering a re-list in 3.12.17; only a full restart is reliable.",
    },
    resources: { value: true, source: DOCS, verifiedOn },
    prompts: { value: true, source: DOCS, verifiedOn },
    elicitation: { value: true, source: DOCS, verifiedOn },
    oauth: { value: true, source: DOCS, verifiedOn },
    dcr: { value: true, source: DOCS, verifiedOn },
    uiResources: { value: true, source: DOCS, verifiedOn },
  },
  limits: {
    toolNamePrefix: {
      value: { format: "{server}" },
      source: "https://forum.cursor.com/t/google-gws-cli-tool-names-too-long/153918/4",
      verifiedOn,
      note: "Length counts the mcp.json server key plus the tool name; the separator is not documented.",
    },
    toolNameChars: {
      value: { allowed: "A-Za-z0-9_-", onInvalid: "replace" },
      source: "https://forum.cursor.com/t/cursor-incorrectly-filters-out-mcp-tool-names-containing-dots-and-hyphens-despite-being-valid-per-mcp-spec/157635",
      verifiedOn,
      note: "Confirmed bug: dots are rejected by validation and replaced with underscores.",
    },
    maxToolNameLength: {
      value: { max: 60, onExceed: "truncateWithHash" },
      source: "https://forum.cursor.com/t/google-gws-cli-tool-names-too-long/153918/4",
      verifiedOn,
      note: "Staff: server name + tool name can't exceed 60; longer names get a warning and are truncated with a hash suffix.",
    },
    typeArraysRejected: {
      value: true,
      source: "https://forum.cursor.com/t/error-invoking-mcp-tools-with-optional-parameters/142477",
      verifiedOn: "2026-09-27",
      note: "Staff-confirmed validation bug (Cursor 2.0.75); a fix was promised without a version, so current builds may differ.",
    },
  },
};
