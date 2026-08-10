export type TrackingMode = "background" | "foreground" | "none";

/** No successful server accept within this window → unhealthy (Ісанчev false healthy). */
export const LAST_ACCEPT_STALE_MS = 10 * 60 * 1000;

/** No GPS point ingested within this window → unhealthy alongside accept staleness. */
export const LAST_POINT_STALE_MS = LAST_ACCEPT_STALE_MS;

export type TrackingHealthKind =
  | "healthy"
  | "zombie_fgs"
  | "task_dead"
  | "accept_stale"
  | "point_stale"
  | "foreground_only"
  | "no_permission"
  | "inactive";

export type TrackingHealthSnapshot = {
  claimedMode: TrackingMode;
  /** Native hasStartedLocationUpdatesAsync — taskRegistered. */
  backgroundTaskStarted: boolean;
  taskRegistered: boolean;
  foregroundWatchActive: boolean;
  actualMode: TrackingMode;
  healthy: boolean;
  shouldRestartBackground: boolean;
  /** False when native task looks alive but no server accept recently. */
  acceptStale: boolean;
  acceptFresh: boolean;
  pointStale: boolean;
  pointFresh: boolean;
  healthKind: TrackingHealthKind;
  /** taskRegistered && acceptStale — Expo #47595 zombie FGS. */
  zombieFgs: boolean;
};

/** Primary reason for red / CTA UI — never conflate with battery unrestricted. */
export type TrackingUnhealthyReason =
  | "none"
  | "background_permission"
  | "background_task_dead"
  | "foreground_watch_dead"
  | "accept_stale"
  | "accept_stale_wrong_day"
  | "accept_stale_auth_401"
  | "fgs_start_blocked_background"
  | "zombie_fgs"
  | "point_stale";

export type ResolveUnhealthyReasonInput = {
  healthy: boolean;
  claimedMode: TrackingMode;
  backgroundTaskStarted: boolean;
  foregroundWatchActive: boolean;
  acceptStale: boolean;
  pointStale?: boolean;
  zombieFgs?: boolean;
  backgroundPermission?: string | null;
  flushBlockReason?: string | null;
  /** User tried Restart while app was not in foreground. */
  fgsRestartBlocked?: boolean;
};

/**
 * Map health bits → one UI reason (priority order).
 * Battery status is intentionally NOT a reason here — shown only via TrackingHealthBanner
 * when restricted/unknown.
 */
export function resolveTrackingUnhealthyReason(
  input: ResolveUnhealthyReasonInput,
): TrackingUnhealthyReason {
  if (input.healthy && !input.acceptStale && !input.pointStale && !input.zombieFgs) {
    return "none";
  }

  if (input.fgsRestartBlocked) {
    return "fgs_start_blocked_background";
  }

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

  if (input.acceptStale) {
    if (input.flushBlockReason === "wrong_day") return "accept_stale_wrong_day";
    if (input.flushBlockReason === "auth_401") return "accept_stale_auth_401";
  }

  if (
    input.zombieFgs ||
    (input.backgroundTaskStarted && input.acceptStale && input.claimedMode === "background")
  ) {
    return "zombie_fgs";
  }

  if (input.claimedMode === "foreground" && !input.foregroundWatchActive) {
    return "foreground_watch_dead";
  }

  if (input.acceptStale) {
    return "accept_stale";
  }

  if (input.pointStale) {
    return "point_stale";
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
    case "zombie_fgs":
    case "point_stale":
      return { titleKey: "gps.gpsNotWriting", bodyKey: "gps.gpsNotWritingHint" };
    case "fgs_start_blocked_background":
      return { titleKey: "gps.openAppFirstTitle", bodyKey: "gps.openAppFirstHint" };
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

export function isPointStale(
  lastGpsPointAt: string | null | undefined,
  nowMs = Date.now(),
  thresholdMs = LAST_POINT_STALE_MS,
): boolean {
  if (lastGpsPointAt == null || !lastGpsPointAt) return true;
  const at = new Date(lastGpsPointAt).getTime();
  if (!Number.isFinite(at)) return true;
  return nowMs - at > thresholdMs;
}

export function deriveTrackingHealthKind(input: {
  claimedMode: TrackingMode;
  taskRegistered: boolean;
  acceptFresh: boolean;
  pointFresh: boolean;
  acceptStale: boolean;
  pointStale: boolean;
  backgroundPermission?: string | null;
}): TrackingHealthKind {
  if (input.claimedMode === "none") return "inactive";
  if (input.backgroundPermission != null && input.backgroundPermission !== "granted") {
    return "no_permission";
  }
  if (input.claimedMode === "foreground") return "foreground_only";
  if (!input.taskRegistered && input.claimedMode === "background") return "task_dead";
  if (input.taskRegistered && input.acceptStale) return "zombie_fgs";
  if (input.acceptStale) return "accept_stale";
  if (input.pointStale) return "point_stale";
  if (input.taskRegistered && input.acceptFresh && input.pointFresh) return "healthy";
  return "accept_stale";
}

/**
 * Pure health check — testable without native mocks.
 * HEALTHY = taskRegistered && acceptFresh && pointFresh (hasStarted alone is NOT healthy).
 */
export function reconcileTrackingHealth(
  claimedMode: TrackingMode,
  backgroundTaskStarted: boolean,
  foregroundWatchActive: boolean,
  opts?: {
    lastAcceptedAt?: string | null;
    lastGpsPointAt?: string | null;
    nowMs?: number;
    /** When false, skip accept/point staleness (e.g. tracking disabled / no shift). */
    requireRecentAccept?: boolean;
    backgroundPermission?: string | null;
  },
): TrackingHealthSnapshot {
  const taskRegistered = backgroundTaskStarted;
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
  const pointStale = requireRecentAccept
    ? isPointStale(opts?.lastGpsPointAt, opts?.nowMs)
    : false;
  const acceptFresh = !acceptStale;
  const pointFresh = !pointStale;

  const nativeHealthy = !shouldRestartBackground && !missingForegroundWatch && !claimedButDead;
  const zombieFgs =
    claimedMode === "background" && taskRegistered && acceptStale;

  let healthy =
    claimedMode === "background" &&
    taskRegistered &&
    acceptFresh &&
    pointFresh &&
    nativeHealthy;

  if (
    claimedMode === "foreground" ||
    (claimedMode !== "none" &&
      opts?.backgroundPermission != null &&
      opts.backgroundPermission !== "granted")
  ) {
    healthy = false;
  }

  const healthKind = deriveTrackingHealthKind({
    claimedMode,
    taskRegistered,
    acceptFresh,
    pointFresh,
    acceptStale,
    pointStale,
    backgroundPermission: opts?.backgroundPermission,
  });

  return {
    claimedMode,
    backgroundTaskStarted,
    taskRegistered,
    foregroundWatchActive,
    actualMode,
    healthy,
    shouldRestartBackground,
    acceptStale,
    acceptFresh,
    pointStale,
    pointFresh,
    healthKind,
    zombieFgs,
  };
}
