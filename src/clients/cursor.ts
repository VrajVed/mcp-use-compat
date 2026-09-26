import { startServer, sendJsonRpc, makeResult } from "./base.js";
import type { TestResult } from "../runner.js";

/**
 * Simulates Cursor MCP client.
 * Static tool list (no dynamic discovery), no auth persistence, no UI.
 */
export default async function testCursor(serverPath: string): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const { process, cleanup } = await startServer(serverPath);

  try {
    // 1. Discovery: Cursor uses static tool list from config, ignores tools/list
    const toolsResponse = (await sendJsonRpc(process, "tools/list", {})) as {
      result?: { tools?: Array<{ name: string; description?: string | null }> };
      error?: { message: string };
    };

    const tools = toolsResponse.result?.tools ?? [];
    const nullDescriptions = tools.filter((t) => !t.description || t.description === null);

    results.push(
      makeResult(
        "discovery",
        tools.length > 0,
        tools.length > 0
          ? `Found ${tools.length} tools, but Cursor uses static config (mcp.json). tools/list is ignored.`
          : "No tools found",
        {
          toolCount: tools.length,
          cursorLimitation: "Tools must be declared in .cursor/mcp.json. Dynamic discovery not supported.",
          nullDescriptionWarning:
            nullDescriptions.length > 0
              ? `${nullDescriptions.length} tools have null descriptions — Cursor may crash on these`
              : undefined,
        }
      )
    );

    // 2. Auth: Cursor does not persist tokens across sessions
    results.push(
      makeResult(
        "auth",
        false,
        "Cursor does not persist OAuth tokens. Users must re-authenticate every session.",
        {
          cursorLimitation: "No auth persistence. Consider API-key auth as fallback.",
        }
      )
    );

    // 3. Edge case: Cursor crashes on null description fields (observed bug)
    results.push(
      makeResult(
        "edge-cases",
        nullDescriptions.length === 0,
        nullDescriptions.length === 0
          ? "All tools have valid descriptions"
          : `WARNING: ${nullDescriptions.length} tools have null descriptions. Cursor < 0.45 crashes on these.`,
        {
          affectedTools: nullDescriptions.map((t) => t.name),
          workaround: "Always provide non-null descriptions in tool definitions.",
        }
      )
    );

    // 4. UI: Not supported
    results.push(
      makeResult(
        "ui",
        false,
        "Cursor does not render MCP UI components.",
        { clientSupport: false }
      )
    );
  } catch (err) {
    results.push(
      makeResult("discovery", false, `Fatal error during Cursor test: ${(err as Error).message}`)
    );
  } finally {
    cleanup();
  }

  return results;
}
