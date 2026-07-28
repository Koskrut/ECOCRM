import * as Location from "expo-location";

export {
  KEEPALIVE_INTERVAL_MS,
  MAX_IMPLAUSIBLE_SPEED_KMH,
  MIN_DISTANCE_DEDUP_M,
  TRACK_MAX_ACCURACY_M,
} from "./location-sample-filter";

export const FIELD_LOCATION_TASK = "FIELD_LOCATION_TASK";

export type SamplingTier = "moving" | "city" | "idle";

export const TIER_CHANGE_DEBOUNCE_MS = 120_000;

export const FLUSH_INTERVAL_MS = 30_000;
export const FLUSH_WHEN_PENDING_GTE = 10;

export const STORAGE_KEYS_EXTRA = {
  LAST_ACCEPTED_SAMPLE: "field_last_accepted_sample",
  CURRENT_TIER: "field_tracking_tier",
  TIER_CHANGED_AT: "field_tier_changed_at",
  GEOFENCE_NOTIFIED: "field_geofence_notified",
} as const;

export type WatchOptions = {
  accuracy: Location.Accuracy;
  timeInterval: number;
  distanceInterval: number;
};

export const SAMPLING_TIERS: Record<SamplingTier, WatchOptions> = {
  moving: {
    accuracy: Location.Accuracy.High,
    timeInterval: 15_000,
    distanceInterval: 15,
  },
  city: {
    accuracy: Location.Accuracy.High,
    timeInterval: 30_000,
    distanceInterval: 25,
  },
  idle: {
    accuracy: Location.Accuracy.High,
    timeInterval: 60_000,
    distanceInterval: 0,
  },
};

export const DEFAULT_TIER: SamplingTier = "moving";

/** Speed thresholds (km/h) between accepted samples. */
export const TIER_SPEED_MOVING_KMH = 15;
export const TIER_SPEED_CITY_KMH = 3;

export function tierFromSpeedKmh(speedKmh: number | null): SamplingTier {
  if (speedKmh == null || !Number.isFinite(speedKmh)) return DEFAULT_TIER;
  if (speedKmh > TIER_SPEED_MOVING_KMH) return "moving";
  if (speedKmh >= TIER_SPEED_CITY_KMH) return "city";
  return "idle";
}

export function watchOptionsForTier(tier: SamplingTier): WatchOptions {
  return SAMPLING_TIERS[tier];
}
