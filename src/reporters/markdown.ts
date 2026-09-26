import type { ClientResult } from "../runner.js";

export function markdownReporter(results: ClientResult[]): string {
  const lines: string[] = [
    "# MCP Compatibility Report",
    "",
    "| Client | Check | Status | Notes |",
    "|--------|-------|--------|-------|",
  ];

  for (const { client, tests } of results) {
    for (const test of tests) {
      const status = test.passed ? "✅ PASS" : "❌ FAIL";
      lines.push(`| ${client} | ${test.category} | ${status} | ${test.message} |`);
    }
  }

  lines.push("");

  // Summary
  const total = results.reduce((sum, r) => sum + r.tests.length, 0);
  const passed = results.reduce(
    (sum, r) => sum + r.tests.filter((t) => t.passed).length,
    0
  );

  lines.push(`**Summary:** ${passed}/${total} checks passed`);
  lines.push("");

  // Known limitations section
  lines.push("## Known Client Limitations");
  lines.push("");

  const limitations: string[] = [];
  for (const { client, tests } of results) {
    for (const test of tests) {
      if (!test.passed && test.details) {
        const lim = test.details.clientLimitation || test.details.chatgptLimitation || test.details.cursorLimitation;
        if (lim) {
          limitations.push(`- **${client}**: ${lim}`);
        }
      }
    }
  }

  if (limitations.length > 0) {
    lines.push(...limitations);
  } else {
    lines.push("_No documented limitations found._");
  }

  lines.push("");
  return lines.join("\n");
}
