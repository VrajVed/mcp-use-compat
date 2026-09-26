import type { OutputFormat } from "../cli.js";
import type { Report } from "../evaluate.js";
import { githubReporter } from "./github.js";
import { jsonReporter } from "./json.js";
import { markdownReporter } from "./markdown.js";

export const REPORTERS: Record<OutputFormat, (report: Report) => string> = {
  md: markdownReporter,
  json: jsonReporter,
  github: githubReporter,
};

export { markdownReporter };
