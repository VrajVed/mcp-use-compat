import { startServer, sendJsonRpc, makeResult } from "./base.js";
import type { TestResult } from "../runner.js";

/**
 * Simulates ChatGPT / Codex plugin client.
 * Partial MCP support: no dynamic discovery, no UI, manual auth.
 */
export default async function testChatGPT(serverPath: string): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const { process, cleanup } = await startServer(serverPath);

  try {
    // 1. Discovery: ChatGPT requires a static manifest — no dynamic tools/list
    const toolsResponse = (await sendJsonRpc(process, "tools/list", {})) as {
      result?: { tools?: unknown[] };
      error?: { message: string };
    };

    const toolCount = toolsResponse.result?.tools?.length ?? 0;
    const discoveryPassed = toolCount > 0;

    results.push(
      makeResult(
        "discovery",
        discoveryPassed,
        discoveryPassed
          ? `Server exposes ${toolCount} tools, but ChatGPT requires manual manifest registration`
          : "No tools found — ChatGPT plugin manifest will be empty",
        {
          toolCount,
          chatgptLimitation: "ChatGPT does not call tools/list dynamically. Tools must be declared in plugin manifest.",
        }
      )
    );

    // 2. Auth: ChatGPT requires HTTPS redirect URI
    const authResponse = (await sendJsonRpc(process, "auth/callback", {
      code: "test_code",
      redirect_uri: "http://localhost:3000/callback",
    })) as {
      result?: { access_token?: string };
      error?: { message: string; code?: number };
    };

    const isLocalhost = authResponse.error?.message?.includes("localhost") ||
                        authResponse.error?.message?.includes("http://");

    results.push(
      makeResult(
        "auth",
        !isLocalhost,
        isLocalhost
          ? "CRITICAL: ChatGPT rejects localhost redirect URIs. Use HTTPS."
          : "Auth callback accepted (or server doesn't validate URI)",
        {
          error: authResponse.error?.message,
          chatgptRequirement: "OAuth redirect_uri must be HTTPS, not localhost",
        }
      )
    );

    // 3. UI: ChatGPT does not support MCP UI resources
    results.push(
      makeResult(
        "ui",
        false,
        "ChatGPT does not render MCP UI components. They appear as plain text.",
        { clientSupport: false, fallback: "text_description" }
      )
    );
  } catch (err) {
    results.push(
      makeResult("discovery", false, `Fatal error during ChatGPT test: ${(err as Error).message}`)
    );
  } finally {
    cleanup();
  }

  return results;
}
