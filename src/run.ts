import { appendFileSync, writeFileSync } from "node:fs";
import { ALL_CHECKS } from "./checks/index.js";
import type { CheckArea } from "./checks/types.js";
import { UsageError, type CallOptions, type OAuthLoginOptions, type RunOptions, type TargetOptions } from "./cli.js";
import { CredentialStore, describeCredentials, oauthLogin, StoredOAuthProvider } from "./oauth.js";
import { connect, type ConnectOptions } from "./connect/index.js";
import { evaluate, type Report } from "./evaluate.js";
import { EXIT, exitCode, failures, parsePolicy, PolicyError } from "./policy.js";
import { ALL_PROFILES, selectProfiles, UnknownClientError } from "./profiles/index.js";
import { markdownReporter, REPORTERS } from "./reporters/index.js";
import { badge, groupFindings } from "./reporters/pretty.js";
import { colorJson, err, out, padEnd, rule, Spinner, SYM, width, wrap } from "./term.js";
import { cell } from "./reporters/escape.js";
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

  const spinner = new Spinner();
  const snapshot = await getSnapshot(options, spinner);
  spinner.stop();
  if (options.saveSnapshot) saveSnapshot(options.saveSnapshot, snapshot);

  const report = evaluate(snapshot, ALL_CHECKS, profiles);
  const output = REPORTERS[options.format](report, { verbose: options.verbose, toFile: !!options.out });
  if (options.out) writeFileSync(options.out, output);
  else process.stdout.write(output);

  if (options.format === "github" && process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdownReporter(report));
  }

  const connectFailed = report.checks.some((c) => c.id === "TRANSPORT_CONNECT_FAILED" && c.ran) && !snapshot.connect.ok;
  const code = exitCode(report, policy, connectFailed);
  printVerdict(report, code, failures(report, policy), options, snapshot);
  return code;
}

/** The closing line on stderr: pass/fail at a glance, with what matched --fail-on. */
function printVerdict(report: Report, code: number, failed: string[], options: RunOptions, snapshot: ServerSnapshot): void {
  const p = err();
  const groups = groupFindings(report);
  const count = (sev: string) => groups.filter((g) => g.severity === sev).length;
  const tally = [
    `${count("error")} ${count("error") === 1 ? "error" : "errors"}`,
    `${count("warn")} ${count("warn") === 1 ? "warning" : "warnings"}`,
    `${count("info")} ${count("info") === 1 ? "note" : "notes"}`,
    `${report.clients.length} clients`,
  ].join(p.gray(` ${SYM.bullet} `));
  const tag = (color: (s: string) => string, text: string) => color(p.bold(` ${text} `));
  if (options.out) process.stderr.write(`${p.gray(`${SYM.arrow} report written to ${options.out}`)}\n`);
  if (code === EXIT.connectFailed) {
    process.stderr.write(`\n${tag((x) => p.bgRed(p.black(x)), "FAIL")} ${p.red(`Could not connect to the server: ${snapshot.connect.error ?? "unknown error"}`)}\n`);
    return;
  }
  if (code === EXIT.failed) {
    const byCheck = new Map<string, number>();
    for (const f of failed) {
      const id = f.split(" ").pop()!;
      byCheck.set(id, (byCheck.get(id) ?? 0) + 1);
    }
    const list = [...byCheck].slice(0, 6).map(([id, n]) => `${p.cyan(id)}${n > 1 ? p.gray(` ×${n}`) : ""}`).join(p.gray(", "));
    process.stderr.write(`\n${tag((x) => p.bgRed(p.black(x)), "FAIL")} ${tally}  ${p.gray(`fail-on: ${options.failOn}`)}\n       ${list}${byCheck.size > 6 ? p.gray(` +${byCheck.size - 6} more`) : ""}\n`);
    return;
  }
  process.stderr.write(`\n${tag((x) => p.bgGreen(p.black(x)), "PASS")} ${tally}  ${p.gray(`nothing matched --fail-on=${options.failOn}`)}\n`);
}

export async function getSnapshot(
  options: TargetOptions & Pick<ConnectOptions, "versionMatrix" | "probeCalls" | "calls">,
  spinner?: Spinner
): Promise<ServerSnapshot> {
  if (options.fromSnapshot) return loadSnapshot(options.fromSnapshot);
  spinner?.start("connecting");
  let target = options.target!;
  if (options.oauth && target.kind === "http") {
    target = { ...target, authProvider: new StoredOAuthProvider(target.url, new CredentialStore()) };
  }
  return connect({
    target,
    timeoutMs: options.timeoutMs,
    authProbe: options.authProbe,
    versionMatrix: options.versionMatrix,
    probeCalls: options.probeCalls,
    calls: options.calls,
    offline: options.offline,
    progress: (stage) => spinner?.update(stage),
    log: (message) => (spinner ? spinner.log(`${err().gray(SYM.arrow)} ${err().dim(message)}`) : console.error(message)),
  });
}

/** Calls one tool, prints its result and any call findings. */
export async function runCall(options: CallOptions): Promise<number> {
  if (options.fromSnapshot) throw new UsageError("call needs a live server (-- <command> or --url), not a snapshot");
  const spinner = new Spinner();
  const snapshot = await getSnapshot({ ...options, calls: [{ tool: options.tool, args: options.args }] }, spinner);
  spinner.stop();
  if (!snapshot.connect.ok) {
    const p = err();
    console.error(`${p.red(`${SYM.fail} Could not connect to the server:`)} ${snapshot.connect.error ?? "unknown error"}`);
    return EXIT.connectFailed;
  }
  const probe = snapshot.calls?.[0];
  const report = evaluate(snapshot, ALL_CHECKS.filter((c) => c.area === "calls"), []);
  const known = snapshot.lists.tools?.items.some((t) => t.name === options.tool);
  const failed = report.findings.some((f) => f.severity === "error") || !!probe?.error;

  if (options.format === "json") {
    process.stdout.write(JSON.stringify({ call: probe, findings: report.findings }, null, 2) + "\n");
  } else if (options.format === "pretty") {
    const p = out();
    const w = width();
    const lines = ["", `  ${p.bold(p.cyan(options.tool))}${p.gray(`(${JSON.stringify(options.args)})`)}  ${p.gray(`${probe?.durationMs ?? "?"} ms${probe?.resultChars !== undefined ? ` ${SYM.bullet} ${probe.resultChars} chars` : ""}`)}`];
    if (!known) lines.push(`  ${p.yellow(`${SYM.warn} "${options.tool}" is not in the server's tools/list`)}`);
    lines.push("", "  " + rule(p, probe?.error ? "error" : probe?.result?.isError ? "result (isError)" : "result", w - 2), "");
    lines.push(colorJson(p, probe?.result ?? { error: probe?.error }).replace(/^/gm, "  "), "");
    lines.push("  " + rule(p, "checks", w - 2), "");
    if (report.findings.length === 0) lines.push(`  ${p.green(`${SYM.pass} The result is valid.`)}`);
    for (const f of report.findings) {
      lines.push(`  ${badge(p, f.severity)}  ${p.cyan(f.checkId)}`);
      lines.push(`          ${wrap(f.message, w - 12, "          ")}`);
      if (f.fix) lines.push(`          ${p.green("fix")}  ${wrap(f.fix, w - 17, "               ")}`);
    }
    lines.push("");
    process.stdout.write(lines.join("\n") + "\n");
  } else {
    const lines = [`# ${options.tool}(${JSON.stringify(options.args)})`, ""];
    if (!known) lines.push(`_Note: "${options.tool}" is not in the server's tools/list._`, "");
    lines.push(`${probe?.durationMs ?? "?"} ms${probe?.resultChars !== undefined ? ` · ${probe.resultChars} characters` : ""}`, "");
    lines.push("```json", JSON.stringify(probe?.result ?? { error: probe?.error }, null, 2), "```", "");
    if (report.findings.length) {
      lines.push("| Severity | Check | Message |", "|---|---|---|");
      for (const f of report.findings) lines.push(`| ${f.severity} | \`${f.checkId}\` | ${cell(f.message)} |`);
    } else {
      lines.push("_No problems found in the result._");
    }
    process.stdout.write(lines.join("\n") + "\n");
  }
  return failed ? EXIT.failed : EXIT.ok;
}

/** Colours the "✔ step: detail" lines oauthLogin prints. */
function styleStep(message: string): string {
  const p = err();
  const m = /^([✔✖]) ([^:]+): (.*)$/s.exec(message);
  if (!m) return message.startsWith("\nOpen this URL") ? p.bold(message) : message;
  const [, mark, step, detail] = m;
  return `${mark === "✔" ? p.green(mark) : p.red(mark)} ${p.bold(step.padEnd(26))} ${mark === "✔" ? p.gray(detail) : p.red(detail)}`;
}

export async function runOAuthLogin(options: OAuthLoginOptions): Promise<number> {
  const p = err();
  console.error(`\n  ${p.bold(p.cyan("oauth login"))} ${p.gray(options.url)}\n`);
  const steps = await oauthLogin({
    ...options,
    log: (m) => console.error("  " + styleStep(m)),
    verify: async (provider) => {
      const snapshot = await connect({
        target: { kind: "http", url: options.url, headers: {}, authProvider: provider },
        timeoutMs: 15000,
        authProbe: false,
      });
      if (!snapshot.connect.ok) throw new Error(snapshot.connect.error ?? "connect failed");
      return `initialize + tools/list OK (${snapshot.lists.tools?.items.length ?? 0} tools)`;
    },
  });
  const ok = steps.length > 0 && steps.every((s) => s.ok);
  console.error(
    ok
      ? `\n${p.bgGreen(p.black(p.bold(" DONE ")))} Logged in. Add ${p.cyan("-A")} (--oauth) to check or call to reuse these credentials.`
      : `\n${p.bgRed(p.black(p.bold(" FAIL ")))} Login did not complete.`
  );
  return ok ? EXIT.ok : EXIT.failed;
}

export function runOAuthStatus(): number {
  const p = out();
  const all = new CredentialStore().all();
  const urls = Object.keys(all);
  if (urls.length === 0) console.log(p.gray("No stored credentials. Log in with: mcpkit oauth login -u <url>"));
  for (const url of urls) {
    const [first, second] = describeCredentials(url, all[url]).split("\n");
    const state = second?.trim() ?? "";
    const color = /expired/.test(state) ? p.yellow : /no tokens/.test(state) ? p.red : p.green;
    console.log(`${color(SYM.pass)} ${p.bold(first)}\n  ${p.gray(state)}`);
  }
  return EXIT.ok;
}

export function runOAuthLogout(url: string): number {
  const p = err();
  const store = new CredentialStore();
  const had = url in store.all();
  store.update(url, () => undefined);
  console.error(had ? `${p.green(SYM.pass)} Removed credentials for ${p.bold(url)}.` : p.gray(`No credentials stored for ${url}.`));
  return EXIT.ok;
}

export function listChecks(): number {
  const p = out();
  for (const area of AREAS) {
    const checks = ALL_CHECKS.filter((c) => c.area === area);
    console.log(`\n${p.bold(p.magenta(area))} ${p.gray(`(${checks.length})`)}`);
    for (const c of checks) console.log(`  ${padEnd(p.cyan(c.id), 36)} ${c.description}`);
  }
  console.log(p.gray(`\n${ALL_CHECKS.length} checks. Details: mcpkit ex <CHECK_ID>`));
  return EXIT.ok;
}

export function listClients(): number {
  const p = out();
  if (ALL_PROFILES.length === 0) console.log("No client profiles yet.");
  console.log("");
  for (const profile of ALL_PROFILES) {
    const dates = [
      ...Object.values(profile.supports).map((s) => s!.verifiedOn),
      ...Object.values(profile.limits).map((l) => l!.verifiedOn),
    ].sort();
    const oldest = dates[0];
    const ageDays = oldest ? (Date.now() - Date.parse(oldest)) / 86_400_000 : Infinity;
    const fresh = ageDays > 90 ? p.yellow(`${oldest} (stale: re-verify)`) : p.green(oldest ?? "-");
    console.log(`  ${padEnd(p.cyan(profile.id), 18)} ${padEnd(p.bold(profile.displayName), 34)} ${p.gray(`${String(dates.length).padStart(2)} facts`)}  ${p.gray("verified")} ${fresh}`);
  }
  console.log(p.gray(`\n${ALL_PROFILES.length} clients. Use ids or aliases with -c, e.g. -c claude,cursor,vscode`));
  return EXIT.ok;
}
