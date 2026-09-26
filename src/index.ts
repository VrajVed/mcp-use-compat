#!/usr/bin/env node
import { CommanderError } from "commander";
import { parseArgs, UsageError } from "./cli.js";
import { run } from "./run.js";

async function main(): Promise<number> {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof CommanderError) return err.exitCode === 0 ? 0 : 2;
    if (err instanceof UsageError) {
      console.error(`error: ${err.message}\nRun with --help for usage.`);
      return 2;
    }
    throw err;
  }
  return run(options);
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
