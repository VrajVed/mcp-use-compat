import type { Report } from "../evaluate.js";

export function jsonReporter(report: Report): string {
  return JSON.stringify(report, null, 2) + "\n";
}
