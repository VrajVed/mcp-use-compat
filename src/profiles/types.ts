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
  | "cimd"
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

/** "partial" = supported but known to be unreliable or incomplete; see the note. */
export type Support = boolean | "partial";

/** What a client does with a tool name it doesn't accept as-is. */
export type NameHandling =
  | "reject"
  | "replace"
  | "truncate"
  /** Truncated, then made unique with a hash suffix. */
  | "truncateWithHash"
  | "unknown";

/** How a client passes a tool result with structuredContent to the model. */
export type StructuredContentHandling =
  /** Model sees JSON of structuredContent instead of the text content. */
  | "replacesText"
  /** Model sees both. */
  | "alongsideText"
  /** Model sees text content; structuredContent only if content is empty. */
  | "fallbackOnly";

export interface ClientProfile {
  id: string;
  aliases: string[];
  displayName: string;
  versionTested?: string;
  /** Absent feature = unknown. Unknown never produces a FAIL or WARN. */
  supports: Partial<Record<ClientFeature, Sourced<Support>>>;
  limits: {
    maxTools?: Sourced<number>;
    /**
     * Prefix the client adds before the tool name. {server} is the name the
     * user gave the server; maxLength caps the prefix, lowercase lowercases it.
     */
    toolNamePrefix?: Sourced<{ format: string; maxLength?: number; lowercase?: boolean }>;
    /** Allowed characters (regex character class body, e.g. "A-Za-z0-9_-") and what happens to others. */
    toolNameChars?: Sourced<{ allowed: string; onInvalid: NameHandling }>;
    /** Max length of prefix + tool name and what happens beyond it. */
    maxToolNameLength?: Sourced<{ max: number; onExceed: NameHandling }>;
    /** Descriptions (and server instructions) longer than this are truncated. */
    maxDescriptionLength?: Sourced<number>;
    /** Top-level inputSchema property names must match this regex, or the tool is dropped. */
    inputPropertyNamePattern?: Sourced<string>;
    /** JSON Schema keywords the client rejects or drops. */
    schemaUnsupported?: Sourced<string[]>;
    structuredContent?: Sourced<StructuredContentHandling>;
  };
}
