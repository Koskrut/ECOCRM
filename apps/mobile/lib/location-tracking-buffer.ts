import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import { FLUSH_INTERVAL_MS, FLUSH_WHEN_PENDING_GTE } from "./location-tracking-config";
import { getApiBaseUrl } from "./config";
import { appendErrorLog } from "./error-log";
import {
  classifyFlushHttpStatus,
  classifyFlushThrownError,
  type FlushErrorAction,
} from "./location-flush-errors";

const TOKEN_KEY = "crm_manager_jwt";
const MAX_BATCH = 30;
export const MAX_PENDING_SAMPLES = 500;

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

let bufferLock: Promise<void> = Promise.resolve();

function withBufferLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = bufferLock.then(fn, fn);
  bufferLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

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

function trimPending(samples: PendingLocationSample[]): PendingLocationSample[] {
  if (samples.length <= MAX_PENDING_SAMPLES) return samples;
  return samples.slice(samples.length - MAX_PENDING_SAMPLES);
}

async function applyFlushFailure(
  action: FlushErrorAction,
  pending: PendingLocationSample[],
  batch: PendingLocationSample[],
  message: string,
): Promise<void> {
  if (action === "retry") {
    return;
  }
  if (action === "discard_all") {
    await writePending([]);
    void appendErrorLog(`flush samples discarded all: ${message}`);
    return;
  }
  const rest = pending.slice(batch.length);
  await writePending(rest);
  void appendErrorLog(`flush samples discarded batch: ${message}`);
}

export async function appendPendingSample(sample: PendingLocationSample): Promise<number> {
  return withBufferLock(async () => {
    const pending = trimPending([...(await readPending()), sample]);
    await writePending(pending);
    return pending.length;
  });
}

export async function getPendingCount(): Promise<number> {
  return withBufferLock(async () => (await readPending()).length);
}

async function getAuthToken(): Promise<string | null> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  return token && token.length > 0 ? token : null;
}

export async function flushPendingSamples(shiftId?: string): Promise<number> {
  return withBufferLock(async () => {
    const sid = shiftId ?? (await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID));
    if (!sid) return 0;

    const token = await getAuthToken();
    if (!token) return 0;

    let uploaded = 0;

    while (true) {
      const pending = await readPending();
      if (pending.length === 0) break;

      const batch = pending.slice(0, MAX_BATCH);
      const rest = pending.slice(MAX_BATCH);

      try {
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
          const message = text || `Upload failed (${res.status})`;
          const action = classifyFlushHttpStatus(res.status);
          await applyFlushFailure(action, pending, batch, message);
          if (action === "discard_batch") {
            uploaded += batch.length;
          }
          break;
        }

        await writePending(rest);
        await AsyncStorage.setItem(STORAGE_KEYS.LAST_FLUSH_AT, new Date().toISOString());
        uploaded += batch.length;

        if (rest.length === 0) break;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await applyFlushFailure(classifyFlushThrownError(), pending, batch, message);
        break;
      }
    }

    return uploaded;
  });
}

export async function maybeFlushAfterAppend(pendingCount: number): Promise<void> {
  if (pendingCount >= FLUSH_WHEN_PENDING_GTE) {
    await flushPendingSamples();
  }
}

export { FLUSH_INTERVAL_MS };
