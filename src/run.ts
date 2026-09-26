import type { RunOptions } from "./cli.js";
import { connect } from "./connect/index.js";
import { loadSnapshot, saveSnapshot, type ServerSnapshot } from "./snapshot.js";

/** Returns the process exit code. */
export async function run(options: RunOptions): Promise<number> {
  const snapshot = await getSnapshot(options);
  if (options.saveSnapshot) saveSnapshot(options.saveSnapshot, snapshot);
  // Checks and reporters are added in the next phase.
  process.stdout.write(JSON.stringify(snapshot, null, 2) + "\n");
  return 0;
}

async function getSnapshot(options: RunOptions): Promise<ServerSnapshot> {
  if (options.fromSnapshot) return loadSnapshot(options.fromSnapshot);
  return connect({ target: options.target!, timeoutMs: options.timeoutMs, authProbe: options.authProbe });
}
