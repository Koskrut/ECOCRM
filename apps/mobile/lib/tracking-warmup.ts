import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "./location-tracking-buffer";
import {
  isWarmupActiveUntil,
  TRACKING_WARMUP_MS,
} from "./tracking-warmup-core";

export { isWarmupActiveUntil, TRACKING_WARMUP_MS } from "./tracking-warmup-core";

export async function markTrackingWarmup(
  durationMs = TRACKING_WARMUP_MS,
  nowMs = Date.now(),
): Promise<void> {
  const until = new Date(nowMs + durationMs).toISOString();
  await AsyncStorage.setItem(STORAGE_KEYS.TRACKING_WARMUP_UNTIL, until);
}

export async function clearTrackingWarmup(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.TRACKING_WARMUP_UNTIL);
}

export async function isTrackingWarmupActive(nowMs = Date.now()): Promise<boolean> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_WARMUP_UNTIL);
  return isWarmupActiveUntil(raw, nowMs);
}
