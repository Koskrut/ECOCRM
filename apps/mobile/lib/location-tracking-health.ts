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

/** Primary reason for red / CTA UI — never conflate with battery unrestricted. */
export type TrackingUnhealthyReason =
  | "none"
  | "background_permission"
  | "background_task_dead"
  | "foreground_watch_dead"
  | "accept_stale"
  | "accept_stale_wrong_day"
  | "accept_stale_auth_401";

export type ResolveUnhealthyReasonInput = {
  healthy: boolean;
  claimedMode: TrackingMode;
  backgroundTaskStarted: boolean;
  foregroundWatchActive: boolean;
  acceptStale: boolean;
  backgroundPermission?: string | null;
  flushBlockReason?: string | null;
};

/**
 * Map health bits → one UI reason (priority order).
 * Battery status is intentionally NOT a reason here — shown only via TrackingHealthBanner
 * when restricted/unknown.
 */
export function resolveTrackingUnhealthyReason(
  input: ResolveUnhealthyReasonInput,
): TrackingUnhealthyReason {
  if (input.healthy && !input.acceptStale) return "none";

  const modeActive = input.claimedMode !== "none";
  if (
    modeActive &&
    input.backgroundPermission != null &&
    input.backgroundPermission !== "granted"
  ) {
    return "background_permission";
  }

  if (input.claimedMode === "background" && !input.backgroundTaskStarted) {
    return "background_task_dead";
  }

  if (input.claimedMode === "foreground" && !input.foregroundWatchActive) {
    return "foreground_watch_dead";
  }

  if (input.acceptStale) {
    if (input.flushBlockReason === "wrong_day") return "accept_stale_wrong_day";
    if (input.flushBlockReason === "auth_401") return "accept_stale_auth_401";
    return "accept_stale";
  }

  if (!input.healthy) {
    if (input.claimedMode === "background") return "background_task_dead";
    if (input.claimedMode === "foreground") return "foreground_watch_dead";
  }

  return "none";
}

/** i18n path for title/body of the unhealthy banner (uk dict under gps.*). */
export function unhealthyReasonMessageKeys(reason: TrackingUnhealthyReason): {
  titleKey: string;
  bodyKey: string;
} | null {
  switch (reason) {
    case "background_permission":
      return { titleKey: "gps.trackingForegroundOnly", bodyKey: "gps.backgroundHint" };
    case "background_task_dead":
      return { titleKey: "gps.backgroundTaskDeadTitle", bodyKey: "gps.backgroundTaskDeadHint" };
    case "foreground_watch_dead":
      return { titleKey: "gps.gpsNotWriting", bodyKey: "gps.foregroundWatchDeadHint" };
    case "accept_stale_wrong_day":
      return { titleKey: "gps.wrongDayTitle", bodyKey: "gps.wrongDayHint" };
    case "accept_stale_auth_401":
      return { titleKey: "gps.sessionExpiredTitle", bodyKey: "gps.sessionExpiredHint" };
    case "accept_stale":
      return { titleKey: "gps.gpsNotWriting", bodyKey: "gps.gpsNotWritingHint" };
    default:
      return null;
  }
}

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
