import { appendFileSync, writeFileSync } from "node:fs";
import { ALL_CHECKS } from "./checks/index.js";
import type { CheckArea } from "./checks/types.js";
import { UsageError, type RunOptions, type TargetOptions } from "./cli.js";
import { connect } from "./connect/index.js";
import { evaluate } from "./evaluate.js";
import { EXIT, exitCode, failures, parsePolicy, PolicyError } from "./policy.js";
import { ALL_PROFILES, selectProfiles, UnknownClientError } from "./profiles/index.js";
import { markdownReporter, REPORTERS } from "./reporters/index.js";
import { loadSnapshot, saveSnapshot, type ServerSnapshot } from "./snapshot.js";

const AREAS = [...new Set(ALL_CHECKS.map((c) => c.area))] as CheckArea[];

/** Runs the check command. Returns the process exit code. */
export async function run(options: RunOptions): Promise<number> {
  if (options.listChecks) return listChecks();
  if (options.listClients) return listClients();

  let profiles, policy;
  try {
    profiles = selectProfiles(options.clients);
    policy = parsePolicy(options.failOn, ALL_CHECKS.map((c) => c.id), AREAS);
  } catch (err) {
    if (err instanceof UnknownClientError || err instanceof PolicyError) throw new UsageError(err.message);
    throw err;
  }

  const snapshot = await getSnapshot(options);
  if (options.saveSnapshot) saveSnapshot(options.saveSnapshot, snapshot);

  const report = evaluate(snapshot, ALL_CHECKS, profiles);
  const output = REPORTERS[options.format](report);
  if (options.out) writeFileSync(options.out, output);
  else process.stdout.write(output);

  if (options.format === "github" && process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdownReporter(report));
  }

  const connectFailed = report.checks.some((c) => c.id === "TRANSPORT_CONNECT_FAILED" && c.ran) && !snapshot.connect.ok;
  const code = exitCode(report, policy, connectFailed);
  if (code === EXIT.connectFailed) {
    console.error(`\n✖ Could not connect to the server: ${snapshot.connect.error ?? "unknown error"}`);
  } else if (code === EXIT.failed) {
    const failed = failures(report, policy);
    console.error(`\n✖ ${failed.length} check result(s) failed --fail-on=${options.failOn}: ${failed.slice(0, 10).join(", ")}${failed.length > 10 ? ", …" : ""}`);
  } else {
    console.error(`\n✔ No results matched --fail-on=${options.failOn}.`);
  }
  return code;
}

export async function getSnapshot(options: TargetOptions & { versionMatrix?: boolean }): Promise<ServerSnapshot> {
  if (options.fromSnapshot) return loadSnapshot(options.fromSnapshot);
  return connect({
    target: options.target!,
    timeoutMs: options.timeoutMs,
    authProbe: options.authProbe,
    versionMatrix: options.versionMatrix,
  });
}

export function listChecks(): number {
  for (const area of AREAS) {
    console.log(`\n${area}`);
    for (const c of ALL_CHECKS.filter((c) => c.area === area)) console.log(`  ${c.id.padEnd(36)} ${c.description}`);
  }
  return EXIT.ok;
}

export function listClients(): number {
  if (ALL_PROFILES.length === 0) console.log("No client profiles yet.");
  for (const p of ALL_PROFILES) {
    const dates = [
      ...Object.values(p.supports).map((s) => s!.verifiedOn),
      ...Object.values(p.limits).map((l) => l!.verifiedOn),
    ].sort();
    const oldest = dates[0];
    const stale = oldest && Date.now() - Date.parse(oldest) > 90 * 86_400_000 ? "  (stale: re-verify)" : "";
    console.log(`${p.id.padEnd(16)} ${p.displayName.padEnd(28)} facts: ${dates.length}, oldest verified ${oldest ?? "-"}${stale}`);
  }
  return EXIT.ok;
}
