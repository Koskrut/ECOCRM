/** Mirror of FLUSH_INTERVAL_MS — keep free of expo-location for unit tests. */
export const FLUSH_INTERVAL_MS = 30_000;

/** True when interval flush should run (background task + foreground timer). */
export function shouldFlushByInterval(
  lastFlushAt: string | null | undefined,
  nowMs = Date.now(),
  intervalMs = FLUSH_INTERVAL_MS,
): boolean {
  if (!lastFlushAt) return true;
  const at = new Date(lastFlushAt).getTime();
  if (!Number.isFinite(at)) return true;
  return nowMs - at >= intervalMs;
}

/** Flush failure actions that must keep the pending buffer intact. */
export function flushFailureKeepsBuffer(action: string): boolean {
  return action === "auth_required" || action === "retry";
}
