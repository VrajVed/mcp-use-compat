import type { ClientFeature, ClientProfile } from "../profiles/types.js";
import type { ServerSnapshot } from "../snapshot.js";

export type Severity = "error" | "warn" | "info";

export type CheckArea =
  | "transport"
  | "protocol"
  | "tools"
  | "schema"
  | "discovery"
  | "resources"
  | "ui"
  | "auth"
  | "calls"
  | "sdk";

export interface Finding {
  checkId: string;
  severity: Severity;
  message: string;
  /** Tool/resource/prompt name or URL the finding is about. */
  subject?: string;
  evidence?: Record<string, unknown>;
  fix?: string;
  /**
   * Client features that make this finding matter. A client known not to
   * support any of them gets INFO instead of FAIL/WARN. Absent = all clients.
   */
  affects?: ClientFeature[];
  /** Set when the finding only applies to one client (limit checks). */
  client?: string;
  /** Profile source backing a client-specific finding. */
  source?: string;
}

export interface CheckContext {
  profiles: ClientProfile[];
}

export interface Check {
  id: string;
  area: CheckArea;
  /** One line, shown by --list-checks. */
  description: string;
  /** False → the check is reported as SKIP (e.g. auth checks on stdio). */
  appliesTo: (snapshot: ServerSnapshot) => boolean;
  run: (snapshot: ServerSnapshot, ctx: CheckContext) => Finding[];
}

/** Helper so check modules can define checks with less boilerplate. */
export function defineCheck(check: Check): Check {
  return check;
}
