import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

export type Ecosystem = "npm" | "pypi" | "go" | "crates";

/** An MCP SDK or framework the server's project depends on. */
export interface DetectedSdk {
  ecosystem: Ecosystem;
  name: string;
  /** Version actually installed (node_modules, site-packages, lockfile), if found. */
  installed?: string;
  /** Version or range declared in the manifest. */
  declared?: string;
  /** Latest release from the registry (filled in by lookupLatest). */
  latest?: string;
  manifest: string;
  /** Package manager used to upgrade it (npm, pnpm, yarn, bun, uv, poetry, pipenv, pip, go, cargo). */
  manager: string;
  /** For pip: the interpreter that owns the environment. */
  python?: string;
}

export interface ProjectInfo {
  dir: string;
  sdks: DetectedSdk[];
}

/** SDK packages we know, with verified facts about protocol support. */
export const KNOWN_SDKS: Record<Ecosystem, string[]> = {
  npm: ["@modelcontextprotocol/sdk", "@modelcontextprotocol/server", "mcp-use", "fastmcp", "mcp-framework", "mcp-handler"],
  pypi: ["mcp", "fastmcp"],
  go: ["github.com/modelcontextprotocol/go-sdk", "github.com/mark3labs/mcp-go"],
  crates: ["rmcp"],
};

const MANIFESTS = ["package.json", "pyproject.toml", "requirements.txt", "go.mod", "Cargo.toml"];
const MAX_UP = 6;

/**
 * Finds the project a stdio server runs from: the cwd, directories of file
 * arguments (e.g. dist/index.js) and a venv interpreter, walking up to the
 * nearest manifest. Reads files only; no network.
 */
export function detectProject(command: string, args: string[], cwd: string): ProjectInfo | undefined {
  const starts = new Set<string>();
  const addPath = (p: string) => {
    const abs = isAbsolute(p) ? p : resolve(cwd, p);
    if (existsSync(abs)) starts.add(statSync(abs).isDirectory() ? abs : dirname(abs));
  };
  for (const a of args) if (!a.startsWith("-") && /[./\\]/.test(a)) addPath(a);
  if (/[/\\]/.test(command)) addPath(command);
  starts.add(cwd);

  for (const start of starts) {
    const dir = findUp(start, (d) => MANIFESTS.some((m) => existsSync(join(d, m))));
    if (!dir) continue;
    const python = /[/\\]bin[/\\]python[0-9.]*$|[/\\]Scripts[/\\]python\.exe$/i.test(command)
      ? isAbsolute(command)
        ? command
        : resolve(cwd, command)
      : undefined;
    const sdks = [...detectNpm(dir), ...detectPython(dir, python), ...detectGo(dir), ...detectCargo(dir)];
    if (sdks.length) return { dir, sdks };
  }
  return undefined;
}

function findUp(start: string, match: (dir: string) => boolean): string | undefined {
  let dir = start;
  for (let i = 0; i <= MAX_UP; i++) {
    if (match(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

function readJson(path: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

function readText(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

function detectNpm(dir: string): DetectedSdk[] {
  const pkg = readJson(join(dir, "package.json"));
  if (!pkg) return [];
  const deps = { ...(pkg.devDependencies as object), ...(pkg.dependencies as object) } as Record<string, string>;
  const lockDir = findUp(dir, (d) => ["pnpm-lock.yaml", "yarn.lock", "bun.lockb", "bun.lock", "package-lock.json"].some((f) => existsSync(join(d, f))));
  const manager = !lockDir
    ? "npm"
    : existsSync(join(lockDir, "pnpm-lock.yaml"))
      ? "pnpm"
      : existsSync(join(lockDir, "yarn.lock"))
        ? "yarn"
        : existsSync(join(lockDir, "bun.lockb")) || existsSync(join(lockDir, "bun.lock"))
          ? "bun"
          : "npm";
  return KNOWN_SDKS.npm
    .filter((name) => deps[name])
    .map((name) => {
      const installedDir = findUp(dir, (d) => existsSync(join(d, "node_modules", name, "package.json")));
      const installed = installedDir ? (readJson(join(installedDir, "node_modules", name, "package.json"))?.version as string) : undefined;
      return { ecosystem: "npm" as const, name, declared: deps[name], installed, manifest: join(dir, "package.json"), manager };
    });
}

/** Normalised Python distribution name, per PEP 503. */
const pyName = (n: string) => n.toLowerCase().replace(/[-_.]+/g, "-");

function detectPython(dir: string, python?: string): DetectedSdk[] {
  const sources: Array<[string, string]> = [];
  for (const file of ["pyproject.toml", "requirements.txt", "requirements.in"]) {
    const text = readText(join(dir, file));
    if (text) sources.push([join(dir, file), text]);
  }
  if (!sources.length) return [];
  const manager = existsSync(join(dir, "uv.lock"))
    ? "uv"
    : existsSync(join(dir, "poetry.lock"))
      ? "poetry"
      : existsSync(join(dir, "Pipfile.lock"))
        ? "pipenv"
        : "pip";
  const sitePackages = findSitePackages(dir, python);

  return KNOWN_SDKS.pypi.flatMap((name): DetectedSdk[] => {
    for (const [manifest, text] of sources) {
      const declared = manifest.endsWith(".toml") ? pyprojectRequirement(text, name) : requirementsLine(text, name);
      if (declared === undefined) continue;
      return [
        {
          ecosystem: "pypi",
          name,
          declared: declared || undefined,
          installed: sitePackages ? installedPython(sitePackages, name) : undefined,
          manifest,
          manager,
          python,
        },
      ];
    }
    return [];
  });
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The version specifier for `name` in a requirements file ("" if unpinned),
 * or undefined if it isn't listed. Comments and other packages are ignored.
 */
export function requirementsLine(text: string, name: string): string | undefined {
  const re = new RegExp(`^${escape(name)}(?:\\[[^\\]]*\\])?\\s*((?:[<>=!~]=?|===)[^;\\s]*(?:\\s*,\\s*(?:[<>=!~]=?|===)[^;\\s]*)*)?\\s*(?:;.*)?$`, "i");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "").replace(/^#.*$/, "").trim();
    const m = re.exec(line);
    if (m) return m[1]?.trim() ?? "";
  }
  return undefined;
}

/**
 * The specifier for `name` in pyproject.toml: PEP 621 quoted requirements
 * ("mcp[cli]>=1.2") or Poetry tables (mcp = "^1.2" / mcp = { version = "^1.2" }).
 */
export function pyprojectRequirement(text: string, name: string): string | undefined {
  const n = escape(name);
  const quoted = new RegExp(`["']\\s*${n}(?:\\[[^\\]]*\\])?\\s*((?:[<>=!~]=?|===)[^"';]*)?\\s*(?:;[^"']*)?["']`, "i").exec(text);
  if (quoted) return quoted[1]?.trim() ?? "";
  const poetry = new RegExp(`^\\s*${n}\\s*=\\s*(?:"([^"]*)"|\\{[^}]*version\\s*=\\s*"([^"]*)")`, "im").exec(text);
  if (poetry) return (poetry[1] ?? poetry[2] ?? "").trim();
  return undefined;
}

function findSitePackages(dir: string, python?: string): string | undefined {
  const venvs = [
    ...(python ? [dirname(dirname(python))] : []),
    join(dir, ".venv"),
    join(dir, "venv"),
    join(dir, "env"),
  ];
  for (const venv of venvs) {
    const lib = join(venv, "lib");
    if (!existsSync(lib)) {
      if (existsSync(join(venv, "Lib", "site-packages"))) return join(venv, "Lib", "site-packages");
      continue;
    }
    const py = readdirSync(lib).find((d) => d.startsWith("python"));
    if (py && existsSync(join(lib, py, "site-packages"))) return join(lib, py, "site-packages");
  }
  return undefined;
}

function installedPython(sitePackages: string, name: string): string | undefined {
  const entry = readdirSync(sitePackages).find((d) => {
    const m = /^(.+)-([^-]+)\.dist-info$/.exec(d);
    return !!m && pyName(m[1]) === pyName(name);
  });
  return entry ? /-([^-]+)\.dist-info$/.exec(entry)?.[1] : undefined;
}

function detectGo(dir: string): DetectedSdk[] {
  const text = readText(join(dir, "go.mod"));
  if (!text) return [];
  return KNOWN_SDKS.go.flatMap((name): DetectedSdk[] => {
    const m = new RegExp(`^\\s*(?:require\\s+)?${name.replace(/[.]/g, "\\.")}\\s+(v[^\\s]+)`, "m").exec(text);
    return m ? [{ ecosystem: "go", name, declared: m[1], installed: m[1], manifest: join(dir, "go.mod"), manager: "go" }] : [];
  });
}

function detectCargo(dir: string): DetectedSdk[] {
  const text = readText(join(dir, "Cargo.toml"));
  if (!text) return [];
  return KNOWN_SDKS.crates.flatMap((name): DetectedSdk[] => {
    const m = new RegExp(`^\\s*${name}\\s*=\\s*(?:"([^"]+)"|\\{[^}]*version\\s*=\\s*"([^"]+)")`, "m").exec(text);
    if (!m) return [];
    const lock = readText(join(dir, "Cargo.lock"));
    const installed = lock ? new RegExp(`name = "${name}"\\nversion = "([^"]+)"`).exec(lock)?.[1] : undefined;
    return [{ ecosystem: "crates", name, declared: m[1] ?? m[2], installed, manifest: join(dir, "Cargo.toml"), manager: "cargo" }];
  });
}

/** Looks up the latest release of each SDK. Failures leave `latest` unset. */
export async function lookupLatest(sdks: DetectedSdk[], timeoutMs = 4000): Promise<void> {
  await Promise.all(
    sdks.map(async (sdk) => {
      try {
        sdk.latest = await latestVersion(sdk.ecosystem, sdk.name, timeoutMs);
      } catch {
        // Offline or registry error: advice falls back to "@latest".
      }
    })
  );
}

async function latestVersion(ecosystem: Ecosystem, name: string, timeoutMs: number): Promise<string | undefined> {
  const get = async (url: string) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "mcp-use-compat" } });
    return res.ok ? ((await res.json()) as Record<string, unknown>) : undefined;
  };
  switch (ecosystem) {
    case "npm":
      return (await get(`https://registry.npmjs.org/${name.replace("/", "%2f")}/latest`))?.version as string | undefined;
    case "pypi":
      return ((await get(`https://pypi.org/pypi/${name}/json`))?.info as { version?: string } | undefined)?.version;
    case "go":
      return (await get(`https://proxy.golang.org/${name}/@latest`))?.Version as string | undefined;
    case "crates":
      return ((await get(`https://crates.io/api/v1/crates/${name}`))?.crate as { max_stable_version?: string } | undefined)?.max_stable_version;
  }
}

/** Compares dotted numeric versions (ignores a leading v and pre-release suffixes). */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    v
      .replace(/^v/, "")
      .split(/[-+]/)[0]
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export const majorOf = (v: string) => parseInt(v.replace(/^v/, "").split(".")[0], 10) || 0;

/** Registry versions end up in shell commands, so only plain version strings are allowed. */
export const SAFE_VERSION = /^v?[0-9][0-9A-Za-z.+-]*$/;

/**
 * Shell command that upgrades the SDK to `version` (or the newest) with the
 * project's package manager. Unsafe version strings are ignored (→ "latest").
 */
export function upgradeCommand(sdk: DetectedSdk, requested = sdk.latest): string {
  const version = requested && SAFE_VERSION.test(requested) ? requested : undefined;
  const at = version ? `@${version.replace(/^v/, "")}` : "@latest";
  const pin = version ? `>=${version}` : "";
  switch (sdk.manager) {
    case "pnpm":
      return `pnpm add ${sdk.name}${at}`;
    case "yarn":
      return `yarn add ${sdk.name}${at}`;
    case "bun":
      return `bun add ${sdk.name}${at}`;
    case "npm":
      return `npm install ${sdk.name}${at}`;
    case "uv":
      return `uv add "${sdk.name}${pin}"`;
    case "poetry":
      return `poetry add "${sdk.name}${pin ? `@${pin}` : "@latest"}"`;
    case "pipenv":
      return `pipenv install "${sdk.name}${pin}"`;
    case "pip":
      return `${sdk.python ?? "python"} -m pip install --upgrade "${sdk.name}${pin}"`;
    case "go":
      return `go get ${sdk.name}@${version ?? "latest"} && go mod tidy`;
    case "cargo":
      return `cargo add ${sdk.name}${version ? `@${version}` : ""}`;
    default:
      return `upgrade ${sdk.name} to ${version ?? "the latest version"}`;
  }
}
