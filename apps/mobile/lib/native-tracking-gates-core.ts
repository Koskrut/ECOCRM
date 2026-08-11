const LAST_ACCEPT_STALE_MS = 10 * 60 * 1000;

export type FieldTrackingModeFlag = "legacy_expo" | "native_android";

function isAcceptStale(iso: string | null | undefined): boolean {
  if (!iso) return true;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t > LAST_ACCEPT_STALE_MS;
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
      acceptStale: false,
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
  pendingSamples: number,
): number {
  return shouldShowJsPendingQueue(fieldTrackingMode) ? pendingSamples : 0;
}

export function shouldSuppressNativeFlushRetryAlert(health: NativeWatchdogHealthInput): boolean {
  return health.fieldTrackingMode === "native_android";
}
