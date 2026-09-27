/**
 * Regenerates the generated sections of README.md from the check registry and
 * client profiles. `npm run readme` writes; the test suite fails if it is stale.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ALL_CHECKS } from "../src/checks/index.js";
import { ALL_PROFILES } from "../src/profiles/index.js";
import type { ClientFeature, ClientProfile, Sourced, Support } from "../src/profiles/types.js";

export const README = resolve(import.meta.dirname, "../README.md");

const COLUMNS: Array<[ClientFeature, string]> = [
  ["stdio", "stdio"],
  ["streamableHttp", "HTTP"],
  ["toolsListChanged", "Tool list refresh"],
  ["resources", "Resources"],
  ["prompts", "Prompts"],
  ["oauth", "OAuth"],
  ["cimd", "CIMD"],
  ["uiResources", "MCP Apps UI"],
];

function mark(fact: Sourced<Support> | undefined): string {
  if (!fact) return "?";
  const symbol = fact.value === true ? "✅" : fact.value === false ? "❌" : "⚠️";
  return `[${symbol}](${fact.source})`;
}

function limits(p: ClientProfile): string {
  const l = p.limits;
  const parts: string[] = [];
  if (l.toolNamePrefix) parts.push(`prefix \`${l.toolNamePrefix.value.format}\``);
  if (l.maxToolNameLength) parts.push(`name ≤ ${l.maxToolNameLength.value.max} (${l.maxToolNameLength.value.onExceed})`);
  if (l.toolNameChars) parts.push(`chars \`[${l.toolNameChars.value.allowed}]\` (${l.toolNameChars.value.onInvalid})`);
  if (l.maxTools) parts.push(`≤ ${l.maxTools.value} tools`);
  if (l.maxDescriptionLength) parts.push(`descriptions ≤ ${l.maxDescriptionLength.value} chars`);
  return parts.join("; ") || "none";
}

export function clientsSection(): string {
  const header = `| Client | ${COLUMNS.map(([, label]) => label).join(" | ")} | Limits |`;
  const divider = `|${"---|".repeat(COLUMNS.length + 2)}`;
  const rows = ALL_PROFILES.map(
    (p) => `| ${p.displayName} | ${COLUMNS.map(([f]) => mark(p.supports[f])).join(" | ")} | ${limits(p)} |`
  );
  const dates = ALL_PROFILES.flatMap((p) => [...Object.values(p.supports), ...Object.values(p.limits)].map((f) => f!.verifiedOn)).sort();
  return [
    header,
    divider,
    ...rows,
    "",
    `✅ supported · ❌ not supported · ⚠️ partial or unreliable · ? unknown. Every mark links to its source. Facts verified ${dates[0]}${dates.at(-1) !== dates[0] ? ` to ${dates.at(-1)}` : ""}; run \`mcpkit list-clients\` for details.`,
  ].join("\n");
}

export function checksSection(): string {
  const areas = [...new Set(ALL_CHECKS.map((c) => c.area))];
  return areas
    .map((area) => {
      const rows = ALL_CHECKS.filter((c) => c.area === area).map((c) => `| \`${c.id}\` | ${c.description} |`);
      return [`**${area}**`, "", "| Check | What it verifies |", "|---|---|", ...rows].join("\n");
    })
    .join("\n\n");
}

export function render(readme: string): string {
  const replace = (text: string, name: string, body: string) => {
    const re = new RegExp(`(<!-- ${name}:start -->)[\\s\\S]*?(<!-- ${name}:end -->)`);
    if (!re.test(text)) throw new Error(`README is missing the ${name} markers`);
    return text.replace(re, `$1\n${body}\n$2`);
  };
  return replace(replace(readme, "clients", clientsSection()), "checks", checksSection());
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  writeFileSync(README, render(readFileSync(README, "utf8")));
  console.log("README.md updated");
}
