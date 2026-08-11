const LAST_ACCEPT_STALE_MS = 10 * 60 * 1000;

function isAcceptStale(iso: string | null | undefined, nowMs = Date.now()): boolean {
  if (iso == null || !iso) return true;
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return true;
  return nowMs - at > LAST_ACCEPT_STALE_MS;
}

export function shouldClearStaleJsLastAcceptedAt(
  jsAccept: string | null,
  nativeAccept: string | null,
  nowMs = Date.now(),
): boolean {
  if (!jsAccept) return false;
  const jsStale = isAcceptStale(jsAccept, nowMs);
  const nativeFresh = nativeAccept != null && !isAcceptStale(nativeAccept, nowMs);
  const nativeNewer =
    nativeAccept != null &&
    new Date(nativeAccept).getTime() > new Date(jsAccept).getTime();
  return jsStale || nativeFresh || nativeNewer;
}
