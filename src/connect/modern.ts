import type { ConnectTarget } from "./index.js";
import { LIST_KINDS, type ListKind, type ModernPageMeta, type ModernProbe } from "../snapshot.js";
import { TOOL_NAME, VERSION } from "../version.js";
import { elapsed, isObject, listAll, readUiResources, type Requester } from "./lists.js";
import { RpcError, RpcSession } from "./session.js";
import { CapturingStdioTransport } from "./stdio.js";

/** The stateless protocol revision: no initialize, a _meta envelope on every request. */
export const MODERN_VERSION = "2026-07-28";

const META = "io.modelcontextprotocol/";
/** Error codes only a 2026-07-28 server sends; seeing one means the server is modern. */
const MODERN_ERROR_CODES = new Set([-32020, -32021, -32022]);
/** A version no server supports, to check the UnsupportedProtocolVersion error. */
const BOGUS_VERSION = "1999-01-01";

function envelope(params: Record<string, unknown> | undefined, version = MODERN_VERSION): Record<string, unknown> {
  const meta = isObject(params?._meta) ? params._meta : {};
  return {
    ...params,
    _meta: {
      ...meta,
      [`${META}protocolVersion`]: version,
      [`${META}clientCapabilities`]: {},
      [`${META}clientInfo`]: { name: TOOL_NAME, version: VERSION },
    },
  };
}

interface Channel {
  /** Sends a 2026-07-28 request (envelope added here). */
  request(method: string, params: Record<string, unknown> | undefined, version?: string): Promise<unknown>;
  close(): Promise<void>;
  stderrTail(): string[];
}

/** stdio: a fresh server process, as the spec's era detection and the v2 SDK do. */
async function stdioChannel(target: Extract<ConnectTarget, { kind: "stdio" }>, timeoutMs: number): Promise<Channel> {
  const transport = new CapturingStdioTransport(target);
  const session = new RpcSession(transport);
  await session.start();
  return {
    request: (method, params, version) => session.request(method, envelope(params, version), timeoutMs),
    close: () => session.close(),
    stderrTail: () => transport.stderrTail,
  };
}

/** HTTP: independent POSTs with the headers 2026-07-28 requires. */
function httpChannel(url: string, headers: Record<string, string>, timeoutMs: number): Channel {
  let nextId = 1;
  return {
    async request(method, params, version = MODERN_VERSION) {
      const body = { jsonrpc: "2.0", id: nextId++, method, params: envelope(params, version) };
      const name = typeof params?.name === "string" ? params.name : typeof params?.uri === "string" ? params.uri : undefined;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": version,
          "mcp-method": method,
          ...(name ? { "mcp-name": encodeHeader(name) } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const message = parseHttpJsonRpc(await res.text(), res.headers.get("content-type") ?? "");
      if (!message) throw new Error(`HTTP ${res.status} with no JSON-RPC response`);
      if (isObject(message.error)) {
        const e = message.error as { code?: number; message?: string; data?: unknown };
        throw new RpcError(e.message ?? "Unknown error", e.code, e.data);
      }
      return message.result;
    },
    close: async () => {},
    stderrTail: () => [],
  };
}

/** Header values must be ASCII; others use the spec's =?base64?…?= form. */
function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?base64?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** Parses a JSON-RPC response from a JSON body or the first SSE data event carrying one. */
export function parseHttpJsonRpc(body: string, contentType: string): Record<string, unknown> | undefined {
  const candidates = contentType.includes("text/event-stream")
    ? body
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
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

function pageMeta(result: Record<string, unknown>): ModernPageMeta {
  const meta = isObject(result._meta) ? result._meta : {};
  return {
    resultType: result.resultType,
    ttlMs: result.ttlMs,
    cacheScope: result.cacheScope,
    serverInfo: isObject(meta[`${META}serverInfo`]) ? (meta[`${META}serverInfo`] as Record<string, unknown>) : undefined,
  };
}

/**
 * Talks 2026-07-28 to the server: server/discover, then (if the server is modern)
 * every list method, the linked UI resources, and one request with an unsupported
 * version to check the error. Never throws.
 */
export async function probeModern(target: ConnectTarget, timeoutMs: number, headers: Record<string, string>): Promise<ModernProbe> {
  const started = performance.now();
  let channel: Channel;
  try {
    channel = target.kind === "stdio" ? await stdioChannel(target, timeoutMs) : httpChannel(target.url, headers, timeoutMs);
  } catch (err) {
    return { version: MODERN_VERSION, supported: false, discover: { ok: false, error: { message: (err as Error).message } } };
  }

  const probe: ModernProbe = { version: MODERN_VERSION, supported: false, discover: { ok: false } };
  try {
    try {
      const result = await channel.request("server/discover", undefined);
      if (isObject(result)) {
        probe.discover = { ok: true, result };
        probe.discoverMeta = pageMeta(result);
        probe.supported = Array.isArray(result.supportedVersions);
      } else {
        probe.discover = { ok: false, error: { message: "Result is not an object" } };
      }
    } catch (err) {
      const code = err instanceof RpcError ? err.code : undefined;
      probe.discover = { ok: false, error: { code, message: (err as Error).message } };
      // A modern-only error means a modern server that rejected our request.
      probe.supported = code !== undefined && MODERN_ERROR_CODES.has(code);
    }
    probe.startupMs = elapsed(started);

    const versions = probe.discover.result?.supportedVersions;
    if (!probe.supported || (Array.isArray(versions) && !versions.includes(MODERN_VERSION))) return probe;

    const request: Requester = (method, params) => channel.request(method, params);
    probe.lists = {};
    probe.pagesMeta = {};
    for (const kind of Object.keys(LIST_KINDS) as ListKind[]) {
      const pages: ModernPageMeta[] = [];
      probe.lists[kind] = await listAll(request, kind, (result) => pages.push(pageMeta(result)));
      probe.pagesMeta[kind] = pages;
    }
    probe.uiReads = await readUiResources(request, probe.lists.tools?.items ?? []);

    try {
      await channel.request("tools/list", undefined, BOGUS_VERSION);
      probe.unsupportedVersion = { answered: true };
    } catch (err) {
      probe.unsupportedVersion = {
        answered: false,
        code: err instanceof RpcError ? err.code : undefined,
        message: (err as Error).message,
        data: err instanceof RpcError ? err.data : undefined,
      };
    }
    return probe;
  } finally {
    await channel.close().catch(() => {});
    const tail = channel.stderrTail();
    if (tail.length) probe.stderrTail = tail.slice(-10);
  }
}
