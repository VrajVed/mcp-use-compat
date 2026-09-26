import type { ClientFeature, ClientProfile } from "../profiles/types.js";
import type { ListKind, RawItem, ServerSnapshot } from "../snapshot.js";
import type { Finding } from "./types.js";

export const connected = (s: ServerSnapshot): boolean => s.connect.ok;
export const isStdio = (s: ServerSnapshot): boolean => s.target.kind === "stdio";
export const isHttp = (s: ServerSnapshot): boolean => s.target.kind === "http";

export function items(s: ServerSnapshot, kind: ListKind): RawItem[] {
  const list = s.lists[kind];
  return list?.ok ? list.items : [];
}

export function declared(s: ServerSnapshot, capability: string): boolean {
  const caps = s.initialize?.capabilities ?? {};
  return caps[capability] !== undefined && caps[capability] !== null;
}

export function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function itemLabel(item: RawItem, fallbackKey = "name"): string {
  return str(item[fallbackKey]) ?? str(item.uri) ?? str(item.uriTemplate) ?? "(unnamed)";
}

/**
 * One finding per selected client known not to support `feature`, or to
 * support it only partially. Used when the server uses a feature some
 * clients ignore. The client's note is appended to the message.
 */
export function featureGap(
  profiles: ClientProfile[],
  feature: ClientFeature,
  make: (profile: ClientProfile, partial: boolean) => Omit<Finding, "client" | "source">
): Finding[] {
  return profiles.flatMap((p) => {
    const support = p.supports[feature];
    if (!support || support.value === true) return [];
    const finding = make(p, support.value === "partial");
    const message = support.note ? `${finding.message} (${support.note})` : finding.message;
    return [{ ...finding, message, client: p.id, source: support.source }];
  });
}
