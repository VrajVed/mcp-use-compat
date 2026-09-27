import { readFileSync, writeFileSync } from "node:fs";
import type { ProjectInfo } from "./project.js";

/**
 * Everything we observed about a server in one session. Plain JSON so it can be
 * saved, attached to bug reports, and re-checked offline.
 *
 * List items are stored exactly as the server sent them (not SDK-validated), so
 * checks can see malformed data such as `description: null`.
 */
export interface ServerSnapshot {
  snapshotVersion: 1;
  /**
   * Which protocol generation the checks ran over: "legacy" (initialize handshake),
   * "modern" (2026-07-28 only; lists come from the modern probe) or "both".
   * Absent in snapshots from older versions = "legacy".
   */
  era?: "legacy" | "modern" | "both";
  target: Target;
  connectedAt: string;
  connect: {
    ok: boolean;
    error?: string;
    /** For era "modern": why the initialize handshake failed. */
    legacyError?: string;
    /** Transport start → initialize response. */
    startupMs?: number;
  };
  initialize?: {
    requestedProtocolVersion: string;
    negotiatedProtocolVersion?: string;
    serverInfo?: Record<string, unknown>;
    capabilities: Record<string, unknown>;
    instructions?: string;
  };
  lists: {
    tools?: ListResult;
    resources?: ListResult;
    resourceTemplates?: ListResult;
    prompts?: ListResult;
  };
  io: {
    /** stdio only: lines on stdout that were not JSON-RPC messages. Capped. */
    stdoutNonJsonLines: string[];
    /** Last lines of stderr. Capped. */
    stderrTail: string[];
  };
  http?: HttpProbe;
  /** server/discover (protocol revision 2026-07-28 and later). */
  discover?: DiscoverProbe;
  /** Everything learned over protocol 2026-07-28. */
  modern?: ModernProbe;
  /** resources/read results for UI resources that tools link to, keyed by URI. */
  uiReads?: Record<string, UiRead>;
  /** One initialize per protocol version (--version-matrix). */
  versionMatrix?: VersionProbe[];
  /** tools/call results (--probe-calls or the call command). */
  calls?: CallProbe[];
  /** The stdio server's project and the MCP SDKs it uses. */
  project?: ProjectInfo;
}

export interface CallProbe {
  tool: string;
  args: Record<string, unknown>;
  /** "probe" = picked automatically (readOnlyHint), "explicit" = named by the user. */
  origin: "probe" | "explicit";
  durationMs: number;
  /** Set when the server answered with a JSON-RPC error or the call failed. */
  error?: { code?: number; message: string };
  /** Raw result, with large text truncated. */
  result?: Record<string, unknown>;
  /** Size of the full JSON result before truncation, in characters. */
  resultChars?: number;
}

export interface VersionProbe {
  requested: string;
  ok: boolean;
  negotiated?: string;
  error?: string;
  /** Sorted tool names listed in that session. */
  tools?: string[];
}

export interface UiRead {
  ok: boolean;
  mimeType?: string;
  error?: string;
}

export interface ModernPageMeta {
  resultType?: unknown;
  ttlMs?: unknown;
  cacheScope?: unknown;
  /** _meta["io.modelcontextprotocol/serverInfo"] from the result. */
  serverInfo?: Record<string, unknown>;
}

export interface ModernProbe {
  version: string;
  /** The server answered like a 2026-07-28 server. */
  supported: boolean;
  discover: DiscoverProbe;
  /** Result metadata of server/discover. */
  discoverMeta?: ModernPageMeta;
  startupMs?: number;
  lists?: Partial<Record<ListKind, ListResult>>;
  /** Result metadata per list page. */
  pagesMeta?: Partial<Record<ListKind, ModernPageMeta[]>>;
  uiReads?: Record<string, UiRead>;
  /** What the server did with a request carrying an unsupported protocol version. */
  unsupportedVersion?: { answered: boolean; code?: number; message?: string; data?: unknown };
  stderrTail?: string[];
}

export interface DiscoverProbe {
  ok: boolean;
  /** Raw result when ok. */
  result?: Record<string, unknown>;
  error?: { code?: number; message: string };
}

export type Target =
  | { kind: "stdio"; command: string; args: string[]; cwd: string }
  | { kind: "http"; url: string };

export type RawItem = Record<string, unknown>;

export interface ListResult {
  ok: boolean;
  items: RawItem[];
  pages: number;
  durationMs: number;
  error?: { code?: number; message: string };
  /** Set when pagination stopped because a cursor repeated. */
  cursorLoop?: boolean;
}

export interface HttpResponseProbe {
  url: string;
  status?: number;
  error?: string;
  headers?: Record<string, string>;
  /** Parsed JSON body, when the response was JSON. */
  json?: unknown;
}

export interface HttpProbe {
  /** Unauthenticated initialize POST. */
  unauthenticated: HttpResponseProbe;
  /** Protected resource metadata fetches, in the order tried. */
  protectedResource: HttpResponseProbe[];
  /** Authorization server metadata fetches, in the order tried. */
  authorizationServer: HttpResponseProbe[];
}

export const LIST_KINDS = {
  tools: { method: "tools/list", key: "tools", capability: "tools" },
  resources: { method: "resources/list", key: "resources", capability: "resources" },
  resourceTemplates: {
    method: "resources/templates/list",
    key: "resourceTemplates",
    capability: "resources",
  },
  prompts: { method: "prompts/list", key: "prompts", capability: "prompts" },
} as const;

export type ListKind = keyof typeof LIST_KINDS;

export function saveSnapshot(path: string, snapshot: ServerSnapshot): void {
  writeFileSync(path, JSON.stringify(snapshot, null, 2) + "\n");
}

export function loadSnapshot(path: string): ServerSnapshot {
  const data = JSON.parse(readFileSync(path, "utf8")) as ServerSnapshot;
  if (data?.snapshotVersion !== 1) {
    throw new Error(`${path}: unsupported snapshot version ${String(data?.snapshotVersion)}`);
  }
  return data;
}
