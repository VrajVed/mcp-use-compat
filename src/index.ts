#!/usr/bin/env node
import { isCommanderExit, parseCommandLine, UsageError, type Invocation } from "./cli.js";
import { runDiff } from "./diff.js";
import { explain } from "./explain.js";
import { listChecks, listClients, run, runCall } from "./run.js";

async function dispatch(invocation: Invocation): Promise<number> {
  switch (invocation.command) {
    case "check":
      return run(invocation.options);
    case "call":
      return runCall(invocation.options);
    case "diff":
      return runDiff(invocation.options);
    case "explain":
      return explain(invocation.checkId);
    case "list-checks":
      return listChecks();
    case "list-clients":
      return listClients();
  }
}

async function main(): Promise<number> {
  try {
    return await dispatch(parseCommandLine(process.argv.slice(2)));
  } catch (err) {
    if (isCommanderExit(err)) return err.exitCode === 0 ? 0 : 2;
    if (err instanceof UsageError) {
      console.error(`error: ${err.message}\nRun with --help for usage.`);
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
