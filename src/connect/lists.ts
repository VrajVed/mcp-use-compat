import { LIST_KINDS, type ListKind, type ListResult, type RawItem, type UiRead } from "../snapshot.js";
import { linkedUiUris } from "../ui.js";
import { RpcError, type RpcSession } from "./session.js";

const MAX_PAGES = 50;
const MAX_UI_READS = 20;

/** Sends one request and resolves with the raw result; rejects with RpcError on a JSON-RPC error. */
export type Requester = (method: string, params: Record<string, unknown> | undefined) => Promise<unknown>;

export function requester(session: RpcSession, timeoutMs: number): Requester {
  return (method, params) => session.request(method, params, timeoutMs);
}

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Lists every page of one kind, following nextCursor. Errors are recorded, never thrown. */
export async function listAll(
  request: Requester,
  kind: ListKind,
  onPage?: (result: Record<string, unknown>) => void
): Promise<ListResult> {
  const { method, key } = LIST_KINDS[kind];
  const items: RawItem[] = [];
  const seenCursors = new Set<string>();
  const started = performance.now();
  let cursor: string | undefined;
  let pages = 0;

  try {
    do {
      const raw = await request(method, cursor ? { cursor } : undefined);
      const result = isObject(raw) ? raw : {};
      pages++;
      onPage?.(result);
      const page = result[key];
      if (Array.isArray(page)) items.push(...page.filter(isObject));
      cursor = typeof result.nextCursor === "string" ? result.nextCursor : undefined;
      if (cursor !== undefined) {
        if (seenCursors.has(cursor)) {
          return { ok: true, items, pages, durationMs: elapsed(started), cursorLoop: true };
        }
        seenCursors.add(cursor);
      }
    } while (cursor !== undefined && pages < MAX_PAGES);
    return { ok: true, items, pages, durationMs: elapsed(started) };
  } catch (err) {
    return {
      ok: false,
      items,
      pages,
      durationMs: elapsed(started),
      error: { code: err instanceof RpcError ? err.code : undefined, message: (err as Error).message },
    };
  }
}

/** Reads each UI resource a tool links to, so checks can tell whether the link works. */
export async function readUiResources(request: Requester, tools: RawItem[]): Promise<Record<string, UiRead> | undefined> {
  const uris = [...new Set(tools.flatMap((t) => linkedUiUris(t)))].slice(0, MAX_UI_READS);
  if (uris.length === 0) return undefined;
  const reads: Record<string, UiRead> = {};
  for (const uri of uris) {
    try {
      const result = (await request("resources/read", { uri })) as { contents?: unknown } | undefined;
      const first = Array.isArray(result?.contents) ? (result.contents[0] as Record<string, unknown> | undefined) : undefined;
      reads[uri] = first
        ? { ok: true, mimeType: typeof first.mimeType === "string" ? first.mimeType : undefined }
        : { ok: false, error: "No contents returned" };
    } catch (err) {
      reads[uri] = { ok: false, error: (err as Error).message };
    }
  }
  return reads;
}

export function elapsed(started: number): number {
  return Math.round(performance.now() - started);
}
