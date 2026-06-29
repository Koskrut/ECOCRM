/** How to handle a failed sample upload. */
export type FlushErrorAction = "retry" | "discard_batch" | "discard_all";

/** Classify HTTP status from POST /field/shifts/:id/samples. */
export function classifyFlushHttpStatus(status: number): FlushErrorAction {
  if (status === 401 || status === 404) {
    return "discard_all";
  }
  if (status >= 400 && status < 500) {
    if (status === 408 || status === 429) {
      return "retry";
    }
    return "discard_batch";
  }
  if (status >= 500) {
    return "retry";
  }
  return "retry";
}

/** Network / thrown errors should be retried. */
export function classifyFlushThrownError(): FlushErrorAction {
  return "retry";
}
