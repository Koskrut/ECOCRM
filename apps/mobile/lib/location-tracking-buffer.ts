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
import {
  classifySampleRejectBatch,
  formatRejectReasons,
  isWrongDayBatch,
  softRejectCountsAsAccept,
  type SampleRejectReasons,
} from "./location-sample-reject";
import { enqueueOfflineJob } from "./offline-queue";
import {
  setAuthRequired,
  setFlushBlockReason,
  validateAuthToken,
} from "./session-auth";

const MAX_BATCH = 100;
export const MAX_PENDING_SAMPLES = 500;

export const STORAGE_KEYS = {
  PENDING_SAMPLES: "field_location_pending_samples",
  ACTIVE_SHIFT_ID: "field_active_shift_id",
  ACTIVE_SHIFT_DAY_KEY: "field_active_shift_day_key",
  TRACKING_MODE: "field_tracking_mode",
  LAST_FLUSH_AT: "field_last_flush_at",
  LAST_ACCEPTED_AT: "field_last_accepted_at",
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

export async function purgePendingSamples(): Promise<void> {
  return withBufferLock(async () => {
    await writePending([]);
  });
}

export async function getLastAcceptedAt(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEYS.LAST_ACCEPTED_AT);
}

/** Server accepted samples OR soft-filtered (dedup) — pipeline is alive. */
async function markPipelineAlive(): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.LAST_ACCEPTED_AT, new Date().toISOString());
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
  if (action === "auth_required") {
    // Keep entire pending buffer — never silent discard on 401 (Грибовская).
    void appendErrorLog(`flush samples auth required (401): ${message}`, "error");
    setAuthRequired(true, "auth_401");
    return;
  }
  if (action === "discard_all") {
    await writePending([]);
    void appendErrorLog(`flush samples discarded all: ${message}`, "error");
    return;
  }
  if (action === "discard_batch") {
    // 400 after failed retarget — KEEP buffer, stop ingest. Do not drain 100-by-100.
    // Clear accept timestamp so watchdog CTA appears immediately (like wrong_day).
    await AsyncStorage.removeItem(STORAGE_KEYS.LAST_ACCEPTED_AT);
    void appendErrorLog(
      `flush samples blocked on 400 (${batch.length} kept): ${message}`,
      "error",
    );
    setFlushBlockReason("stale_gps");
    return;
  }
  const rest = pending.slice(batch.length);
  await enqueueOfflineJob("shiftSamplesBatch", {
    shiftId,
    clientMutationId: newMutationId(),
    items: batch,
  });
  await writePending(rest);
  void appendErrorLog(`flush samples enqueued offline (${batch.length}): ${message}`, "warn");
}

export async function appendPendingSample(sample: PendingLocationSample): Promise<number> {
  return withBufferLock(async () => {
    const { getLastFlushBlockReason } = await import("./session-auth");
    const block = getLastFlushBlockReason();
    // Under auth/wrong_day/stale — do not grow buffer (esp. trim-at-500 silent loss).
    if (block === "auth_401" || block === "wrong_day" || block === "stale_gps") {
      return (await readPending()).length;
    }
    const current = await readPending();
    if (current.length >= MAX_PENDING_SAMPLES) {
      void appendErrorLog(
        `append pending skipped: buffer full (${MAX_PENDING_SAMPLES})`,
        "warn",
      );
      return current.length;
    }
    const pending = trimPending([...current, sample]);
    await writePending(pending);
    return pending.length;
  });
}

export async function getPendingCount(): Promise<number> {
  return withBufferLock(async () => (await readPending()).length);
}

export { getAuthToken };

/**
 * Resolve shift id for flush: explicit arg → storage → GET /field/shifts/active.
 * Needed after 401 pause cleared tracking mode but buffer still has points.
 */
async function resolveFlushShiftId(
  shiftId: string | undefined,
  token: string,
): Promise<string | null> {
  if (shiftId) return shiftId;
  const stored = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
  if (stored) return stored;
  try {
    const activeRes = await fetch(`${getApiBaseUrl()}/field/shifts/active`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!activeRes.ok) return null;
    const body = (await activeRes.json()) as { shift?: { id?: string } | null };
    const id = body.shift?.id;
    if (typeof id === "string" && id.length > 0) {
      await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_SHIFT_ID, id);
      return id;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function flushPendingSamples(shiftId?: string): Promise<number> {
  return withBufferLock(async () => {
    await hydrateApiBaseUrl();
    let token = await getAuthToken();
    if (!token) {
      // Do NOT setAuthRequired here — empty SecureStore also happens on voluntary logout.
      // auth_required is only set from a real HTTP 401 response.
      void appendErrorLog("flush samples skipped: no auth token (buffer kept)", "warn");
      return 0;
    }

    let sid = await resolveFlushShiftId(shiftId, token);
    if (!sid) {
      const pending = await readPending();
      if (pending.length > 0) {
        void appendErrorLog(
          `flush samples blocked: ${pending.length} pending but no active shift id`,
          "warn",
        );
      }
      return 0;
    }

    let uploaded = 0;
    let retargetAttempted = false;

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

          if (action === "auth_required") {
            // Attempt lightweight "refresh": re-validate; if fail → force re-login UI.
            const stillValid = await validateAuthToken(token, getApiBaseUrl());
            if (stillValid) {
              // Race / transient — keep pending and retry later.
              void appendErrorLog(
                `flush samples 401 but /auth/me ok — keep buffer, retry later`,
                "warn",
              );
              break;
            }
            // Clear dead JWT so AuthProvider forces login; buffer stays.
            try {
              const SecureStore = await import("expo-secure-store");
              await SecureStore.deleteItemAsync("crm_manager_jwt");
            } catch {
              /* ignore */
            }
            await applyFlushFailure(action, pending, batch, sid, message);
            break;
          }

          // Dead shift after re-login: retarget once to today's active shift.
          if (action === "discard_batch" && !retargetAttempted) {
            retargetAttempted = true;
            try {
              const activeRes = await fetch(`${getApiBaseUrl()}/field/shifts/active`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (activeRes.ok) {
                const body = (await activeRes.json()) as { shift?: { id?: string } | null };
                const newSid = body.shift?.id;
                if (typeof newSid === "string" && newSid.length > 0 && newSid !== sid) {
                  await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_SHIFT_ID, newSid);
                  void appendErrorLog(
                    `flush retarget shift ${sid} → ${newSid} after 400`,
                    "warn",
                  );
                  sid = newSid;
                  continue;
                }
              }
            } catch {
              /* fall through to discard_batch */
            }
          }

          await applyFlushFailure(action, pending, batch, sid, message);
          break;
        }

        let created = batch.length;
        let rejected = 0;
        let rejectReasons: SampleRejectReasons | undefined;
        try {
          const body = (await res.json()) as {
            created?: number;
            rejected?: number;
            rejectReasons?: SampleRejectReasons;
          };
          if (typeof body.created === "number" && Number.isFinite(body.created)) {
            created = body.created;
          }
          if (typeof body.rejected === "number" && Number.isFinite(body.rejected)) {
            rejected = body.rejected;
          }
          if (body.rejectReasons && typeof body.rejectReasons === "object") {
            rejectReasons = body.rejectReasons;
          }
        } catch {
          /* non-JSON body — treat as full batch accepted */
        }

        // Ісанчев: wrong_day batches must leave the buffer immediately (no forever retry).
        if (created === 0 && isWrongDayBatch(rejectReasons, rejected)) {
          await writePending(rest);
          await AsyncStorage.setItem(STORAGE_KEYS.LAST_FLUSH_AT, new Date().toISOString());
          // Force accept-stale so watchdog shows «Перезапустити зміну» immediately.
          await AsyncStorage.removeItem(STORAGE_KEYS.LAST_ACCEPTED_AT);
          setFlushBlockReason("wrong_day");
          void appendErrorLog(
            `flush samples wrong_day purged (${rejected}) shiftId=${sid} rejectReasons=${formatRejectReasons(rejectReasons)} — restart shift`,
            "error",
          );
          if (rest.length === 0) break;
          continue;
        }

        await writePending(rest);
        await AsyncStorage.setItem(STORAGE_KEYS.LAST_FLUSH_AT, new Date().toISOString());
        uploaded += Math.max(0, created);

        if (created === 0 && rejected > 0) {
          const reasons = formatRejectReasons(rejectReasons);
          const severity = classifySampleRejectBatch(rejectReasons);
          if (severity === "soft") {
            // Михайлів: duplicate → info, never ERROR.
            // Healthy only if server reported keepalive rejects (legacy); duplicate alone
            // must NOT refresh LAST_ACCEPTED_AT — that masked stale GPS.
            if (softRejectCountsAsAccept(rejectReasons)) {
              await markPipelineAlive();
            }
            void appendErrorLog(
              `flush samples all rejected (${rejected}) shiftId=${sid} rejectReasons=${reasons} — batch dropped (dedup)`,
              "info",
            );
          } else if (severity === "hard") {
            void appendErrorLog(
              `flush samples all rejected (${rejected}) shiftId=${sid} rejectReasons=${reasons} — batch dropped`,
              "error",
            );
          } else {
            void appendErrorLog(
              `flush samples all rejected (${rejected}) shiftId=${sid} rejectReasons=${reasons} — batch dropped`,
              "warn",
            );
          }
        } else if (created > 0) {
          // Keepalive on server is accept:true → created>0 (not a reject reason).
          await markPipelineAlive();
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
