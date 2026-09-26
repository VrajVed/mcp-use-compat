import { readFileSync, writeFileSync } from "node:fs";

/**
 * Everything we observed about a server in one session. Plain JSON so it can be
 * saved, attached to bug reports, and re-checked offline.
 *
 * List items are stored exactly as the server sent them (not SDK-validated), so
 * checks can see malformed data such as `description: null`.
 */
export interface ServerSnapshot {
  snapshotVersion: 1;
  target: Target;
  connectedAt: string;
  connect: {
    ok: boolean;
    error?: string;
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
