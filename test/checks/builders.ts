import type { Check, CheckContext, Finding } from "../../src/checks/types.js";
import type { ClientProfile } from "../../src/profiles/types.js";
import type { ListResult, RawItem, ServerSnapshot } from "../../src/snapshot.js";

type DeepPartialSnapshot = Partial<Omit<ServerSnapshot, "initialize">> & {
  initialize?: Partial<NonNullable<ServerSnapshot["initialize"]>>;
};

export function list(items: RawItem[], extra: Partial<ListResult> = {}): ListResult {
  return { ok: true, items, pages: 1, durationMs: 5, ...extra };
}

export function failedList(code: number, message: string): ListResult {
  return { ok: false, items: [], pages: 0, durationMs: 5, error: { code, message } };
}

export const goodTool = (name = "get_weather"): RawItem => ({
  name,
  description: "Get the current weather for a city.",
  inputSchema: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
});

/** A connected stdio snapshot with sensible defaults; override what the test needs. */
export function snapshot(overrides: DeepPartialSnapshot = {}): ServerSnapshot {
  const { initialize, ...rest } = overrides;
  return {
    snapshotVersion: 1,
    target: { kind: "stdio", command: "node", args: ["server.js"], cwd: "/" },
    connectedAt: "2026-01-01T00:00:00.000Z",
    connect: { ok: true, startupMs: 100 },
    lists: { tools: list([goodTool()]) },
    io: { stdoutNonJsonLines: [], stderrTail: [] },
    ...rest,
    initialize: {
      requestedProtocolVersion: "2025-11-25",
      negotiatedProtocolVersion: "2025-11-25",
      serverInfo: { name: "test-server", version: "1.0.0" },
      capabilities: { tools: {} },
      ...initialize,
    },
  };
}

export function profile(overrides: Partial<ClientProfile> = {}): ClientProfile {
  return { id: "test-client", aliases: [], displayName: "Test Client", supports: {}, limits: {}, ...overrides };
}

export const src = { source: "https://example.com/docs", verifiedOn: "2026-01-01" };

export function runCheck(check: Check, s: ServerSnapshot, ctx: CheckContext = { profiles: [] }): Finding[] {
  if (!check.appliesTo(s)) throw new Error(`${check.id} does not apply to this snapshot`);
  const findings = check.run(s, ctx);
  for (const f of findings) {
    if (f.checkId !== check.id) throw new Error(`${check.id} emitted a finding for ${f.checkId}`);
  }
  return findings;
}

export function byId<T extends { id: string }>(checks: T[], id: string): T {
  const check = checks.find((c) => c.id === id);
  if (!check) throw new Error(`No check ${id}`);
  return check;
}
