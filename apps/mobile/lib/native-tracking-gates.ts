import {
  resolveFieldTrackingMode,
  shouldUseNativeTracking,
  type FieldTrackingModeFlag,
} from "./tracking-feature-flag-core";

const LAST_ACCEPT_STALE_MS = 10 * 60 * 1000;

function isAcceptStale(iso: string | null | undefined): boolean {
  if (!iso) return true;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t > LAST_ACCEPT_STALE_MS;
}

/** JS Expo buffer / flush / TaskManager must not run when native FGS owns the pipeline. */
export function isJsLocationPipelineDisabled(
  mode: FieldTrackingModeFlag = resolveFieldTrackingMode(),
): boolean {
  return shouldUseNativeTracking(mode);
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

export type NativeAcceptHealthResult = {
  lastAcceptedAt: string | null;
  acceptStale: boolean;
};

/**
 * Native mode: never treat stale JS AsyncStorage accept as unhealthy when native FGS is healthy.
 */
export function resolveNativeRuntimeAcceptHealth(
  nativeHealth: NativeAcceptHealthInput | null | undefined,
  jsLastAcceptedAt: string | null,
  inWarmup: boolean,
): NativeAcceptHealthResult {
  const nativeAccept = nativeHealth?.lastServerAcceptAt ?? null;
  const nativeHealthy =
    nativeHealth?.serviceRunning === true &&
    mapNativeHealthStateToHealthy(nativeHealth.trackingHealthState);

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
  fieldTrackingMode?: "legacy_expo" | "native_android";
  healthy?: boolean;
  backgroundTaskStarted?: boolean;
  acceptStale?: boolean;
};

/** Suppress accept_stale / gpsNotWriting alerts when native FGS is healthy. */
export function shouldSuppressNativeAcceptStaleAlert(health: NativeWatchdogHealthInput): boolean {
  if (health.fieldTrackingMode !== "native_android") return false;
  return health.healthy === true && health.backgroundTaskStarted === true;
}

/** Native uploads from Room — JS buffer flush retry alerts are misleading. */
export function shouldSuppressNativeFlushRetryAlert(health: NativeWatchdogHealthInput): boolean {
  return health.fieldTrackingMode === "native_android";
}
