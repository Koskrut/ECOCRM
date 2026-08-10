/** After cold start / login / manual restart — suppress accept_stale UI briefly. */
export const TRACKING_WARMUP_MS = 3 * 60 * 1000;

export function isWarmupActiveUntil(
  untilIso: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!untilIso) return false;
  const at = new Date(untilIso).getTime();
  if (!Number.isFinite(at)) return false;
  return nowMs < at;
}
