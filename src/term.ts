/**
 * Terminal styling without dependencies: colours, symbols, rules, wrapping,
 * hyperlinks and a spinner. Colour is on only for a TTY (or FORCE_COLOR), and
 * off with NO_COLOR, TERM=dumb or --no-color.
 */

type Stream = { isTTY?: boolean; columns?: number };

export function colorEnabled(stream: Stream = process.stdout, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== "0") return true;
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false;
  if (env.TERM === "dumb") return false;
  return !!stream.isTTY;
}

const code = (open: number, close: number) => (on: boolean) => (s: string) => (on ? `\x1b[${open}m${s}\x1b[${close}m` : s);

const STYLES = {
  bold: code(1, 22),
  dim: code(2, 22),
  italic: code(3, 23),
  underline: code(4, 24),
  red: code(31, 39),
  green: code(32, 39),
  yellow: code(33, 39),
  blue: code(34, 39),
  magenta: code(35, 39),
  cyan: code(36, 39),
  gray: code(90, 39),
  brightGreen: code(92, 39),
  bgRed: code(41, 49),
  bgGreen: code(42, 49),
  bgYellow: code(43, 49),
  bgBlue: code(44, 49),
  black: code(30, 39),
} as const;

export type Painter = { [K in keyof typeof STYLES]: (s: string) => string } & { on: boolean };

export function painter(on: boolean): Painter {
  const p = { on } as Painter;
  for (const [name, style] of Object.entries(STYLES)) (p as Record<string, unknown>)[name] = style(on);
  return p;
}

/** Painter for stdout (reports) and stderr (progress, messages). */
export const out = (): Painter => painter(colorEnabled(process.stdout));
export const err = (): Painter => painter(colorEnabled(process.stderr));

export const SYM = {
  pass: "✔",
  fail: "✖",
  warn: "▲",
  info: "ℹ",
  skip: "○",
  arrow: "›",
  bullet: "·",
  line: "─",
  corner: "└",
  link: "↗",
} as const;

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m|\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)/g;

/** Length as it appears on screen (ignores colour codes and hyperlinks). */
export const visible = (s: string): number => [...s.replace(ANSI, "")].length;

export const padEnd = (s: string, width: number): string => s + " ".repeat(Math.max(0, width - visible(s)));

/** Usable width for text: the terminal's, capped for readability. */
export function width(stream: Stream = process.stdout): number {
  return Math.max(60, Math.min(stream.columns || 100, 120));
}

/** A section rule: "── title ─────────". */
export function rule(p: Painter, title: string, w: number, note = ""): string {
  const head = `${p.gray(SYM.line.repeat(2))} ${p.bold(title)}${note ? " " + p.gray(note) : ""} `;
  return head + p.gray(SYM.line.repeat(Math.max(3, w - visible(head))));
}

/** Word-wraps plain text; continuation lines get `indent`. */
export function wrap(text: string, w: number, indent = ""): string {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (visible(candidate) > w && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines.map((l, i) => (i === 0 ? l : indent + l)).join("\n");
}

/** Clickable link (OSC 8) where colour is on; plain text otherwise. */
export function link(p: Painter, url: string, text = shortUrl(url)): string {
  return p.on ? `\x1b]8;;${url}\x1b\\${p.underline(text)}\x1b]8;;\x1b\\` : text;
}

/** "github.com/openai/codex/…/models.rs" style label for a URL. */
export function shortUrl(url: string, max = 48): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const full = [u.hostname.replace(/^www\./, ""), ...parts].join("/");
    if (full.length <= max) return full;
    const last = parts.at(-1) ?? "";
    return `${u.hostname.replace(/^www\./, "")}/…/${last}`.slice(0, max);
  } catch {
    return url.slice(0, max);
  }
}

/** One-line spinner on stderr for a TTY; a no-op otherwise (CI logs stay clean). */
export class Spinner {
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private i = 0;
  private timer?: NodeJS.Timeout;
  private text = "";
  private readonly active: boolean;
  private readonly p: Painter;

  constructor(stream: NodeJS.WriteStream = process.stderr, env: NodeJS.ProcessEnv = process.env) {
    this.active = !!stream.isTTY && !env.CI && env.TERM !== "dumb";
    this.p = painter(colorEnabled(stream, env));
  }

  start(text: string): void {
    this.text = text;
    if (!this.active) return;
    if (!this.timer) {
      this.timer = setInterval(() => this.render(), 80);
      this.timer.unref();
    }
    this.render();
  }

  update(text: string): void {
    this.text = text;
    if (this.active) this.render();
  }

  /** Clears the spinner line. */
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (this.active) process.stderr.write("\r\x1b[2K");
  }

  /** Prints a message above the spinner without breaking it. */
  log(message: string): void {
    if (this.active) process.stderr.write("\r\x1b[2K");
    process.stderr.write(message + "\n");
    if (this.active && this.timer) this.render();
  }

  private render(): void {
    const frame = this.frames[(this.i = (this.i + 1) % this.frames.length)];
    process.stderr.write(`\r\x1b[2K${this.p.cyan(frame)} ${this.p.dim(this.text)}`);
  }
}

/** Minimal JSON syntax colouring for terminal output. */
export function colorJson(p: Painter, value: unknown, indent = 2): string {
  const text = JSON.stringify(value, null, indent);
  if (!p.on || text === undefined) return text ?? "undefined";
  return text.replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (m, str: string | undefined, colon: string | undefined, lit: string | undefined, num: string | undefined) =>
      str ? (colon ? p.cyan(str) + colon : p.green(str)) : lit ? p.magenta(lit) : num ? p.yellow(num) : m
  );
}
