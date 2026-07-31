export type TrackingMode = "background" | "foreground" | "none";

/** No successful server accept within this window → unhealthy (Ісанчев false healthy). */
export const LAST_ACCEPT_STALE_MS = 10 * 60 * 1000;

export type TrackingHealthSnapshot = {
  claimedMode: TrackingMode;
  backgroundTaskStarted: boolean;
  foregroundWatchActive: boolean;
  actualMode: TrackingMode;
  healthy: boolean;
  shouldRestartBackground: boolean;
  /** False when native task looks alive but no server accept recently. */
  acceptStale: boolean;
};

export function shouldRestartBackgroundTask(
  claimedMode: TrackingMode,
  backgroundTaskStarted: boolean,
): boolean {
  return claimedMode === "background" && !backgroundTaskStarted;
}

export function isAcceptStale(
  lastAcceptedAt: string | null | undefined,
  nowMs = Date.now(),
  thresholdMs = LAST_ACCEPT_STALE_MS,
): boolean {
  if (lastAcceptedAt == null || !lastAcceptedAt) return true;
  const at = new Date(lastAcceptedAt).getTime();
  if (!Number.isFinite(at)) return true;
  return nowMs - at > thresholdMs;
}

/**
 * Pure health check — testable without native mocks.
 * Tracking healthy requires native continuity AND recent successful accept
 * when the claimed mode is actively collecting.
 */
export function reconcileTrackingHealth(
  claimedMode: TrackingMode,
  backgroundTaskStarted: boolean,
  foregroundWatchActive: boolean,
  opts?: {
    lastAcceptedAt?: string | null;
    nowMs?: number;
    /** When false, skip accept-staleness (e.g. tracking disabled / no shift). */
    requireRecentAccept?: boolean;
  },
): TrackingHealthSnapshot {
  let actualMode: TrackingMode = "none";
  if (backgroundTaskStarted) {
    actualMode = "background";
  } else if (foregroundWatchActive) {
    actualMode = "foreground";
  }

  const shouldRestartBackground = claimedMode === "background" && !backgroundTaskStarted;
  const missingForegroundWatch = claimedMode === "foreground" && !foregroundWatchActive;
  const claimedButDead = claimedMode !== "none" && actualMode === "none";

  const requireRecentAccept = opts?.requireRecentAccept !== false && claimedMode !== "none";
  const acceptStale = requireRecentAccept
    ? isAcceptStale(opts?.lastAcceptedAt, opts?.nowMs)
    : false;

  const nativeHealthy = !shouldRestartBackground && !missingForegroundWatch && !claimedButDead;
  const healthy = nativeHealthy && !acceptStale;

  return {
    claimedMode,
    backgroundTaskStarted,
    foregroundWatchActive,
    actualMode,
    healthy,
    shouldRestartBackground,
    acceptStale,
  };
}
