import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import { getApiBaseUrl } from "./config";

const TOKEN_KEY = "crm_manager_jwt";
const MAX_BATCH = 30;

export const STORAGE_KEYS = {
  PENDING_SAMPLES: "field_location_pending_samples",
  ACTIVE_SHIFT_ID: "field_active_shift_id",
  TRACKING_MODE: "field_tracking_mode",
  LAST_FLUSH_AT: "field_last_flush_at",
} as const;

export type PendingLocationSample = {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  clientRecordedAt: string;
};

async function readPending(): Promise<PendingLocationSample[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_SAMPLES);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PendingLocationSample[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writePending(samples: PendingLocationSample[]): Promise<void> {
  if (samples.length === 0) {
    await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_SAMPLES);
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEYS.PENDING_SAMPLES, JSON.stringify(samples));
}

export async function appendPendingSample(sample: PendingLocationSample): Promise<void> {
  const pending = await readPending();
  pending.push(sample);
  await writePending(pending);
}

export async function getPendingCount(): Promise<number> {
  return (await readPending()).length;
}

async function getAuthToken(): Promise<string | null> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  return token && token.length > 0 ? token : null;
}

export async function flushPendingSamples(shiftId?: string): Promise<number> {
  const sid = shiftId ?? (await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID));
  if (!sid) return 0;

  const token = await getAuthToken();
  if (!token) return 0;

  const pending = await readPending();
  if (pending.length === 0) return 0;

  const batch = pending.slice(0, MAX_BATCH);
  const rest = pending.slice(MAX_BATCH);

  const res = await fetch(`${getApiBaseUrl()}/field/shifts/${sid}/samples`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ items: batch }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Upload failed (${res.status})`);
  }

  await writePending(rest);
  await AsyncStorage.setItem(STORAGE_KEYS.LAST_FLUSH_AT, new Date().toISOString());

  if (rest.length > 0) {
    return batch.length + (await flushPendingSamples(sid));
  }
  return batch.length;
}
