import type { HttpResponseProbe, ServerSnapshot } from "../snapshot.js";
import { isObject, str } from "./util.js";
import { defineCheck, type Finding } from "./types.js";

const DISCOVERY_SPEC =
  "https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery";
const REGISTRATION_SPEC = "https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration";

/** The server demanded credentials for an unauthenticated initialize. */
const protectedServer = (s: ServerSnapshot) => {
  const status = s.http?.unauthenticated.status;
  return status === 401 || status === 403;
};

const okJson = (r: HttpResponseProbe) => r.status === 200 && isObject(r.json);
const prm = (s: ServerSnapshot) => s.http?.protectedResource.find(okJson);
const asm = (s: ServerSnapshot) => s.http?.authorizationServer.find(okJson);
const json = (r: HttpResponseProbe | undefined) => (r?.json ?? {}) as Record<string, unknown>;

const withoutTrailingSlash = (u: string) => u.replace(/\/+$/, "");

export const authChecks = [
  defineCheck({
    id: "AUTH_CHALLENGE_MISSING",
    area: "auth",
    description: "401 responses carry a WWW-Authenticate challenge",
    appliesTo: protectedServer,
    run: (s) =>
      s.http!.unauthenticated.headers?.["www-authenticate"]
        ? []
        : [
            {
              checkId: "AUTH_CHALLENGE_MISSING",
              severity: "warn",
              message: `HTTP ${s.http!.unauthenticated.status} without a WWW-Authenticate header; clients must guess where the protected resource metadata is.`,
              affects: ["oauth"],
              source: DISCOVERY_SPEC,
              fix: 'Return WWW-Authenticate: Bearer resource_metadata="https://<host>/.well-known/oauth-protected-resource/<path>".',
            },
          ],
  }),

  defineCheck({
    id: "AUTH_PRM_MISSING",
    area: "auth",
    description: "Protected resource metadata (RFC 9728) is discoverable",
    appliesTo: protectedServer,
    run: (s) =>
      prm(s)
        ? []
        : [
            {
              checkId: "AUTH_PRM_MISSING",
              severity: "error",
              message: "No protected resource metadata found, so clients can't find the authorization server.",
              evidence: { tried: s.http!.protectedResource.map((r) => `${r.url} → ${r.status ?? r.error}`) },
              affects: ["oauth"],
              source: DISCOVERY_SPEC,
              fix: "Serve /.well-known/oauth-protected-resource (path-suffixed for your MCP endpoint) with resource and authorization_servers.",
            },
          ],
  }),

  defineCheck({
    id: "AUTH_PRM_INVALID",
    area: "auth",
    description: "Protected resource metadata names the resource and its authorization servers",
    appliesTo: (s) => protectedServer(s) && !!prm(s),
    run: (s) => {
      const metadata = json(prm(s));
      const findings: Finding[] = [];
      const servers = metadata.authorization_servers;
      if (!Array.isArray(servers) || !servers.some((a) => typeof a === "string")) {
        findings.push({
          checkId: "AUTH_PRM_INVALID",
          severity: "error",
          message: "Protected resource metadata has no authorization_servers.",
          affects: ["oauth"],
          source: DISCOVERY_SPEC,
          fix: 'Add "authorization_servers": ["https://<issuer>"].',
        });
      }
      const resource = str(metadata.resource);
      const url = s.target.kind === "http" ? s.target.url : "";
      if (!resource) {
        findings.push({
          checkId: "AUTH_PRM_INVALID",
          severity: "error",
          message: "Protected resource metadata has no resource.",
          affects: ["oauth"],
          source: DISCOVERY_SPEC,
          fix: `Add "resource": "${url}".`,
        });
      } else if (withoutTrailingSlash(resource) !== withoutTrailingSlash(url)) {
        findings.push({
          checkId: "AUTH_PRM_INVALID",
          severity: "error",
          subject: resource,
          message: `resource is ${resource} but the server is at ${url}; clients must reject metadata for a different resource (RFC 9728 §3.3).`,
          affects: ["oauth"],
          source: DISCOVERY_SPEC,
          fix: "Set resource to the exact MCP endpoint URL.",
        });
      }
      return findings;
    },
  }),

  defineCheck({
    id: "AUTH_ASM_MISSING",
    area: "auth",
    description: "Authorization server metadata (RFC 8414 / OIDC) is discoverable",
    appliesTo: (s) => protectedServer(s) && s.http!.authorizationServer.length > 0,
    run: (s) =>
      asm(s)
        ? []
        : [
            {
              checkId: "AUTH_ASM_MISSING",
              severity: "error",
              message: "No authorization server metadata at any well-known location.",
              evidence: { tried: s.http!.authorizationServer.map((r) => `${r.url} → ${r.status ?? r.error}`) },
              affects: ["oauth"],
              source: DISCOVERY_SPEC,
              fix: "Serve /.well-known/oauth-authorization-server or /.well-known/openid-configuration for the issuer.",
            },
          ],
  }),

  defineCheck({
    id: "AUTH_ISSUER_MISMATCH",
    area: "auth",
    description: "Authorization server metadata issuer matches the advertised issuer",
    appliesTo: (s) => protectedServer(s) && !!asm(s),
    run: (s) => {
      const servers = json(prm(s)).authorization_servers;
      // Malformed authorization_servers is reported by AUTH_PRM_INVALID.
      const advertised = Array.isArray(servers) ? servers.find((a): a is string => typeof a === "string") : undefined;
      const issuer = str(json(asm(s)).issuer);
      if (!advertised || (issuer && withoutTrailingSlash(issuer) === withoutTrailingSlash(advertised))) return [];
      return [
        {
          checkId: "AUTH_ISSUER_MISMATCH",
          severity: "error",
          message: `Metadata issuer is ${JSON.stringify(issuer ?? null)} but the resource names ${advertised}; spec-following clients reject the authorization server.`,
          affects: ["oauth"],
          source: DISCOVERY_SPEC,
          fix: "Make the issuer in the metadata identical to the URL in authorization_servers.",
        },
      ];
    },
  }),

  defineCheck({
    id: "AUTH_PKCE_S256_MISSING",
    area: "auth",
    description: "Authorization server advertises PKCE S256",
    appliesTo: (s) => protectedServer(s) && !!asm(s),
    run: (s) => {
      const methods = json(asm(s)).code_challenge_methods_supported;
      if (Array.isArray(methods) && methods.includes("S256")) return [];
      return [
        {
          checkId: "AUTH_PKCE_S256_MISSING",
          severity: "error",
          message: Array.isArray(methods)
            ? `code_challenge_methods_supported is ${JSON.stringify(methods)} without S256.`
            : "Authorization server metadata omits code_challenge_methods_supported; MCP clients must refuse to proceed (ChatGPT rejects the server).",
          affects: ["oauth"],
          source: DISCOVERY_SPEC,
          fix: 'Advertise "code_challenge_methods_supported": ["S256"].',
        },
      ];
    },
  }),

  defineCheck({
    id: "AUTH_CLIENT_REGISTRATION",
    area: "auth",
    description: "Clients can register themselves (CIMD or DCR)",
    appliesTo: (s) => protectedServer(s) && !!asm(s),
    run: (s) => {
      const metadata = json(asm(s));
      const cimd = metadata.client_id_metadata_document_supported === true;
      const dcr = typeof metadata.registration_endpoint === "string";
      if (cimd) return [];
      if (dcr) {
        return [
          {
            checkId: "AUTH_CLIENT_REGISTRATION",
            severity: "info",
            message:
              "Only Dynamic Client Registration is offered. It works with today's clients but is deprecated in protocol 2026-07-28 in favour of Client ID Metadata Documents.",
            source: REGISTRATION_SPEC,
            fix: "Also advertise client_id_metadata_document_supported: true.",
          },
        ];
      }
      return [
        {
          checkId: "AUTH_CLIENT_REGISTRATION",
          severity: "warn",
          message:
            "Neither Client ID Metadata Documents nor Dynamic Client Registration is offered, so users must obtain and paste a client ID/secret for every client.",
          affects: ["oauth"],
          source: REGISTRATION_SPEC,
          fix: "Support CIMD (client_id_metadata_document_supported: true) or a registration_endpoint.",
        },
      ];
    },
  }),

  defineCheck({
    id: "AUTH_INSECURE_URL",
    area: "auth",
    description: "Remote servers and OAuth endpoints use HTTPS",
    appliesTo: (s) => s.target.kind === "http",
    run: (s) => {
      const urls = [
        s.target.kind === "http" ? s.target.url : "",
        ...Object.entries(json(asm(s)))
          .filter(([k]) => k.endsWith("_endpoint"))
          .map(([, v]) => str(v) ?? ""),
      ];
      const insecure = urls.filter((u) => {
        try {
          const url = new URL(u);
          return url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
        } catch {
          return false;
        }
      });
      return [...new Set(insecure)].map((u) => ({
        checkId: "AUTH_INSECURE_URL",
        severity: "warn" as const,
        subject: u,
        message: "Plain http:// on a non-loopback host; OAuth 2.1 requires HTTPS and hosted clients will refuse it.",
        fix: "Serve over HTTPS.",
      }));
    },
  }),
];
