import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

export interface TestResult {
  category: string;
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface ClientResult {
  client: string;
  tests: TestResult[];
}

export async function runCompatSuite(
  serverPath: string,
  clients: string[]
): Promise<ClientResult[]> {
  const absolutePath = resolve(serverPath);
  const results: ClientResult[] = [];

  for (const client of clients) {
    const tests = await runClientTests(client, absolutePath);
    results.push({ client, tests });
  }

  return results;
}

async function runClientTests(client: string, serverPath: string): Promise<TestResult[]> {
  // Dynamic import so we can add clients without touching this file
  const modulePath = `./clients/${client}.js`;
  let clientModule;

  try {
    clientModule = await import(modulePath);
  } catch {
    return [
      {
        category: "discovery",
        passed: false,
        message: `Unknown client: ${client}. Supported: claude, chatgpt, cursor, opencode`,
      },
    ];
  }

  const runner = clientModule.default || clientModule;
  return await runner(serverPath);
}
