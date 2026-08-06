export type ShiftBootstrapFailureReason = "no_shift_id" | "no_token";

export type ShiftBootstrapResult =
  | { ok: true }
  | { ok: false; reason: ShiftBootstrapFailureReason };

/** Pure gate — unit-testable without AsyncStorage / SecureStore. */
export function validateShiftBootstrapPrerequisites(
  shiftId: string | null | undefined,
  hasToken: boolean,
): ShiftBootstrapResult {
  if (!shiftId || shiftId.length === 0) {
    return { ok: false, reason: "no_shift_id" };
  }
  if (!hasToken) {
    return { ok: false, reason: "no_token" };
  }
  return { ok: true };
}
