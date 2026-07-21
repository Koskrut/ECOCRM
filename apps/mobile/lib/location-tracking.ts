import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { AppState, Platform } from "react-native";

import { readBatteryOptimizationStatus } from "./battery-optimization";
import { formatKyivDateKey } from "./date";
import {
  appendPendingSample,
  flushPendingSamples,
  getPendingCount,
  maybeFlushAfterAppend,
  STORAGE_KEYS,
  FLUSH_INTERVAL_MS,
  type PendingLocationSample,
} from "./location-tracking-buffer";
import { FIELD_LOCATION_TASK } from "./location-tracking-config";
import { registerFieldLocationTask, setForegroundWatchStarter } from "./location-tracking-task";
import {
  applyAdaptiveTier,
  backgroundOptionsForTier,
  getCurrentForegroundTier,
  locationOptionsForWatch,
  restartBackgroundWatch,
  setCurrentForegroundTier,
  setForegroundSubscription,
} from "./location-tracking-adaptive";
import { DEFAULT_TIER, watchOptionsForTier, type SamplingTier } from "./location-tracking-config";
import {
  processLocationUpdate,
  resetLocationProcessorState,
} from "./location-tracking-processor";
import {
  getTrackingPermissionStatus,
  requestTrackingPermissionsWithRationale,
  type TrackingPermissionStatus,
} from "./location-permissions";
import { appendErrorLog } from "./error-log";
import { reconcileTrackingHealth } from "./location-tracking-health";
import {
  clearPendingAdaptiveTier,
  getPendingAdaptiveTier,
  getTrackingRestartDiagnostics,
  mapRestartContextToReason,
  recordRestartAttempt,
  resetTrackingRestartDiagnostics,
  setBatteryOptimizationStatus,
  type TrackingRestartReason,
} from "./location-tracking-restart";
import { ensureFieldTrackingNotificationChannel } from "./tracking-notification-channel";
import { sendTrackingRestartEvent } from "./tracking-telemetry";

export { registerFieldLocationTask };
export { requestTrackingPermissionsWithRationale as requestTrackingPermissions };
export type { TrackingPermissionStatus };
export { shouldMaintainOnAppState } from "./location-tracking-restart";
export type { TrackingRestartReason } from "./location-tracking-restart";

export { appendPendingSample, flushPendingSamples, getPendingCount, STORAGE_KEYS };
export type { PendingLocationSample };

export type TrackingMode = "background" | "foreground" | "none";

export type TrackingDiagnostics = {
  mode: TrackingMode;
  pendingSamples: number;
  lastFlushAt: string | null;
  activeShiftId: string | null;
  foregroundPermission: string;
  backgroundPermission: string | null;
  backgroundTaskStarted: boolean;
  healthy: boolean;
  lastRestartAt: string | null;
  restartCountToday: number;
  lastRestartReason: TrackingRestartReason | null;
  batteryOptimizationStatus: "restricted" | "unrestricted" | "unknown";
};

export type TrackingRuntimeHealth = TrackingDiagnostics & {
  claimedMode: TrackingMode;
  actualMode: TrackingMode;
  foregroundWatchActive: boolean;
};

let flushTimer: ReturnType<typeof setInterval> | null = null;

type LocationCallback = (result: Awaited<ReturnType<typeof processLocationUpdate>>) => void;
const locationListeners = new Set<LocationCallback>();

export function onProcessedLocation(cb: LocationCallback): () => void {
  locationListeners.add(cb);
  return () => locationListeners.delete(cb);
}

function notifyListeners(result: Awaited<ReturnType<typeof processLocationUpdate>>): void {
  for (const cb of locationListeners) {
    try {
      cb(result);
    } catch {
      /* listener error */
    }
  }
}

async function handleRawLocation(input: {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  clientRecordedAt: string;
}): Promise<void> {
  const result = await processLocationUpdate(input);
  if (result.accepted && result.sample) {
    const count = await appendPendingSample(result.sample);
    void maybeFlushAfterAppend(count).catch(() => undefined);
    void flushPendingSamples().catch(() => undefined);
  }
  if (result.tierChanged) {
    void applyAdaptiveTier(result.tier, startForegroundWatch).catch(() => undefined);
  }
  notifyListeners(result);
}

function startFlushTimer(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    if (AppState.currentState !== "active") return;
    void flushPendingSamples().catch(() => {
      /* retry on next tick */
    });
  }, FLUSH_INTERVAL_MS);
}

function stopFlushTimer(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

async function startForegroundWatch(tier: SamplingTier = DEFAULT_TIER): Promise<void> {
  const opts = watchOptionsForTier(tier);
  setCurrentForegroundTier(tier);
  const sub = await Location.watchPositionAsync(locationOptionsForWatch(opts), (pos) => {
    const c = pos.coords;
    void handleRawLocation({
      lat: c.latitude,
      lng: c.longitude,
      accuracyM:
        typeof c.accuracy === "number" && Number.isFinite(c.accuracy) ? c.accuracy : undefined,
      clientRecordedAt: new Date(pos.timestamp).toISOString(),
    });
  });
  setForegroundSubscription(sub);
}

async function stopForegroundWatch(): Promise<void> {
  const { getForegroundSubscription, setForegroundSubscription: setSub } = await import(
    "./location-tracking-adaptive"
  );
  const sub = getForegroundSubscription();
  if (sub) {
    sub.remove();
  }
  setSub(null);
}

async function startBackgroundUpdates(
  initialTier: SamplingTier,
  opts?: { forceRestart?: boolean },
): Promise<boolean> {
  const started = await Location.hasStartedLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(
    () => false,
  );
  if (started && !opts?.forceRestart) {
    return true;
  }
  if (started) {
    await Location.stopLocationUpdatesAsync(FIELD_LOCATION_TASK);
  }
  await ensureFieldTrackingNotificationChannel();
  await Location.startLocationUpdatesAsync(
    FIELD_LOCATION_TASK,
    backgroundOptionsForTier(initialTier),
  );
  return Location.hasStartedLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(() => false);
}

async function applyPendingAdaptiveTierIfNeeded(): Promise<void> {
  const pendingTier = await getPendingAdaptiveTier();
  if (!pendingTier) return;

  const mode = (await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE)) as TrackingMode | null;
  if (mode !== "background") {
    await clearPendingAdaptiveTier();
    return;
  }

  const started = await Location.hasStartedLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(
    () => false,
  );
  if (!started) {
    await clearPendingAdaptiveTier();
    return;
  }

  const attempt = await recordRestartAttempt("tier_change");
  if (!attempt.allowed) return;

  try {
    await restartBackgroundWatch(pendingTier);
    await clearPendingAdaptiveTier();
    const shiftId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
    if (shiftId) {
      void sendTrackingRestartEvent(shiftId, "tier_change");
    }
    void appendErrorLog("applyPendingAdaptiveTier: tier applied", "info");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    void appendErrorLog(`applyPendingAdaptiveTier failed: ${message}`);
  }
}

export async function startLocationTracking(shiftId: string): Promise<TrackingMode> {
  try {
    setForegroundWatchStarter(startForegroundWatch);
    await registerFieldLocationTask();
    await resetLocationProcessorState();
    await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_SHIFT_ID, shiftId);
    await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_SHIFT_DAY_KEY, formatKyivDateKey());

    const { foreground, background } = await requestTrackingPermissionsWithRationale();
    if (foreground !== "granted") {
      await AsyncStorage.setItem(STORAGE_KEYS.TRACKING_MODE, "none");
      return "none";
    }

    const hasBackground = background === "granted";
    const initialTier = DEFAULT_TIER;

    if (hasBackground) {
      const taskStarted = await startBackgroundUpdates(initialTier);
      if (!taskStarted) {
        void appendErrorLog("startLocationTracking: background task failed to start");
        await AsyncStorage.setItem(STORAGE_KEYS.TRACKING_MODE, "none");
        return "none";
      }
      await stopForegroundWatch();
      await AsyncStorage.setItem(STORAGE_KEYS.TRACKING_MODE, "background");
      startFlushTimer();
      return "background";
    }

    await Location.stopLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(() => undefined);
    await startForegroundWatch(initialTier);
    await AsyncStorage.setItem(STORAGE_KEYS.TRACKING_MODE, "foreground");
    startFlushTimer();
    return "foreground";
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    void appendErrorLog(`startLocationTracking: ${message}`);
    await AsyncStorage.setItem(STORAGE_KEYS.TRACKING_MODE, "none").catch(() => undefined);
    return "none";
  }
}

export async function stopLocationTracking(): Promise<void> {
  try {
    stopFlushTimer();
    await stopForegroundWatch();
    const started = await Location.hasStartedLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(
      () => false,
    );
    if (started) {
      await Location.stopLocationUpdatesAsync(FIELD_LOCATION_TASK);
    }
    const shiftId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
    if (shiftId) {
      try {
        await flushPendingSamples(shiftId);
      } catch {
        /* keep buffer for next session */
      }
    }
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.ACTIVE_SHIFT_ID,
      STORAGE_KEYS.ACTIVE_SHIFT_DAY_KEY,
      STORAGE_KEYS.TRACKING_MODE,
    ]);
    await resetLocationProcessorState();
    await resetTrackingRestartDiagnostics();
  } catch {
    /* best-effort stop */
  }
}

export async function resumeTrackingIfNeeded(
  shift: { id: string; trackingEnabled: boolean; status: string; date?: string } | null,
): Promise<TrackingMode> {
  try {
    if (!shift || shift.status !== "ACTIVE" || !shift.trackingEnabled) {
      return "none";
    }
    const todayKey = formatKyivDateKey();
    const shiftDayKey = shift.date?.slice(0, 10) ?? null;
    if (shiftDayKey && shiftDayKey !== todayKey) {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.ACTIVE_SHIFT_ID,
        STORAGE_KEYS.ACTIVE_SHIFT_DAY_KEY,
        STORAGE_KEYS.TRACKING_MODE,
      ]);
      return startLocationTracking(shift.id);
    }
    const boundDay = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_DAY_KEY);
    if (boundDay && boundDay !== todayKey) {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.ACTIVE_SHIFT_ID,
        STORAGE_KEYS.ACTIVE_SHIFT_DAY_KEY,
        STORAGE_KEYS.TRACKING_MODE,
      ]);
      return startLocationTracking(shift.id);
    }
    await registerFieldLocationTask();
    setForegroundWatchStarter(startForegroundWatch);
    const mode = await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE);
    const activeId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
    if (activeId === shift.id && mode && mode !== "none") {
      startFlushTimer();
      if (mode === "background") {
        const restarted = await ensureBackgroundTaskRunning(shift.id, "resumeTrackingIfNeeded");
        return restarted;
      }
      if (mode === "foreground") {
        const { getForegroundSubscription } = await import("./location-tracking-adaptive");
        if (!getForegroundSubscription()) {
          await startForegroundWatch(getCurrentForegroundTier());
        }
        return maybeUpgradeToBackgroundTracking();
      }
    }
    const started = await startLocationTracking(shift.id);
    if (started === "foreground") {
      return maybeUpgradeToBackgroundTracking();
    }
    return started;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    void appendErrorLog(`resumeTrackingIfNeeded: ${message}`);
    await AsyncStorage.setItem(STORAGE_KEYS.TRACKING_MODE, "none").catch(() => undefined);
    return "none";
  }
}

export async function getTrackingState(): Promise<{
  mode: TrackingMode;
  pendingSamples: number;
  lastFlushAt: string | null;
}> {
  const mode = (await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE)) as TrackingMode | null;
  const pendingSamples = await getPendingCount();
  const lastFlushAt = await AsyncStorage.getItem(STORAGE_KEYS.LAST_FLUSH_AT);
  return {
    mode: mode ?? "none",
    pendingSamples,
    lastFlushAt,
  };
}

export async function getTrackingRuntimeHealth(): Promise<TrackingRuntimeHealth> {
  const [state, perms, activeShiftId, backgroundTaskStarted, restartDiagnostics, batteryStatus] =
    await Promise.all([
      getTrackingState(),
      getTrackingPermissionStatus(),
      AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID),
      Location.hasStartedLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(() => false),
      getTrackingRestartDiagnostics(),
      readBatteryOptimizationStatus(),
    ]);
  void setBatteryOptimizationStatus(batteryStatus);
  const { getForegroundSubscription } = await import("./location-tracking-adaptive");
  const foregroundWatchActive = !!getForegroundSubscription();
  const health = reconcileTrackingHealth(state.mode, backgroundTaskStarted, foregroundWatchActive);

  return {
    mode: state.mode,
    claimedMode: health.claimedMode,
    actualMode: health.actualMode,
    pendingSamples: state.pendingSamples,
    lastFlushAt: state.lastFlushAt,
    activeShiftId,
    foregroundPermission: perms.foreground,
    backgroundPermission: perms.background,
    backgroundTaskStarted,
    foregroundWatchActive,
    healthy: health.healthy,
    lastRestartAt: restartDiagnostics.lastRestartAt,
    restartCountToday: restartDiagnostics.restartCountToday,
    lastRestartReason: restartDiagnostics.lastRestartReason,
    batteryOptimizationStatus: batteryStatus,
  };
}

export async function getTrackingDiagnostics(): Promise<TrackingDiagnostics> {
  const health = await getTrackingRuntimeHealth();
  return {
    mode: health.mode,
    pendingSamples: health.pendingSamples,
    lastFlushAt: health.lastFlushAt,
    activeShiftId: health.activeShiftId,
    foregroundPermission: health.foregroundPermission,
    backgroundPermission: health.backgroundPermission,
    backgroundTaskStarted: health.backgroundTaskStarted,
    healthy: health.healthy,
    lastRestartAt: health.lastRestartAt,
    restartCountToday: health.restartCountToday,
    lastRestartReason: health.lastRestartReason,
    batteryOptimizationStatus: health.batteryOptimizationStatus,
  };
}

/**
 * When the app is in the foreground, try switching from foreground watch to
 * background task if the user granted «Allow all the time» in Settings.
 */
export async function maybeUpgradeToBackgroundTracking(): Promise<TrackingMode> {
  const shiftId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
  if (!shiftId) return "none";

  const mode = (await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE)) as TrackingMode | null;
  if (mode !== "foreground") {
    return mode ?? "none";
  }

  const { background } = await getTrackingPermissionStatus();
  if (background !== "granted") {
    return "foreground";
  }

  return startLocationTracking(shiftId);
}

/** Restart background task when storage says background but OS task is dead. */
async function ensureBackgroundTaskRunning(
  shiftId: string,
  context: string,
): Promise<TrackingMode> {
  const mode = (await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE)) as TrackingMode | null;
  if (mode !== "background") {
    return mode ?? "none";
  }

  const started = await Location.hasStartedLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(
    () => false,
  );
  if (started) {
    return "background";
  }

  const reason = mapRestartContextToReason(context);
  const attempt = await recordRestartAttempt(reason);
  if (!attempt.allowed) {
    void appendErrorLog(`${context}: restart skipped (cooldown)`, "info");
    return "background";
  }

  void appendErrorLog(`${context}: background task dead, restarting`, "warn");
  const result = await startLocationTracking(shiftId);
  if (result === "background") {
    void sendTrackingRestartEvent(shiftId, reason);
  } else {
    void appendErrorLog(`${context}: restart failed → ${result}`);
  }
  return result;
}

/** Keep foreground watch or background task alive after resume / screen unlock. */
export async function ensureTrackingContinuity(): Promise<TrackingMode> {
  await applyPendingAdaptiveTierIfNeeded();

  const upgraded = await maybeUpgradeToBackgroundTracking();
  if (upgraded === "background") {
    startFlushTimer();
    return "background";
  }

  const shiftId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
  if (!shiftId) return upgraded;

  const mode = (await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE)) as TrackingMode | null;
  if (mode === "background") {
    const restarted = await ensureBackgroundTaskRunning(shiftId, "ensureTrackingContinuity");
    startFlushTimer();
    return restarted;
  }

  if (mode === "foreground") {
    const { getForegroundSubscription } = await import("./location-tracking-adaptive");
    if (!getForegroundSubscription()) {
      await startForegroundWatch(getCurrentForegroundTier());
    }
    startFlushTimer();
    return "foreground";
  }

  return upgraded;
}

/**
 * When the app goes to background: flush samples and restart a dead background task.
 */
export async function maintainBackgroundTracking(): Promise<TrackingMode> {
  const shiftId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
  if (!shiftId) return "none";

  const mode = (await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE)) as TrackingMode | null;

  if (mode === "background") {
    void flushPendingSamples().catch(() => undefined);
    return ensureBackgroundTaskRunning(shiftId, "maintainBackgroundTracking");
  }

  if (mode === "foreground") {
    void flushPendingSamples().catch(() => undefined);
    return "foreground";
  }

  return mode ?? "none";
}

/** Health-only restart used by background fetch watchdog. */
export async function runBackgroundTrackingWatchdog(): Promise<void> {
  const shiftId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
  if (!shiftId) return;

  const mode = (await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE)) as TrackingMode | null;
  if (mode !== "background") return;

  await ensureBackgroundTaskRunning(shiftId, "backgroundWatchdog");
}

/** @deprecated Use maintainBackgroundTracking on background and maybeUpgradeToBackgroundTracking on active. */
export async function tryUpgradeBackgroundTracking(): Promise<TrackingMode> {
  return maintainBackgroundTracking();
}

export function locationProviderLabel(): string {
  return Platform.select({ ios: "ios-core", android: "android-fused", default: "expo-location" }) ?? "expo-location";
}
