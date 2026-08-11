import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { AppState, Platform } from "react-native";

import { readBatteryOptimizationDetailed } from "./battery-optimization";
import { bootstrapShiftTrackingContext } from "./location-shift-bootstrap";
import { clearFieldShiftSnapshot, writeFieldShiftSnapshot } from "./field-shift-snapshot";
import { formatKyivDateKey } from "./date";
import {
  appendPendingSample,
  flushPendingSamples,
  getLastAcceptedAt,
  getLastFlushError,
  getLastGpsPointAt,
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
  setCurrentForegroundTier,
  setForegroundSubscription,
} from "./location-tracking-adaptive";
import {
  BACKGROUND_FGS_TIER,
  DEFAULT_TIER,
  watchOptionsForTier,
  type SamplingTier,
} from "./location-tracking-config";
import {
  processLocationUpdate,
  resetLocationProcessorState,
} from "./location-tracking-processor";
import {
  ensureBackgroundLocationGranted,
  getTrackingPermissionStatus,
  isBackgroundLocationGrantedStatus,
  requestTrackingPermissionsWithRationale,
  type TrackingPermissionStatus,
} from "./location-permissions";
import { appendErrorLog } from "./error-log";
import { validateRawLocationSample } from "./location-region-check";
import { formatTeleportRejectLog } from "./location-sample-filter";
import { isAcceptStale, reconcileTrackingHealth, LAST_POINT_STALE_MS } from "./location-tracking-health";
import {
  clearFlushBlockReason,
  clearStaleGpsFlushBlockIfNeeded,
  getLastFlushBlockReason,
  hydrateSessionAuthFromStorage,
} from "./session-auth";
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
  notifyGpsStoppedZombieFgs,
} from "./location-tracking-alerts";
import { resolveTrackingModeAfterPermissions } from "./location-tracking-start";
import { shouldUseExpoTracking, shouldUseNativeTracking, getFieldTrackingMode } from "./tracking-feature-flag";
import {
  startNativeTracking,
  stopNativeTracking,
  getNativeTrackingHealth,
  isNativeTrackingModuleLoaded,
  flushNativePendingSamples,
  purgeNativePendingSamples,
  type NativeTrackingHealth,
} from "../modules/crm-native-tracking";
import {
  syncNativeTrackingSession,
  syncNativeTrackingSessionDetailed,
} from "./native-tracking-session";
import { markTrackingWarmup, isTrackingWarmupActive } from "./tracking-warmup";
import {
  displayPendingSamples,
  deriveNativeHealthKind,
  isNativeAcceptTimestampStale,
  resolveNativeRuntimeAcceptHealth,
} from "./native-tracking-gates";
import { sendGpsZombieDetectedEvent, sendTrackingRestartEvent } from "./tracking-telemetry";
import {
  beginRecoveryAttempt,
  clearRecoveryState,
  evaluateRecoveryOutcome,
  markRecoveryRequired,
  parseRecoveryStateKind,
  readRecoveryState,
  recordRecoveryEvent,
  type RecoveryPersistedState,
  type RecoveryStateKind,
} from "./tracking-recovery-state";
import type { TrackingHealthKind } from "./location-tracking-health";

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
  getLastGpsPointAt,
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
  pointStale?: boolean;
  healthKind?: TrackingHealthKind;
  zombieFgs?: boolean;
  recoveryState?: RecoveryStateKind;
  lastGpsPointAt?: string | null;
  flushBlockReason?: string | null;
  lastRestartAt: string | null;
  restartCountToday: number;
  lastRestartReason: TrackingRestartReason | null;
  batteryOptimizationStatus: "restricted" | "unrestricted" | "unknown" | "module_unavailable";
  batteryModuleLoaded?: boolean;
  batteryRawIgnoring?: boolean | null;
  /** Baked at build time via EXPO_PUBLIC_FIELD_TRACKING_MODE / app.config.js extra. */
  fieldTrackingMode?: "legacy_expo" | "native_android";
  nativeModuleLoaded?: boolean;
  /** Native FGS health snapshot — used for alert/UI gating independent of JS accept. */
  nativeTrackingHealthState?: string;
  nativeServiceRunning?: boolean;
  claimedMode?: TrackingMode;
  actualMode?: TrackingMode;
};

export type TrackingRuntimeHealth = TrackingDiagnostics & {
  claimedMode: TrackingMode;
  actualMode: TrackingMode;
  foregroundWatchActive: boolean;
  recovery?: RecoveryPersistedState;
};

let flushTimer: ReturnType<typeof setInterval> | null = null;

function isTimestampStale(iso: string | null | undefined, thresholdMs: number): boolean {
  if (!iso) return true;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t > thresholdMs;
}

function mapNativeHealthStateToHealthy(state: string | undefined): boolean {
  return state === "TRACKING_HEALTHY" || state === "NETWORK_DEGRADED";
}

async function buildNativeRuntimeHealth(
  state: Awaited<ReturnType<typeof getTrackingState>>,
  perms: TrackingPermissionStatus,
  activeShiftId: string | null,
  restartDiagnostics: Awaited<ReturnType<typeof getTrackingRestartDiagnostics>>,
  batteryDetailed: Awaited<ReturnType<typeof readBatteryOptimizationDetailed>>,
  nativeHealth: NativeTrackingHealth | null,
): Promise<TrackingRuntimeHealth> {
  const batteryStatus = batteryDetailed.status;
  void setBatteryOptimizationStatus(batteryStatus);
  const inWarmup = await isTrackingWarmupActive();
  // Prefer native FGS flag; only trust claimed background during warmup when bridge lags.
  const serviceRunning =
    nativeHealth?.serviceRunning === true ||
    (inWarmup && nativeHealth == null && state.mode === "background" && !!activeShiftId);
  const mode: TrackingMode =
    state.mode !== "none" ? state.mode : serviceRunning ? "background" : "none";
  const fieldTrackingMode = getFieldTrackingMode();
  const { lastAcceptedAt, acceptStale } = resolveNativeRuntimeAcceptHealth(
    nativeHealth,
    await getLastAcceptedAt(),
    inWarmup,
    { nativeMode: fieldTrackingMode === "native_android" },
  );
  const lastGpsPointAt = nativeHealth?.lastGpsCapturedAt ?? null;
  const pointStale = inWarmup ? false : isTimestampStale(lastGpsPointAt, LAST_POINT_STALE_MS);
  const rawAcceptStale = isNativeAcceptTimestampStale(
    nativeHealth?.lastServerAcceptAt ?? lastAcceptedAt,
  );
  const healthState = nativeHealth?.trackingHealthState;
  const healthy =
    mapNativeHealthStateToHealthy(healthState) &&
    serviceRunning &&
    healthState !== "LOCATION_STALE";
  const nativePending = nativeHealth?.pendingUploadCount ?? 0;
  const nativeLastFlush = nativeHealth?.lastFlushAt ?? null;
  const nativeLastReject = nativeHealth?.lastRejectReasons ?? null;
  const zombieFgs =
    serviceRunning &&
    rawAcceptStale &&
    mode === "background" &&
    healthState === "LOCATION_STALE";

  return {
    mode,
    claimedMode: mode,
    actualMode: serviceRunning ? "background" : "none",
    pendingSamples: displayPendingSamples(fieldTrackingMode, state.pendingSamples, nativePending),
    lastFlushAt: nativeLastFlush ?? state.lastFlushAt,
    activeShiftId,
    foregroundPermission: perms.foreground,
    backgroundPermission: perms.background,
    backgroundTaskStarted: serviceRunning,
    foregroundWatchActive: false,
    healthy,
    acceptStale,
    pointStale,
    healthKind: deriveNativeHealthKind({
      serviceRunning,
      acceptStale: rawAcceptStale,
      pointStale: inWarmup ? false : isTimestampStale(lastGpsPointAt, LAST_POINT_STALE_MS),
      trackingHealthState: healthState,
    }),
    zombieFgs,
    recoveryState: parseRecoveryStateKind(nativeHealth?.recoveryState),
    lastGpsPointAt,
    flushBlockReason: getLastFlushBlockReason(),
    lastRestartAt: restartDiagnostics.lastRestartAt,
    restartCountToday: restartDiagnostics.restartCountToday,
    lastRestartReason: restartDiagnostics.lastRestartReason,
    batteryOptimizationStatus: batteryStatus,
    batteryModuleLoaded: batteryDetailed.moduleLoaded,
    batteryRawIgnoring: batteryDetailed.rawIgnoring,
    fieldTrackingMode,
    nativeModuleLoaded: isNativeTrackingModuleLoaded(),
    nativeTrackingHealthState: healthState,
    nativeServiceRunning: serviceRunning,
    lastAcceptedAt,
    lastRejectReason: nativeLastReject ?? (await getLastRejectReason()),
    lastFlushError: await getLastFlushError(),
    recovery: await readRecoveryState(),
  };
}

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
  if (shouldUseNativeTracking()) {
    return;
  }
  const validated = validateRawLocationSample(input);
  if (!validated.ok) {
    void appendErrorLog(validated.logLine, "warn");
    return;
  }
  input = { ...input, lat: validated.lat, lng: validated.lng };
  // Stop feeding a blocked shift (wrong_day / 401 / dead-shift 400).
  const block = getLastFlushBlockReason();
  if (block === "wrong_day" || block === "auth_401" || block === "stale_gps") {
    return;
  }
  const result = await processLocationUpdate(input);
  if (result.accepted && result.sample) {
    if (result.reanchor && result.prevSample) {
      const gapMin =
        result.gapMs != null && Number.isFinite(result.gapMs)
          ? (result.gapMs / 60_000).toFixed(1)
          : "?";
      void appendErrorLog(
        `location sample reanchor after gap gapMin=${gapMin}` +
          ` prev=${result.prevSample.lat.toFixed(5)},${result.prevSample.lng.toFixed(5)}` +
          ` next=${result.sample.lat.toFixed(5)},${result.sample.lng.toFixed(5)}`,
        "info",
      );
    }
    const count = await appendPendingSample(result.sample);
    // Threshold flush + 30s timer cover delivery; per-sample flush doubled network churn.
    void maybeFlushAfterAppend(count).catch(() => undefined);
  } else if (
    result.rejectReason === "teleport" &&
    result.prevSample
  ) {
    void appendErrorLog(
      formatTeleportRejectLog(
        result.prevSample,
        {
          lat: input.lat,
          lng: input.lng,
          accuracyM: input.accuracyM,
          clientRecordedAt: input.clientRecordedAt,
        },
        result.gapMs,
        result.distM,
      ),
      "warn",
    );
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
    backgroundOptionsForTier(BACKGROUND_FGS_TIER),
  );
  return Location.hasStartedLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(() => false);
}

async function applyPendingAdaptiveTierIfNeeded(): Promise<void> {
  // Adaptive Expo tiers are irrelevant for native FGS.
  if (shouldUseNativeTracking()) {
    await clearPendingAdaptiveTier();
    return;
  }

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

  try {
    setCurrentForegroundTier(pendingTier);
    await clearPendingAdaptiveTier();
    void appendErrorLog("applyPendingAdaptiveTier: tier applied", "info");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    void appendErrorLog(`applyPendingAdaptiveTier failed: ${message}`);
  }
}

/** Stop Expo TaskManager / foreground watch so native and legacy never dual-write. */
async function stopExpoLocationWriters(): Promise<void> {
  stopFlushTimer();
  await stopForegroundWatch().catch(() => undefined);
  const started = await Location.hasStartedLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(
    () => false,
  );
  if (started) {
    await Location.stopLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(() => undefined);
  }
}

async function resolvePermissionsForTrackingStart(): Promise<TrackingPermissionStatus> {
  const probed = await ensureBackgroundLocationGranted();
  if (
    probed.foreground === "granted" &&
    isBackgroundLocationGrantedStatus(probed.background)
  ) {
    return probed;
  }
  return requestTrackingPermissionsWithRationale();
}

export async function startLocationTracking(shiftId: string): Promise<TrackingMode> {
  try {
    if (shouldUseNativeTracking()) {
      // Drop legacy Expo buffer — native FGS owns capture + upload.
      await purgePendingSamples();
      await purgeNativePendingSamples();

      // Never leave Expo FGS running alongside native (dual writers).
      await stopExpoLocationWriters();

      await ensureFieldTrackingNotificationChannel();
      await ensureTrackingNotificationPermission();
      const { foreground, background } = await resolvePermissionsForTrackingStart();
      if (foreground !== "granted" || background !== "granted") {
        void appendErrorLog(
          "startLocationTracking(native): background permission required (Always)",
          "warn",
        );
        await AsyncStorage.setItem(STORAGE_KEYS.TRACKING_MODE, "none");
        return "none";
      }

      // Credentials must land in Kotlin DataStore before FGS upload; retry once on race.
      const sync = await syncNativeTrackingSessionDetailed({ retries: 1 });
      if (!sync.ok) {
        const reason =
          sync.reason === "module_missing"
            ? "module_missing (CrmNativeTracking not linked — reinstall preview-native APK)"
            : sync.reason;
        void appendErrorLog(
          `startLocationTracking(native): syncSession failed (${reason})`,
          sync.reason === "module_missing" ? "error" : "warn",
        );
        await AsyncStorage.setItem(STORAGE_KEYS.TRACKING_MODE, "none");
        return "none";
      }

      let ok = await startNativeTracking(shiftId);
      if (!ok) {
        // One more sync+start after a prior bridge miss (module/context race).
        const retrySync = await syncNativeTrackingSessionDetailed({ retries: 0 });
        if (!retrySync.ok) {
          void appendErrorLog(
            `startLocationTracking(native): syncSession failed after start miss (${retrySync.reason})`,
            "warn",
          );
          await AsyncStorage.setItem(STORAGE_KEYS.TRACKING_MODE, "none");
          return "none";
        }
        ok = await startNativeTracking(shiftId);
      }
      if (!ok) {
        void appendErrorLog("startLocationTracking(native): startTracking failed", "warn");
        await AsyncStorage.setItem(STORAGE_KEYS.TRACKING_MODE, "none");
        return "none";
      }

      await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_SHIFT_ID, shiftId);
      await AsyncStorage.setItem(STORAGE_KEYS.TRACKING_MODE, "background");
      await writeFieldShiftSnapshot({
        shiftId,
        trackingMode: "background",
        startedAt: new Date().toISOString(),
      });
      await markTrackingWarmup();
      void flushNativePendingSamples().catch(() => undefined);
      return "background";
    }

    if (!shouldUseExpoTracking()) {
      return "none";
    }

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

    const { foreground, background } = await resolvePermissionsForTrackingStart();
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
    await writeFieldShiftSnapshot({
      shiftId,
      trackingMode: "background",
      startedAt: new Date().toISOString(),
    });
    startFlushTimer();
    clearStaleGpsFlushBlockIfNeeded();
    void clearGpsStoppedNotificationDedupe().catch(() => undefined);
    void captureImmediateFixAndFlush().catch(() => undefined);
    await markTrackingWarmup();
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
  if (shouldUseNativeTracking()) {
    void flushNativePendingSamples().catch(() => undefined);
    return false;
  }
  try {
    await hydrateSessionAuthFromStorage();
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
  errorCode?: "no_shift" | "app_not_active" | "start_failed" | "recovery_failed";
  /** Raw / plain-language failure detail for Alert. */
  errorDetail?: string;
  recoveryState?: RecoveryStateKind;
};

/**
 * Manual "Restart tracking" — bypasses cooldown, only from foreground.
 * Success requires hasStartedLocationUpdatesAsync === true when claiming background.
 */
export async function restartTrackingPipeline(): Promise<RestartTrackingResult> {
  const shiftId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
  const claimed =
    ((await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE)) as TrackingMode | null) ?? "none";

  if (shouldUseNativeTracking()) {
    const taskStartedNow = (await getNativeTrackingHealth())?.serviceRunning === true;
    if (!shiftId) {
      return { ok: false, mode: claimed, backgroundTaskStarted: taskStartedNow, errorCode: "no_shift" };
    }
    if (!canStartLocationForegroundService(AppState.currentState)) {
      return {
        ok: false,
        mode: claimed,
        backgroundTaskStarted: taskStartedNow,
        errorCode: "app_not_active",
      };
    }

    const attempt = await recordRestartAttempt("os_kill", Date.now(), { bypassCooldown: true });
    if (!attempt.allowed) {
      void appendErrorLog("manualRestart(native): skipped (cooldown)", "info");
    }

    await purgeNativePendingSamples();
    const sync = await syncNativeTrackingSessionDetailed({ retries: 1 });
    if (!sync.ok) {
      void appendErrorLog(
        `manualRestart(native): syncSession failed (${sync.reason})`,
        sync.reason === "module_missing" ? "error" : "warn",
      );
      return {
        ok: false,
        mode: claimed,
        backgroundTaskStarted: taskStartedNow,
        errorCode: "start_failed",
        errorDetail: sync.reason,
      };
    }

    await stopNativeTracking();
    const started = await startNativeTracking(shiftId);
    if (!started) {
      return {
        ok: false,
        mode: "none",
        backgroundTaskStarted: false,
        errorCode: "start_failed",
        errorDetail: "native_start_rejected",
      };
    }

    await AsyncStorage.setItem(STORAGE_KEYS.TRACKING_MODE, "background");
    void sendTrackingRestartEvent(shiftId, "os_kill");
    await flushNativePendingSamples();

    const nativeHealth = await getNativeTrackingHealth();
    const serviceRunning = nativeHealth?.serviceRunning === true;
    const lastAccept = nativeHealth?.lastServerAcceptAt;
    const acceptFresh = !!lastAccept && !isAcceptStale(lastAccept);
    const recoveryState = parseRecoveryStateKind(nativeHealth?.recoveryState);

    if (serviceRunning && acceptFresh) {
      await markTrackingWarmup();
      return {
        ok: true,
        mode: "background",
        backgroundTaskStarted: true,
        recoveryState: "RECOVERED",
      };
    }
    if (serviceRunning) {
      return {
        ok: false,
        mode: "background",
        backgroundTaskStarted: true,
        errorCode: "recovery_failed",
        errorDetail: "no_new_accept",
        recoveryState,
      };
    }
    return {
      ok: false,
      mode: "none",
      backgroundTaskStarted: false,
      errorCode: "start_failed",
      errorDetail: "native_service_failed",
      recoveryState,
    };
  }

  await markTrackingWarmup();

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
  const recoveryReason = acceptStale ? "ZOMBIE_FGS" : "TASK_DEAD";
  await beginRecoveryAttempt(lastAcceptedAt, recoveryReason);
  await recordRecoveryEvent("RESTART_REQUESTED");

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

  if (backgroundTaskStarted) {
    await recordRecoveryEvent("TASK_RECREATED");
  }

  const newAcceptedAt = await getLastAcceptedAt();
  const recovery = await evaluateRecoveryOutcome({
    taskStarted: backgroundTaskStarted,
    lastAcceptedAt: newAcceptedAt,
  });
  if (newAcceptedAt && recovery.recoveryStartedAt && newAcceptedAt > recovery.recoveryStartedAt) {
    await recordRecoveryEvent("ACCEPT_RECEIVED");
    await recordRecoveryEvent("RECOVERY_CONFIRMED");
  }

  // Field default: success requires background FGS AND fresh accept after recovery start.
  if (mode === "background" || claimed === "background" || claimed === "none") {
    const recoveryPass =
      recovery.state === "RECOVERED" ||
      (recovery.recoveryStartedAt != null &&
        newAcceptedAt != null &&
        newAcceptedAt > recovery.recoveryStartedAt);

    if (!backgroundTaskStarted || mode !== "background" || !recoveryPass) {
      if (backgroundTaskStarted && !recoveryPass) {
        await recordRecoveryEvent("RECOVERY_FAILED");
      }
      return {
        ok: false,
        mode: reportedModeAfterBackgroundRestartAttempt(
          claimed === "foreground" ? "foreground" : "background",
          backgroundTaskStarted,
        ),
        backgroundTaskStarted,
        errorCode: backgroundTaskStarted && !recoveryPass ? "recovery_failed" : "start_failed",
        errorDetail: backgroundTaskStarted && !recoveryPass ? "no_new_accept" : "fgs_or_os_rejected",
        recoveryState: (await readRecoveryState()).state,
      };
    }
    clearStaleGpsFlushBlockIfNeeded();
    void clearGpsStoppedNotificationDedupe().catch(() => undefined);
    return { ok: true, mode: "background", backgroundTaskStarted: true, recoveryState: "RECOVERED" };
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
    if (shouldUseNativeTracking()) {
      await stopNativeTracking();
      await flushNativePendingSamples().catch(() => undefined);
    }
    await stopExpoLocationWriters();
    const shiftId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
    if (shiftId && !shouldUseNativeTracking()) {
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
    await clearFieldShiftSnapshot();
    await clearRecoveryState();
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
    if (shouldUseNativeTracking()) {
      await stopNativeTracking();
    }
    await stopExpoLocationWriters();
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
    await markTrackingWarmup();
    const activeId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
    if (activeId && activeId !== shift.id) {
      await purgePendingSamples();
      await purgeNativePendingSamples();
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
    if (shouldUseNativeTracking()) {
      const mode = await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE);
      if (activeId === shift.id && mode === "background") {
        await purgePendingSamples();
        await syncNativeTrackingSession();
        const health = await getNativeTrackingHealth();
        const inWarmup = await isTrackingWarmupActive();
        const pipelineHealthy =
          health != null &&
          health.serviceRunning === true &&
          mapNativeHealthStateToHealthy(health.trackingHealthState);
        const gpsStale =
          !inWarmup && isTimestampStale(health?.lastGpsCapturedAt ?? null, LAST_POINT_STALE_MS);
        if (!pipelineHealthy || gpsStale) {
          await startNativeTracking(shift.id);
        }
        return "background";
      }
      return startLocationTracking(shift.id);
    }
    await registerFieldLocationTask();
    setForegroundWatchStarter(startForegroundWatch);
    const mode = await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE);
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
  if (shouldUseNativeTracking()) {
    const [
      state,
      perms,
      activeShiftId,
      restartDiagnostics,
      batteryDetailed,
      nativeHealth,
    ] = await Promise.all([
      getTrackingState(),
      getTrackingPermissionStatus(),
      AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID),
      getTrackingRestartDiagnostics(),
      readBatteryOptimizationDetailed(),
      getNativeTrackingHealth(),
    ]);
    return buildNativeRuntimeHealth(
      state,
      perms,
      activeShiftId,
      restartDiagnostics,
      batteryDetailed,
      nativeHealth,
    );
  }

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
    lastGpsPointAt,
    recoveryState,
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
    getLastGpsPointAt(),
    readRecoveryState(),
  ]);
  const batteryStatus = batteryDetailed.status;
  void setBatteryOptimizationStatus(batteryStatus);
  const { getForegroundSubscription } = await import("./location-tracking-adaptive");
  const foregroundWatchActive = !!getForegroundSubscription();
  const inWarmup = await isTrackingWarmupActive();
  let health = reconcileTrackingHealth(state.mode, backgroundTaskStarted, foregroundWatchActive, {
    lastAcceptedAt,
    lastGpsPointAt,
    requireRecentAccept: !!activeShiftId && state.mode !== "none" && !inWarmup,
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
    pointStale: health.pointStale,
    healthKind: health.healthKind,
    zombieFgs: health.zombieFgs,
    recoveryState: recoveryState.state,
    lastGpsPointAt,
    flushBlockReason: getLastFlushBlockReason(),
    lastRestartAt: restartDiagnostics.lastRestartAt,
    restartCountToday: restartDiagnostics.restartCountToday,
    lastRestartReason: restartDiagnostics.lastRestartReason,
    batteryOptimizationStatus: batteryStatus,
    batteryModuleLoaded: batteryDetailed.moduleLoaded,
    batteryRawIgnoring: batteryDetailed.rawIgnoring,
    fieldTrackingMode: getFieldTrackingMode(),
    nativeModuleLoaded: isNativeTrackingModuleLoaded(),
    lastAcceptedAt,
    lastRejectReason,
    lastFlushError,
    recovery: recoveryState,
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
    pointStale: health.pointStale,
    healthKind: health.healthKind,
    zombieFgs: health.zombieFgs,
    recoveryState: health.recoveryState,
    lastGpsPointAt: health.lastGpsPointAt ?? null,
    flushBlockReason: health.flushBlockReason,
    lastRestartAt: health.lastRestartAt,
    restartCountToday: health.restartCountToday,
    lastRestartReason: health.lastRestartReason,
    batteryOptimizationStatus: health.batteryOptimizationStatus,
    batteryModuleLoaded: health.batteryModuleLoaded,
    batteryRawIgnoring: health.batteryRawIgnoring,
    fieldTrackingMode: health.fieldTrackingMode,
    nativeModuleLoaded: health.nativeModuleLoaded,
    nativeTrackingHealthState: health.nativeTrackingHealthState,
    nativeServiceRunning: health.nativeServiceRunning,
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
  // Native Android uses LocationForegroundService — never start Expo TaskManager here.
  if (shouldUseNativeTracking()) {
    await syncNativeTrackingSession();
    const health = await getNativeTrackingHealth();
    if (health?.serviceRunning && !opts?.forceRecreate) {
      return "background";
    }
    if (!canStartLocationForegroundService(AppState.currentState)) {
      return health?.serviceRunning ? "background" : "none";
    }
    const reason = mapRestartContextToReason(context);
    const attempt = await recordRestartAttempt(reason, Date.now(), {
      bypassCooldown: opts?.bypassCooldown === true,
    });
    if (!attempt.allowed) {
      void appendErrorLog(`${context}(native): restart skipped (cooldown)`, "info");
    }
    await stopExpoLocationWriters();
    await stopNativeTracking();
    const ok = await startNativeTracking(shiftId);
    if (ok) {
      void sendTrackingRestartEvent(shiftId, reason);
    }
    return ok ? "background" : "none";
  }

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
  if (shouldUseNativeTracking()) {
    const shiftId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
    if (!shiftId) return "none";
    const mode = (await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE)) as TrackingMode | null;
    if (mode !== "background") return mode ?? "none";
    await stopExpoLocationWriters();
    await syncNativeTrackingSession();
    const health = await getNativeTrackingHealth();
    if (
      health?.serviceRunning &&
      mapNativeHealthStateToHealthy(health.trackingHealthState) &&
      !opts?.bypassCooldown
    ) {
      void flushNativePendingSamples().catch(() => undefined);
      return "background";
    }
    return ensureBackgroundTaskRunning(shiftId, "ensureTrackingContinuity", opts);
  }

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
 * Background-only health inspection: notify + persist recovery requirement.
 * Never start FGS from background (Android 12+ forbids it).
 */
async function inspectBackgroundTrackingHealth(context: string): Promise<void> {
  const shiftId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
  if (!shiftId) return;

  const mode = await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE);
  if (mode !== "background") return;

  const taskRegistered = await Location.hasStartedLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(
    () => false,
  );
  const [lastAcceptedAt, lastGpsPointAt] = await Promise.all([
    getLastAcceptedAt(),
    getLastGpsPointAt(),
  ]);
  const health = reconcileTrackingHealth("background", taskRegistered, false, {
    lastAcceptedAt,
    lastGpsPointAt,
    requireRecentAccept: true,
  });

  if (health.zombieFgs) {
    void appendErrorLog(`${context}: zombie_fgs (task registered, accept stale)`, "warn");
    void sendGpsZombieDetectedEvent(shiftId);
    void notifyGpsStoppedZombieFgs().catch(() => undefined);
    await markRecoveryRequired("ZOMBIE_FGS");
    return;
  }

  if (!taskRegistered) {
    void appendErrorLog(`${context}: skip_fgs_start_while_background`, "info");
    void notifyGpsStoppedIfBackgroundTaskDead().catch(() => undefined);
    await markRecoveryRequired("TASK_DEAD");
  }
}

/**
 * App went to background: flush pending samples + health inspection only.
 * Do NOT call startLocationUpdatesAsync — Android 12+ rejects FGS start here.
 * Dead / zombie tasks are recovered when AppState becomes active.
 */
export async function maintainBackgroundTracking(): Promise<TrackingMode> {
  const shiftId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
  if (!shiftId) return "none";

  const mode = (await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE)) as TrackingMode | null;

  if (shouldUseNativeTracking()) {
    // Native FGS uploads without JS — only nudge flush; never start Expo writers.
    if (mode === "background") {
      void flushNativePendingSamples().catch(() => undefined);
      const health = await getNativeTrackingHealth();
      return health?.serviceRunning ? "background" : "none";
    }
    return mode ?? "none";
  }

  if (mode === "background" || mode === "foreground") {
    void flushPendingSamples().catch(() => undefined);
  }

  if (mode === "background") {
    await inspectBackgroundTrackingHealth("maintainBackgroundTracking");
    const started = await Location.hasStartedLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(
      () => false,
    );
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
 * Background-fetch watchdog: health inspection + flush only. Never start FGS.
 * Secondary path — foreground AppState / in-app watchdog perform actual restart.
 */
export async function runBackgroundTrackingWatchdog(): Promise<void> {
  const shiftId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
  if (!shiftId) return;

  const mode = (await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE)) as TrackingMode | null;
  if (mode !== "background") return;

  if (shouldUseNativeTracking()) {
    void flushNativePendingSamples().catch(() => undefined);
    return;
  }

  void flushPendingSamples().catch(() => undefined);
  await inspectBackgroundTrackingHealth("backgroundWatchdog");
}

/** Foreground recovery: dead or zombie background task → forceRestart + immediate fix. */
export async function recoverDeadBackgroundTaskOnForeground(): Promise<TrackingMode> {
  await hydrateSessionAuthFromStorage();

  if (shouldUseNativeTracking()) {
    if (!canStartLocationForegroundService(AppState.currentState)) {
      return "none";
    }
    const shiftId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
    if (!shiftId) return "none";
    await syncNativeTrackingSession();
    const health = await getNativeTrackingHealth();
    const inWarmup = await isTrackingWarmupActive();
    const nativeHealthy =
      health?.serviceRunning === true &&
      mapNativeHealthStateToHealthy(health.trackingHealthState) &&
      (inWarmup || !isTimestampStale(health.lastGpsCapturedAt, LAST_POINT_STALE_MS)) &&
      !isNativeAcceptTimestampStale(health.lastServerAcceptAt);
    if (nativeHealthy) {
      void flushNativePendingSamples().catch(() => undefined);
      return "background";
    }
    const attempt = await recordRestartAttempt("watchdog", Date.now(), {
      bypassCooldown: true,
    });
    if (!attempt.allowed) {
      void appendErrorLog("foregroundRecover(native): restart skipped (cooldown)", "info");
    }
    await purgeNativePendingSamples();
    await stopNativeTracking();
    const ok = await startNativeTracking(shiftId);
    if (ok) {
      void sendTrackingRestartEvent(shiftId, "watchdog");
    }
    await flushNativePendingSamples();
    return ok ? "background" : "none";
  }

  if (!canStartLocationForegroundService(AppState.currentState)) {
    return "none";
  }
  const shiftId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
  if (!shiftId) return "none";

  const mode = (await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE)) as TrackingMode | null;
  if (mode === "foreground") {
    return maybeUpgradeToBackgroundTracking();
  }
  if (mode !== "background") {
    return ensureTrackingContinuity({ bypassCooldown: true });
  }

  const started = await Location.hasStartedLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(
    () => false,
  );
  const lastAcceptedAt = await getLastAcceptedAt();
  const lastGpsPointAt = await getLastGpsPointAt();
  const health = reconcileTrackingHealth("background", started, false, {
    lastAcceptedAt,
    lastGpsPointAt,
    requireRecentAccept: true,
  });

  // Dead FGS, or Expo #47595 zombie (notification alive, no location callbacks).
  if (!started || health.acceptStale || health.zombieFgs) {
    const recoveryReason = health.zombieFgs
      ? "ZOMBIE_FGS"
      : !started
        ? "TASK_DEAD"
        : "ACCEPT_STALE";
    await beginRecoveryAttempt(lastAcceptedAt, recoveryReason);
    await recordRecoveryEvent("RESTART_REQUESTED");

    const restarted = await ensureBackgroundTaskRunning(shiftId, "foregroundRecover", {
      bypassCooldown: true,
      forceRecreate: true,
    });

    if (restarted === "background") {
      await recordRecoveryEvent("TASK_RECREATED");
      startFlushTimer();
      clearStaleGpsFlushBlockIfNeeded();
      await flushPendingSamples(shiftId).catch(() => undefined);
      await captureImmediateFixAndFlush().catch(() => false);

      const newAcceptedAt = await getLastAcceptedAt();
      const recovery = await evaluateRecoveryOutcome({
        taskStarted: true,
        lastAcceptedAt: newAcceptedAt,
      });

      if (
        recovery.recoveryStartedAt &&
        newAcceptedAt &&
        newAcceptedAt > recovery.recoveryStartedAt
      ) {
        await recordRecoveryEvent("ACCEPT_RECEIVED");
        await recordRecoveryEvent("RECOVERY_CONFIRMED");
        void clearGpsStoppedNotificationDedupe().catch(() => undefined);
        return "background";
      }

      await recordRecoveryEvent("RECOVERY_FAILED");
      return "background";
    }
    return restarted;
  }

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
