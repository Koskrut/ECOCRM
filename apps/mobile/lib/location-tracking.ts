import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { Platform } from "react-native";

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

export { registerFieldLocationTask };
export { requestTrackingPermissionsWithRationale as requestTrackingPermissions };
export type { TrackingPermissionStatus };

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
  const { getForegroundSubscription, setForegroundSubscription } = await import(
    "./location-tracking-adaptive"
  );
  const sub = getForegroundSubscription();
  if (sub) {
    sub.remove();
  }
  setForegroundSubscription(null);
}

async function startBackgroundUpdates(initialTier: SamplingTier): Promise<void> {
  const started = await Location.hasStartedLocationUpdatesAsync(FIELD_LOCATION_TASK);
  if (started) {
    await Location.stopLocationUpdatesAsync(FIELD_LOCATION_TASK);
  }
  await Location.startLocationUpdatesAsync(
    FIELD_LOCATION_TASK,
    backgroundOptionsForTier(initialTier),
  );
}

export async function startLocationTracking(shiftId: string): Promise<TrackingMode> {
  try {
    setForegroundWatchStarter(startForegroundWatch);
    await registerFieldLocationTask();
    await resetLocationProcessorState();
    await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_SHIFT_ID, shiftId);

    const { foreground, background } = await requestTrackingPermissionsWithRationale();
    if (foreground !== "granted") {
      await AsyncStorage.setItem(STORAGE_KEYS.TRACKING_MODE, "none");
      return "none";
    }

    const hasBackground = background === "granted";
    const initialTier = DEFAULT_TIER;

    if (hasBackground) {
      await startBackgroundUpdates(initialTier);
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
    await AsyncStorage.multiRemove([STORAGE_KEYS.ACTIVE_SHIFT_ID, STORAGE_KEYS.TRACKING_MODE]);
    await resetLocationProcessorState();
  } catch {
    /* best-effort stop */
  }
}

export async function resumeTrackingIfNeeded(
  shift: { id: string; trackingEnabled: boolean; status: string } | null,
): Promise<TrackingMode> {
  try {
    if (!shift || shift.status !== "ACTIVE" || !shift.trackingEnabled) {
      return "none";
    }
    await registerFieldLocationTask();
    setForegroundWatchStarter(startForegroundWatch);
    const mode = await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE);
    const activeId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
    if (activeId === shift.id && mode && mode !== "none") {
      startFlushTimer();
      if (mode === "background") {
        const started = await Location.hasStartedLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(
          () => false,
        );
        if (!started) {
          return startLocationTracking(shift.id);
        }
        return "background";
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

export async function getTrackingDiagnostics(): Promise<TrackingDiagnostics> {
  const [state, perms, activeShiftId, backgroundTaskStarted] = await Promise.all([
    getTrackingState(),
    getTrackingPermissionStatus(),
    AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID),
    Location.hasStartedLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(() => false),
  ]);
  return {
    mode: state.mode,
    pendingSamples: state.pendingSamples,
    lastFlushAt: state.lastFlushAt,
    activeShiftId,
    foregroundPermission: perms.foreground,
    backgroundPermission: perms.background,
    backgroundTaskStarted,
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

/** Keep foreground watch or background task alive after resume / screen unlock. */
export async function ensureTrackingContinuity(): Promise<TrackingMode> {
  const upgraded = await maybeUpgradeToBackgroundTracking();
  if (upgraded === "background") {
    startFlushTimer();
    return "background";
  }

  const shiftId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
  if (!shiftId) return upgraded;

  const mode = (await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE)) as TrackingMode | null;
  if (mode === "background") {
    const started = await Location.hasStartedLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(
      () => false,
    );
    if (!started) {
      return startLocationTracking(shiftId);
    }
    startFlushTimer();
    return "background";
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
 * When the app goes to background: only restart an already-running background task.
 * Do not request permissions or start background updates for the first time here.
 */
export async function maintainBackgroundTracking(): Promise<TrackingMode> {
  const shiftId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
  if (!shiftId) return "none";

  const mode = (await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE)) as TrackingMode | null;

  if (mode === "background") {
    const started = await Location.hasStartedLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(
      () => false,
    );
    if (started) {
      void flushPendingSamples().catch(() => undefined);
    }
    return "background";
  }

  if (mode === "foreground") {
    void flushPendingSamples().catch(() => undefined);
    return "foreground";
  }

  return mode ?? "none";
}

/** @deprecated Use maintainBackgroundTracking on background and maybeUpgradeToBackgroundTracking on active. */
export async function tryUpgradeBackgroundTracking(): Promise<TrackingMode> {
  return maintainBackgroundTracking();
}

export function locationProviderLabel(): string {
  return Platform.select({ ios: "ios-core", android: "android-fused", default: "expo-location" }) ?? "expo-location";
}
