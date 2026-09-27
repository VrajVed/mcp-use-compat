import { ALL_CHECKS } from "./checks/index.js";
import { EXPLANATIONS } from "./checks/explanations.js";
import { UsageError } from "./cli.js";
import { ALL_PROFILES } from "./profiles/index.js";
import type { Sourced } from "./profiles/types.js";
import { link, out, painter, width, wrap, type Painter } from "./term.js";

/** Renders the explanation for one check (id matching is case-insensitive). */
export function renderExplanation(checkId: string, p: Painter = painter(false)): string {
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
  const lines = [`${p.bold(p.cyan(check.id))}  ${p.gray(`(${check.area})`)}`, "", p.bold(check.description + "."), ""];
  if (e) {
    lines.push(wrap(e.why, width() - 2), "");
    if (e.sources?.length) lines.push(p.magenta("Sources:"), ...e.sources.map((s) => `  ${link(p, s, s)}`), "");

    const facts: string[] = [];
    for (const profile of ALL_PROFILES) {
      for (const key of e.limits ?? []) {
        const fact = profile.limits[key] as Sourced<unknown> | undefined;
        if (fact) facts.push(`  ${p.bold(profile.displayName)}: ${key} = ${p.yellow(format(fact.value))}  ${p.gray(`(${link(p, fact.source, fact.source)}, ${fact.verifiedOn})`)}`);
      }
      for (const feature of e.features ?? []) {
        const fact = profile.supports[feature];
        if (fact) facts.push(`  ${p.bold(profile.displayName)}: ${feature} = ${p.yellow(format(fact.value))}  ${p.gray(`(${link(p, fact.source, fact.source)}, ${fact.verifiedOn})`)}`);
      }
    }
    if (e.limits?.length || e.features?.length) {
      lines.push(p.magenta("Client facts used:"), ...(facts.length ? facts : ["  (no client has a sourced value yet, so the check never fires)"]), "");
    }
  }
  return lines.join("\n");
}

export function explain(checkId: string): number {
  process.stdout.write("\n" + renderExplanation(checkId, out()).replace(/^(?=.)/gm, "  ") + "\n");
  return 0;
}

function format(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}
