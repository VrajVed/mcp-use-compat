import { spawn } from "child_process";
import type { TestResult } from "../runner.js";

export interface MCPClientEnv {
  name: string;
  supportsDynamicDiscovery: boolean;
  supportsAuthPersistence: boolean;
  supportsUI: boolean;
  mcpVersion: string;
}

export async function startServer(serverPath: string): Promise<{
  process: ReturnType<typeof spawn>;
  cleanup: () => void;
}> {
  const proc = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Wait for server to announce readiness (simple heuristic)
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Server startup timeout")), 5000);
    proc.stdout?.once("data", () => {
      clearTimeout(timeout);
      resolve();
    });
    proc.stderr?.once("data", (data) => {
      // Some servers log to stderr on startup
      if (data.toString().includes("Listening") || data.toString().includes("ready")) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  return {
    process: proc,
    cleanup: () => {
      proc.kill("SIGTERM");
    },
  };
}

export async function sendJsonRpc(
  proc: ReturnType<typeof spawn>,
  method: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const id = Math.random().toString(36).slice(2);
  const request = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";

  proc.stdin?.write(request);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("RPC timeout")), 3000);

    const handler = (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const response = JSON.parse(line);
          if (response.id === id) {
            clearTimeout(timeout);
            proc.stdout?.off("data", handler);
            resolve(response);
          }
        } catch {
          // Ignore non-JSON lines
        }
      }
    };

    proc.stdout?.on("data", handler);
  });
}

export function makeResult(
  category: string,
  passed: boolean,
  message: string,
  details?: Record<string, unknown>
): TestResult {
  return { category, passed, message, details };
}
