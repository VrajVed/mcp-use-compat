import { ALL_CHECKS } from "./checks/index.js";
import { EXPLANATIONS } from "./checks/explanations.js";
import { UsageError } from "./cli.js";
import { ALL_PROFILES } from "./profiles/index.js";
import type { Sourced } from "./profiles/types.js";

/** Renders the explanation for one check (id matching is case-insensitive). */
export function renderExplanation(checkId: string): string {
  const id = checkId.toUpperCase();
  const check = ALL_CHECKS.find((c) => c.id === id);
  if (!check) {
    const words = id.split("_").filter((w) => w.length > 2);
    const similar = ALL_CHECKS.filter((c) => words.some((w) => c.id.includes(w))).map((c) => c.id);
    throw new UsageError(
      `Unknown check "${checkId}".${similar.length ? ` Did you mean: ${similar.slice(0, 5).join(", ")}?` : ""} See list-checks.`
    );
  }

  const e = EXPLANATIONS[id];
  const lines = [`${check.id}  (${check.area})`, "", check.description + ".", ""];
  if (e) {
    lines.push(e.why, "");
    if (e.sources?.length) lines.push("Sources:", ...e.sources.map((s) => `  ${s}`), "");

    const facts: string[] = [];
    for (const p of ALL_PROFILES) {
      for (const key of e.limits ?? []) {
        const fact = p.limits[key] as Sourced<unknown> | undefined;
        if (fact) facts.push(`  ${p.displayName}: ${key} = ${format(fact.value)}  (${fact.source}, ${fact.verifiedOn})`);
      }
      for (const feature of e.features ?? []) {
        const fact = p.supports[feature];
        if (fact) facts.push(`  ${p.displayName}: ${feature} = ${format(fact.value)}  (${fact.source}, ${fact.verifiedOn})`);
      }
    }
    if (e.limits?.length || e.features?.length) {
      lines.push("Client facts used:", ...(facts.length ? facts : ["  (no client has a sourced value yet, so the check never fires)"]), "");
    }
  }
  return lines.join("\n");
}

export function explain(checkId: string): number {
  process.stdout.write(renderExplanation(checkId));
  return 0;
}

function format(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}
