import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

export class RpcError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly data?: unknown
  ) {
    super(message);
  }
}

type Pending = {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
};

/**
 * Minimal JSON-RPC session over an MCP transport. Unlike the SDK Client it
 * returns results unvalidated, so malformed server output is observable rather
 * than thrown away.
 */
export class RpcSession {
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private closedError?: Error;
  readonly notifications: Array<{ method: string; params?: unknown }> = [];

  constructor(private readonly transport: Transport) {
    transport.onmessage = (message) => this.onMessage(message);
    transport.onclose = () => this.failAll(new Error("Connection closed by server"));
    transport.onerror = () => {
      // Transport errors surface via onclose or request timeouts.
    };
  }

  start(): Promise<void> {
    return this.transport.start();
  }

  request(method: string, params: Record<string, unknown> | undefined, timeoutMs: number): Promise<unknown> {
    if (this.closedError) return Promise.reject(this.closedError);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      const message = { jsonrpc: "2.0", id, method, ...(params ? { params } : {}) } as JSONRPCMessage;
      this.transport.send(message).catch((err: Error) => {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      });
    });
  }

  async notify(method: string, params?: Record<string, unknown>): Promise<void> {
    await this.transport.send({ jsonrpc: "2.0", method, ...(params ? { params } : {}) } as JSONRPCMessage);
  }

  async close(): Promise<void> {
    this.failAll(new Error("Session closed"));
    await this.transport.close();
  }

  private onMessage(message: JSONRPCMessage): void {
    const msg = message as Record<string, unknown>;
    const hasId = typeof msg.id === "string" || typeof msg.id === "number";

    if (hasId && typeof msg.method === "string") {
      // Server → client request. We advertise no client capabilities, so only ping is valid.
      const reply =
        msg.method === "ping"
          ? { jsonrpc: "2.0", id: msg.id, result: {} }
          : { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } };
      this.transport.send(reply as JSONRPCMessage).catch(() => {});
      return;
    }

    if (!hasId) {
      if (typeof msg.method === "string") {
        this.notifications.push({ method: msg.method, params: msg.params });
      }
      return;
    }

    const pending = this.pending.get(msg.id as number);
    if (!pending) return;
    this.pending.delete(msg.id as number);
    clearTimeout(pending.timer);

    if (msg.error && typeof msg.error === "object") {
      const err = msg.error as { code?: number; message?: string; data?: unknown };
      pending.reject(new RpcError(err.message ?? "Unknown error", err.code, err.data));
    } else {
      pending.resolve(msg.result);
    }
  }

  private failAll(err: Error): void {
    this.closedError ??= err;
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
      this.pending.delete(id);
    }
  }
}
