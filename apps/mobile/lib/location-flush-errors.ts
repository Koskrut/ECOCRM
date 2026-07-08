/** How to handle a failed sample upload. */
export type FlushErrorAction = "retry" | "enqueue_offline" | "discard_all";

/** Classify HTTP status from POST /field/shifts/:id/samples. */
export function classifyFlushHttpStatus(status: number): FlushErrorAction {
  if (status === 401 || status === 404) {
    return "discard_all";
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
