/** How to handle a failed sample upload. */
export type FlushErrorAction = "retry" | "enqueue_offline" | "discard_all" | "discard_batch";

/**
 * Classify HTTP status from POST /field/shifts/:id/samples.
 * - 401: keep pending / offline (do not wipe buffer — token may refresh)
 * - 404: shift gone → discard all
 * - 400: usually "shift not active" → discard this batch, clear local shift id
 */
export function classifyFlushHttpStatus(status: number): FlushErrorAction {
  if (status === 401) {
    return "enqueue_offline";
  }
  if (status === 404) {
    return "discard_all";
  }
  if (status === 400) {
    return "discard_batch";
  }
  if (status >= 500 || status === 408 || status === 429) {
    return "retry";
  }
  return "enqueue_offline";
}

/** Network / thrown errors should be retried via offline queue. */
export function classifyFlushThrownError(): FlushErrorAction {
  return "enqueue_offline";
}

export type ShiftSamplesBatchJob = {
  kind: string;
  payload: Record<string, unknown>;
  lastError?: string | null;
};

/** Rewrite dead shiftId after 400, or return null to discard the job. */
export function retargetShiftSamplesBatchJob<T extends ShiftSamplesBatchJob>(
  job: T,
  activeShiftId: string | null,
): T | null {
  if (job.kind !== "shiftSamplesBatch") return job;
  if (!activeShiftId) return null;
  return {
    ...job,
    payload: { ...job.payload, shiftId: activeShiftId },
    lastError: "retargeted shiftId after 400",
  };
}
