import type { Report } from "../evaluate.js";
import { annotation, annotationProperty } from "./escape.js";

/**
 * GitHub Actions workflow commands: one annotation per client-independent
 * finding and per client-specific error/warning.
 */
export function githubReporter(report: Report): string {
  const lines: string[] = [];
  for (const f of report.findings) {
    if (f.severity === "info") continue;
    const level = f.severity === "error" ? "error" : "warning";
    const scope = [f.client, f.subject].filter(Boolean).join(" · ");
    const title = `${f.checkId}${scope ? ` (${scope})` : ""}`;
    const message = f.fix ? `${f.message} Fix: ${f.fix}` : f.message;
    lines.push(`::${level} title=${annotationProperty(title)}::${annotation(message)}`);
  }
  return lines.join("\n") + (lines.length ? "\n" : "");
}
