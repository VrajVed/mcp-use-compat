import { spawn } from "child_process";
import { resolve } from "path";

const CLI_PATH = resolve(process.cwd(), "dist/index.js");
const SERVER_PATH = resolve(process.cwd(), "dist/tests/fake-server.js");

function runCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn("node", [CLI_PATH, ...args], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (d) => (stdout += d.toString()));
    proc.stderr?.on("data", (d) => (stderr += d.toString()));

    proc.on("close", (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

async function main() {
  console.log("=== Test: Claude client ===");
  const claude = await runCli([SERVER_PATH, "--clients=claude", "--output=json"]);
  console.log("exit:", claude.code);
  console.log("stderr:", claude.stderr.slice(0, 200));
  const claudeResult = JSON.parse(claude.stdout);
  console.log("tools discovered:", claudeResult.results[0].tests.find((t: any) => t.category === "discovery")?.passed);
  console.log("auth passed:", claudeResult.results[0].tests.find((t: any) => t.category === "auth")?.passed);
  console.log("ui found:", claudeResult.results[0].tests.find((t: any) => t.category === "ui")?.passed);

  console.log("\n=== Test: ChatGPT client ===");
  const chatgpt = await runCli([SERVER_PATH, "--clients=chatgpt", "--output=json"]);
  const chatgptResult = JSON.parse(chatgpt.stdout);
  const authTest = chatgptResult.results[0].tests.find((t: any) => t.category === "auth");
  console.log("auth failed (expected):", !authTest?.passed);
  console.log("auth message:", authTest?.message);

  console.log("\n=== Test: Cursor client ===");
  const cursor = await runCli([SERVER_PATH, "--clients=cursor", "--output=json"]);
  const cursorResult = JSON.parse(cursor.stdout);
  const edgeTest = cursorResult.results[0].tests.find((t: any) => t.category === "edge-cases");
  console.log("edge cases passed:", edgeTest?.passed);

  console.log("\n=== Test: Markdown output ===");
  const md = await runCli([SERVER_PATH, "--clients=claude,chatgpt,cursor"]);
  console.log(md.stdout.slice(0, 800));

  console.log("\n=== Test: CI fail mode ===");
  const ci = await runCli([SERVER_PATH, "--clients=chatgpt", "--fail-on=auth"]);
  console.log("exit code (expect 1):", ci.code);
}

main().catch(console.error);
