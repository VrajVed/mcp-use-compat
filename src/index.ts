#!/usr/bin/env node
import { isCommanderExit, parseCommandLine, UsageError, type Invocation } from "./cli.js";
import { runDiff } from "./diff.js";
import { explain } from "./explain.js";
import { runFix } from "./fix.js";
import { runUpgrade } from "./upgrade.js";
import { err as stderrPainter } from "./term.js";
import { listChecks, listClients, run, runCall, runOAuthLogin, runOAuthLogout, runOAuthStatus } from "./run.js";

async function dispatch(invocation: Invocation): Promise<number> {
  switch (invocation.command) {
    case "check":
      return run(invocation.options);
    case "call":
      return runCall(invocation.options);
    case "diff":
      return runDiff(invocation.options);
    case "upgrade":
      return runUpgrade(invocation.options);
    case "fix":
      return runFix(invocation.options);
    case "explain":
      return explain(invocation.checkId);
    case "oauth-login":
      return runOAuthLogin(invocation.options);
    case "oauth-status":
      return runOAuthStatus();
    case "oauth-logout":
      return runOAuthLogout(invocation.url);
    case "list-checks":
      return listChecks();
    case "list-clients":
      return listClients();
  }
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  // --no-color works with every command (but not after --, where it belongs to the server).
  const end = argv.includes("--") ? argv.indexOf("--") : argv.length;
  const noColor = argv.slice(0, end).indexOf("--no-color");
  if (noColor !== -1) {
    // An explicit flag beats FORCE_COLOR from the environment.
    delete process.env.FORCE_COLOR;
    process.env.NO_COLOR = "1";
    argv.splice(noColor, 1);
  }
  try {
    return await dispatch(parseCommandLine(argv));
  } catch (err) {
    if (isCommanderExit(err)) return err.exitCode === 0 ? 0 : 2;
    if (err instanceof UsageError) {
      const p = stderrPainter();
      console.error(`${p.red(p.bold("error"))} ${err.message}\n${p.gray("Run with --help for usage.")}`);
      return 2;
    }
    throw err;
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : err);
    process.exitCode = 2;
  }
);
