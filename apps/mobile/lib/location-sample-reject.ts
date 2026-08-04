/** Server-side GPS sample reject reason counts from POST /field/shifts/:id/samples. */
export type SampleRejectReasons = Record<string, number>;

/** Reasons that indicate a real tracking/GPS problem (not expected dedup). */
const HARD_REJECT_REASONS = new Set([
  "bad_accuracy",
  "wrong_day",
  "teleport",
  "out_of_region",
]);

/** Soft / expected filter noise — never surface as ERROR in diagnostics. */
const SOFT_REJECT_REASONS = new Set(["duplicate", "keepalive"]);

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
  if (keys.every((k) => SOFT_REJECT_REASONS.has(k))) return "soft";
  // Unknown server reasons must not look like "healthy dedup".
  return "unknown";
}

/**
 * Whether a soft-rejected batch should refresh LAST_ACCEPTED_AT.
 * Server keepalive is accept:true (created>0) — not a reject reason.
 * Duplicate-only must NOT keep healthy forever (Ісанчев stale mask).
 */
export function softRejectCountsAsAccept(
  rejectReasons: SampleRejectReasons | undefined | null,
): boolean {
  if (!rejectReasons || typeof rejectReasons !== "object") return false;
  const keepalive = rejectReasonCount(rejectReasons, "keepalive");
  if (keepalive <= 0) return false;
  // Only if no hard reasons mixed in.
  return classifySampleRejectBatch(rejectReasons) === "soft";
}

export function formatRejectReasons(rejectReasons: SampleRejectReasons | undefined | null): string {
  if (!rejectReasons || typeof rejectReasons !== "object") return "{}";
  try {
    return JSON.stringify(rejectReasons);
  } catch {
    return "{}";
  }
}

export function rejectReasonCount(
  rejectReasons: SampleRejectReasons | undefined | null,
  reason: string,
): number {
  if (!rejectReasons || typeof rejectReasons !== "object") return 0;
  const n = rejectReasons[reason];
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/** Batch is dominated by wrong_day (Ісанчев loop) — purge, do not retry forever. */
export function isWrongDayBatch(
  rejectReasons: SampleRejectReasons | undefined | null,
  rejected: number,
): boolean {
  const wrong = rejectReasonCount(rejectReasons, "wrong_day");
  if (wrong <= 0 || rejected <= 0) return false;
  // Majority (>=50%) so a stray duplicate in the same batch still purges.
  return wrong >= Math.ceil(rejected * 0.5);
}
