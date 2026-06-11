import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { Platform } from "react-native";

import {
  flushPendingSamples,
  getPendingCount,
  STORAGE_KEYS,
  type PendingLocationSample,
} from "./location-tracking-buffer";
import { FIELD_LOCATION_TASK } from "./location-tracking-task";

export { appendPendingSample, flushPendingSamples, getPendingCount, STORAGE_KEYS };
export type { PendingLocationSample };

export type TrackingMode = "background" | "foreground" | "none";

let foregroundSubscription: Location.LocationSubscription | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;

function startFlushTimer(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    void flushPendingSamples().catch(() => {
      /* retry on next tick */
    });
  }, 60_000);
}

function stopFlushTimer(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

async function startForegroundWatch(): Promise<void> {
  if (foregroundSubscription) return;
  const { appendPendingSample: append } = await import("./location-tracking-buffer");
  foregroundSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 180_000,
      distanceInterval: 50,
    },
    (pos) => {
      const c = pos.coords;
      void append({
        lat: c.latitude,
        lng: c.longitude,
        accuracyM:
          typeof c.accuracy === "number" && Number.isFinite(c.accuracy) ? c.accuracy : undefined,
        clientRecordedAt: new Date().toISOString(),
      }).then(() => flushPendingSamples());
    },
  );
}

async function stopForegroundWatch(): Promise<void> {
  if (foregroundSubscription) {
    foregroundSubscription.remove();
    foregroundSubscription = null;
  }
}

export async function requestTrackingPermissions(): Promise<{
  foreground: Location.PermissionStatus;
  background: Location.PermissionStatus | null;
}> {
  const fg = await Location.requestForegroundPermissionsAsync();
  let bg: Location.PermissionStatus | null = null;
  if (fg.status === "granted") {
    const bgRes = await Location.requestBackgroundPermissionsAsync();
    bg = bgRes.status;
  }
  return { foreground: fg.status, background: bg };
}

export async function startLocationTracking(shiftId: string): Promise<TrackingMode> {
  await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_SHIFT_ID, shiftId);

  const { foreground, background } = await requestTrackingPermissions();
  if (foreground !== "granted") {
    await AsyncStorage.setItem(STORAGE_KEYS.TRACKING_MODE, "none");
    return "none";
  }

  const hasBackground = background === "granted";

  if (hasBackground) {
    const started = await Location.hasStartedLocationUpdatesAsync(FIELD_LOCATION_TASK);
    if (!started) {
      await Location.startLocationUpdatesAsync(FIELD_LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 180_000,
        distanceInterval: 50,
        deferredUpdatesInterval: 180_000,
        deferredUpdatesDistance: 50,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "CRM — зміна активна",
          notificationBody: "Збір геолокації для маршруту",
          notificationColor: "#2563eb",
        },
        pausesUpdatesAutomatically: false,
        activityType: Location.ActivityType.AutomotiveNavigation,
      });
    }
    await stopForegroundWatch();
    await AsyncStorage.setItem(STORAGE_KEYS.TRACKING_MODE, "background");
    startFlushTimer();
    return "background";
  }

  await Location.stopLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(() => undefined);
  await startForegroundWatch();
  await AsyncStorage.setItem(STORAGE_KEYS.TRACKING_MODE, "foreground");
  startFlushTimer();
  return "foreground";
}

export async function stopLocationTracking(): Promise<void> {
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
}

export async function resumeTrackingIfNeeded(
  shift: { id: string; trackingEnabled: boolean; status: string } | null,
): Promise<TrackingMode> {
  if (!shift || shift.status !== "ACTIVE" || !shift.trackingEnabled) {
    return "none";
  }
  const mode = await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE);
  const activeId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
  if (activeId === shift.id && mode && mode !== "none") {
    startFlushTimer();
    if (mode === "background") {
      const started = await Location.hasStartedLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(
        () => false,
      );
      if (started) return "background";
    }
    if (mode === "foreground") {
      await startForegroundWatch();
      return "foreground";
    }
  }
  return startLocationTracking(shift.id);
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

export function locationProviderLabel(): string {
  return Platform.select({ ios: "ios-core", android: "android-fused", default: "expo-location" }) ?? "expo-location";
}
