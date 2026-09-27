import { Command, CommanderError, InvalidArgumentError } from "commander";
import type { ConnectTarget } from "./connect/index.js";
import { VERSION } from "./version.js";

export type OutputFormat = "md" | "json" | "github";

/** Options shared by every command that talks to a server. */
export interface TargetOptions {
  target?: ConnectTarget;
  fromSnapshot?: string;
  timeoutMs: number;
  authProbe: boolean;
}

export interface RunOptions extends TargetOptions {
  saveSnapshot?: string;
  versionMatrix: boolean;
  clients?: string[];
  format: OutputFormat;
  out?: string;
  failOn: string;
  listChecks: boolean;
  listClients: boolean;
}

export interface DiffOptions {
  before: string;
  after: string;
  format: Exclude<OutputFormat, "github"> | "github";
  out?: string;
  failOn: "breaking" | "any" | "none";
}

export type Invocation =
  | { command: "check"; options: RunOptions }
  | { command: "diff"; options: DiffOptions }
  | { command: "explain"; checkId: string }
  | { command: "list-checks" }
  | { command: "list-clients" };

export class UsageError extends Error {}

type Warn = (msg: string) => void;

/** Parses the full command line into one invocation. `check` is the default command. */
export function parseCommandLine(argv: string[], warn: Warn = console.error): Invocation {
  let result: Invocation | undefined;
  const program = new Command()
    .name("mcp-use-compat")
    .description("Check an MCP server for issues that break specific MCP clients")
    .version(VERSION)
    .enablePositionalOptions()
    .exitOverride()
    .configureOutput({ writeErr: (s) => process.stderr.write(s) });

  const check = program
    .command("check", { isDefault: true })
    .description("connect to a server and report compatibility issues per client (default)")
    .usage("[options] -- <command> [args...]\n       mcp-use-compat check [options] --url <url>")
    .argument("[command...]", "stdio server command, after --")
    .passThroughOptions();
  addTargetOptions(check)
    .option("--save-snapshot <file>", "write the raw server snapshot to a file")
    .option("--version-matrix", "also initialize with every protocol version (one session each)", false)
    .option("-c, --clients <list>", "comma-separated client ids (default: all)", splitList)
    .option("-f, --format <format>", "md | json | github", parseFormat, "md")
    .option("-o, --out <file>", "write the report to a file instead of stdout")
    .option("--fail-on <spec>", "error | warn | none | comma list of check ids/areas", "error")
    .option("--list-checks", "same as the list-checks command", false)
    .option("--list-clients", "same as the list-clients command", false)
    .action((command: string[], opts: Record<string, unknown>) => {
      const base = {
        saveSnapshot: opts.saveSnapshot as string | undefined,
        versionMatrix: opts.versionMatrix as boolean,
        clients: opts.clients as string[] | undefined,
        format: opts.format as OutputFormat,
        out: opts.out as string | undefined,
        failOn: opts.failOn as string,
        listChecks: opts.listChecks as boolean,
        listClients: opts.listClients as boolean,
      };
      if (base.listChecks) return void (result = { command: "list-checks" });
      if (base.listClients) return void (result = { command: "list-clients" });
      result = { command: "check", options: { ...base, ...resolveTarget(command, opts, warn) } };
    });

  program
    .command("diff")
    .description("compare two snapshots (or JSON reports) and classify tool-surface changes")
    .argument("<before>", "snapshot or --format json report from the old version")
    .argument("<after>", "snapshot or --format json report from the new version")
    .option("-f, --format <format>", "md | json | github", parseFormat, "md")
    .option("-o, --out <file>", "write the diff to a file instead of stdout")
    .option("--fail-on <level>", "breaking | any | none", parseDiffFailOn, "breaking")
    .action((before: string, after: string, opts: Record<string, unknown>) => {
      result = {
        command: "diff",
        options: {
          before,
          after,
          format: opts.format as OutputFormat,
          out: opts.out as string | undefined,
          failOn: opts.failOn as DiffOptions["failOn"],
        },
      };
    });

  program
    .command("explain")
    .description("explain what a check verifies, why, and where the facts come from")
    .argument("<check-id>")
    .action((checkId: string) => void (result = { command: "explain", checkId }));

  program
    .command("list-checks")
    .description("print all checks")
    .action(() => void (result = { command: "list-checks" }));

  program
    .command("list-clients")
    .description("print client profiles and how fresh their facts are")
    .action(() => void (result = { command: "list-clients" }));

  // Commander matches subcommand names even after "--", so `-- diff x` (a server
  // command called diff) would run our diff. Route anything not starting with a
  // subcommand to `check` explicitly when a server command is given.
  const subcommands = new Set(program.commands.flatMap((c) => [c.name(), ...c.aliases()]));
  const args = argv[0] !== undefined && !subcommands.has(argv[0]) && argv.includes("--") ? ["check", ...argv] : argv;
  program.parse(args, { from: "user" });
  if (!result) throw new UsageError("No command given. Run with --help for usage.");
  return result;
}

/** Back-compat entry point for the default command; throws if argv selects another command. */
export function parseArgs(argv: string[], warn: Warn = console.error): RunOptions {
  const invocation = parseCommandLine(argv, warn);
  if (invocation.command === "check") return invocation.options;
  if (invocation.command === "list-checks" || invocation.command === "list-clients") {
    return {
      format: "md",
      failOn: "error",
      versionMatrix: false,
      timeoutMs: 10000,
      authProbe: true,
      listChecks: invocation.command === "list-checks",
      listClients: invocation.command === "list-clients",
    };
  }
  throw new UsageError(`"${invocation.command}" is not the check command`);
}

/** Adds --url/--from-snapshot/--env/--header/--cwd/--timeout/--no-auth-probe. */
export function addTargetOptions(cmd: Command): Command {
  return cmd
    .option("--url <url>", "Streamable HTTP endpoint instead of a stdio command")
    .option("--from-snapshot <file>", "use a saved snapshot instead of connecting")
    .option("--timeout <ms>", "per-request timeout in ms (startup gets 2x)", parsePositiveInt, 10000)
    .option("--env <KEY=VAL>", "environment variable for the stdio server (repeatable)", collectKeyValue("="), {})
    .option("--header <Name:Value>", "HTTP header for --url (repeatable)", collectKeyValue(":"), {})
    .option("--cwd <dir>", "working directory for the stdio server", process.cwd())
    .option("--no-auth-probe", "skip unauthenticated OAuth discovery requests (--url only)");
}

/** Turns the shared target options plus the positional command into a TargetOptions. */
export function resolveTarget(command: string[], opts: Record<string, unknown>, warn: Warn): TargetOptions {
  const base: TargetOptions = {
    fromSnapshot: opts.fromSnapshot as string | undefined,
    timeoutMs: opts.timeout as number,
    authProbe: opts.authProbe as boolean,
  };
  const sources = [command.length > 0, !!opts.url, !!base.fromSnapshot].filter(Boolean).length;
  if (sources !== 1) {
    throw new UsageError("Specify exactly one of: -- <command>, --url <url>, --from-snapshot <file>");
  }

  if (opts.url) {
    let url: URL;
    try {
      url = new URL(opts.url as string);
    } catch {
      throw new UsageError(`Invalid --url: ${String(opts.url)}`);
    }
    return { ...base, target: { kind: "http", url: url.href, headers: opts.header as Record<string, string> } };
  }

  if (command.length > 0) {
    let [cmd, ...args] = command;
    // v0.1 compatibility: a bare script path means "node <path>".
    if (command.length === 1 && /\.(c|m)?js$/.test(cmd)) {
      warn(`Note: treating "${cmd}" as "-- node ${cmd}". Pass the full command after -- instead.`);
      args = [cmd];
      cmd = process.execPath;
    }
    return {
      ...base,
      target: { kind: "stdio", command: cmd, args, cwd: opts.cwd as string, env: opts.env as Record<string, string> },
    };
  }

  return base;
}

export function isCommanderExit(err: unknown): err is CommanderError {
  return err instanceof CommanderError;
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

function parseDiffFailOn(value: string): DiffOptions["failOn"] {
  if (value === "breaking" || value === "any" || value === "none") return value;
  throw new InvalidArgumentError("must be breaking, any or none");
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
