import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { compareVersions, detectProject, pyprojectRequirement, requirementsLine, upgradeCommand, type DetectedSdk } from "../../src/project.js";
import { adviseUpgrade, SAFE_VERSION } from "../../src/sdk-facts.js";
import { applyPlan, bumpPin, planUpgrades } from "../../src/upgrade.js";

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "mcp-proj-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

const sdk = (over: Partial<DetectedSdk>): DetectedSdk => ({ ecosystem: "npm", name: "mcp-use", manifest: "package.json", manager: "npm", ...over });

describe("detectProject", () => {
  it("finds npm SDKs with installed versions and the package manager from the lockfile", () => {
    const dir = project({
      "package.json": JSON.stringify({ dependencies: { "mcp-use": "^2.6.0", express: "^5" } }),
      "pnpm-lock.yaml": "",
      "node_modules/mcp-use/package.json": JSON.stringify({ version: "2.6.3" }),
      "dist/index.js": "",
    });
    const p = detectProject("node", ["dist/index.js"], dir);
    assert.equal(p?.dir, dir);
    assert.deepEqual(
      p?.sdks.map((s) => [s.name, s.declared, s.installed, s.manager]),
      [["mcp-use", "^2.6.0", "2.6.3", "pnpm"]]
    );
  });

  it("finds a pinned Python SDK and its version in the server's venv", () => {
    const dir = project({
      "requirements.txt": "# MCP SDK\nmcp==1.27.2\nmcp-server-git==0.1\n",
      ".venv/lib/python3.12/site-packages/mcp-1.27.2.dist-info/METADATA": "",
      ".venv/bin/python": "",
    });
    const p = detectProject(join(dir, ".venv/bin/python"), ["-m", "server"], dir);
    assert.deepEqual(
      p?.sdks.map((s) => [s.name, s.declared, s.installed, s.manager, s.python]),
      [["mcp", "==1.27.2", "1.27.2", "pip", join(dir, ".venv/bin/python")]]
    );
  });

  it("detects uv/poetry projects, Go and Rust SDKs", () => {
    const uv = project({ "pyproject.toml": '[project]\ndescription = "an MCP server"\ndependencies = ["fastmcp>=2.3"]\n', "uv.lock": "" });
    assert.deepEqual(detectProject("uv", ["run", "server.py"], uv)?.sdks.map((s) => [s.name, s.declared, s.manager]), [["fastmcp", ">=2.3", "uv"]]);
    const go = project({ "go.mod": "module x\n\nrequire (\n\tgithub.com/mark3labs/mcp-go v0.30.0\n)\n" });
    assert.deepEqual(detectProject("go", ["run", "."], go)?.sdks.map((s) => [s.name, s.installed]), [["github.com/mark3labs/mcp-go", "v0.30.0"]]);
    const rust = project({ "Cargo.toml": '[dependencies]\nrmcp = { version = "0.8", features = ["server"] }\n', "Cargo.lock": 'name = "rmcp"\nversion = "0.8.5"\n' });
    assert.deepEqual(detectProject("cargo", ["run"], rust)?.sdks.map((s) => [s.name, s.declared, s.installed]), [["rmcp", "0.8", "0.8.5"]]);
  });

  it("returns undefined when no MCP SDK is present", () => {
    assert.equal(detectProject("node", ["x.js"], project({ "package.json": JSON.stringify({ dependencies: { express: "5" } }) })), undefined);
  });
});

describe("dependency parsing", () => {
  it("requirementsLine ignores comments and similarly named packages", () => {
    assert.equal(requirementsLine("# mcp==1\nmcp-server-x==2\nmcp[cli]>=1.2,<2 ; python_version>'3.9'", "mcp"), ">=1.2,<2");
    assert.equal(requirementsLine("fastmcp", "fastmcp"), "");
    assert.equal(requirementsLine("# only a comment mentioning mcp", "mcp"), undefined);
  });

  it("pyprojectRequirement reads PEP 621 and Poetry, not prose", () => {
    assert.equal(pyprojectRequirement('dependencies = ["mcp[cli]>=1.26.0"]', "mcp"), ">=1.26.0");
    assert.equal(pyprojectRequirement('[tool.poetry.dependencies]\nmcp = { version = "^1.9" }', "mcp"), "^1.9");
    assert.equal(pyprojectRequirement('description = "an MCP server"', "mcp"), undefined);
  });
});

describe("upgrade advice", () => {
  it("compares versions numerically", () => {
    assert.ok(compareVersions("1.10.0", "1.9.9") > 0);
    assert.equal(compareVersions("v1.8.0", "1.8"), 0);
    assert.ok(compareVersions("2.0.0-rc.1", "1.99") > 0);
  });

  it("builds the command for each package manager", () => {
    const cmd = (manager: string, extra: Partial<DetectedSdk> = {}) => upgradeCommand(sdk({ manager, latest: "2.7.0", ...extra }));
    assert.equal(cmd("npm"), "npm install mcp-use@2.7.0");
    assert.equal(cmd("pnpm"), "pnpm add mcp-use@2.7.0");
    assert.equal(cmd("uv", { name: "mcp" }), 'uv add "mcp>=2.7.0"');
    assert.equal(cmd("pip", { name: "mcp", python: "/p/.venv/bin/python" }), '/p/.venv/bin/python -m pip install --upgrade "mcp>=2.7.0"');
    assert.equal(cmd("go", { name: "github.com/mark3labs/mcp-go", latest: "v1.1.1" }), "go get github.com/mark3labs/mcp-go@v1.1.1 && go mod tidy");
    assert.equal(upgradeCommand(sdk({ manager: "npm" })), "npm install mcp-use@latest");
  });

  it("classifies minor, major, current and migrate, and knows when 2026-07-28 arrives", () => {
    assert.equal(adviseUpgrade(sdk({ installed: "2.6.0", latest: "2.7.0" })).kind, "minor");
    const py = adviseUpgrade(sdk({ ecosystem: "pypi", name: "mcp", manager: "pip", installed: "1.27.2", declared: "==1.27.2", manifest: "/r/requirements.txt", latest: "2.2.0" }));
    assert.equal(py.kind, "major");
    assert.equal(py.addsModern, true);
    assert.equal(py.pinnedFile, "/r/requirements.txt");
    assert.equal(adviseUpgrade(sdk({ installed: "2.7.0", latest: "2.7.0" })).kind, "current");
    assert.equal(adviseUpgrade(sdk({ name: "@modelcontextprotocol/sdk", installed: "1.30.1", latest: "1.30.1" })).kind, "migrate");
    assert.equal(adviseUpgrade(sdk({ installed: "2.6.0" })).kind, "unknown");
  });

  it("never puts an unsafe registry version into a command", () => {
    assert.equal(SAFE_VERSION.test("2.7.0"), true);
    assert.equal(SAFE_VERSION.test("1.0.0; rm -rf ~"), false);
    const a = adviseUpgrade(sdk({ installed: "2.6.0", latest: "2.7.0 && curl evil" }));
    assert.equal(a.kind, "unknown");
    assert.doesNotMatch(a.command ?? "", /evil/);
    assert.equal(upgradeCommand(sdk({ latest: "1; rm -rf ~" })), "npm install mcp-use@latest");
  });

  it("plans minor upgrades only unless --major, and never migrations", () => {
    const advice = [
      adviseUpgrade(sdk({ name: "a", installed: "1.0.0", latest: "1.1.0" })),
      adviseUpgrade(sdk({ name: "b", installed: "1.0.0", latest: "2.0.0" })),
      adviseUpgrade(sdk({ name: "@modelcontextprotocol/sdk", installed: "1.30.1", latest: "1.30.1" })),
    ];
    assert.deepEqual(planUpgrades(advice, false).map((a) => a.sdk.name), ["a"]);
    assert.deepEqual(planUpgrades(advice, true).map((a) => a.sdk.name), ["a", "b"]);
  });
});

describe("applyPlan", () => {
  it("runs commands in the project and bumps == pins", async () => {
    const dir = project({ "requirements.txt": "httpx==0.27\nmcp==1.27.2  # sdk\n" });
    const plan = [adviseUpgrade(sdk({ ecosystem: "pypi", name: "mcp", manager: "pip", installed: "1.27.2", declared: "==1.27.2", manifest: join(dir, "requirements.txt"), latest: "2.2.0" }))];
    const ran: string[] = [];
    const ok = await applyPlan(plan, dir, async (cmd, cwd) => (ran.push(`${cwd}: ${cmd}`), 0), () => {});
    assert.equal(ok, true);
    assert.deepEqual(ran, [`${dir}: python -m pip install --upgrade "mcp>=2.2.0"`]);
    assert.equal(readFileSync(join(dir, "requirements.txt"), "utf8"), "httpx==0.27\nmcp==2.2.0  # sdk\n");
  });

  it("stops at the first failing command", async () => {
    const plan = ["a", "b"].map((name) => adviseUpgrade(sdk({ name, installed: "1.0.0", latest: "1.1.0" })));
    const ran: string[] = [];
    assert.equal(await applyPlan(plan, "/tmp", async (cmd) => (ran.push(cmd), 1), () => {}), false);
    assert.equal(ran.length, 1);
  });

  it("bumpPin leaves files without a matching pin alone", () => {
    const dir = project({ "requirements.txt": "mcp>=1.2\n" });
    assert.equal(bumpPin(join(dir, "requirements.txt"), "mcp", "2.2.0"), false);
  });
});
