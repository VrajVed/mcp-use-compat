import type { RawItem } from "./snapshot.js";

/** MCP Apps (io.modelcontextprotocol/ui, stable 2026-01-26). */
export const MCP_APP_MIME = "text/html;profile=mcp-app";
/** Legacy OpenAI Apps SDK widget type, still emitted by some mcp-ui adapters. */
export const SKYBRIDGE_MIME = "text/html+skybridge";

export interface UiLinks {
  /** `_meta.ui.resourceUri`, the current MCP Apps key. */
  current?: string;
  /** `_meta["ui/resourceUri"]`, deprecated flat key. */
  flat?: string;
  /** `_meta["openai/outputTemplate"]`, ChatGPT compatibility alias. */
  openai?: string;
}

export function uiLinks(tool: RawItem): UiLinks {
  const meta = tool._meta;
  if (typeof meta !== "object" || meta === null) return {};
  const m = meta as Record<string, unknown>;
  const ui = typeof m.ui === "object" && m.ui !== null ? (m.ui as Record<string, unknown>) : {};
  const s = (v: unknown) => (typeof v === "string" ? v : undefined);
  return { current: s(ui.resourceUri), flat: s(m["ui/resourceUri"]), openai: s(m["openai/outputTemplate"]) };
}

export function linkedUiUris(tool: RawItem): string[] {
  const links = uiLinks(tool);
  return [...new Set([links.current, links.flat, links.openai].filter((u): u is string => !!u))];
}

/** Normalises a MIME type for comparison: lowercase, no spaces around parameters. */
export function normalizeMime(mime: string): string {
  return mime.toLowerCase().replace(/\s*;\s*/g, ";").trim();
}
