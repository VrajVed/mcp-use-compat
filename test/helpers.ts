import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import type { ConnectTarget } from "../src/connect/index.js";

export const ROOT = resolve(import.meta.dirname, "..");
export const TSX = resolve(ROOT, "node_modules/.bin/tsx");

export function fixture(name: string, ...args: string[]): ConnectTarget {
  return {
    kind: "stdio",
    command: TSX,
    args: [resolve(ROOT, "test/fixtures/servers", `${name}.ts`), ...args],
    cwd: ROOT,
    env: {},
  };
}

/** Starts the HTTP fixture in the given mode and resolves once it is listening. */
export async function startHttpFixture(mode: string): Promise<{ url: string; stop: () => void }> {
  const child: ChildProcess = spawn(TSX, [resolve(ROOT, "test/fixtures/servers/http.ts"), mode], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  const port = await new Promise<string>((resolvePort, reject) => {
    const timer = setTimeout(() => reject(new Error("http fixture did not start")), 15000);
    child.stderr!.on("data", (d) => {
      const m = /listening (\d+)/.exec(String(d));
      if (m) {
        clearTimeout(timer);
        resolvePort(m[1]);
      }
    });
  });
  return { url: `http://127.0.0.1:${port}/mcp`, stop: () => child.kill() };
}
