import type { OutputFormat } from "../cli.js";
import type { Report } from "../evaluate.js";
import { colorEnabled, width } from "../term.js";
import { githubReporter } from "./github.js";
import { jsonReporter } from "./json.js";
import { markdownReporter } from "./markdown.js";
import { prettyReporter } from "./pretty.js";

export interface ReportContext {
  verbose?: boolean;
  /** Writing to a file: never colour. */
  toFile?: boolean;
}

export const REPORTERS: Record<OutputFormat, (report: Report, ctx?: ReportContext) => string> = {
  pretty: (report, ctx = {}) =>
    prettyReporter(report, { color: !ctx.toFile && colorEnabled(process.stdout), width: width(), verbose: ctx.verbose }),
  md: markdownReporter,
  json: jsonReporter,
  github: githubReporter,
};

export { markdownReporter };
