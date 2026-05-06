import type { TimelineCursorPayload, TimelineSource } from "./timeline.types";

/**
 * Encodes the (at, source, id) tuple as base64url-JSON. Decoding is lenient: any
 * malformed cursor returns `null` so the caller can simply restart pagination.
 */
export function encodeTimelineCursor(payload: TimelineCursorPayload): string {
  const json = JSON.stringify({ at: payload.at, source: payload.source, id: payload.id });
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeTimelineCursor(raw: string | undefined | null): TimelineCursorPayload | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as Partial<TimelineCursorPayload>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.at !== "string" || typeof parsed.source !== "string" || typeof parsed.id !== "string") {
      return null;
    }
    return {
      at: parsed.at,
      source: parsed.source as TimelineSource,
      id: parsed.id,
    };
  } catch {
    return null;
  }
}

/**
 * Returns true when an item with `(at, source, id)` is strictly older than the cursor
 * tuple. Sort order is descending by `at`, then by source-bucket, then by id.
 */
export function compareDescending(
  a: TimelineCursorPayload,
  b: TimelineCursorPayload,
): number {
  const at = b.at.localeCompare(a.at);
  if (at !== 0) return at;
  const src = a.source.localeCompare(b.source);
  if (src !== 0) return src;
  return a.id.localeCompare(b.id);
}
