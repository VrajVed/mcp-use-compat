import { readFileSync } from "node:fs";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
) as { name: string; version: string };

export const TOOL_NAME = pkg.name;
export const VERSION = pkg.version;
