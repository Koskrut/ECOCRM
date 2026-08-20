import AsyncStorage from "@react-native-async-storage/async-storage";

import { getAuthToken, getAuthTokenWithRetry } from "./auth-token";
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
  describeRejectBatch,
  formatRejectReasons,
  isWrongDayBatch,
  softRejectCountsAsAccept,
  type SampleRejectReasons,
} from "./location-sample-reject";
import { sortSamplesByTime } from "./location-sample-filter";
import {
  patchFieldShiftSnapshot,
  resolveShiftIdForAppend,
} from "./field-shift-snapshot";
import { readActiveShiftId } from "./location-shift-bootstrap";
import { enqueueOfflineJob } from "./offline-queue";
import {
  hydrateSessionAuthFromStorage,
  setAuthRequired,
  setFlushBlockReason,
  validateAuthToken,
} from "./session-auth";
import { buildFlushTelemetryPayload } from "./location-flush-telemetry";
import { isJsLocationPipelineDisabled } from "./native-tracking-gates";
import { getTrackingDeviceId } from "./tracking-device-id";
import {
  buildBatchSamplesSummary,
  type FlushReason,
  logBatchAudit,
  type SampleSource,
  type TrackingSampleAuditEntry,
} from "./tracking-audit-log";
import { newUuidV4 } from "./tracking-ids";

const MAX_BATCH = 100;
export const MAX_PENDING_SAMPLES = 500;

/** Field networks stall silently — never let a flush request hold the buffer lock forever. */
const FLUSH_FETCH_TIMEOUT_MS = 25_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FLUSH_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export const STORAGE_KEYS = {
  PENDING_SAMPLES: "field_location_pending_samples",
  ACTIVE_SHIFT_ID: "field_active_shift_id",
  ACTIVE_SHIFT_DAY_KEY: "field_active_shift_day_key",
  TRACKING_MODE: "field_tracking_mode",
  LAST_FLUSH_AT: "field_last_flush_at",
  LAST_ACCEPTED_AT: "field_last_accepted_at",
  LAST_REJECT_REASON: "field_last_reject_reason",
  LAST_FLUSH_ERROR: "field_last_flush_error",
  LAST_GPS_POINT_AT: "field_last_gps_point_at",
  /** ISO timestamp — suppress accept_stale banner during post-login recovery. */
  TRACKING_WARMUP_UNTIL: "field_tracking_warmup_until",
} as const;

export type PendingLocationSample = {
  sampleId?: string;
  lat: number;
  lng: number;
  accuracyM?: number | null;
  clientRecordedAt: string;
  source?: SampleSource;
  attempt?: number;
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

function newSampleId(): string {
  return newUuidV4();
}

function normalizeAttempt(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) return 1;
  return Math.floor(value);
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

export async function getLastGpsPointAt(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEYS.LAST_GPS_POINT_AT);
}

async function markGpsPointReceived(at = new Date().toISOString()): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.LAST_GPS_POINT_AT, at);
  void patchFieldShiftSnapshot({ lastKnownPointAt: at }).catch(() => undefined);
}

export async function getLastRejectReason(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEYS.LAST_REJECT_REASON);
}

export async function getLastFlushError(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEYS.LAST_FLUSH_ERROR);
}

async function rememberFlushError(message: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.LAST_FLUSH_ERROR, message.slice(0, 300));
}

async function clearFlushError(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.LAST_FLUSH_ERROR);
}

/** Drop stale SecureStore-race diagnostic once a flush HTTP call succeeded. */
async function clearStaleNoAuthTokenFlushError(): Promise<void> {
  const prev = await AsyncStorage.getItem(STORAGE_KEYS.LAST_FLUSH_ERROR);
  if (prev === "no auth token") {
    await clearFlushError();
  }
}

/** Only real server accepts (created>0 / keepalive accept) refresh healthy. */
async function markPipelineAlive(): Promise<void> {
  const at = new Date().toISOString();
  await AsyncStorage.setItem(STORAGE_KEYS.LAST_ACCEPTED_AT, at);
  void patchFieldShiftSnapshot({ lastKnownAcceptAt: at }).catch(() => undefined);
  const { clearTrackingWarmup } = await import("./tracking-warmup");
  await clearTrackingWarmup();
}

async function rememberRejectReasons(
  rejectReasons: SampleRejectReasons | undefined,
): Promise<void> {
  if (!rejectReasons) return;
  const summary = formatRejectReasons(rejectReasons);
  if (summary === "{}") return;
  await AsyncStorage.setItem(STORAGE_KEYS.LAST_REJECT_REASON, summary);
}

async function applyFlushFailure(
  action: FlushErrorAction,
  pending: PendingLocationSample[],
  batch: PendingLocationSample[],
  shiftId: string,
  message: string,
): Promise<void> {
  if (action === "retry") {
    const bumped = pending.map((s) => ({ ...s, attempt: normalizeAttempt(s.attempt) + 1 }));
    await writePending(bumped);
    return;
  }
  if (action === "auth_required") {
    // Keep entire pending buffer — never silent discard on 401 (Грибовская).
    void rememberFlushError(`401: ${message}`);
    void appendErrorLog(`flush samples auth required (401): ${message}`, "error");
    setAuthRequired(true, "auth_401");
    return;
  }
  if (action === "discard_all") {
    await writePending([]);
    void rememberFlushError(`discard_all: ${message}`);
    void appendErrorLog(`flush samples discarded all: ${message}`, "error");
    return;
  }
  if (action === "discard_batch") {
    // 400 after failed retarget — KEEP buffer, stop ingest. Do not drain 100-by-100.
    // Clear accept timestamp so watchdog CTA appears immediately (like wrong_day).
    await AsyncStorage.removeItem(STORAGE_KEYS.LAST_ACCEPTED_AT);
    void rememberFlushError(`400 blocked: ${message}`);
    void appendErrorLog(
      `flush samples blocked on 400 (${batch.length} kept): ${message}`,
      "error",
    );
    setFlushBlockReason("stale_gps");
    return;
  }
  const rest = pending.slice(batch.length);
  const retriedBatch = batch.map((s) => ({ ...s, attempt: normalizeAttempt(s.attempt) + 1 }));
  await enqueueOfflineJob("shiftSamplesBatch", {
    shiftId,
    batchId: newUuidV4(),
    clientMutationId: newSampleId(),
    reason: "watchdog",
    items: retriedBatch,
  });
  await writePending(rest);
  void rememberFlushError(message);
  void appendErrorLog(`flush samples enqueued offline (${batch.length}): ${message}`, "warn");
}

export async function appendPendingSample(sample: PendingLocationSample): Promise<number> {
  if (isJsLocationPipelineDisabled()) {
    return 0;
  }
  return withBufferLock(async () => {
    const { getLastFlushBlockReason } = await import("./session-auth");
    const block = getLastFlushBlockReason();
    // Under auth/wrong_day/stale — do not grow buffer (esp. trim-at-500 silent loss).
    if (block === "auth_401" || block === "wrong_day" || block === "stale_gps") {
      return (await readPending()).length;
    }
    const storedShiftId = await readActiveShiftId();
    const shiftId = await resolveShiftIdForAppend(storedShiftId);
    if (shiftId && shiftId !== storedShiftId) {
      await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_SHIFT_ID, shiftId);
    }
    if (!shiftId) {
      void appendErrorLog("append pending: no shift id yet (cold wake — queueing sample)", "warn");
    }
    const token = await getAuthToken();
    if (!token) {
      void appendErrorLog("append pending: no auth token (sample queued)", "warn");
    }
    const current = await readPending();
    if (current.length >= MAX_PENDING_SAMPLES) {
      // Surface in diagnostics (More → GPS debug), not only in the error log.
      void rememberFlushError(`buffer full (${MAX_PENDING_SAMPLES}) — new points dropped`);
      void appendErrorLog(
        `append pending skipped: buffer full (${MAX_PENDING_SAMPLES})`,
        "warn",
      );
      return current.length;
    }
    const pending = trimPending([
      ...current,
      {
        ...sample,
        sampleId: sample.sampleId ?? newSampleId(),
        source: sample.source ?? "live_callback",
        attempt: normalizeAttempt(sample.attempt),
      },
    ]);
    await writePending(pending);
    await markGpsPointReceived(sample.clientRecordedAt);
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
  const fromSnapshot = await resolveShiftIdForAppend(null);
  if (fromSnapshot) {
    await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_SHIFT_ID, fromSnapshot);
    return fromSnapshot;
  }
  try {
    const activeRes = await fetchWithTimeout(`${getApiBaseUrl()}/field/shifts/active`, {
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

async function logSampleAudit(entry: Omit<TrackingSampleAuditEntry, "kind" | "at">): Promise<void> {
  await import("./tracking-audit-log").then(({ appendTrackingAudit }) =>
    appendTrackingAudit({
      kind: "sample",
      at: new Date().toISOString(),
      ...entry,
    }),
  );
}

export async function flushPendingSamples(
  shiftId?: string,
  reason: FlushReason = "interval",
): Promise<number> {
  if (isJsLocationPipelineDisabled()) {
    return 0;
  }
  return withBufferLock(async () => {
    await hydrateApiBaseUrl();
    // Headless / cold-wake: rehydrate block flags + retry SecureStore before giving up.
    await hydrateSessionAuthFromStorage();
    let token = await getAuthTokenWithRetry();
    if (!token) {
      // Do NOT setAuthRequired here — empty SecureStore also happens on voluntary logout.
      // auth_required is only set from a real HTTP 401 response.
      void rememberFlushError("no auth token");
      void appendErrorLog("flush samples skipped: no auth token (buffer kept)", "warn");
      return 0;
    }

    let sid = await resolveFlushShiftId(shiftId, token);
    if (!sid) {
      const pending = await readPending();
      if (pending.length > 0) {
        void rememberFlushError(`no shift id (${pending.length} pending)`);
        void appendErrorLog(
          `flush samples blocked: ${pending.length} pending but no active shift id`,
          "warn",
        );
      }
      return 0;
    }

    let uploaded = 0;
    let authRetryAttempted = false;

    while (true) {
      const pending = sortSamplesByTime(await readPending());
      if (pending.length === 0) break;

      const batch = pending.slice(0, MAX_BATCH);
      const rest = pending.slice(MAX_BATCH);
      const batchId = newUuidV4();
      const deviceId = await getTrackingDeviceId();

      const lastGpsCapturedAt = await getLastGpsPointAt();
      const telemetry = buildFlushTelemetryPayload({
        lastGpsCapturedAt,
        nowIso: new Date().toISOString(),
      });
      const sampleIds = batch.map((s) => s.sampleId ?? "missing_sample_id");
      await logBatchAudit({ batchId, shiftId: sid, sampleIds, reason });
      void appendErrorLog(
        `flush batch ${batchId} shiftId=${sid} reason=${reason} count=${batch.length} ${buildBatchSamplesSummary(sampleIds)}`,
        "info",
      );

      try {
        const payloadItems = batch.map((s) => {
          const attempt = normalizeAttempt(s.attempt);
          const sampleSource: SampleSource =
            attempt > 1 ? "retry_flush" : (s.source ?? "replay_buffer");
          return {
            ...s,
            source: "expo",
            deviceId,
            attempt,
            sampleSource,
          };
        });
        for (const s of batch) {
          const attempt = normalizeAttempt(s.attempt);
          const sampleSource: SampleSource =
            attempt > 1 ? "retry_flush" : (s.source ?? "replay_buffer");
          await logSampleAudit({
            sampleId: s.sampleId ?? "missing_sample_id",
            shiftId: sid,
            deviceId,
            clientRecordedAt: s.clientRecordedAt,
            lat: s.lat,
            lng: s.lng,
            accuracyM: s.accuracyM ?? null,
            source: sampleSource,
            batchId,
            attempt,
          });
        }
        const res = await fetchWithTimeout(`${getApiBaseUrl()}/field/shifts/${sid}/samples`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            batchId,
            reason,
            items: payloadItems,
            telemetry: {
              ...telemetry,
              deviceId,
            },
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          const message = text || `Upload failed (${res.status})`;
          const action = classifyFlushHttpStatus(res.status);

          if (action === "auth_required") {
            // Re-validate session once, then retry this batch. Fail → re-login UI, keep buffer.
            if (!authRetryAttempted) {
              authRetryAttempted = true;
              const stillValid = await validateAuthToken(token, getApiBaseUrl());
              if (stillValid) {
                const refreshed = await getAuthToken();
                if (refreshed) token = refreshed;
                void appendErrorLog(
                  `flush samples 401 → session ok, retry once (buffer kept)`,
                  "warn",
                );
                continue;
              }
            }
            try {
              const SecureStore = await import("expo-secure-store");
              await SecureStore.deleteItemAsync("crm_manager_jwt");
            } catch {
              /* ignore */
            }
            await applyFlushFailure(action, pending, batch, sid, message);
            break;
          }

          await applyFlushFailure(action, pending, batch, sid, message);
          break;
        }

        let created = batch.length;
        let duplicate = 0;
        let rejected = 0;
        let rejectReasons: SampleRejectReasons | undefined;
        try {
          const body = (await res.json()) as {
            created?: number;
            duplicate?: number;
            rejected?: number;
            rejectReasons?: SampleRejectReasons;
            ghostDuplicate?: boolean;
          };
          if (typeof body.created === "number" && Number.isFinite(body.created)) {
            created = body.created;
          }
          if (typeof body.duplicate === "number" && Number.isFinite(body.duplicate)) {
            duplicate = body.duplicate;
          }
          if (typeof body.rejected === "number" && Number.isFinite(body.rejected)) {
            rejected = body.rejected;
          }
          if (body.rejectReasons && typeof body.rejectReasons === "object") {
            rejectReasons = body.rejectReasons;
          }
          if (body.ghostDuplicate === true && created === 0 && duplicate > 0) {
            void appendErrorLog(
              `flush ghost duplicate batch=${batchId} shiftId=${sid} count=${duplicate} (buffer kept)`,
              "warn",
            );
            await applyFlushFailure("retry", pending, batch, sid, "ghost duplicate");
            break;
          }
        } catch {
          /* non-JSON body — treat as full batch accepted */
        }

        await rememberRejectReasons(rejectReasons);

        // Ісанчев: wrong_day batches must leave the buffer immediately (no forever retry).
        if (created === 0 && isWrongDayBatch(rejectReasons, rejected)) {
          await writePending(rest);
          await AsyncStorage.setItem(STORAGE_KEYS.LAST_FLUSH_AT, new Date().toISOString());
          await AsyncStorage.removeItem(STORAGE_KEYS.LAST_ACCEPTED_AT);
          await clearStaleNoAuthTokenFlushError();
          setFlushBlockReason("wrong_day");
          void appendErrorLog(
            `flush samples wrong_day purged count=${rejected} shiftId=${sid} rejectReasons=${formatRejectReasons(rejectReasons)}`,
            "error",
          );
          if (rest.length === 0) break;
          continue;
        }

        // Drop this batch from buffer (accepted or rejected). Hard geo rejects must not
        // block subsequent fresh points — only wrong_day / 401 / dead-shift set a block.
        await writePending(rest);
        await AsyncStorage.setItem(STORAGE_KEYS.LAST_FLUSH_AT, new Date().toISOString());
        uploaded += Math.max(0, created);

        if (created > 0 || duplicate > 0) {
          await clearFlushError();
        } else {
          await clearStaleNoAuthTokenFlushError();
        }

        if (created === 0 && rejected > 0) {
          const reasons = formatRejectReasons(rejectReasons);
          const human = describeRejectBatch(rejectReasons);
          const severity = classifySampleRejectBatch(rejectReasons);
          if (severity === "soft") {
            if (softRejectCountsAsAccept(rejectReasons) || duplicate > 0) {
              await markPipelineAlive();
            }
            void appendErrorLog(
              `flush samples dedup (${rejected}) shiftId=${sid}: ${human}`,
              "info",
            );
          } else if (severity === "hard") {
            void appendErrorLog(
              `flush samples rejected (${rejected}) shiftId=${sid}: ${human} [${reasons}]`,
              "warn",
            );
          } else {
            void appendErrorLog(
              `flush samples rejected (${rejected}) shiftId=${sid}: ${human} [${reasons}]`,
              "warn",
            );
          }
        } else if (created > 0 || duplicate > 0) {
          // Keepalive on server is accept:true → created>0 or idempotent duplicate.
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
