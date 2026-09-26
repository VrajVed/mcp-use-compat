import { spawn, type ChildProcess } from "node:child_process";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessageSchema, type JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

const MAX_CAPTURED_LINES = 50;

export interface StdioOptions {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

/**
 * stdio transport that, unlike the SDK's, records what it sees: non-JSON-RPC
 * lines on stdout (a common server bug) and the tail of stderr.
 */
export class CapturingStdioTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  readonly stdoutNonJsonLines: string[] = [];
  readonly stderrTail: string[] = [];
  exitCode: number | null = null;
  exitSignal: NodeJS.Signals | null = null;

  private process?: ChildProcess;
  private buffer = "";
  private stderrBuffer = "";

  constructor(private readonly options: StdioOptions) {}

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.options.command, this.options.args, {
        cwd: this.options.cwd,
        env: { ...process.env, ...this.options.env },
        stdio: ["pipe", "pipe", "pipe"],
        shell: process.platform === "win32",
        windowsHide: true,
      });
      this.process = child;

      child.once("error", (err) => {
        reject(err);
        this.onerror?.(err);
      });
      child.once("spawn", () => resolve());
      child.once("close", (code, signal) => {
        this.exitCode = code;
        this.exitSignal = signal;
        this.flushStderr();
        this.onclose?.();
      });

      child.stdout!.setEncoding("utf8");
      child.stdout!.on("data", (chunk: string) => this.onStdout(chunk));
      child.stderr!.setEncoding("utf8");
      child.stderr!.on("data", (chunk: string) => this.onStderr(chunk));
      // A server that exits early closes stdin; don't crash on EPIPE.
      child.stdin!.on("error", (err) => this.onerror?.(err));
    });
  }

  async send(message: JSONRPCMessage): Promise<void> {
    const stdin = this.process?.stdin;
    if (!stdin || stdin.destroyed) throw new Error("Server process is not running");
    await new Promise<void>((resolve, reject) => {
      stdin.write(JSON.stringify(message) + "\n", (err) => (err ? reject(err) : resolve()));
    });
  }

  async close(): Promise<void> {
    const child = this.process;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
    child.stdin?.end();
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 2000);
    await closed;
    clearTimeout(timer);
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    let index: number;
    while ((index = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, index).replace(/\r$/, "");
      this.buffer = this.buffer.slice(index + 1);
      this.handleLine(line);
    }
  }

  private handleLine(line: string): void {
    if (line.trim() === "") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      this.recordNonJson(line);
      return;
    }
    const result = JSONRPCMessageSchema.safeParse(parsed);
    if (!result.success) {
      this.recordNonJson(line);
      return;
    }
    this.onmessage?.(result.data);
  }

  private recordNonJson(line: string): void {
    if (this.stdoutNonJsonLines.length < MAX_CAPTURED_LINES) {
      this.stdoutNonJsonLines.push(truncate(line));
    }
  }

  private onStderr(chunk: string): void {
    this.stderrBuffer += chunk;
    let index: number;
    while ((index = this.stderrBuffer.indexOf("\n")) !== -1) {
      this.pushStderr(this.stderrBuffer.slice(0, index).replace(/\r$/, ""));
      this.stderrBuffer = this.stderrBuffer.slice(index + 1);
    }
  }

  private flushStderr(): void {
    if (this.stderrBuffer) this.pushStderr(this.stderrBuffer);
    this.stderrBuffer = "";
  }

  private pushStderr(line: string): void {
    if (line.trim() === "") return;
    this.stderrTail.push(truncate(line));
    if (this.stderrTail.length > MAX_CAPTURED_LINES) this.stderrTail.shift();
  }
}

function truncate(line: string): string {
  return line.length > 500 ? line.slice(0, 500) + "…" : line;
}
