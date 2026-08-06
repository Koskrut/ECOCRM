/**
 * Pure gates for shift / tracking mutations — testable without RN AppState.
 */

export type ShiftOpBusyReason = "busy" | "app_not_active";

/** Prevent thrash: Smoke User created 3 empty shifts in ~2 min. */
export function canRunShiftOperation(opInFlight: boolean): boolean {
  return !opInFlight;
}

export function shouldReuseActiveShift(status: string | null | undefined): boolean {
  return status === "ACTIVE";
}

/**
 * End+start shift is NOT the primary GPS fix (creates empty FieldShift rows).
 * Only wrong_day requires a new shift row.
 */
export function shouldOfferRestartShiftCta(
  unhealthyReason:
    | "none"
    | "background_permission"
    | "background_task_dead"
    | "foreground_watch_dead"
    | "accept_stale"
    | "accept_stale_wrong_day"
    | "accept_stale_auth_401"
    | "fgs_start_blocked_background",
): boolean {
  return unhealthyReason === "accept_stale_wrong_day";
}

/** Adaptive tier stop+start only while foreground (Android 12+ FGS rule). */
export function shouldDeferAdaptiveTierApply(appState: string): boolean {
  return appState !== "active";
}

/**
 * Expo #47595: task reports started but no accepts → force recreate on foreground.
 */
export function shouldForceRecreateBackgroundTask(input: {
  claimedMode: string | null;
  taskStarted: boolean;
  acceptStale: boolean;
  appState: string;
}): boolean {
  if (input.appState !== "active") return false;
  if (input.claimedMode !== "background") return false;
  if (!input.taskStarted && input.acceptStale) return true;
  if (!input.taskStarted) return true;
  return input.acceptStale;
}
