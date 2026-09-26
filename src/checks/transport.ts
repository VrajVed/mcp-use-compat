import { connected, isHttp, isStdio } from "./util.js";
import { defineCheck } from "./types.js";

const SLOW_STARTUP_MS = 5000;
const SLOW_LIST_MS = 3000;

function authRequired(s: Parameters<typeof connected>[0]): boolean {
  const status = s.http?.unauthenticated.status;
  return !s.connect.ok && (status === 401 || status === 403);
}

export const transportChecks = [
  defineCheck({
    id: "TRANSPORT_CONNECT_FAILED",
    area: "transport",
    description: "The server starts and answers initialize",
    appliesTo: (s) => !authRequired(s),
    run: (s) =>
      s.connect.ok
        ? []
        : [
            {
              checkId: "TRANSPORT_CONNECT_FAILED",
              severity: "error",
              message: `Could not connect: ${s.connect.error ?? "unknown error"}`,
              evidence: { stderrTail: s.io.stderrTail.slice(-10) },
              fix: "Check the command, working directory and required environment variables (--env).",
            },
          ],
  }),

  defineCheck({
    id: "TRANSPORT_AUTH_REQUIRED",
    area: "transport",
    description: "Notes when an HTTP server needs credentials before initialize",
    appliesTo: isHttp,
    run: (s) =>
      authRequired(s)
        ? [
            {
              checkId: "TRANSPORT_AUTH_REQUIRED",
              severity: "info",
              message: `Server requires authorization (HTTP ${s.http!.unauthenticated.status}); only auth discovery was checked.`,
              fix: "Pass --header 'Authorization: Bearer <token>' to also check tools, resources and prompts.",
            },
          ]
        : [],
  }),

  defineCheck({
    id: "TRANSPORT_STDOUT_POLLUTION",
    area: "transport",
    description: "stdout carries only JSON-RPC messages",
    appliesTo: isStdio,
    run: (s) => {
      const lines = s.io.stdoutNonJsonLines;
      if (lines.length === 0) return [];
      return [
        {
          checkId: "TRANSPORT_STDOUT_POLLUTION",
          severity: "error",
          message: `Server wrote ${lines.length}${lines.length >= 50 ? "+" : ""} non-JSON-RPC line(s) to stdout, e.g. ${JSON.stringify(lines[0])}`,
          evidence: { lines: lines.slice(0, 5) },
          affects: ["stdio"],
          fix: "Send logs to stderr (console.error / logging to sys.stderr). stdout is reserved for protocol messages.",
        },
      ];
    },
  }),

  defineCheck({
    id: "TRANSPORT_SLOW_STARTUP",
    area: "transport",
    description: `initialize answers within ${SLOW_STARTUP_MS / 1000}s of launch`,
    appliesTo: connected,
    run: (s) =>
      (s.connect.startupMs ?? 0) > SLOW_STARTUP_MS
        ? [
            {
              checkId: "TRANSPORT_SLOW_STARTUP",
              severity: "warn",
              message: `initialize took ${s.connect.startupMs}ms; some clients time out on slow startup.`,
              evidence: { startupMs: s.connect.startupMs },
              fix: "Defer expensive setup (network, model loading) until after initialize. If launched via npx/uvx, first-run installs count too.",
            },
          ]
        : [],
  }),

  defineCheck({
    id: "TRANSPORT_SLOW_LIST",
    area: "transport",
    description: `list requests answer within ${SLOW_LIST_MS / 1000}s`,
    appliesTo: connected,
    run: (s) =>
      Object.entries(s.lists)
        .filter(([, list]) => list && list.durationMs > SLOW_LIST_MS)
        .map(([kind, list]) => ({
          checkId: "TRANSPORT_SLOW_LIST",
          severity: "warn" as const,
          subject: kind,
          message: `${kind} listing took ${list!.durationMs}ms.`,
          evidence: { durationMs: list!.durationMs, pages: list!.pages },
          fix: "Build list responses from static metadata; don't call upstream APIs while listing.",
        })),
  }),

  defineCheck({
    id: "TRANSPORT_STDERR_ERRORS",
    area: "transport",
    description: "stderr shows no errors during the session",
    appliesTo: isStdio,
    run: (s) => {
      const errors = s.io.stderrTail.filter((l) => /\b(error|exception|traceback|unhandled)\b/i.test(l));
      if (errors.length === 0 || !s.connect.ok) return [];
      return [
        {
          checkId: "TRANSPORT_STDERR_ERRORS",
          severity: "info",
          message: `stderr contained ${errors.length} error-looking line(s), e.g. ${JSON.stringify(errors[0])}`,
          evidence: { lines: errors.slice(0, 5) },
        },
      ];
    },
  }),
];
