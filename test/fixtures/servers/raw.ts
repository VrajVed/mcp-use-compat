/**
 * Hand-rolled stdio MCP server for fixtures the SDK would refuse to produce
 * (null descriptions, stdout logging, bad schemas, ...). Each fixture file
 * calls `serve()` with the raw data it wants to send.
 */
import { createInterface } from "node:readline";

export interface RawServerConfig {
  protocolVersion?: string;
  serverInfo?: unknown;
  capabilities?: Record<string, unknown>;
  tools?: unknown[];
  resources?: unknown[];
  resourceTemplates?: unknown[];
  prompts?: unknown[];
  /** Delay before reading stdin, to simulate slow startup. */
  startupDelayMs?: number;
  /** Delay before answering list requests. */
  listDelayMs?: number;
  /** Written to stdout at startup and before every response. */
  stdoutNoise?: string;
  /** Page size for tools/list (enables pagination). */
  toolsPageSize?: number;
  /** Always return the same nextCursor for tools/list. */
  toolsCursorLoop?: boolean;
  /** Methods that return an internal error even if declared. */
  brokenMethods?: string[];
  /** Reject initialize with "method not found" (a 2026-07-28-only server). */
  rejectInitialize?: boolean;
  /** Result for server/discover; omitted = method not found. */
  discover?: Record<string, unknown>;
  /** resources/read contents by URI. */
  resourceContents?: Record<string, { mimeType?: string; text: string }>;
  /** tools/call results by tool name; `{ rpcError }` answers with a JSON-RPC error. */
  callResults?: Record<string, unknown>;
  /**
   * 2026-07-28 behaviour for requests carrying the _meta envelope: add resultType,
   * ttlMs/cacheScope and serverInfo to results (conformant: true), and reject
   * unsupported versions with -32022.
   */
  modern?: { conformant: boolean; tools?: unknown[] };
}

const MODERN = "2026-07-28";

export async function serve(config: RawServerConfig): Promise<void> {
  if (config.startupDelayMs) await sleep(config.startupDelayMs);
  if (config.stdoutNoise) process.stdout.write(config.stdoutNoise + "\n");

  const lists: Record<string, [string, unknown[] | undefined]> = {
    "tools/list": ["tools", config.tools],
    "resources/list": ["resources", config.resources],
    "resources/templates/list": ["resourceTemplates", config.resourceTemplates],
    "prompts/list": ["prompts", config.prompts],
  };

  const send = (msg: unknown) => {
    if (config.stdoutNoise) process.stdout.write(config.stdoutNoise + "\n");
    process.stdout.write(JSON.stringify(msg) + "\n");
  };

  createInterface({ input: process.stdin }).on("line", async (line) => {
    let msg: { id?: number | string; method?: string; params?: { cursor?: string; uri?: string; name?: string } };
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.id === undefined || !msg.method) return;
    const { id, method } = msg;
    const meta = (msg.params as { _meta?: Record<string, unknown> } | undefined)?._meta;
    const requestedVersion = meta?.["io.modelcontextprotocol/protocolVersion"];
    const isModern = config.modern && typeof requestedVersion === "string";
    if (isModern && config.modern!.conformant && requestedVersion !== MODERN) {
      send({
        jsonrpc: "2.0",
        id,
        error: { code: -32022, message: "Unsupported protocol version", data: { supported: [MODERN], requested: requestedVersion } },
      });
      return;
    }
    // Decorates results for 2026-07-28 requests when the fixture is conformant.
    const modernSend = (result: Record<string, unknown>, cacheable: boolean) => {
      const decorated =
        isModern && config.modern!.conformant
          ? {
              ...result,
              resultType: "complete",
              ...(cacheable ? { ttlMs: 60000, cacheScope: "public" } : {}),
              _meta: { "io.modelcontextprotocol/serverInfo": config.serverInfo ?? { name: "raw-fixture", version: "1.0.0" } },
            }
          : result;
      send({ jsonrpc: "2.0", id, result: decorated });
    };

    if (method === "server/discover" && config.discover) {
      modernSend(config.discover, true);
      return;
    }

    if (method === "resources/read") {
      const uri = (msg.params as { uri?: string } | undefined)?.uri ?? "";
      const content = config.resourceContents?.[uri];
      if (content) send({ jsonrpc: "2.0", id, result: { contents: [{ uri, ...content }] } });
      else send({ jsonrpc: "2.0", id, error: { code: -32002, message: `Resource not found: ${uri}` } });
      return;
    }

    if (method === "tools/call" && config.callResults) {
      const name = (msg.params as { name?: string } | undefined)?.name ?? "";
      console.error(`CALLED ${name}`);
      const result = config.callResults[name] as { rpcError?: string } | undefined;
      if (!result) send({ jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown tool: ${name}` } });
      else if (result.rpcError) send({ jsonrpc: "2.0", id, error: { code: -32603, message: result.rpcError } });
      else send({ jsonrpc: "2.0", id, result });
      return;
    }

    if (method === "initialize" && config.rejectInitialize) {
      send({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found: initialize" } });
      return;
    }

    if (method === "initialize") {
      send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: config.protocolVersion ?? "2025-06-18",
          serverInfo: config.serverInfo ?? { name: "raw-fixture", version: "1.0.0" },
          capabilities: config.capabilities ?? {},
        },
      });
      return;
    }

    const list = lists[method];
    if (list && list[1] !== undefined && !config.brokenMethods?.includes(method)) {
      if (config.listDelayMs) await sleep(config.listDelayMs);
      const [key, items] = list;
      if (method === "tools/list" && (config.toolsPageSize || config.toolsCursorLoop)) {
        if (config.toolsCursorLoop) {
          send({ jsonrpc: "2.0", id, result: { [key]: items.slice(0, 1), nextCursor: "same" } });
          return;
        }
        const size = config.toolsPageSize!;
        const offset = Number(msg.params?.cursor ?? 0);
        const next = offset + size < items.length ? String(offset + size) : undefined;
        send({ jsonrpc: "2.0", id, result: { [key]: items.slice(offset, offset + size), nextCursor: next } });
        return;
      }
      const listed = isModern && key === "tools" && config.modern!.tools ? config.modern!.tools : items;
      modernSend({ [key]: listed }, true);
      return;
    }
    if (config.brokenMethods?.includes(method)) {
      send({ jsonrpc: "2.0", id, error: { code: -32603, message: "Internal error" } });
      return;
    }
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
