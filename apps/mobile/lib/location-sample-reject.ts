/** Server-side GPS sample reject reason counts from POST /field/shifts/:id/samples. */
export type SampleRejectReasons = Record<string, number>;

/** Reasons that indicate a real tracking/GPS problem (not expected dedup). */
const HARD_REJECT_REASONS = new Set(["bad_accuracy", "wrong_day", "teleport"]);

export type SampleRejectSeverity = "hard" | "soft" | "unknown";

/**
 * Classify an all-rejected batch for logging / UX.
 * duplicate-only (stationed phone) is soft — expected filter behavior, not "GPS broken".
 */
export function classifySampleRejectBatch(
  rejectReasons: SampleRejectReasons | undefined | null,
): SampleRejectSeverity {
  if (!rejectReasons || typeof rejectReasons !== "object") return "unknown";
  const keys = Object.keys(rejectReasons).filter(
    (k) => typeof rejectReasons[k] === "number" && rejectReasons[k]! > 0,
  );
  if (keys.length === 0) return "unknown";
  if (keys.some((k) => HARD_REJECT_REASONS.has(k))) return "hard";
  return "soft";
}

export function formatRejectReasons(rejectReasons: SampleRejectReasons | undefined | null): string {
  if (!rejectReasons || typeof rejectReasons !== "object") return "{}";
  try {
    return JSON.stringify(rejectReasons);
  } catch {
    return "{}";
  }
}
