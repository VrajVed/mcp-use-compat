/** Client features a finding can depend on. */
export type ClientFeature =
  | "stdio"
  | "streamableHttp"
  | "sse"
  | "toolsListChanged"
  | "resourcesListChanged"
  | "promptsListChanged"
  | "resources"
  | "prompts"
  | "sampling"
  | "elicitation"
  | "oauth"
  | "dcr"
  | "uiResources"
  | "structuredContent";

/** A fact about a client, with where we learned it. */
export interface Sourced<T> {
  value: T;
  source: string;
  /** YYYY-MM-DD */
  verifiedOn: string;
  note?: string;
}

export type Support = boolean | "partial";

export interface ClientProfile {
  id: string;
  aliases: string[];
  displayName: string;
  versionTested?: string;
  /** Absent feature = unknown. Unknown never produces a FAIL or WARN. */
  supports: Partial<Record<ClientFeature, Sourced<Support>>>;
  limits: {
    maxTools?: Sourced<number>;
    /** Regex source, tested against the bare tool name. */
    toolNamePattern?: Sourced<string>;
    /** Max length of prefix + tool name, as the client sends it to the model. */
    maxToolNameLength?: Sourced<number>;
    /** Prefix format, with {server} as the server name placeholder. */
    toolNamePrefix?: Sourced<string>;
    /** JSON Schema keywords the client rejects or drops. */
    schemaUnsupported?: Sourced<string[]>;
  };
}
