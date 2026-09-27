import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { auth, type OAuthClientProvider, type OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { TOOL_NAME, VERSION } from "./version.js";

export interface StoredCredentials {
  clientInformation?: OAuthClientInformationMixed;
  /** How the client got its id. */
  registration?: "cimd" | "dcr" | "preregistered";
  tokens?: OAuthTokens;
  /** Epoch ms when tokens were saved; with expires_in gives the expiry. */
  tokensSavedAt?: number;
  codeVerifier?: string;
  discoveryState?: OAuthDiscoveryState;
}

/** Credentials per MCP server URL in ~/.config/mcpkit/oauth.json (mode 0600). */
export class CredentialStore {
  constructor(readonly path: string = defaultStorePath()) {}

  all(): Record<string, StoredCredentials> {
    if (!existsSync(this.path)) return {};
    try {
      return JSON.parse(readFileSync(this.path, "utf8")) as Record<string, StoredCredentials>;
    } catch {
      return {};
    }
  }

  get(url: string): StoredCredentials {
    return this.all()[url] ?? {};
  }

  update(url: string, change: (current: StoredCredentials) => StoredCredentials | undefined): void {
    const data = this.all();
    const next = change(data[url] ?? {});
    if (next) data[url] = next;
    else delete data[url];
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    writeFileSync(this.path, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
    chmodSync(this.path, 0o600);
  }
}

export function defaultStorePath(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  const path = join(base, TOOL_NAME, "oauth.json");
  // Carry over credentials saved before the rename from mcp-use-compat.
  const legacy = join(base, "mcp-use-compat", "oauth.json");
  if (!existsSync(path) && existsSync(legacy)) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    copyFileSync(legacy, path);
    chmodSync(path, 0o600);
  }
  return path;
}

export interface ProviderOptions {
  redirectUrl?: string;
  clientId?: string;
  clientSecret?: string;
  /** HTTPS URL of a Client ID Metadata Document you host (used when the AS supports CIMD). */
  clientMetadataUrl?: string;
  scope?: string;
  /** Called with the authorization URL. Without it, needing a login is an error. */
  onRedirect?: (url: URL) => void | Promise<void>;
}

/** SDK OAuthClientProvider backed by the credential store. */
export class StoredOAuthProvider implements OAuthClientProvider {
  readonly clientMetadataUrl?: string;
  private readonly stateValue = randomBytes(16).toString("hex");

  constructor(
    private readonly serverUrl: string,
    private readonly store: CredentialStore,
    private readonly options: ProviderOptions = {}
  ) {
    this.clientMetadataUrl = options.clientMetadataUrl;
  }

  /**
   * Non-interactive providers (no onRedirect) still report a redirect URL so the SDK
   * takes the authorization-code path and reaches redirectToAuthorization, which
   * explains how to log in, instead of attempting a client-credentials grant.
   */
  get redirectUrl(): string | undefined {
    return this.options.redirectUrl ?? (this.options.onRedirect ? undefined : "http://127.0.0.1/not-logged-in");
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: TOOL_NAME,
      software_id: TOOL_NAME,
      software_version: VERSION,
      redirect_uris: this.options.redirectUrl ? [this.options.redirectUrl] : [],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: this.options.clientSecret ? "client_secret_post" : "none",
      ...(this.options.scope ? { scope: this.options.scope } : {}),
      // Required by protocol 2026-07-28 for DCR; ignored by older servers. Not in the SDK's type yet.
      ...({ application_type: "native" } as object),
    };
  }

  state(): string {
    return this.stateValue;
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    if (this.options.clientId) {
      return { client_id: this.options.clientId, ...(this.options.clientSecret ? { client_secret: this.options.clientSecret } : {}) };
    }
    const info = this.store.get(this.serverUrl).clientInformation;
    if (info) return info;
    // Never register a new client from a non-interactive run.
    if (!this.options.onRedirect) throw this.notLoggedIn();
    return undefined;
  }

  private notLoggedIn(): Error {
    return new Error(`Not logged in to ${this.serverUrl} (or the session can't be refreshed). Run: ${TOOL_NAME} oauth login --url ${this.serverUrl}`);
  }

  saveClientInformation(info: OAuthClientInformationMixed): void {
    const registration = info.client_id === this.clientMetadataUrl ? "cimd" : "dcr";
    this.store.update(this.serverUrl, (c) => ({ ...c, clientInformation: info, registration }));
  }

  tokens(): OAuthTokens | undefined {
    return this.store.get(this.serverUrl).tokens;
  }

  saveTokens(tokens: OAuthTokens): void {
    const registration = this.options.clientId
      ? "preregistered"
      : this.store.get(this.serverUrl).registration ?? (this.clientMetadataUrl ? "cimd" : undefined);
    this.store.update(this.serverUrl, (c) => ({ ...c, tokens, tokensSavedAt: Date.now(), registration }));
  }

  async redirectToAuthorization(url: URL): Promise<void> {
    if (!this.options.onRedirect) throw this.notLoggedIn();
    await this.options.onRedirect(url);
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.store.update(this.serverUrl, (c) => ({ ...c, codeVerifier }));
  }

  codeVerifier(): string {
    const verifier = this.store.get(this.serverUrl).codeVerifier;
    if (!verifier) throw new Error("No PKCE code verifier saved; restart the login.");
    return verifier;
  }

  saveDiscoveryState(state: OAuthDiscoveryState): void {
    this.store.update(this.serverUrl, (c) => ({ ...c, discoveryState: state }));
  }

  discoveryState(): OAuthDiscoveryState | undefined {
    return this.store.get(this.serverUrl).discoveryState;
  }

  invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery"): void {
    this.store.update(this.serverUrl, (c) => {
      if (scope === "all") return undefined;
      const next = { ...c };
      if (scope === "client") delete next.clientInformation;
      if (scope === "tokens") delete next.tokens;
      if (scope === "verifier") delete next.codeVerifier;
      if (scope === "discovery") delete next.discoveryState;
      return next;
    });
  }
}

export interface LoginOptions {
  url: string;
  callbackPort: number;
  clientId?: string;
  clientSecret?: string;
  clientMetadataUrl?: string;
  scope?: string;
  openBrowser: boolean;
  timeoutMs: number;
  store?: CredentialStore;
  /** Opens the authorization URL; defaults to the system browser. Tests pass a fake. */
  browser?: (url: string) => void;
  log: (msg: string) => void;
  /** Verifies the new token with an authenticated MCP request; returns a summary. */
  verify: (provider: StoredOAuthProvider) => Promise<string>;
}

export interface LoginStep {
  step: string;
  ok: boolean;
  detail: string;
}

/** Runs the full browser login and records each step. Throws only on programmer errors. */
export async function oauthLogin(options: LoginOptions): Promise<LoginStep[]> {
  const store = options.store ?? new CredentialStore();
  const steps: LoginStep[] = [];
  const record = (step: string, ok: boolean, detail: string) => {
    steps.push({ step, ok, detail });
    options.log(`${ok ? "✔" : "✖"} ${step}: ${detail}`);
    return ok;
  };

  // Start fresh: a DCR client registered earlier is tied to an old redirect port.
  store.update(options.url, () => undefined);

  const callback = await startCallbackServer(options.callbackPort);
  const redirectUrl = `http://127.0.0.1:${callback.port}/callback`;
  let authorizationUrl: URL | undefined;
  const provider = new StoredOAuthProvider(options.url, store, {
    redirectUrl,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    clientMetadataUrl: options.clientMetadataUrl,
    scope: options.scope,
    onRedirect: (url) => {
      authorizationUrl = url;
    },
  });

  try {
    let first;
    try {
      first = await auth(provider, { serverUrl: options.url, scope: options.scope });
    } catch (err) {
      record("Discovery and client registration", false, (err as Error).message);
      return steps;
    }
    const discovery = provider.discoveryState();
    record(
      "Discovery",
      true,
      `authorization server ${discovery?.authorizationServerUrl ?? "(unknown)"}${discovery?.resourceMetadata ? ", protected resource metadata found" : ", no protected resource metadata (fell back to the server origin)"}`
    );
    const registration = options.clientId ? "preregistered" : store.get(options.url).registration ?? (options.clientMetadataUrl ? "cimd" : "dcr");
    record("Client registration", true, { preregistered: "pre-registered client id", cimd: "Client ID Metadata Document", dcr: "Dynamic Client Registration" }[registration]);

    if (first === "AUTHORIZED") {
      record("Authorization", true, "already authorized");
    } else {
      const url = authorizationUrl!;
      const pkce = url.searchParams.get("code_challenge_method");
      const resource = url.searchParams.get("resource");
      record("Authorization request", pkce === "S256", `PKCE ${pkce ?? "missing"}, resource=${resource ?? "(none)"}`);
      options.log(`\nOpen this URL to log in${options.openBrowser ? " (opening your browser)" : ""}:\n  ${url.href}\n`);
      if (options.openBrowser) (options.browser ?? openInBrowser)(url.href);

      const result = await callback.waitForCode(options.timeoutMs);
      if ("error" in result) {
        record("Authorization", false, result.error);
        return steps;
      }
      if (result.state !== provider.state()) {
        record("Authorization", false, "state parameter mismatch (possible CSRF); aborting");
        return steps;
      }
      if (result.iss && discovery?.authorizationServerMetadata?.issuer && result.iss !== discovery.authorizationServerMetadata.issuer) {
        record("Authorization", false, `iss ${result.iss} doesn't match the issuer ${discovery.authorizationServerMetadata.issuer} (RFC 9207)`);
        return steps;
      }
      record("Authorization", true, `code received${result.iss ? ", iss matches issuer" : ""}`);

      try {
        await auth(provider, { serverUrl: options.url, authorizationCode: result.code, scope: options.scope });
      } catch (err) {
        record("Token exchange", false, (err as Error).message);
        return steps;
      }
    }

    const tokens = provider.tokens();
    record(
      "Token exchange",
      !!tokens?.access_token,
      tokens
        ? `${tokens.token_type} token${tokens.expires_in ? `, expires in ${tokens.expires_in}s` : ""}${tokens.refresh_token ? ", refresh token issued" : ", no refresh token"}${tokens.scope ? `, scope "${tokens.scope}"` : ""}`
        : "no tokens"
    );
    if (!tokens?.access_token) return steps;

    try {
      record("Authenticated MCP request", true, await options.verify(provider));
    } catch (err) {
      record("Authenticated MCP request", false, `${(err as Error).message} (token issued but rejected: check audience/resource and scopes)`);
    }
    return steps;
  } finally {
    callback.close();
  }
}

type CallbackResult = { code: string; state?: string; iss?: string } | { error: string };

async function startCallbackServer(port: number): Promise<{
  port: number;
  waitForCode: (timeoutMs: number) => Promise<CallbackResult>;
  close: () => void;
}> {
  let resolveResult!: (r: CallbackResult) => void;
  const result = new Promise<CallbackResult>((r) => (resolveResult = r));
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/callback") {
      res.writeHead(404).end();
      return;
    }
    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(
      `<!doctype html><title>${TOOL_NAME}</title><p>${error ? "Login failed. You can close this tab." : "Logged in. You can close this tab and return to the terminal."}</p>`
    );
    if (error) resolveResult({ error: `${error}${url.searchParams.get("error_description") ? `: ${url.searchParams.get("error_description")}` : ""}` });
    else if (code) resolveResult({ code, state: url.searchParams.get("state") ?? undefined, iss: url.searchParams.get("iss") ?? undefined });
    else resolveResult({ error: "callback without code or error" });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  return {
    port: typeof address === "object" && address ? address.port : port,
    waitForCode: (timeoutMs) =>
      Promise.race([result, new Promise<CallbackResult>((r) => setTimeout(() => r({ error: `no callback within ${Math.round(timeoutMs / 1000)}s` }), timeoutMs).unref())]),
    close: () => server.close(),
  };
}

function openInBrowser(url: string): void {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  } catch {
    // The URL is printed too.
  }
}

/** Human summary of stored credentials, without secrets. */
export function describeCredentials(url: string, c: StoredCredentials): string {
  const expires =
    c.tokens?.expires_in && c.tokensSavedAt ? new Date(c.tokensSavedAt + c.tokens.expires_in * 1000) : undefined;
  const state = !c.tokens
    ? "no tokens"
    : expires
      ? expires.getTime() > Date.now()
        ? `valid until ${expires.toISOString()}`
        : `expired ${expires.toISOString()}${c.tokens.refresh_token ? " (will refresh)" : ""}`
      : "no expiry given";
  return `${url}\n  ${c.registration ?? "unknown"} client ${c.clientInformation?.client_id ?? "-"} · ${state}`;
}
