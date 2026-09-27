/**
 * Streamable HTTP fixture. Modes (argv[2]):
 *   open         no auth
 *   oauth        401 + WWW-Authenticate + protected resource + AS metadata, and a working
 *                authorization server: DCR, /authorize (auto-approves, checks PKCE S256),
 *                /token (verifies the code verifier). MCP accepts tokens it issued.
 *   oauth-broken 401 without a challenge and no metadata
 * Prints "listening <port>" on stderr once ready.
 */
import { createHash } from "node:crypto";
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

async function readText(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const text = await readText(req);
  return text ? JSON.parse(text) : undefined;
}

const codes = new Map<string, { challenge: string; redirectUri: string }>();
const issued = new Set<string>();
let counter = 0;

const http = createServer(async (req, res) => {
  const origin = `http://${req.headers.host}`;
  const path = new URL(req.url ?? "/", origin).pathname;

  if (mode === "oauth") {
    const params = new URL(req.url ?? "/", origin).searchParams;
    if (path === "/register" && req.method === "POST") {
      const body = (await readBody(req)) as { redirect_uris?: string[] };
      return json(res, 201, { client_id: `client-${++counter}`, redirect_uris: body.redirect_uris, token_endpoint_auth_method: "none" });
    }
    if (path === "/authorize") {
      if (params.get("code_challenge_method") !== "S256") return json(res, 400, { error: "invalid_request" });
      const code = `code-${++counter}`;
      codes.set(code, { challenge: params.get("code_challenge")!, redirectUri: params.get("redirect_uri")! });
      const back = new URL(params.get("redirect_uri")!);
      back.searchParams.set("code", code);
      back.searchParams.set("state", params.get("state") ?? "");
      back.searchParams.set("iss", origin);
      res.writeHead(302, { location: back.href });
      return res.end();
    }
    if (path === "/token" && req.method === "POST") {
      const form = new URLSearchParams(await readText(req));
      if (form.get("grant_type") === "authorization_code") {
        const entry = codes.get(form.get("code") ?? "");
        const verifier = form.get("code_verifier") ?? "";
        const challenge = createHash("sha256").update(verifier).digest("base64url");
        if (!entry || entry.challenge !== challenge) return json(res, 400, { error: "invalid_grant" });
        codes.delete(form.get("code")!);
      } else if (form.get("grant_type") !== "refresh_token") {
        return json(res, 400, { error: "unsupported_grant_type" });
      }
      const token = `tok-${++counter}`;
      issued.add(token);
      return json(res, 200, { access_token: token, token_type: "Bearer", expires_in: 3600, refresh_token: `refresh-${counter}` });
    }
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
        token_endpoint_auth_methods_supported: ["none"],
        code_challenge_methods_supported: ["S256"],
      });
    }
  }

  if (path !== "/mcp") return json(res, 404, { error: "not_found" });

  const bearer = req.headers.authorization?.replace(/^Bearer /, "");
  const authorized = mode === "oauth" ? !!bearer && issued.has(bearer) : !!req.headers.authorization;
  if (mode !== "open" && !authorized) {
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
