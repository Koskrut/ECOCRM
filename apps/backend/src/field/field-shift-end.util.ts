export const SHIFT_END_REASONS = ["user", "auto_stale_day", "restart", "cron"] as const;

export type ShiftEndReason = (typeof SHIFT_END_REASONS)[number];

export const SHIFT_REOPEN_WINDOW_MS = 60_000;
export const LATE_FLUSH_AFTER_END_MS = 15 * 60_000;

export function parseShiftEndReason(value: unknown): ShiftEndReason | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return (SHIFT_END_REASONS as readonly string[]).includes(v) ? (v as ShiftEndReason) : null;
}
