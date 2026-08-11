import type { TrackingHealthKind } from "./location-tracking-health";

const LAST_ACCEPT_STALE_MS = 10 * 60 * 1000;

export type FieldTrackingModeFlag = "legacy_expo" | "native_android";

export function isNativeAcceptTimestampStale(
  iso: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  return isAcceptStale(iso, nowMs);
}

function isAcceptStale(iso: string | null | undefined, nowMs = Date.now()): boolean {
  if (!iso) return true;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return true;
  return nowMs - t > LAST_ACCEPT_STALE_MS;
}

const NATIVE_UNHEALTHY_STATES = new Set([
  "LOCATION_STALE",
  "SERVICE_DEAD",
  "RECOVERY_FAILED",
  "RECOVERY_IN_PROGRESS",
]);

/** Label health for diagnostics — uses raw accept staleness, not warmup suppression. */
export function deriveNativeHealthKind(input: {
  serviceRunning: boolean;
  acceptStale: boolean;
  pointStale: boolean;
  trackingHealthState?: string;
}): TrackingHealthKind {
  if (!input.serviceRunning) return "task_dead";
  if (
    input.trackingHealthState === "TRACKING_HEALTHY" ||
    input.trackingHealthState === "NETWORK_DEGRADED"
  ) {
    return "healthy";
  }
  if (input.pointStale && !input.acceptStale) return "point_stale";
  if (input.acceptStale || input.trackingHealthState === "LOCATION_STALE") {
    return input.serviceRunning ? "zombie_fgs" : "accept_stale";
  }
  if (
    input.trackingHealthState === "SERVICE_DEAD" ||
    input.trackingHealthState === "RECOVERY_FAILED"
  ) {
    return "task_dead";
  }
  return input.serviceRunning ? "accept_stale" : "task_dead";
}

function mapNativeHealthStateToHealthy(state: string | undefined): boolean {
  return state === "TRACKING_HEALTHY" || state === "NETWORK_DEGRADED";
}

export type NativeAcceptHealthInput = {
  trackingHealthState?: string;
  serviceRunning?: boolean;
  lastServerAcceptAt?: string | null;
  lastGpsCapturedAt?: string | null;
};

export function isNativeTrackingPipelineHealthy(
  nativeHealth: NativeAcceptHealthInput | null | undefined,
): boolean {
  if (!nativeHealth) return false;
  return (
    nativeHealth.serviceRunning === true &&
    mapNativeHealthStateToHealthy(nativeHealth.trackingHealthState)
  );
}

export type NativeAcceptHealthResult = {
  lastAcceptedAt: string | null;
  acceptStale: boolean;
};

export function resolveNativeRuntimeAcceptHealth(
  nativeHealth: NativeAcceptHealthInput | null | undefined,
  jsLastAcceptedAt: string | null,
  inWarmup: boolean,
  opts?: { nativeMode?: boolean },
): NativeAcceptHealthResult {
  const nativeMode = opts?.nativeMode === true;

  if (nativeMode && nativeHealth == null) {
    return {
      lastAcceptedAt: jsLastAcceptedAt,
      // Warmup: bridge may lag on cold start. After warmup, missing bridge + no accept
      // must stay stale so watchdog/restart paths are not silenced (v81 purge clears JS accept).
      acceptStale: inWarmup ? false : isAcceptStale(jsLastAcceptedAt),
    };
  }

  const nativeAccept = nativeHealth?.lastServerAcceptAt ?? null;
  const nativeHealthy = isNativeTrackingPipelineHealthy(nativeHealth);

  if (inWarmup) {
    return {
      lastAcceptedAt: nativeAccept ?? jsLastAcceptedAt,
      acceptStale: false,
    };
  }

  if (nativeHealthy) {
    return {
      lastAcceptedAt: nativeAccept ?? nativeHealth?.lastGpsCapturedAt ?? null,
      acceptStale: false,
    };
  }

  const lastAcceptedAt = nativeAccept ?? jsLastAcceptedAt;
  return {
    lastAcceptedAt,
    acceptStale: isAcceptStale(lastAcceptedAt),
  };
}

export type NativeWatchdogHealthInput = {
  fieldTrackingMode?: FieldTrackingModeFlag;
  healthy?: boolean;
  backgroundTaskStarted?: boolean;
  acceptStale?: boolean;
  nativeTrackingHealthState?: string;
  nativeServiceRunning?: boolean;
};

export function shouldSuppressNativeAcceptStaleAlert(health: NativeWatchdogHealthInput): boolean {
  if (health.fieldTrackingMode !== "native_android") return false;
  if (
    health.nativeTrackingHealthState != null &&
    NATIVE_UNHEALTHY_STATES.has(health.nativeTrackingHealthState)
  ) {
    return false;
  }
  if (
    isNativeTrackingPipelineHealthy({
      trackingHealthState: health.nativeTrackingHealthState,
      serviceRunning: health.nativeServiceRunning ?? health.backgroundTaskStarted,
    })
  ) {
    return true;
  }
  return health.healthy === true && health.backgroundTaskStarted === true;
}

export function shouldShowJsPendingQueue(
  fieldTrackingMode: FieldTrackingModeFlag | undefined,
): boolean {
  return fieldTrackingMode !== "native_android";
}

export function displayPendingSamples(
  fieldTrackingMode: FieldTrackingModeFlag | undefined,
  jsPendingSamples: number,
  nativePendingSamples?: number,
): number {
  if (fieldTrackingMode === "native_android") {
    return nativePendingSamples ?? 0;
  }
  return jsPendingSamples;
}

export function shouldSuppressNativeFlushRetryAlert(health: NativeWatchdogHealthInput): boolean {
  return health.fieldTrackingMode === "native_android";
}
