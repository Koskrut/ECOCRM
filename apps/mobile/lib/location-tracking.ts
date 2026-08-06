import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { AppState, Platform } from "react-native";

import { readBatteryOptimizationDetailed } from "./battery-optimization";
import { bootstrapShiftTrackingContext } from "./location-shift-bootstrap";
import { formatKyivDateKey } from "./date";
import {
  appendPendingSample,
  flushPendingSamples,
  getLastAcceptedAt,
  getLastFlushError,
  getLastRejectReason,
  getPendingCount,
  maybeFlushAfterAppend,
  purgePendingSamples,
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
import { isAcceptStale, reconcileTrackingHealth } from "./location-tracking-health";
import { clearFlushBlockReason, clearStaleGpsFlushBlockIfNeeded, getLastFlushBlockReason } from "./session-auth";
import {
  canStartLocationForegroundService,
  clearPendingAdaptiveTier,
  getPendingAdaptiveTier,
  getTrackingRestartDiagnostics,
  isFgsBlockedFromBackgroundError,
  mapRestartContextToReason,
  recordRestartAttempt,
  reportedModeAfterBackgroundRestartAttempt,
  resetTrackingRestartDiagnostics,
  setBatteryOptimizationStatus,
  type TrackingRestartReason,
} from "./location-tracking-restart";
import {
  ensureFieldTrackingNotificationChannel,
  ensureTrackingNotificationPermission,
} from "./tracking-notification-channel";
import {
  clearGpsStoppedNotificationDedupe,
  notifyGpsStoppedIfBackgroundTaskDead,
} from "./location-tracking-alerts";
import { resolveTrackingModeAfterPermissions } from "./location-tracking-start";
import { sendTrackingRestartEvent } from "./tracking-telemetry";

export { registerFieldLocationTask };
export { requestTrackingPermissionsWithRationale as requestTrackingPermissions };
export type { TrackingPermissionStatus };
export {
  canStartLocationForegroundService,
  reportedModeAfterBackgroundRestartAttempt,
  shouldMaintainOnAppState,
} from "./location-tracking-restart";
export type { TrackingRestartReason } from "./location-tracking-restart";

export {
  appendPendingSample,
  flushPendingSamples,
  getLastAcceptedAt,
  getLastFlushError,
  getLastRejectReason,
  getPendingCount,
  purgePendingSamples,
  STORAGE_KEYS,
};
export type { PendingLocationSample };

export type TrackingMode = "background" | "foreground" | "none";

export type TrackingDiagnostics = {
  mode: TrackingMode;
  pendingSamples: number;
  lastFlushAt: string | null;
  lastAcceptedAt: string | null;
  lastRejectReason: string | null;
  lastFlushError: string | null;
  activeShiftId: string | null;
  foregroundPermission: string;
  backgroundPermission: string | null;
  backgroundTaskStarted: boolean;
  healthy: boolean;
  acceptStale?: boolean;
  flushBlockReason?: string | null;
  lastRestartAt: string | null;
  restartCountToday: number;
  lastRestartReason: TrackingRestartReason | null;
  batteryOptimizationStatus: "restricted" | "unrestricted" | "unknown" | "module_unavailable";
  batteryModuleLoaded?: boolean;
  batteryRawIgnoring?: boolean | null;
  claimedMode?: TrackingMode;
  actualMode?: TrackingMode;
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

function isMockLocation(pos: {
  mocked?: boolean | null;
  coords?: { latitude?: number; longitude?: number };
}): boolean {
  if (pos.mocked === true) return true;
  // Android LocationObject.mocked; some builds expose isFromMockProvider via extras.
  const anyPos = pos as { isFromMockProvider?: boolean };
  return anyPos.isFromMockProvider === true;
}

async function handleRawLocation(input: {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  clientRecordedAt: string;
  mocked?: boolean;
}): Promise<void> {
  if (input.mocked) {
    void appendErrorLog("location sample skipped: reason=mock", "warn");
    return;
  }
  // Client-side UA bbox — don't buffer Lima/emulator points (server would out_of_region).
  if (
    !Number.isFinite(input.lat) ||
    !Number.isFinite(input.lng) ||
    input.lat < 44 ||
    input.lat > 53 ||
    input.lng < 22 ||
    input.lng > 41
  ) {
    void appendErrorLog("location sample skipped: out_of_region", "warn");
    return;
  }
  // Stop feeding a blocked shift (wrong_day / 401 / dead-shift 400).
  const block = getLastFlushBlockReason();
  if (block === "wrong_day" || block === "auth_401" || block === "stale_gps") {
    return;
  }
  const result = await processLocationUpdate(input);
  if (result.accepted && result.sample) {
    const count = await appendPendingSample(result.sample);
    // Threshold flush + 30s timer cover delivery; per-sample flush doubled network churn.
    void maybeFlushAfterAppend(count).catch(() => undefined);
  }
  if (result.tierChanged) {
    void applyAdaptiveTier(result.tier, startForegroundWatch).catch(() => undefined);
  }
  notifyListeners(result);
}

function startFlushTimer(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    // Flush in background too — FGS keeps JS alive; Ісанчев had 1h silence while foreground gate blocked timer.
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
      mocked: isMockLocation(pos),
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

  // Android 12+: starting a location FGS while backgrounded always fails.
  if (!canStartLocationForegroundService(AppState.currentState)) {
    void appendErrorLog("skip_fgs_start_while_background", "info");
    return false;
  }

  if (started) {
    await Location.stopLocationUpdatesAsync(FIELD_LOCATION_TASK);
  }
  await ensureTrackingNotificationPermission();
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

  if (!canStartLocationForegroundService(AppState.currentState)) {
    // Keep pending tier; apply on next foreground resume.
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
    const boot = await bootstrapShiftTrackingContext(shiftId);
    if (!boot.ok) {
      void appendErrorLog(`startLocationTracking: bootstrap failed (${boot.reason})`, "warn");
      await AsyncStorage.setItem(STORAGE_KEYS.TRACKING_MODE, "none");
      return "none";
    }

    setForegroundWatchStarter(startForegroundWatch);
    await registerFieldLocationTask();
    await resetLocationProcessorState();
    clearFlushBlockReason();

    const { foreground, background } = await requestTrackingPermissionsWithRationale();
    if (foreground !== "granted") {
      await AsyncStorage.setItem(STORAGE_KEYS.TRACKING_MODE, "none");
      return "none";
    }

    const hasBackground = background === "granted";
    const initialTier = DEFAULT_TIER;

    if (!hasBackground) {
      void appendErrorLog("startLocationTracking: background permission required (Always)", "warn");
      await stopForegroundWatch().catch(() => undefined);
      await Location.stopLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(() => undefined);
      await AsyncStorage.setItem(STORAGE_KEYS.TRACKING_MODE, "none");
      return "none";
    }

    const taskStarted = await startBackgroundUpdates(initialTier);
    const mode = resolveTrackingModeAfterPermissions(foreground, background, taskStarted);
    if (mode === "none") {
      void appendErrorLog("startLocationTracking: background task failed to start");
      await AsyncStorage.setItem(STORAGE_KEYS.TRACKING_MODE, "none");
      return "none";
    }
    await stopForegroundWatch();
    await AsyncStorage.setItem(STORAGE_KEYS.TRACKING_MODE, "background");
    startFlushTimer();
    clearStaleGpsFlushBlockIfNeeded();
    void clearGpsStoppedNotificationDedupe().catch(() => undefined);
    void captureImmediateFixAndFlush().catch(() => undefined);
    return "background";
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    void appendErrorLog(`startLocationTracking: ${message}`);
    await AsyncStorage.setItem(STORAGE_KEYS.TRACKING_MODE, "none").catch(() => undefined);
    return "none";
  }
}

/** One-shot foreground GPS + buffer append + flush (does not wait for background task). */
export async function captureImmediateFixAndFlush(): Promise<boolean> {
  try {
    const block = getLastFlushBlockReason();
    if (block === "wrong_day" || block === "auth_401" || block === "stale_gps") {
      return false;
    }
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    if (isMockLocation(pos)) {
      void appendErrorLog("immediate fix skipped: reason=mock", "warn");
      return false;
    }
    await handleRawLocation({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracyM:
        typeof pos.coords.accuracy === "number" && Number.isFinite(pos.coords.accuracy)
          ? pos.coords.accuracy
          : undefined,
      clientRecordedAt: new Date(pos.timestamp).toISOString(),
      mocked: false,
    });
    const uploaded = await flushPendingSamples();
    return uploaded > 0;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    void appendErrorLog(`captureImmediateFixAndFlush failed: ${message}`, "warn");
    return false;
  }
}

export type RestartTrackingResult = {
  ok: boolean;
  mode: TrackingMode;
  backgroundTaskStarted: boolean;
  errorCode?: "no_shift" | "app_not_active" | "start_failed";
  /** Raw / plain-language failure detail for Alert. */
  errorDetail?: string;
};

/**
 * Manual "Restart tracking" — bypasses cooldown, only from foreground.
 * Success requires hasStartedLocationUpdatesAsync === true when claiming background.
 */
export async function restartTrackingPipeline(): Promise<RestartTrackingResult> {
  const shiftId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
  const claimed =
    ((await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE)) as TrackingMode | null) ?? "none";
  const taskStartedNow = await Location.hasStartedLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(
    () => false,
  );

  if (!shiftId) {
    return { ok: false, mode: claimed, backgroundTaskStarted: taskStartedNow, errorCode: "no_shift" };
  }

  // No side effects on shift / TRACKING_MODE while minimized (Android 12+).
  if (!canStartLocationForegroundService(AppState.currentState)) {
    return {
      ok: false,
      mode: claimed,
      backgroundTaskStarted: taskStartedNow,
      errorCode: "app_not_active",
    };
  }

  clearStaleGpsFlushBlockIfNeeded();
  const lastAcceptedAt = await getLastAcceptedAt();
  const acceptStale = isAcceptStale(lastAcceptedAt);

  let mode: TrackingMode;
  if (claimed === "background") {
    // Dead FGS or Expo #47595 zombie (started but accept stale) → force recreate.
    mode = await ensureBackgroundTaskRunning(shiftId, "manualRestart", {
      bypassCooldown: true,
      forceRecreate: acceptStale || !taskStartedNow,
    });
    if (mode !== "background") {
      mode = await startLocationTracking(shiftId);
    }
  } else if (claimed === "none") {
    mode = await startLocationTracking(shiftId);
  } else {
    mode = await ensureTrackingContinuity({ bypassCooldown: true });
  }

  await captureImmediateFixAndFlush().catch(() => false);

  const backgroundTaskStarted = await Location.hasStartedLocationUpdatesAsync(
    FIELD_LOCATION_TASK,
  ).catch(() => false);

  // Field default: success means background FGS is actually running.
  if (mode === "background" || claimed === "background" || claimed === "none") {
    if (!backgroundTaskStarted || mode !== "background") {
      return {
        ok: false,
        mode: reportedModeAfterBackgroundRestartAttempt(
          claimed === "foreground" ? "foreground" : "background",
          backgroundTaskStarted,
        ),
        backgroundTaskStarted,
        errorCode: "start_failed",
        errorDetail: "fgs_or_os_rejected",
      };
    }
    clearStaleGpsFlushBlockIfNeeded();
    return { ok: true, mode: "background", backgroundTaskStarted: true };
  }

  if (mode !== "none") {
    clearStaleGpsFlushBlockIfNeeded();
  }

  return {
    ok: mode !== "none",
    mode,
    backgroundTaskStarted,
    errorCode: mode === "none" ? "start_failed" : undefined,
  };
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

/**
 * Stop native GPS on session expiry without wiping buffer / shift id.
 * After re-login, flushPendingSamples can still target the same shift.
 */
export async function pauseLocationTrackingKeepBuffer(): Promise<void> {
  try {
    stopFlushTimer();
    await stopForegroundWatch();
    const started = await Location.hasStartedLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(
      () => false,
    );
    if (started) {
      await Location.stopLocationUpdatesAsync(FIELD_LOCATION_TASK);
    }
    // Keep ACTIVE_SHIFT_ID + PENDING_SAMPLES; only mark mode none so UI/watchdogs idle.
    await AsyncStorage.setItem(STORAGE_KEYS.TRACKING_MODE, "none");
  } catch {
    /* best-effort pause */
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
    // Stale ACTIVE shift from yesterday — do NOT keep writing samples (wrong_day loop).
    // Caller (refresh) should end the shift; we only clear local binding.
    if (shiftDayKey && shiftDayKey !== todayKey) {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.ACTIVE_SHIFT_ID,
        STORAGE_KEYS.ACTIVE_SHIFT_DAY_KEY,
        STORAGE_KEYS.TRACKING_MODE,
      ]);
      await purgePendingSamples();
      return "none";
    }
    const boundDay = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_DAY_KEY);
    // Local day rolled over but shift is still today (timezone edge) — rebind cleanly.
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
        return maybeUpgradeToBackgroundTracking();
      }
    }
    return startLocationTracking(shift.id);
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
  const [
    state,
    perms,
    activeShiftId,
    backgroundTaskStarted,
    restartDiagnostics,
    batteryDetailed,
    lastAcceptedAt,
    lastRejectReason,
    lastFlushError,
  ] = await Promise.all([
    getTrackingState(),
    getTrackingPermissionStatus(),
    AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID),
    Location.hasStartedLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(() => false),
    getTrackingRestartDiagnostics(),
    readBatteryOptimizationDetailed(),
    getLastAcceptedAt(),
    getLastRejectReason(),
    getLastFlushError(),
  ]);
  const batteryStatus = batteryDetailed.status;
  void setBatteryOptimizationStatus(batteryStatus);
  const { getForegroundSubscription } = await import("./location-tracking-adaptive");
  const foregroundWatchActive = !!getForegroundSubscription();
  let health = reconcileTrackingHealth(state.mode, backgroundTaskStarted, foregroundWatchActive, {
    lastAcceptedAt,
    requireRecentAccept: !!activeShiftId && state.mode !== "none",
    backgroundPermission: perms.background,
  });

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
    acceptStale: health.acceptStale,
    flushBlockReason: getLastFlushBlockReason(),
    lastRestartAt: restartDiagnostics.lastRestartAt,
    restartCountToday: restartDiagnostics.restartCountToday,
    lastRestartReason: restartDiagnostics.lastRestartReason,
    batteryOptimizationStatus: batteryStatus,
    batteryModuleLoaded: batteryDetailed.moduleLoaded,
    batteryRawIgnoring: batteryDetailed.rawIgnoring,
    lastAcceptedAt,
    lastRejectReason,
    lastFlushError,
  };
}

export async function getTrackingDiagnostics(): Promise<TrackingDiagnostics> {
  const health = await getTrackingRuntimeHealth();
  return {
    mode: health.mode,
    claimedMode: health.claimedMode,
    actualMode: health.actualMode,
    pendingSamples: health.pendingSamples,
    lastFlushAt: health.lastFlushAt,
    lastAcceptedAt: health.lastAcceptedAt ?? null,
    lastRejectReason: health.lastRejectReason ?? null,
    lastFlushError: health.lastFlushError ?? null,
    activeShiftId: health.activeShiftId,
    foregroundPermission: health.foregroundPermission,
    backgroundPermission: health.backgroundPermission,
    backgroundTaskStarted: health.backgroundTaskStarted,
    healthy: health.healthy,
    acceptStale: health.acceptStale,
    flushBlockReason: health.flushBlockReason,
    lastRestartAt: health.lastRestartAt,
    restartCountToday: health.restartCountToday,
    lastRestartReason: health.lastRestartReason,
    batteryOptimizationStatus: health.batteryOptimizationStatus,
    batteryModuleLoaded: health.batteryModuleLoaded,
    batteryRawIgnoring: health.batteryRawIgnoring,
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

/** Restart background task when storage says background but OS task is dead / poisoned. */
async function ensureBackgroundTaskRunning(
  shiftId: string,
  context: string,
  opts?: { bypassCooldown?: boolean; forceRecreate?: boolean },
): Promise<TrackingMode> {
  const mode = (await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE)) as TrackingMode | null;
  if (mode !== "background") {
    return mode ?? "none";
  }

  const started = await Location.hasStartedLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(
    () => false,
  );
  if (started && !opts?.forceRecreate) {
    return "background";
  }

  // Never attempt FGS start while minimized — Android 12+ rejects it.
  if (!canStartLocationForegroundService(AppState.currentState)) {
    void appendErrorLog(`${context}: skip_fgs_start_while_background`, "info");
    return reportedModeAfterBackgroundRestartAttempt("background", started);
  }

  const reason = mapRestartContextToReason(context);
  const attempt = await recordRestartAttempt(reason, Date.now(), {
    bypassCooldown: opts?.bypassCooldown === true,
  });
  if (!attempt.allowed) {
    void appendErrorLog(`${context}: restart skipped (cooldown)`, "info");
    return reportedModeAfterBackgroundRestartAttempt("background", started);
  }

  void appendErrorLog(
    started && opts?.forceRecreate
      ? `${context}: poison FGS recreate (Expo #47595)`
      : `${context}: background task dead, restarting`,
    "warn",
  );
  // Light restart — do NOT reset LAST_ACCEPTED_AT / processor (would mask stale GPS).
  try {
    await registerFieldLocationTask();
    setForegroundWatchStarter(startForegroundWatch);
    const taskStarted = await startBackgroundUpdates(getCurrentForegroundTier(), {
      forceRestart: true,
    });
    if (taskStarted) {
      await AsyncStorage.setItem(STORAGE_KEYS.TRACKING_MODE, "background");
      startFlushTimer();
      clearStaleGpsFlushBlockIfNeeded();
      void sendTrackingRestartEvent(shiftId, reason);
      return "background";
    }
    void appendErrorLog(`${context}: restart failed → task still dead`, "warn");
    return reportedModeAfterBackgroundRestartAttempt("background", false);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (isFgsBlockedFromBackgroundError(message)) {
      void appendErrorLog(`${context}: skip_fgs_start_while_background (${message})`, "info");
    } else {
      void appendErrorLog(`${context}: restart failed → ${message}`);
    }
    return reportedModeAfterBackgroundRestartAttempt("background", false);
  }
}

/** Keep foreground watch or background task alive after resume / screen unlock. */
export async function ensureTrackingContinuity(opts?: {
  bypassCooldown?: boolean;
}): Promise<TrackingMode> {
  await applyPendingAdaptiveTierIfNeeded();

  const upgraded = await maybeUpgradeToBackgroundTracking();
  if (upgraded === "background") {
    const started = await Location.hasStartedLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(
      () => false,
    );
    if (started) {
      startFlushTimer();
      return "background";
    }
  }

  const shiftId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
  if (!shiftId) return upgraded;

  const mode = (await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE)) as TrackingMode | null;
  if (mode === "background") {
    const restarted = await ensureBackgroundTaskRunning(shiftId, "ensureTrackingContinuity", opts);
    if (restarted === "background") {
      startFlushTimer();
      clearStaleGpsFlushBlockIfNeeded();
      void captureImmediateFixAndFlush().catch(() => undefined);
    }
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
 * App went to background: flush pending samples only.
 * Do NOT call startLocationUpdatesAsync — Android 12+ rejects FGS start here.
 * Dead tasks are recovered when AppState becomes active.
 */
export async function maintainBackgroundTracking(): Promise<TrackingMode> {
  const shiftId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
  if (!shiftId) return "none";

  const mode = (await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE)) as TrackingMode | null;

  if (mode === "background" || mode === "foreground") {
    void flushPendingSamples().catch(() => undefined);
  }

  if (mode === "background") {
    const started = await Location.hasStartedLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(
      () => false,
    );
    if (!started) {
      void appendErrorLog("maintainBackgroundTracking: skip_fgs_start_while_background", "info");
      void notifyGpsStoppedIfBackgroundTaskDead().catch(() => undefined);
    }
    return reportedModeAfterBackgroundRestartAttempt("background", started);
  }

  if (mode === "foreground") {
    // Legacy foreground-only — GPS dies when minimized; treat as inactive.
    void notifyGpsStoppedIfBackgroundTaskDead().catch(() => undefined);
    return "foreground";
  }

  return mode ?? "none";
}

/**
 * Background-fetch watchdog: flush only. Never start FGS from background.
 * Foreground AppState / in-app watchdog perform the actual restart.
 */
export async function runBackgroundTrackingWatchdog(): Promise<void> {
  const shiftId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
  if (!shiftId) return;

  const mode = (await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE)) as TrackingMode | null;
  if (mode !== "background") return;

  void flushPendingSamples().catch(() => undefined);
  const started = await Location.hasStartedLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(
    () => false,
  );
  if (!started) {
    void appendErrorLog("backgroundWatchdog: skip_fgs_start_while_background", "info");
    void notifyGpsStoppedIfBackgroundTaskDead().catch(() => undefined);
  }
}

/** Foreground recovery: dead or zombie background task → forceRestart + immediate fix. */
export async function recoverDeadBackgroundTaskOnForeground(): Promise<TrackingMode> {
  if (!canStartLocationForegroundService(AppState.currentState)) {
    return "none";
  }
  const shiftId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
  if (!shiftId) return "none";

  const mode = (await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE)) as TrackingMode | null;
  if (mode === "foreground") {
    // Upgrade legacy foreground-only to background if Always was granted in Settings.
    return maybeUpgradeToBackgroundTracking();
  }
  if (mode !== "background") {
    return ensureTrackingContinuity({ bypassCooldown: true });
  }

  const started = await Location.hasStartedLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(
    () => false,
  );
  const lastAcceptedAt = await getLastAcceptedAt();
  const acceptStale = reconcileTrackingHealth("background", started, false, {
    lastAcceptedAt,
    requireRecentAccept: true,
  }).acceptStale;

  // Dead FGS, or Expo #47595 zombie (notification alive, no location callbacks).
  if (!started || acceptStale) {
    const restarted = await ensureBackgroundTaskRunning(shiftId, "foregroundRecover", {
      bypassCooldown: true,
      forceRecreate: true,
    });
    if (restarted === "background") {
      startFlushTimer();
      clearStaleGpsFlushBlockIfNeeded();
      void clearGpsStoppedNotificationDedupe().catch(() => undefined);
      await flushPendingSamples(shiftId).catch(() => undefined);
      await captureImmediateFixAndFlush().catch(() => false);
      return "background";
    }
    return restarted;
  }

  // Always flush + immediate fix on foreground resume (even when task looks alive).
  void clearGpsStoppedNotificationDedupe().catch(() => undefined);
  await flushPendingSamples(shiftId).catch(() => undefined);
  await captureImmediateFixAndFlush().catch(() => false);
  return "background";
}

/** @deprecated Use maintainBackgroundTracking on background and maybeUpgradeToBackgroundTracking on active. */
export async function tryUpgradeBackgroundTracking(): Promise<TrackingMode> {
  return maintainBackgroundTracking();
}

export function locationProviderLabel(): string {
  return Platform.select({ ios: "ios-core", android: "android-fused", default: "expo-location" }) ?? "expo-location";
}
