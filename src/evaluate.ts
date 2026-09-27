import type { Check, CheckArea, Finding, Severity } from "./checks/types.js";
import type { ClientProfile } from "./profiles/types.js";
import type { ServerSnapshot, Target } from "./snapshot.js";
import { PACKAGE_NAME, VERSION } from "./version.js";

export type Status = "pass" | "warn" | "fail" | "info" | "skip";

export interface Row {
  checkId: string;
  area: CheckArea;
  status: Status;
  message: string;
  subject?: string;
  fix?: string;
  source?: string;
}

export interface ClientVerdict {
  client: string;
  displayName: string;
  rows: Row[];
  summary: Record<Status, number>;
}

export interface Report {
  schemaVersion: 1;
  tool: { name: string; version: string };
  generatedAt: string;
  target: Target;
  server: {
    connected: boolean;
    /** Protocol generation the checks ran over. */
    era: "legacy" | "modern" | "both";
    /** Per protocol version: did it work, and what did the server answer (--version-matrix). */
    versions?: Array<{ version: string; ok: boolean; negotiated?: string }>;
    name?: string;
    version?: string;
    protocolVersion?: string;
    counts: { tools: number; resources: number; resourceTemplates: number; prompts: number };
  };
  checks: Array<{ id: string; area: CheckArea; description: string; ran: boolean }>;
  /** Everything the checks found, client-independent and client-specific. */
  findings: Finding[];
  clients: ClientVerdict[];
}

const SEVERITY_STATUS: Record<Severity, Status> = { error: "fail", warn: "warn", info: "info" };

export function runChecks(snapshot: ServerSnapshot, checks: Check[], profiles: ClientProfile[]) {
  const ran = new Set<string>();
  const findings: Finding[] = [];
  for (const check of checks) {
    if (!check.appliesTo(snapshot)) continue;
    ran.add(check.id);
    findings.push(...check.run(snapshot, { profiles }));
  }
  return { ran, findings };
}

/** Status of a client-independent finding for one client (see plan §5). */
export function statusFor(finding: Finding, profile: ClientProfile): { status: Status; note?: string; source?: string } {
  const base = SEVERITY_STATUS[finding.severity];
  if (!finding.affects?.length || base === "info") return { status: base };
  const unsupported = finding.affects.map((f) => profile.supports[f]).filter((s) => s?.value === false);
  if (unsupported.length === finding.affects.length) {
    return {
      status: "info",
      note: `Not relevant to ${profile.displayName}: it does not use ${finding.affects.join("/")}.`,
      source: unsupported[0]!.source,
    };
  }
  return { status: base };
}

export function evaluate(snapshot: ServerSnapshot, checks: Check[], profiles: ClientProfile[]): Report {
  const { ran, findings } = runChecks(snapshot, checks, profiles);

  const clients = profiles.map((profile): ClientVerdict => {
    const rows: Row[] = [];
    for (const check of checks) {
      if (!ran.has(check.id)) {
        rows.push({ checkId: check.id, area: check.area, status: "skip", message: "Not applicable" });
        continue;
      }
      const relevant = findings.filter((f) => f.checkId === check.id && (!f.client || f.client === profile.id));
      if (relevant.length === 0) {
        rows.push({ checkId: check.id, area: check.area, status: "pass", message: check.description });
        continue;
      }
      for (const f of relevant) {
        const { status, note, source } = f.client ? { status: SEVERITY_STATUS[f.severity], note: undefined, source: f.source } : statusFor(f, profile);
        rows.push({
          checkId: f.checkId,
          area: check.area,
          status,
          message: note ? `${f.message} (${note})` : f.message,
          subject: f.subject,
          fix: f.fix,
          source: source ?? f.source,
        });
      }
    }
    return { client: profile.id, displayName: profile.displayName, rows, summary: summarize(rows) };
  });

  const count = (kind: keyof ServerSnapshot["lists"]) => snapshot.lists[kind]?.items.length ?? 0;
  const info = snapshot.initialize?.serverInfo;
  return {
    schemaVersion: 1,
    tool: { name: PACKAGE_NAME, version: VERSION },
    generatedAt: new Date().toISOString(),
    target: snapshot.target,
    server: {
      connected: snapshot.connect.ok,
      era: snapshot.era ?? "legacy",
      versions: snapshot.versionMatrix
        ? [
            ...snapshot.versionMatrix.map((v) => ({ version: v.requested, ok: v.ok, negotiated: v.negotiated })),
            ...(snapshot.modern
              ? [{ version: snapshot.modern.version, ok: snapshot.modern.supported, negotiated: snapshot.modern.supported ? snapshot.modern.version : undefined }]
              : []),
          ]
        : undefined,
      name: typeof info?.name === "string" ? info.name : undefined,
      version: typeof info?.version === "string" ? info.version : undefined,
      protocolVersion: snapshot.initialize?.negotiatedProtocolVersion,
      counts: {
        tools: count("tools"),
        resources: count("resources"),
        resourceTemplates: count("resourceTemplates"),
        prompts: count("prompts"),
      },
    },
    checks: checks.map((c) => ({ id: c.id, area: c.area, description: c.description, ran: ran.has(c.id) })),
    findings: sortFindings(findings),
    clients,
  };
}

function summarize(rows: Row[]): Record<Status, number> {
  const summary: Record<Status, number> = { pass: 0, warn: 0, fail: 0, info: 0, skip: 0 };
  for (const r of rows) summary[r.status]++;
  return summary;
}

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.checkId.localeCompare(b.checkId) ||
      (a.client ?? "").localeCompare(b.client ?? "") ||
      (a.subject ?? "").localeCompare(b.subject ?? "")
  );
}
