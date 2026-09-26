import type { CheckArea } from "./checks/types.js";
import type { Report } from "./evaluate.js";

export const EXIT = { ok: 0, failed: 1, usage: 2, connectFailed: 3 } as const;

export class PolicyError extends Error {}

type Policy =
  | { kind: "none" }
  | { kind: "severity"; includeWarn: boolean }
  | { kind: "match"; patterns: RegExp[] };

/**
 * --fail-on: "error" (default), "warn", "none", or a comma list of check ids,
 * id globs (TOOL_*) and areas (auth). A list fails on matching errors only.
 */
export function parsePolicy(spec: string, knownIds: string[], knownAreas: CheckArea[]): Policy {
  const value = spec.trim().toLowerCase();
  if (value === "none") return { kind: "none" };
  if (value === "error" || value === "") return { kind: "severity", includeWarn: false };
  if (value === "warn") return { kind: "severity", includeWarn: true };

  const patterns = spec.split(",").map((raw) => {
    const token = raw.trim();
    if ((knownAreas as string[]).includes(token.toLowerCase())) {
      return new RegExp(`^area:${token.toLowerCase()}$`);
    }
    const re = new RegExp(`^${token.toUpperCase().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
    if (!knownIds.some((id) => re.test(id))) {
      throw new PolicyError(`--fail-on: "${token}" matches no check id or area. See --list-checks.`);
    }
    return re;
  });
  return { kind: "match", patterns };
}

/** Findings that make the run fail, as "CLIENT CHECK_ID" strings (for the log). */
export function failures(report: Report, policy: Policy): string[] {
  if (policy.kind === "none") return [];
  const failing = new Set<string>();

  const matches = (checkId: string, area: string) =>
    policy.kind === "match" && policy.patterns.some((re) => re.test(checkId) || re.test(`area:${area}`));

  const consider = (label: string, checkId: string, area: string, status: string) => {
    const bad =
      policy.kind === "severity"
        ? status === "fail" || (policy.includeWarn && status === "warn")
        : status === "fail" && matches(checkId, area);
    if (bad) failing.add(`${label} ${checkId}`);
  };

  if (report.clients.length > 0) {
    for (const client of report.clients) {
      for (const row of client.rows) consider(client.client, row.checkId, row.area, row.status);
    }
  } else {
    // No client profiles selected: judge client-independent findings by severity.
    const areaOf = new Map(report.checks.map((c) => [c.id, c.area]));
    for (const f of report.findings.filter((f) => !f.client)) {
      const status = f.severity === "error" ? "fail" : f.severity;
      consider("server", f.checkId, areaOf.get(f.checkId) ?? "", status);
    }
  }
  return [...failing];
}

export function exitCode(report: Report, policy: Policy, snapshotConnectFailed: boolean): number {
  if (policy.kind !== "none" && snapshotConnectFailed) return EXIT.connectFailed;
  return failures(report, policy).length > 0 ? EXIT.failed : EXIT.ok;
}
