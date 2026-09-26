import { Command, InvalidArgumentError } from "commander";
import type { ConnectTarget } from "./connect/index.js";
import { VERSION } from "./version.js";

export type OutputFormat = "md" | "json" | "github";

export interface RunOptions {
  target?: ConnectTarget;
  fromSnapshot?: string;
  saveSnapshot?: string;
  clients?: string[];
  format: OutputFormat;
  out?: string;
  failOn: string;
  timeoutMs: number;
  authProbe: boolean;
  probeCalls: boolean;
  listChecks: boolean;
  listClients: boolean;
}

export class UsageError extends Error {}

export function parseArgs(argv: string[], warn: (msg: string) => void = console.error): RunOptions {
  const program = new Command()
    .name("mcp-use-compat")
    .description("Check an MCP server for issues that break specific MCP clients")
    .version(VERSION)
    .usage("[options] -- <command> [args...]\n       mcp-use-compat [options] --url <url>")
    .argument("[command...]", "stdio server command, after --")
    .option("--url <url>", "Streamable HTTP endpoint instead of a stdio command")
    .option("--from-snapshot <file>", "re-run checks on a saved snapshot instead of connecting")
    .option("--save-snapshot <file>", "write the raw server snapshot to a file")
    .option("-c, --clients <list>", "comma-separated client ids (default: all)", splitList)
    .option("-f, --format <format>", "md | json | github", parseFormat, "md")
    .option("-o, --out <file>", "write the report to a file instead of stdout")
    .option("--fail-on <spec>", "error | warn | none | comma list of check ids/areas", "error")
    .option("--timeout <ms>", "per-request timeout in ms (startup gets 2x)", parsePositiveInt, 10000)
    .option("--env <KEY=VAL>", "environment variable for the stdio server (repeatable)", collectKeyValue("="), {})
    .option("--header <Name:Value>", "HTTP header for --url (repeatable)", collectKeyValue(":"), {})
    .option("--cwd <dir>", "working directory for the stdio server", process.cwd())
    .option("--no-auth-probe", "skip unauthenticated OAuth discovery requests (--url only)")
    .option("--probe-calls", "call read-only tools with minimal arguments", false)
    .option("--list-checks", "print all checks and exit", false)
    .option("--list-clients", "print client profiles and exit", false)
    .exitOverride()
    .configureOutput({ writeErr: (s) => process.stderr.write(s) });

  program.parse(argv, { from: "user" });
  const opts = program.opts();
  const command = program.args;

  const base = {
    fromSnapshot: opts.fromSnapshot as string | undefined,
    saveSnapshot: opts.saveSnapshot as string | undefined,
    clients: opts.clients as string[] | undefined,
    format: opts.format as OutputFormat,
    out: opts.out as string | undefined,
    failOn: opts.failOn as string,
    timeoutMs: opts.timeout as number,
    authProbe: opts.authProbe as boolean,
    probeCalls: opts.probeCalls as boolean,
    listChecks: opts.listChecks as boolean,
    listClients: opts.listClients as boolean,
  };
  if (base.listChecks || base.listClients) return base;

  const sources = [command.length > 0, !!opts.url, !!base.fromSnapshot].filter(Boolean).length;
  if (sources !== 1) {
    throw new UsageError("Specify exactly one of: -- <command>, --url <url>, --from-snapshot <file>");
  }

  if (opts.url) {
    let url: URL;
    try {
      url = new URL(opts.url);
    } catch {
      throw new UsageError(`Invalid --url: ${opts.url}`);
    }
    return { ...base, target: { kind: "http", url: url.href, headers: opts.header } };
  }

  if (command.length > 0) {
    let [cmd, ...args] = command;
    // v0.1 compatibility: a bare script path means "node <path>".
    if (command.length === 1 && /\.(c|m)?js$/.test(cmd)) {
      warn(`Note: treating "${cmd}" as "-- node ${cmd}". Pass the full command after -- instead.`);
      args = [cmd];
      cmd = process.execPath;
    }
    return { ...base, target: { kind: "stdio", command: cmd, args, cwd: opts.cwd, env: opts.env } };
  }

  return base;
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseFormat(value: string): OutputFormat {
  if (value === "markdown") return "md";
  if (value === "md" || value === "json" || value === "github") return value;
  throw new InvalidArgumentError("must be md, json or github");
}

function parsePositiveInt(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new InvalidArgumentError("must be a positive integer");
  return n;
}

function collectKeyValue(separator: string) {
  return (value: string, previous: Record<string, string>): Record<string, string> => {
    const index = value.indexOf(separator);
    if (index <= 0) throw new InvalidArgumentError(`expected NAME${separator}VALUE`);
    return { ...previous, [value.slice(0, index).trim()]: value.slice(index + 1).trim() };
  };
}
