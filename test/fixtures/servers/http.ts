/**
 * Streamable HTTP fixture. Modes (argv[2]):
 *   open         no auth
 *   oauth        401 + WWW-Authenticate + protected resource + AS metadata (with DCR)
 *   oauth-broken 401 without a challenge and no metadata
 * Prints "listening <port>" on stderr once ready.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const mode = process.argv[2] ?? "open";

function buildServer(): McpServer {
  const server = new McpServer({ name: `http-${mode}-fixture`, version: "1.0.0" });
  server.registerTool(
    "echo",
    { description: "Echo the given text back to the caller.", inputSchema: { text: z.string() } },
    async ({ text }) => ({ content: [{ type: "text", text }] })
  );
  return server;
}

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : undefined;
}

const http = createServer(async (req, res) => {
  const origin = `http://${req.headers.host}`;
  const path = new URL(req.url ?? "/", origin).pathname;

  if (mode === "oauth") {
    if (path === "/.well-known/oauth-protected-resource/mcp") {
      return json(res, 200, { resource: `${origin}/mcp`, authorization_servers: [origin] });
    }
    if (path === "/.well-known/oauth-authorization-server") {
      return json(res, 200, {
        issuer: origin,
        authorization_endpoint: `${origin}/authorize`,
        token_endpoint: `${origin}/token`,
        registration_endpoint: `${origin}/register`,
        response_types_supported: ["code"],
        code_challenge_methods_supported: ["S256"],
      });
    }
  }

  if (path !== "/mcp") return json(res, 404, { error: "not_found" });

  if (mode !== "open" && !req.headers.authorization) {
    const headers: Record<string, string> =
      mode === "oauth"
        ? { "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"` }
        : {};
    return json(res, 401, { error: "unauthorized" }, headers);
  }

  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.method === "POST" ? await readBody(req) : undefined);
});

http.listen(Number(process.env.PORT ?? 0), "127.0.0.1", () => {
  const address = http.address();
  console.error(`listening ${typeof address === "object" && address ? address.port : ""}`);
});
