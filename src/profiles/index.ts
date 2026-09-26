import type { ClientProfile } from "./types.js";

export const ALL_PROFILES: ClientProfile[] = [];

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
