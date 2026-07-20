import AsyncStorage from "@react-native-async-storage/async-storage";

import { getAuthToken } from "./auth-token";
import { FLUSH_INTERVAL_MS, FLUSH_WHEN_PENDING_GTE } from "./location-tracking-config";
import { getApiBaseUrl, hydrateApiBaseUrl } from "./config";
import { appendErrorLog } from "./error-log";
import {
  classifyFlushHttpStatus,
  classifyFlushThrownError,
  type FlushErrorAction,
} from "./location-flush-errors";
import { enqueueOfflineJob } from "./offline-queue";

const MAX_BATCH = 100;
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

function newMutationId(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
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
  shiftId: string,
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
  if (action === "discard_batch") {
    const rest = pending.slice(batch.length);
    await writePending(rest);
    await AsyncStorage.removeItem(STORAGE_KEYS.ACTIVE_SHIFT_ID).catch(() => undefined);
    void appendErrorLog(`flush samples discarded batch (${batch.length}): ${message}`);
    return;
  }
  const rest = pending.slice(batch.length);
  await enqueueOfflineJob("shiftSamplesBatch", {
    shiftId,
    clientMutationId: newMutationId(),
    items: batch,
  });
  await writePending(rest);
  void appendErrorLog(`flush samples enqueued offline (${batch.length}): ${message}`);
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

export { getAuthToken };

export async function flushPendingSamples(shiftId?: string): Promise<number> {
  return withBufferLock(async () => {
    const sid = shiftId ?? (await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID));
    if (!sid) return 0;

    await hydrateApiBaseUrl();
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
          await applyFlushFailure(action, pending, batch, sid, message);
          break;
        }

        let created = batch.length;
        let rejected = 0;
        try {
          const body = (await res.json()) as { created?: number; rejected?: number };
          if (typeof body.created === "number" && Number.isFinite(body.created)) {
            created = body.created;
          }
          if (typeof body.rejected === "number" && Number.isFinite(body.rejected)) {
            rejected = body.rejected;
          }
        } catch {
          /* non-JSON body — treat as full batch accepted */
        }

        await writePending(rest);
        await AsyncStorage.setItem(STORAGE_KEYS.LAST_FLUSH_AT, new Date().toISOString());
        uploaded += Math.max(0, created);

        if (created === 0 && rejected > 0) {
          void appendErrorLog(
            `flush samples all rejected (${rejected}) shiftId=${sid} — batch dropped`,
          );
        }

        if (rest.length === 0) break;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await applyFlushFailure(classifyFlushThrownError(), pending, batch, sid, message);
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
