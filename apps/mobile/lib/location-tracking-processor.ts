import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  DEFAULT_TIER,
  STORAGE_KEYS_EXTRA,
  TIER_CHANGE_DEBOUNCE_MS,
  tierFromSpeedKmh,
  watchOptionsForTier,
  type SamplingTier,
  type WatchOptions,
} from "./location-tracking-config";
import {
  filterLocationSample,
  speedKmhBetween,
  type LocationSampleInput,
} from "./location-sample-filter";

export type RawLocationInput = {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  clientRecordedAt: string;
};

export type ProcessLocationResult = {
  accepted: boolean;
  sample: LocationSampleInput | null;
  tier: SamplingTier;
  watchOptions: WatchOptions;
  tierChanged: boolean;
  speedKmh: number | null;
  rejectReason?: "bad_accuracy" | "duplicate" | "teleport";
  reanchor?: boolean;
  /** For teleport/reanchor triage logs. */
  prevSample?: LocationSampleInput | null;
  gapMs?: number;
  distM?: number;
};

let lastAcceptedMemory: LocationSampleInput | null = null;
let currentTierMemory: SamplingTier = DEFAULT_TIER;
let tierChangedAtMemory = 0;

async function readLastAccepted(): Promise<LocationSampleInput | null> {
  if (lastAcceptedMemory) return lastAcceptedMemory;
  const raw = await AsyncStorage.getItem(STORAGE_KEYS_EXTRA.LAST_ACCEPTED_SAMPLE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LocationSampleInput;
    if (typeof parsed.lat === "number" && typeof parsed.lng === "number") {
      lastAcceptedMemory = parsed;
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function writeLastAccepted(sample: LocationSampleInput): Promise<void> {
  lastAcceptedMemory = sample;
  await AsyncStorage.setItem(STORAGE_KEYS_EXTRA.LAST_ACCEPTED_SAMPLE, JSON.stringify(sample));
}

async function readCurrentTier(): Promise<SamplingTier> {
  const stored = await AsyncStorage.getItem(STORAGE_KEYS_EXTRA.CURRENT_TIER);
  if (stored === "moving" || stored === "city" || stored === "idle") {
    currentTierMemory = stored;
    return stored;
  }
  return currentTierMemory;
}

async function readTierChangedAt(): Promise<number> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS_EXTRA.TIER_CHANGED_AT);
  const n = raw ? Number(raw) : tierChangedAtMemory;
  return Number.isFinite(n) ? n : 0;
}

async function persistTier(tier: SamplingTier): Promise<void> {
  currentTierMemory = tier;
  tierChangedAtMemory = Date.now();
  await AsyncStorage.multiSet([
    [STORAGE_KEYS_EXTRA.CURRENT_TIER, tier],
    [STORAGE_KEYS_EXTRA.TIER_CHANGED_AT, String(tierChangedAtMemory)],
  ]);
}

export async function processLocationUpdate(raw: RawLocationInput): Promise<ProcessLocationResult> {
  const sample: LocationSampleInput = {
    lat: raw.lat,
    lng: raw.lng,
    accuracyM: raw.accuracyM,
    clientRecordedAt: raw.clientRecordedAt,
  };

  const prev = await readLastAccepted();
  const filterResult = filterLocationSample(prev, sample);
  const currentTier = await readCurrentTier();

  if (!filterResult.accept) {
    return {
      accepted: false,
      sample: null,
      tier: currentTier,
      watchOptions: watchOptionsForTier(currentTier),
      tierChanged: false,
      speedKmh: null,
      rejectReason: filterResult.reason,
      prevSample: prev,
      gapMs: filterResult.gapMs,
      distM: filterResult.distM,
    };
  }

  const speedKmh = prev ? speedKmhBetween(prev, sample) : null;
  const desiredTier = tierFromSpeedKmh(speedKmh);
  let tier = currentTier;
  let tierChanged = false;

  if (desiredTier !== currentTier) {
    const changedAt = await readTierChangedAt();
    if (Date.now() - changedAt >= TIER_CHANGE_DEBOUNCE_MS) {
      tier = desiredTier;
      tierChanged = true;
      await persistTier(tier);
    }
  }

  await writeLastAccepted(sample);

  return {
    accepted: true,
    sample,
    tier,
    watchOptions: watchOptionsForTier(tier),
    tierChanged,
    speedKmh,
    reanchor: filterResult.reanchor === true,
    prevSample: prev,
    gapMs: filterResult.gapMs,
    distM: filterResult.distM,
  };
}

export async function resetLocationProcessorState(): Promise<void> {
  lastAcceptedMemory = null;
  currentTierMemory = DEFAULT_TIER;
  tierChangedAtMemory = 0;
  await AsyncStorage.multiRemove([
    STORAGE_KEYS_EXTRA.LAST_ACCEPTED_SAMPLE,
    STORAGE_KEYS_EXTRA.CURRENT_TIER,
    STORAGE_KEYS_EXTRA.TIER_CHANGED_AT,
  ]);
}

export function getCurrentTierSync(): SamplingTier {
  return currentTierMemory;
}
