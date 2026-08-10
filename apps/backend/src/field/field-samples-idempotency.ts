/** Idempotency helpers for POST /field/shifts/:id/samples (owner + device + sampleId). */

export type SampleIdempotencyInput = {
  sampleId?: string | null;
  deviceId?: string | null;
};

export type IdempotencyKey = {
  ownerId: string;
  deviceId: string | null;
  sampleId: string;
};

/** Normalize client sampleId — trim; empty → null. */
export function normalizeSampleId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Normalize deviceId from item or batch-level telemetry fallback. */
export function normalizeDeviceId(
  item: SampleIdempotencyInput,
  batchDeviceId?: string | null,
): string | null {
  if (typeof item.deviceId === "string" && item.deviceId.trim()) {
    return item.deviceId.trim();
  }
  if (typeof batchDeviceId === "string" && batchDeviceId.trim()) {
    return batchDeviceId.trim();
  }
  return null;
}

export function idempotencyKey(ownerId: string, deviceId: string | null, sampleId: string): IdempotencyKey {
  return { ownerId, deviceId, sampleId };
}

/** Stable string key for in-memory duplicate sets within a batch. */
export function idempotencyKeyString(key: IdempotencyKey): string {
  return `${key.ownerId}\0${key.deviceId ?? ""}\0${key.sampleId}`;
}

export function collectSampleIds(items: SampleIdempotencyInput[]): string[] {
  const ids: string[] = [];
  for (const it of items) {
    const sampleId = normalizeSampleId(it.sampleId);
    if (sampleId) ids.push(sampleId);
  }
  return ids;
}

export function buildExistingKeySet(
  rows: Array<{ ownerId: string | null; deviceId: string | null; sampleId: string | null }>,
  ownerId: string,
): Set<string> {
  const set = new Set<string>();
  for (const row of rows) {
    const sampleId = normalizeSampleId(row.sampleId);
    if (!sampleId) continue;
    if (row.ownerId != null && row.ownerId !== ownerId) continue;
    set.add(
      idempotencyKeyString(
        idempotencyKey(ownerId, normalizeDeviceId({ deviceId: row.deviceId }), sampleId),
      ),
    );
  }
  return set;
}

export function isDuplicateSample(
  ownerId: string,
  deviceId: string | null,
  sampleId: string | null,
  existingKeys: Set<string>,
): boolean {
  if (!sampleId) return false;
  if (existingKeys.has(idempotencyKeyString(idempotencyKey(ownerId, deviceId, sampleId)))) {
    return true;
  }
  // Legacy rows stored before deviceId — owner+sampleId still idempotent across devices.
  return existingKeys.has(idempotencyKeyString(idempotencyKey(ownerId, null, sampleId)));
}

export function markSampleAccepted(
  ownerId: string,
  deviceId: string | null,
  sampleId: string | null,
  existingKeys: Set<string>,
): void {
  if (!sampleId) return;
  existingKeys.add(idempotencyKeyString(idempotencyKey(ownerId, deviceId, sampleId)));
}
