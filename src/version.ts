import { readFileSync } from "node:fs";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
) as { name: string; version: string };

/** Published package name, e.g. "@vrajved/mcpkit". */
export const PACKAGE_NAME = pkg.name;
/** Command and tool name without the npm scope, e.g. "mcpkit". */
export const TOOL_NAME = pkg.name.replace(/^@[^/]+\//, "");
export const VERSION = pkg.version;
