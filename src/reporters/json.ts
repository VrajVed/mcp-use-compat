import type { ClientResult } from "../runner.js";

export function jsonReporter(results: ClientResult[]): string {
  const output = {
    version: "0.1.0",
    timestamp: new Date().toISOString(),
    summary: {
      total: results.reduce((sum, r) => sum + r.tests.length, 0),
      passed: results.reduce(
        (sum, r) => sum + r.tests.filter((t) => t.passed).length,
        0
      ),
      failed: results.reduce(
        (sum, r) => sum + r.tests.filter((t) => !t.passed).length,
        0
      ),
    },
    results,
  };

  return JSON.stringify(output, null, 2);
}
