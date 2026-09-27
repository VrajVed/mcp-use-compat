import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import type { UpgradeOptions } from "./cli.js";
import { connect } from "./connect/index.js";
import { diffSnapshots } from "./diff.js";
import { detectProject, lookupLatest, type ProjectInfo } from "./project.js";
import { adviseUpgrade, SDK_FACTS, type UpgradeAdvice } from "./sdk-facts.js";
import type { ServerSnapshot } from "./snapshot.js";
import { err, out, padEnd, painter, SYM, width, wrap, type Painter } from "./term.js";

export function renderAdvice(project: ProjectInfo, advice: UpgradeAdvice[], p: Painter = painter(false), w = 100): string {
  const status: Record<UpgradeAdvice["kind"], string> = {
    current: p.green(`${SYM.pass} latest`),
    minor: p.cyan("↑ update"),
    major: p.yellow(`${SYM.warn} major update`),
    migrate: p.blue(`${SYM.arrow} migrate for 2026-07-28`),
    unknown: p.gray("? unknown"),
  };
  const nameW = Math.max(...advice.map((a) => a.sdk.name.length), 3) + 2;
  const lines = ["", `  ${p.bold(p.cyan("upgrade"))} ${p.gray(project.dir)}`, ""];
  lines.push(`  ${p.gray(padEnd("SDK", nameW) + padEnd("installed", 12) + padEnd("latest", 12) + "status")}`);
  for (const a of advice) {
    const installed = a.sdk.installed ?? a.sdk.declared ?? "?";
    lines.push(`  ${padEnd(p.bold(a.sdk.name), nameW)}${padEnd(installed, 12)}${padEnd(a.sdk.latest ? p.bold(a.sdk.latest) : "?", 12)}${status[a.kind]}`);
    if (a.command && a.kind !== "current") lines.push(`  ${" ".repeat(nameW)}${p.gray("$")} ${p.green(a.command)}`);
  }
  const notes = advice.filter((a) => a.kind !== "current" || SDK_FACTS[a.sdk.name]?.migrateTo);
  if (notes.length) lines.push("");
  for (const a of notes) {
    const fact = SDK_FACTS[a.sdk.name];
    lines.push(`  ${p.gray(SYM.bullet)} ${wrap(`${a.summary}${fact?.note && a.kind !== "migrate" ? ` ${fact.note}` : ""}`, w - 6, "    ")}`);
  }
  return lines.join("\n") + "\n";
}

/** Which upgrades --apply runs: minor always, major only with --major, never migrations. */
export function planUpgrades(advice: UpgradeAdvice[], allowMajor: boolean): UpgradeAdvice[] {
  return advice.filter((a) => a.command && (a.kind === "minor" || (a.kind === "major" && allowMajor)));
}

/** Rewrites `name==old` to `name==new` in a pinned requirements file. */
export function bumpPin(file: string, name: string, version: string): boolean {
  const text = readFileSync(file, "utf8");
  const re = new RegExp(`^(\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\[[^\\]]*\\])?\\s*==\\s*)[^\\s;#]+`, "im");
  if (!re.test(text)) return false;
  writeFileSync(file, text.replace(re, `$1${version}`));
  return true;
}

/** Runs each upgrade in order and bumps == pins; stops at the first failure. */
export async function applyPlan(
  plan: UpgradeAdvice[],
  dir: string,
  run: (command: string, cwd: string) => Promise<number>,
  log: (m: string) => void
): Promise<boolean> {
  const e = err();
  for (const a of plan) {
    log(`\n${e.gray("$")} ${e.green(a.command!)}`);
    const code = await run(a.command!, dir);
    if (code !== 0) {
      log(e.red(`${SYM.fail} Upgrade of ${a.sdk.name} failed (exit ${code}). Nothing else was changed after this point.`));
      return false;
    }
    if (a.pinnedFile && a.sdk.latest) {
      log(
        bumpPin(a.pinnedFile, a.sdk.name, a.sdk.latest)
          ? `Updated the pin in ${a.pinnedFile} to ${a.sdk.name}==${a.sdk.latest}.`
          : `Couldn't update the pin in ${a.pinnedFile}; edit it by hand.`
      );
    }
  }
  return true;
}

function runShell(command: string, cwd: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, stdio: "inherit" });
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

function protocolOf(s: ServerSnapshot): string {
  if (!s.connect.ok) return "not connecting";
  const modern = s.modern?.supported ? " + 2026-07-28" : "";
  return `${s.initialize?.negotiatedProtocolVersion ?? "?"}${s.era === "modern" ? " (2026-07-28 only)" : modern}`;
}

export async function runUpgrade(options: UpgradeOptions, log: (m: string) => void = (m) => console.error(m)): Promise<number> {
  const e = err();
  const target = options.target;
  const project =
    target?.kind === "stdio" ? detectProject(target.command, target.args, target.cwd) : detectProject("", [], options.dir);
  if (!project) {
    log(`No MCP SDK found in ${target?.kind === "stdio" ? target.cwd : options.dir} or its parents (looked for package.json, pyproject.toml, requirements.txt, go.mod, Cargo.toml).`);
    return 2;
  }
  if (!options.offline) await lookupLatest(project.sdks);
  const advice = project.sdks.map(adviseUpgrade);
  process.stdout.write(renderAdvice(project, advice, out(), width()));

  if (!options.apply) {
    const recheck = target ? " and re-check the server before and after" : "";
    if (planUpgrades(advice, options.major).length) {
      log(e.gray(`\n${SYM.arrow} Run with -a (--apply) to perform ${planUpgrades(advice, options.major).length === 1 ? "this upgrade" : "these upgrades"}${recheck}.`));
    } else if (planUpgrades(advice, true).length) {
      log(e.gray(`\n${SYM.arrow} Run with -a -M (--apply --major) to perform the major upgrade${recheck}; read the release notes first.`));
    }
    return 0;
  }

  const plan = planUpgrades(advice, options.major);
  const skippedMajor = advice.filter((a) => a.kind === "major" && !options.major);
  if (skippedMajor.length) log(`Skipping major upgrade(s) of ${skippedMajor.map((a) => a.sdk.name).join(", ")}; pass --major to include them.`);
  if (plan.length === 0) {
    log("Nothing to apply.");
    return 0;
  }

  const check = (label: string) =>
    target ? (log(e.gray(`\n${SYM.arrow} Checking the server ${label} upgrading...`)), connect({ target, timeoutMs: options.timeoutMs, authProbe: false, offline: true })) : undefined;
  const before = await check("before");

  if (!(await applyPlan(plan, project.dir, options.run ?? runShell, log))) return 1;

  const after = await check("after");
  if (!before || !after) {
    log(`\n${e.green(SYM.pass)} Upgraded. Pass the server command after -- to re-check it automatically.`);
    return 0;
  }
  log(`\n${e.bold("protocol")}  ${protocolOf(before)} ${e.gray(SYM.arrow)} ${e.bold(protocolOf(after))}`);
  if (!after.connect.ok) {
    log(e.red(`${SYM.fail} The server no longer starts after the upgrade: ${after.connect.error}. Review the changes (e.g. git diff) or roll back.`));
    return 1;
  }
  const changes = diffSnapshots(before, after);
  const breaking = changes.filter((c) => c.level === "breaking");
  for (const c of changes) log(`  ${c.level === "breaking" ? e.red(SYM.fail) : c.level === "notable" ? e.yellow(SYM.warn) : e.green("+")} ${e.gray(c.kind.padEnd(8))} ${e.bold(c.subject)}  ${c.message}`);
  log(breaking.length ? `\n${e.bgRed(e.black(e.bold(" FAIL ")))} ${breaking.length} breaking change(s) after the upgrade; review them before shipping.` : `\n${e.bgGreen(e.black(e.bold(" DONE ")))} Upgrade done; no breaking changes to the server's MCP surface.`);
  return breaking.length ? 1 : 0;
}
