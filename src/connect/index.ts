import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  LIST_KINDS,
  type ListKind,
  type ServerSnapshot,
  type VersionProbe,
} from "../snapshot.js";
import { TOOL_NAME, VERSION } from "../version.js";
import { detectProject, lookupLatest } from "../project.js";
import { callTool, probeCalls } from "./calls.js";
import { MODERN_VERSION, probeModern } from "./modern.js";
import { listAll, readUiResources, requester } from "./lists.js";
import { probeHttpAuth } from "./http.js";
import { RpcSession } from "./session.js";
import { CapturingStdioTransport } from "./stdio.js";

export type ConnectTarget =
  | { kind: "stdio"; command: string; args: string[]; cwd: string; env: Record<string, string> }
  | { kind: "http"; url: string; headers: Record<string, string>; authProvider?: OAuthClientProvider };

export interface ConnectOptions {
  target: ConnectTarget;
  timeoutMs: number;
  authProbe: boolean;
  /** Also initialize once per SDK-supported protocol version (one extra session each). */
  versionMatrix?: boolean;
  /** Call tools that declare readOnlyHint: true, with synthesized arguments. */
  probeCalls?: boolean;
  /** Tools the user asked to call explicitly, with their arguments. */
  calls?: Array<{ tool: string; args: Record<string, unknown> }>;
  /** Progress messages (stderr). */
  log?: (msg: string) => void;
  /** Skip registry lookups for the project's SDK versions. */
  offline?: boolean;
}

function makeTransport(target: ConnectTarget): Transport {
  return target.kind === "stdio"
    ? new CapturingStdioTransport(target)
    : new StreamableHTTPClientTransport(new URL(target.url), {
        requestInit: { headers: target.headers },
        authProvider: target.authProvider,
      });
}

export async function connect(options: ConnectOptions): Promise<ServerSnapshot> {
  const { target, timeoutMs } = options;
  const snapshot: ServerSnapshot = {
    snapshotVersion: 1,
    target:
      target.kind === "stdio"
        ? { kind: "stdio", command: target.command, args: target.args, cwd: target.cwd }
        : { kind: "http", url: target.url },
    connectedAt: new Date().toISOString(),
    connect: { ok: false },
    lists: {},
    io: { stdoutNonJsonLines: [], stderrTail: [] },
  };

  const transport = makeTransport(target);
  const session = new RpcSession(transport);

  try {
    const started = performance.now();
    await session.start();
    const init = (await session.request(
      "initialize",
      {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: TOOL_NAME, version: VERSION },
      },
      timeoutMs * 2
    )) as Record<string, unknown> | undefined;

    snapshot.connect = { ok: true, startupMs: Math.round(performance.now() - started) };
    const negotiated = typeof init?.protocolVersion === "string" ? init.protocolVersion : undefined;
    snapshot.initialize = {
      requestedProtocolVersion: LATEST_PROTOCOL_VERSION,
      negotiatedProtocolVersion: negotiated,
      serverInfo: isObject(init?.serverInfo) ? init.serverInfo : undefined,
      capabilities: isObject(init?.capabilities) ? init.capabilities : {},
      instructions: typeof init?.instructions === "string" ? init.instructions : undefined,
    };
    if (negotiated) transport.setProtocolVersion?.(negotiated);
    await session.notify("notifications/initialized");

    // Call every list method regardless of declared capabilities, so checks can
    // compare what was declared with what actually works.
    for (const kind of Object.keys(LIST_KINDS) as ListKind[]) {
      snapshot.lists[kind] = await listAll(requester(session, timeoutMs), kind);
    }
    snapshot.uiReads = await readUiResources(requester(session, timeoutMs), snapshot.lists.tools?.items ?? []);
    if (options.probeCalls || options.calls?.length) {
      const log = options.log ?? ((msg: string) => console.error(msg));
      snapshot.calls = options.probeCalls ? await probeCalls(session, snapshot.lists.tools?.items ?? [], timeoutMs, log) : [];
      for (const { tool, args } of options.calls ?? []) {
        snapshot.calls.push(await callTool(session, tool, args, "explicit", timeoutMs));
      }
    }
  } catch (err) {
    snapshot.connect = { ok: false, error: describeError(err, transport) };
  } finally {
    await session.close().catch(() => {});
  }

  if (transport instanceof CapturingStdioTransport) {
    snapshot.io = {
      stdoutNonJsonLines: transport.stdoutNonJsonLines,
      stderrTail: transport.stderrTail,
    };
  }

  const tokens = target.kind === "http" ? await target.authProvider?.tokens() : undefined;
  const authHeaders =
    target.kind === "http" ? (tokens ? { ...target.headers, authorization: `Bearer ${tokens.access_token}` } : target.headers) : {};

  // Protocol 2026-07-28 runs in its own session (its own process for stdio).
  const modern = await probeModern(target, timeoutMs, authHeaders);
  snapshot.modern = modern;
  snapshot.discover = modern.discover;
  if (!snapshot.connect.ok && modern.supported && modern.lists) {
    // Modern-only server: run every check over what 2026-07-28 returned.
    const info = modern.discoverMeta?.serverInfo ?? modern.pagesMeta?.tools?.[0]?.serverInfo;
    snapshot.era = "modern";
    snapshot.connect = { ok: true, startupMs: modern.startupMs, legacyError: snapshot.connect.error };
    snapshot.initialize = {
      requestedProtocolVersion: MODERN_VERSION,
      negotiatedProtocolVersion: MODERN_VERSION,
      serverInfo: info,
      capabilities: isObject(modern.discover.result?.capabilities) ? modern.discover.result.capabilities : {},
      instructions: typeof modern.discover.result?.instructions === "string" ? modern.discover.result.instructions : undefined,
    };
    snapshot.lists = modern.lists;
    snapshot.uiReads = modern.uiReads;
    if (!snapshot.io.stderrTail.length && modern.stderrTail) snapshot.io.stderrTail = modern.stderrTail;
  } else {
    snapshot.era = modern.supported && snapshot.connect.ok ? "both" : "legacy";
  }

  if (target.kind === "http" && options.authProbe) {
    snapshot.http = await probeHttpAuth(target.url, target.headers, timeoutMs);
  }

  if (target.kind === "stdio") {
    const project = detectProject(target.command, target.args, target.cwd);
    if (project) {
      if (!options.offline) await lookupLatest(project.sdks);
      snapshot.project = project;
    }
  }

  if (options.versionMatrix && snapshot.connect.ok && snapshot.era !== "modern") {
    snapshot.versionMatrix = await probeVersions(target, timeoutMs);
  }

  return snapshot;
}

/**
 * Published protocol revisions that use the initialize handshake. 2024-10-07 is in
 * the SDK's list but was never published, so it isn't probed.
 */
export const HANDSHAKE_VERSIONS = ["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"] as const;

/** Opens one session per handshake protocol version and records what the server answers. */
export async function probeVersions(target: ConnectTarget, timeoutMs: number): Promise<VersionProbe[]> {
  const results: VersionProbe[] = [];
  for (const requested of HANDSHAKE_VERSIONS) {
    const transport = makeTransport(target);
    const session = new RpcSession(transport);
    try {
      await session.start();
      const init = (await session.request(
        "initialize",
        { protocolVersion: requested, capabilities: {}, clientInfo: { name: TOOL_NAME, version: VERSION } },
        timeoutMs * 2
      )) as Record<string, unknown> | undefined;
      const negotiated = typeof init?.protocolVersion === "string" ? init.protocolVersion : undefined;
      if (negotiated) transport.setProtocolVersion?.(negotiated);
      await session.notify("notifications/initialized");
      const tools = await listAll(requester(session, timeoutMs), "tools");
      results.push({
        requested,
        ok: true,
        negotiated,
        tools: tools.ok ? tools.items.flatMap((t) => (typeof t.name === "string" ? [t.name] : [])).sort() : undefined,
      });
    } catch (err) {
      results.push({ requested, ok: false, error: describeError(err, transport) });
    } finally {
      await session.close().catch(() => {});
    }
  }
  return results;
}

function describeError(err: unknown, transport: Transport): string {
  const message = err instanceof Error ? err.message : String(err);
  if (transport instanceof CapturingStdioTransport && (transport.exitCode !== null || transport.exitSignal)) {
    const how = transport.exitSignal ? `signal ${transport.exitSignal}` : `code ${transport.exitCode}`;
    return `${message} (server exited with ${how})`;
  }
  return message;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

