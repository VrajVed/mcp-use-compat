import type { Finding, Severity } from "../checks/types.js";
import type { Report } from "../evaluate.js";
import { link, padEnd, painter, rule, SYM, width as termWidth, wrap, type Painter } from "../term.js";

export interface PrettyOptions {
  color: boolean;
  width: number;
  /** Show informational notes too. */
  verbose: boolean;
}

interface Group {
  severity: Severity;
  checkId: string;
  subject?: string;
  /** Empty for findings that apply to every client. */
  clients: Array<{ name: string; message: string; full: string; source?: string }>;
  message?: string;
  fix?: string;
  source?: string;
}

const ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

export function badge(p: Painter, severity: Severity | "pass"): string {
  switch (severity) {
    case "error":
      return p.red(p.bold(`${SYM.fail} FAIL`));
    case "warn":
      return p.yellow(p.bold(`${SYM.warn} WARN`));
    case "info":
      return p.blue(`${SYM.info} INFO`);
    case "pass":
      return p.green(p.bold(`${SYM.pass} PASS`));
  }
}

/** Groups client-specific findings with the same check and subject. */
export function groupFindings(report: Report): Group[] {
  const names = new Map(report.clients.map((c) => [c.client, c.displayName]));
  const groups: Group[] = [];
  const byKey = new Map<string, Group>();
  for (const f of report.findings as Finding[]) {
    if (!f.client) {
      groups.push({ severity: f.severity, checkId: f.checkId, subject: f.subject, clients: [], message: f.message, fix: f.fix, source: f.source });
      continue;
    }
    const key = `${f.checkId}|${f.subject ?? ""}`;
    let g = byKey.get(key);
    if (!g) {
      g = { severity: f.severity, checkId: f.checkId, subject: f.subject, clients: [], fix: f.fix };
      byKey.set(key, g);
      groups.push(g);
    }
    if (ORDER[f.severity] < ORDER[g.severity]) g.severity = f.severity;
    const name = names.get(f.client) ?? f.client;
    // "Cursor renames it..." reads better as "Cursor  renames it..." under a client label.
    const message = f.message.startsWith(`${name} `) ? f.message.slice(name.length + 1) : f.message;
    g.clients.push({ name, message, full: f.message, source: f.source });
  }
  // List clients in the report's own order, not by severity.
  const rank = new Map(report.clients.map((c, i) => [c.displayName, i]));
  for (const g of groups) g.clients.sort((a, b) => (rank.get(a.name) ?? 0) - (rank.get(b.name) ?? 0));
  return groups.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.checkId.localeCompare(b.checkId));
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function shortList(items: string[], max = 3): string {
  return items.length <= max ? items.join(", ") : `${items.slice(0, max).join(", ")} +${items.length - max}`;
}

export function prettyReporter(report: Report, options: Partial<PrettyOptions> = {}): string {
  const p = painter(options.color ?? false);
  const w = options.width ?? termWidth();
  const verbose = options.verbose ?? false;
  const out: string[] = [];
  const kv = (label: string, value: string) => out.push(`  ${p.gray(label.padEnd(9))} ${value}`);

  // Header
  const { server, target } = report;
  out.push("");
  out.push(`  ${p.bold(p.cyan(report.tool.name))} ${p.gray(report.tool.version)}  ${p.gray("MCP compatibility report")}`);
  out.push("");
  kv("target", target.kind === "stdio" ? [target.command, ...target.args].join(" ") : target.url);
  if (server.connected) {
    const era = server.era === "modern" ? p.yellow(" (2026-07-28 only)") : server.era === "both" ? p.green(" + 2026-07-28") : "";
    kv("server", `${p.bold(server.name ?? "unnamed")} ${p.gray(server.version ?? "")}  ${p.gray("protocol")} ${server.protocolVersion ?? "?"}${era}`);
    const c = server.counts;
    kv(
      "surface",
      [plural(c.tools, "tool"), plural(c.resources, "resource"), plural(c.resourceTemplates, "template"), plural(c.prompts, "prompt")].join(p.gray(` ${SYM.bullet} `))
    );
    if (server.versions?.length) {
      kv(
        "versions",
        server.versions
          .map((v) => (!v.ok ? p.red(`${v.version} ${SYM.fail}`) : v.negotiated && v.negotiated !== v.version ? p.yellow(`${v.version} ${SYM.arrow} ${v.negotiated}`) : p.green(`${v.version} ${SYM.pass}`)))
          .join("  ")
      );
    }
  } else {
    const failed = report.findings.find((f) => f.checkId === "TRANSPORT_CONNECT_FAILED" || f.checkId === "TRANSPORT_AUTH_REQUIRED");
    kv("server", p.red(`${SYM.fail} not connected`));
    if (failed) kv("", p.red(wrap(failed.message, w - 14, " ".repeat(12))));
  }
  out.push("");

  // Clients
  if (report.clients.length) {
    out.push(rule(p, "clients", w - 2, `${report.clients.length}`).replace(/^/, "  "));
    const nameWidth = Math.max(...report.clients.map((c) => c.displayName.length)) + 2;
    for (const c of report.clients) {
      const s = c.summary;
      const mark = s.fail ? p.red(SYM.fail) : s.warn ? p.yellow(SYM.warn) : p.green(SYM.pass);
      const count = (n: number, label: string, paint: (x: string) => string) => padEnd(n ? paint(`${n} ${label}`) : p.gray(`${n} ${label}`), 9);
      out.push(
        `  ${mark} ${padEnd(c.displayName, nameWidth)}${count(s.fail, "fail", (x) => p.red(p.bold(x)))}${count(s.warn, "warn", p.yellow)}${count(s.info, "info", p.blue)}${p.gray(`${s.pass} pass`)}`
      );
    }
    out.push("");
  }

  // Findings
  const groups = groupFindings(report);
  const shown = groups.filter((g) => verbose || g.severity !== "info");
  const hiddenInfo = groups.length - shown.length;
  const problems = groups.filter((g) => g.severity !== "info").length;
  out.push(rule(p, "findings", w - 2, problems ? `${problems}` : "").replace(/^/, "  "));
  if (shown.length === 0) {
    out.push(`  ${p.green(`${SYM.pass} No problems found.`)}`);
  }
  const body = w - 12;
  const pad = " ".repeat(10);
  for (const g of shown) {
    const scope = g.clients.length ? shortList(g.clients.map((c) => c.name)) : "all clients";
    const subject = g.subject ? ` ${p.gray(SYM.bullet)} ${p.bold(g.subject.length > 50 ? g.subject.slice(0, 47) + "..." : g.subject)}` : "";
    out.push("");
    out.push(`  ${badge(p, g.severity)}  ${p.cyan(g.checkId)}${subject}  ${p.gray(scope)}`);
    if (g.clients.length === 0) {
      out.push(pad + wrap(g.message ?? "", body, pad));
    } else if (g.clients.length === 1) {
      out.push(pad + wrap(g.clients[0].full, body, pad));
    } else {
      const labelWidth = Math.min(Math.max(...g.clients.map((c) => c.name.length)) + 2, 28);
      for (const c of g.clients) {
        const label = p.bold(c.name.length > labelWidth - 2 ? c.name.slice(0, labelWidth - 3) + "…" : c.name);
        const inner = pad + " ".repeat(labelWidth + 2);
        out.push(`${pad}${p.gray(SYM.arrow)} ${padEnd(label, labelWidth)}${wrap(c.message, body - labelWidth - 2, inner)}`);
      }
    }
    if (g.fix) out.push(`${pad}${p.green("fix")}  ${wrap(g.fix, body - 5, pad + "     ")}`);
    const sources = [...new Set([g.source, ...g.clients.map((c) => c.source)].filter((s): s is string => !!s))];
    if (sources.length) out.push(`${pad}${p.gray("src")}  ${sources.slice(0, 4).map((s) => link(p, s)).join(p.gray(", "))}${sources.length > 4 ? p.gray(` +${sources.length - 4}`) : ""}`);
  }
  if (hiddenInfo) {
    out.push("");
    out.push(`  ${p.gray(`${SYM.info} ${plural(hiddenInfo, "informational note")} hidden; run with -v to show`)}`);
  }
  out.push("");
  return out.join("\n") + "\n";
}
