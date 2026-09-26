import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import type { HttpProbe, HttpResponseProbe } from "../snapshot.js";
import { VERSION } from "../version.js";

/**
 * Unauthenticated discovery probes, following the MCP authorization spec:
 * one initialize POST without credentials, then RFC 9728 protected resource
 * metadata, then RFC 8414 / OIDC authorization server metadata.
 * Nothing here sends credentials or starts a real OAuth flow.
 */
export async function probeHttpAuth(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<HttpProbe> {
  const unauthenticated = await fetchProbe(url, timeoutMs, {
    method: "POST",
    headers: {
      ...withoutAuthorization(headers),
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "mcp-use-compat-auth-probe", version: VERSION },
      },
    }),
  });

  const probe: HttpProbe = { unauthenticated, protectedResource: [], authorizationServer: [] };
  if (unauthenticated.status !== 401 && unauthenticated.status !== 403) return probe;

  // Protected resource metadata: header hint first, then the well-known URIs.
  const prmUrls: string[] = [];
  const hinted = parseResourceMetadataParam(unauthenticated.headers?.["www-authenticate"]);
  if (hinted) prmUrls.push(hinted);
  prmUrls.push(...wellKnownUrls(url, "oauth-protected-resource"));

  let authServers: string[] = [];
  for (const prmUrl of unique(prmUrls)) {
    const res = await fetchProbe(prmUrl, timeoutMs);
    probe.protectedResource.push(res);
    const servers = (res.json as { authorization_servers?: unknown } | undefined)?.authorization_servers;
    if (res.status === 200 && Array.isArray(servers)) {
      authServers = servers.filter((s): s is string => typeof s === "string");
      break;
    }
  }

  for (const issuer of authServers.slice(0, 3)) {
    for (const asmUrl of authServerMetadataUrls(issuer)) {
      const res = await fetchProbe(asmUrl, timeoutMs);
      probe.authorizationServer.push(res);
      if (res.status === 200 && res.json && typeof res.json === "object") break;
    }
  }

  return probe;
}

/** RFC 9728 §3: path-suffixed well-known first, then the root. */
export function wellKnownUrls(resourceUrl: string, name: string): string[] {
  const u = new URL(resourceUrl);
  const path = u.pathname.replace(/\/$/, "");
  const urls = [];
  if (path) urls.push(`${u.origin}/.well-known/${name}${path}`);
  urls.push(`${u.origin}/.well-known/${name}`);
  return urls;
}

/** RFC 8414 path insertion, then OIDC path insertion, then OIDC path appending. */
export function authServerMetadataUrls(issuer: string): string[] {
  const u = new URL(issuer);
  const path = u.pathname.replace(/\/$/, "");
  if (!path) {
    return [
      `${u.origin}/.well-known/oauth-authorization-server`,
      `${u.origin}/.well-known/openid-configuration`,
    ];
  }
  return [
    `${u.origin}/.well-known/oauth-authorization-server${path}`,
    `${u.origin}/.well-known/openid-configuration${path}`,
    `${u.origin}${path}/.well-known/openid-configuration`,
  ];
}

export function parseResourceMetadataParam(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /resource_metadata\s*=\s*(?:"([^"]*)"|([^\s,]+))/i.exec(header);
  return match?.[1] ?? match?.[2];
}

async function fetchProbe(url: string, timeoutMs: number, init: RequestInit = {}): Promise<HttpResponseProbe> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { accept: "application/json", ...(init.headers as Record<string, string>) },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const headers: Record<string, string> = {};
    for (const name of ["www-authenticate", "content-type", "mcp-session-id"]) {
      const value = res.headers.get(name);
      if (value !== null) headers[name] = value;
    }
    let json: unknown;
    if (res.headers.get("content-type")?.includes("json")) {
      json = await res.json().catch(() => undefined);
    } else {
      await res.body?.cancel().catch(() => {});
    }
    return { url, status: res.status, headers, json };
  } catch (err) {
    return { url, error: (err as Error).message };
  }
}

function withoutAuthorization(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([k]) => k.toLowerCase() !== "authorization"));
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
