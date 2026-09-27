import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  LIST_KINDS,
  type DiscoverProbe,
  type ListKind,
  type ListResult,
  type RawItem,
  type ServerSnapshot,
  type UiRead,
  type VersionProbe,
} from "../snapshot.js";
import { TOOL_NAME, VERSION } from "../version.js";
import { linkedUiUris } from "../ui.js";
import { callTool, probeCalls } from "./calls.js";
import { probeHttpAuth } from "./http.js";
import { RpcError, RpcSession } from "./session.js";
import { CapturingStdioTransport } from "./stdio.js";

const MAX_PAGES = 50;

export type ConnectTarget =
  | { kind: "stdio"; command: string; args: string[]; cwd: string; env: Record<string, string> }
  | { kind: "http"; url: string; headers: Record<string, string>; authProvider?: OAuthClientProvider };

export interface ConnectOptions {
  target: ConnectTarget;
  timeoutMs: number;
  authProbe: boolean;
  /** Also initialize once per SDK-supported protocol version (one extra session each). */
  versionMatrix?: boolean;
  /** Call tools that declare readOnlyHint: true, with synthesized arguments. */
  probeCalls?: boolean;
  /** Tools the user asked to call explicitly, with their arguments. */
  calls?: Array<{ tool: string; args: Record<string, unknown> }>;
  /** Progress messages (stderr). */
  log?: (msg: string) => void;
}

function makeTransport(target: ConnectTarget): Transport {
  return target.kind === "stdio"
    ? new CapturingStdioTransport(target)
    : new StreamableHTTPClientTransport(new URL(target.url), {
        requestInit: { headers: target.headers },
        authProvider: target.authProvider,
      });
}

export async function connect(options: ConnectOptions): Promise<ServerSnapshot> {
  const { target, timeoutMs } = options;
  const snapshot: ServerSnapshot = {
    snapshotVersion: 1,
    target:
      target.kind === "stdio"
        ? { kind: "stdio", command: target.command, args: target.args, cwd: target.cwd }
        : { kind: "http", url: target.url },
    connectedAt: new Date().toISOString(),
    connect: { ok: false },
    lists: {},
    io: { stdoutNonJsonLines: [], stderrTail: [] },
  };

  const transport = makeTransport(target);
  const session = new RpcSession(transport);

  try {
    const started = performance.now();
    await session.start();
    const init = (await session.request(
      "initialize",
      {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: TOOL_NAME, version: VERSION },
      },
      timeoutMs * 2
    )) as Record<string, unknown> | undefined;

    snapshot.connect = { ok: true, startupMs: Math.round(performance.now() - started) };
    const negotiated = typeof init?.protocolVersion === "string" ? init.protocolVersion : undefined;
    snapshot.initialize = {
      requestedProtocolVersion: LATEST_PROTOCOL_VERSION,
      negotiatedProtocolVersion: negotiated,
      serverInfo: isObject(init?.serverInfo) ? init.serverInfo : undefined,
      capabilities: isObject(init?.capabilities) ? init.capabilities : {},
      instructions: typeof init?.instructions === "string" ? init.instructions : undefined,
    };
    if (negotiated) transport.setProtocolVersion?.(negotiated);
    await session.notify("notifications/initialized");

    // Call every list method regardless of declared capabilities, so checks can
    // compare what was declared with what actually works.
    for (const kind of Object.keys(LIST_KINDS) as ListKind[]) {
      snapshot.lists[kind] = await listAll(session, kind, timeoutMs);
    }
    snapshot.uiReads = await readUiResources(session, snapshot, timeoutMs);
    if (options.probeCalls || options.calls?.length) {
      const log = options.log ?? ((msg: string) => console.error(msg));
      snapshot.calls = options.probeCalls ? await probeCalls(session, snapshot.lists.tools?.items ?? [], timeoutMs, log) : [];
      for (const { tool, args } of options.calls ?? []) {
        snapshot.calls.push(await callTool(session, tool, args, "explicit", timeoutMs));
      }
    }
    if (target.kind === "stdio") snapshot.discover = await discover(session, timeoutMs);
  } catch (err) {
    snapshot.connect = { ok: false, error: describeError(err, transport) };
    // The server answered but rejected initialize: it may only speak 2026-07-28+.
    if (err instanceof RpcError && target.kind === "stdio") snapshot.discover = await discover(session, timeoutMs);
  } finally {
    await session.close().catch(() => {});
  }

  if (transport instanceof CapturingStdioTransport) {
    snapshot.io = {
      stdoutNonJsonLines: transport.stdoutNonJsonLines,
      stderrTail: transport.stderrTail,
    };
  }

  if (target.kind === "http") {
    // Over HTTP, 2026-07-28 requests are independent POSTs, so probe outside the session.
    const tokens = await target.authProvider?.tokens();
    const headers = tokens ? { ...target.headers, authorization: `Bearer ${tokens.access_token}` } : target.headers;
    snapshot.discover = await discoverHttp(target.url, headers, timeoutMs);
    if (options.authProbe) snapshot.http = await probeHttpAuth(target.url, target.headers, timeoutMs);
  }

  if (options.versionMatrix && snapshot.connect.ok) {
    snapshot.versionMatrix = await probeVersions(target, timeoutMs);
  }

  return snapshot;
}

/**
 * Published protocol revisions that use the initialize handshake. 2024-10-07 is in
 * the SDK's list but was never published, so it isn't probed.
 */
export const HANDSHAKE_VERSIONS = ["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"] as const;

/** Opens one session per handshake protocol version and records what the server answers. */
export async function probeVersions(target: ConnectTarget, timeoutMs: number): Promise<VersionProbe[]> {
  const results: VersionProbe[] = [];
  for (const requested of HANDSHAKE_VERSIONS) {
    const transport = makeTransport(target);
    const session = new RpcSession(transport);
    try {
      await session.start();
      const init = (await session.request(
        "initialize",
        { protocolVersion: requested, capabilities: {}, clientInfo: { name: TOOL_NAME, version: VERSION } },
        timeoutMs * 2
      )) as Record<string, unknown> | undefined;
      const negotiated = typeof init?.protocolVersion === "string" ? init.protocolVersion : undefined;
      if (negotiated) transport.setProtocolVersion?.(negotiated);
      await session.notify("notifications/initialized");
      const tools = await listAll(session, "tools", timeoutMs);
      results.push({
        requested,
        ok: true,
        negotiated,
        tools: tools.ok ? tools.items.flatMap((t) => (typeof t.name === "string" ? [t.name] : [])).sort() : undefined,
      });
    } catch (err) {
      results.push({ requested, ok: false, error: describeError(err, transport) });
    } finally {
      await session.close().catch(() => {});
    }
  }
  return results;
}

async function listAll(session: RpcSession, kind: ListKind, timeoutMs: number): Promise<ListResult> {
  const { method, key } = LIST_KINDS[kind];
  const items: RawItem[] = [];
  const seenCursors = new Set<string>();
  const started = performance.now();
  let cursor: string | undefined;
  let pages = 0;

  try {
    do {
      const result = (await session.request(method, cursor ? { cursor } : undefined, timeoutMs)) as
        | Record<string, unknown>
        | undefined;
      pages++;
      const page = result?.[key];
      if (Array.isArray(page)) items.push(...page.filter(isObject));
      cursor = typeof result?.nextCursor === "string" ? result.nextCursor : undefined;
      if (cursor !== undefined) {
        if (seenCursors.has(cursor)) {
          return { ok: true, items, pages, durationMs: elapsed(started), cursorLoop: true };
        }
        seenCursors.add(cursor);
      }
    } while (cursor !== undefined && pages < MAX_PAGES);
    return { ok: true, items, pages, durationMs: elapsed(started) };
  } catch (err) {
    return {
      ok: false,
      items,
      pages,
      durationMs: elapsed(started),
      error: { code: err instanceof RpcError ? err.code : undefined, message: (err as Error).message },
    };
  }
}

const MAX_UI_READS = 20;

/** Reads each UI resource a tool links to, so checks can tell whether the link works. */
async function readUiResources(
  session: RpcSession,
  snapshot: ServerSnapshot,
  timeoutMs: number
): Promise<Record<string, UiRead> | undefined> {
  const uris = [...new Set((snapshot.lists.tools?.items ?? []).flatMap((t) => linkedUiUris(t)))].slice(0, MAX_UI_READS);
  if (uris.length === 0) return undefined;
  const reads: Record<string, UiRead> = {};
  for (const uri of uris) {
    try {
      const result = (await session.request("resources/read", { uri }, timeoutMs)) as { contents?: unknown } | undefined;
      const first = Array.isArray(result?.contents) ? (result.contents[0] as Record<string, unknown> | undefined) : undefined;
      reads[uri] = first
        ? { ok: true, mimeType: typeof first.mimeType === "string" ? first.mimeType : undefined }
        : { ok: false, error: "No contents returned" };
    } catch (err) {
      reads[uri] = { ok: false, error: (err as Error).message };
    }
  }
  return reads;
}

async function discover(session: RpcSession, timeoutMs: number): Promise<DiscoverProbe> {
  try {
    const result = await session.request("server/discover", undefined, timeoutMs);
    return isObject(result) ? { ok: true, result } : { ok: false, error: { message: "Result is not an object" } };
  } catch (err) {
    return { ok: false, error: { code: err instanceof RpcError ? err.code : undefined, message: (err as Error).message } };
  }
}

async function discoverHttp(url: string, headers: Record<string, string>, timeoutMs: number): Promise<DiscoverProbe> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-method": "server/discover",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "server/discover" }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    const message = parseHttpJsonRpc(text, res.headers.get("content-type") ?? "");
    if (!message) return { ok: false, error: { message: `HTTP ${res.status} with no JSON-RPC response` } };
    if (isObject(message.error)) {
      const e = message.error as { code?: number; message?: string };
      return { ok: false, error: { code: e.code, message: e.message ?? "Unknown error" } };
    }
    return isObject(message.result) ? { ok: true, result: message.result } : { ok: false, error: { message: "No result" } };
  } catch (err) {
    return { ok: false, error: { message: (err as Error).message } };
  }
}

/** Parses a JSON-RPC response from a JSON body or the first SSE data event. */
export function parseHttpJsonRpc(body: string, contentType: string): Record<string, unknown> | undefined {
  const candidates = contentType.includes("text/event-stream")
    ? body.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim())
    : [body];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (isObject(parsed) && ("result" in parsed || "error" in parsed)) return parsed;
    } catch {
      // Not JSON; try the next event.
    }
  }
  return undefined;
}

function describeError(err: unknown, transport: Transport): string {
  const message = err instanceof Error ? err.message : String(err);
  if (transport instanceof CapturingStdioTransport && (transport.exitCode !== null || transport.exitSignal)) {
    const how = transport.exitSignal ? `signal ${transport.exitSignal}` : `code ${transport.exitCode}`;
    return `${message} (server exited with ${how})`;
  }
  return message;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function elapsed(started: number): number {
  return Math.round(performance.now() - started);
}
