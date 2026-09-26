import { startServer, sendJsonRpc, makeResult } from "./base.js";
import type { TestResult } from "../runner.js";

/**
 * Simulates Claude Desktop MCP client.
 * Full spec compliance: dynamic discovery, auth persistence, UI rendering.
 */
export default async function testClaude(serverPath: string): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const { process, cleanup } = await startServer(serverPath);

  try {
    // 1. Discovery: tools/list
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
          ? `Discovered ${toolCount} tools via dynamic enumeration`
          : "No tools discovered — server may not implement tools/list",
        { toolCount, method: "tools/list" }
      )
    );

    // 2. Resources: resources/list
    const resourcesResponse = (await sendJsonRpc(process, "resources/list", {})) as {
      result?: { resources?: unknown[] };
    };
    const resourceCount = resourcesResponse.result?.resources?.length ?? 0;
    results.push(
      makeResult(
        "discovery",
        true, // Resources optional, so pass by default
        `Discovered ${resourceCount} resources`,
        { resourceCount }
      )
    );

    // 3. Auth: Simulate OAuth handshake
    const authResponse = (await sendJsonRpc(process, "auth/callback", {
      code: "test_authorization_code",
      state: "test_state",
    })) as {
      result?: { access_token?: string };
      error?: { message: string };
    };

    const hasToken = !!authResponse.result?.access_token;
    results.push(
      makeResult(
        "auth",
        hasToken,
        hasToken
          ? "OAuth callback returned access token"
          : `Auth failed: ${authResponse.error?.message || "no token returned"}`,
        { hasToken }
      )
    );

    // 4. UI: Check for MCP UI resource types
    const uiResponse = (await sendJsonRpc(process, "resources/list", {
      filter: { mimeType: "application/vnd.mcp-ui+json" },
    })) as {
      result?: { resources?: Array<{ mimeType?: string }> };
    };

    const uiResources = uiResponse.result?.resources?.filter(
      (r) => r.mimeType === "application/vnd.mcp-ui+json"
    ) ?? [];

    results.push(
      makeResult(
        "ui",
        uiResources.length > 0,
        uiResources.length > 0
          ? `Found ${uiResources.length} MCP UI components`
          : "No MCP UI components registered",
        { uiResourceCount: uiResources.length }
      )
    );
  } catch (err) {
    results.push(
      makeResult("discovery", false, `Fatal error during Claude test: ${(err as Error).message}`)
    );
  } finally {
    cleanup();
  }

  return results;
}
