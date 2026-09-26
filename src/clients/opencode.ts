import { startServer, sendJsonRpc, makeResult } from "./base.js";
import type { TestResult } from "../runner.js";

/**
 * Simulates OpenCode CLI MCP client.
 * CLI-only: supports dynamic discovery, no auth persistence, no UI.
 */
export default async function testOpenCode(serverPath: string): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const { process, cleanup } = await startServer(serverPath);

  try {
    // 1. Discovery: supports dynamic tools/list
    const toolsResponse = (await sendJsonRpc(process, "tools/list", {})) as {
      result?: { tools?: unknown[] };
      error?: { message: string };
    };

    const toolCount = toolsResponse.result?.tools?.length ?? 0;
    results.push(
      makeResult(
        "discovery",
        toolCount > 0,
        toolCount > 0
          ? `Discovered ${toolCount} tools dynamically`
          : "No tools discovered",
        { toolCount, client: "opencode-cli" }
      )
    );

    // 2. Auth: no persistence in CLI sessions
    results.push(
      makeResult(
        "auth",
        false,
        "OpenCode CLI does not persist auth tokens across sessions.",
        {
          opencodeLimitation: "Each session starts fresh. Consider env-var or config-file auth.",
        }
      )
    );

    // 3. UI: CLI-only, no rendering
    results.push(
      makeResult(
        "ui",
        false,
        "OpenCode CLI does not render MCP UI components.",
        { clientSupport: false, fallback: "markdown_text" }
      )
    );
  } catch (err) {
    results.push(
      makeResult("discovery", false, `Fatal error during OpenCode test: ${(err as Error).message}`)
    );
  } finally {
    cleanup();
  }

  return results;
}
