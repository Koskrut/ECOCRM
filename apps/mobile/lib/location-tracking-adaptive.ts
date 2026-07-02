import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";

import { STORAGE_KEYS } from "./location-tracking-buffer";
import { FIELD_LOCATION_TASK } from "./location-tracking-config";
import {
  DEFAULT_TIER,
  watchOptionsForTier,
  type SamplingTier,
  type WatchOptions,
} from "./location-tracking-config";
import { setPendingAdaptiveTier } from "./location-tracking-restart";

let currentForegroundTier: SamplingTier = DEFAULT_TIER;
let foregroundSubscription: Location.LocationSubscription | null = null;

export function getCurrentForegroundTier(): SamplingTier {
  return currentForegroundTier;
}

export function getForegroundSubscription(): Location.LocationSubscription | null {
  return foregroundSubscription;
}

export function setForegroundSubscription(sub: Location.LocationSubscription | null): void {
  foregroundSubscription = sub;
}

export function locationOptionsForWatch(opts: WatchOptions): Location.LocationOptions {
  return {
    accuracy: opts.accuracy,
    timeInterval: opts.timeInterval,
    distanceInterval: opts.distanceInterval,
  };
}

export function backgroundOptionsForTier(tier: SamplingTier): Location.LocationTaskOptions {
  const opts = watchOptionsForTier(tier);
  return {
    accuracy: opts.accuracy,
    timeInterval: opts.timeInterval,
    distanceInterval: opts.distanceInterval,
    deferredUpdatesInterval: opts.timeInterval,
    deferredUpdatesDistance: opts.distanceInterval,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "CRM — зміна активна",
      notificationBody: "Збір геолокації для маршруту",
      notificationColor: "#2563eb",
    },
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
  };
}

/** Foreground-controlled stop/start for tier changes only. */
export async function restartBackgroundWatch(tier: SamplingTier): Promise<void> {
  const started = await Location.hasStartedLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(
    () => false,
  );
  if (!started) return;
  await Location.stopLocationUpdatesAsync(FIELD_LOCATION_TASK);
  await Location.startLocationUpdatesAsync(FIELD_LOCATION_TASK, backgroundOptionsForTier(tier));
}

export async function applyAdaptiveTier(
  tier: SamplingTier,
  startForegroundWatch: (tier: SamplingTier) => Promise<void>,
): Promise<void> {
  const mode = (await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE)) as
    | "background"
    | "foreground"
    | "none"
    | null;
  if (mode === "background") {
    await setPendingAdaptiveTier(tier);
    return;
  }
  if (mode === "foreground" && tier !== currentForegroundTier) {
    currentForegroundTier = tier;
    if (foregroundSubscription) {
      foregroundSubscription.remove();
      foregroundSubscription = null;
    }
    await startForegroundWatch(tier);
  }
}

export function setCurrentForegroundTier(tier: SamplingTier): void {
  currentForegroundTier = tier;
}
