#!/usr/bin/env node

import { Command } from "commander";
import { runCompatSuite } from "./runner.js";
import { markdownReporter } from "./reporters/markdown.js";
import { jsonReporter } from "./reporters/json.js";

const program = new Command();

program
  .name("mcp-use-compat")
  .description("Test MCP servers against simulated client environments")
  .version("0.1.0")
  .argument("<server-path>", "Path to MCP server entry point")
  .option("-c, --clients <clients>", "Comma-separated client list", "claude,chatgpt,cursor")
  .option("-f, --fail-on <checks>", "Fail CI if these checks fail", "")
  .option("-o, --output <format>", "Output format: markdown | json", "markdown")
  .action(async (serverPath: string, options) => {
    const clients = options.clients.split(",").map((c: string) => c.trim());
    const failOn = options.failOn ? options.failOn.split(",").map((c: string) => c.trim()) : [];

    console.error(`Testing ${serverPath} against: ${clients.join(", ")}...\n`);

    const results = await runCompatSuite(serverPath, clients);

    const reporter = options.output === "json" ? jsonReporter : markdownReporter;
    const output = reporter(results);
    console.log(output);

    const failedChecks = results.flatMap((r) =>
      r.tests.filter((t) => !t.passed).map((t) => t.category)
    );

    const shouldFail = failOn.some((check: string) => failedChecks.includes(check));
    if (shouldFail) {
      console.error("\n❌ Compatibility check failed.");
      process.exit(1);
    }

    console.error("\n✅ Compatibility check passed.");
  });

program.parse();
