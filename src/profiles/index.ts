import { chatgpt } from "./chatgpt.js";
import { cline } from "./cline.js";
import { codex } from "./codex.js";
import { continueDev } from "./continue.js";
import { geminiCli } from "./gemini-cli.js";
import { goose } from "./goose.js";
import { windsurf } from "./windsurf.js";
import { claudeCode } from "./claude-code.js";
import { claudeDesktop } from "./claude-desktop.js";
import { cursor } from "./cursor.js";
import { opencode } from "./opencode.js";
import type { ClientProfile } from "./types.js";
import { vscodeCopilot } from "./vscode-copilot.js";

export const ALL_PROFILES: ClientProfile[] = [
  claudeDesktop,
  claudeCode,
  chatgpt,
  cursor,
  vscodeCopilot,
  opencode,
  codex,
  geminiCli,
  cline,
  goose,
  continueDev,
  windsurf,
];

export class UnknownClientError extends Error {}

/** Resolves ids/aliases to profiles; undefined selects all. */
export function selectProfiles(ids: string[] | undefined, profiles = ALL_PROFILES): ClientProfile[] {
  if (!ids) return profiles;
  return ids.map((id) => {
    const wanted = id.toLowerCase();
    const found = profiles.find((p) => p.id === wanted || p.aliases.includes(wanted));
    if (!found) {
      const known = profiles.map((p) => p.id).join(", ") || "(none)";
      throw new UnknownClientError(`Unknown client "${id}". Known clients: ${known}`);
    }
    return found;
  });
}
