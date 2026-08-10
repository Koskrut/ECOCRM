/**
 * Pure gates for shift / tracking mutations — testable without RN AppState.
 */

import type { TrackingUnhealthyReason } from "./location-tracking-health";

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
export function shouldOfferRestartShiftCta(unhealthyReason: TrackingUnhealthyReason): boolean {
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
