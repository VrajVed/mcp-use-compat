import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { LIST_KINDS, type ListKind, type ListResult, type RawItem, type ServerSnapshot } from "../snapshot.js";
import { TOOL_NAME, VERSION } from "../version.js";
import { probeHttpAuth } from "./http.js";
import { RpcError, RpcSession } from "./session.js";
import { CapturingStdioTransport } from "./stdio.js";

const MAX_PAGES = 50;

export type ConnectTarget =
  | { kind: "stdio"; command: string; args: string[]; cwd: string; env: Record<string, string> }
  | { kind: "http"; url: string; headers: Record<string, string> };

export interface ConnectOptions {
  target: ConnectTarget;
  timeoutMs: number;
  authProbe: boolean;
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

  const transport: Transport =
    target.kind === "stdio"
      ? new CapturingStdioTransport(target)
      : new StreamableHTTPClientTransport(new URL(target.url), { requestInit: { headers: target.headers } });
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
  } catch (err) {
    snapshot.connect = { ok: false, error: describeError(err, transport) };
  } finally {
    await session.close().catch(() => {});
  }

  if (transport instanceof CapturingStdioTransport) {
    snapshot.io = {
      stdoutNonJsonLines: transport.stdoutNonJsonLines,
      stderrTail: transport.stderrTail,
    };
  }

  if (target.kind === "http" && options.authProbe) {
    snapshot.http = await probeHttpAuth(target.url, target.headers, timeoutMs);
  }

  return snapshot;
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
