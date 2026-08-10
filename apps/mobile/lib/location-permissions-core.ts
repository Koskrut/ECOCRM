/**
 * Pure permission status helpers (no RN / expo imports — unit-testable).
 */

/** expo-location / PermissionStatus string values. */
export type PermissionStatusString = "granted" | "denied" | "undetermined" | string;

/**
 * Merge expo-location background status with a native Android check.
 *
 * On some OEMs / after Settings returns, expo can report `undetermined` or
 * `denied` while `ACCESS_BACKGROUND_LOCATION` is already granted. Native
 * ContextCompat / PermissionChecker `true` overrides that false-negative.
 *
 * - expo `granted` always wins
 * - native `true` upgrades ambiguous expo statuses to `granted`
 * - native `null` (module missing / non-Android) leaves expo status as-is
 * - native `false` does not downgrade expo `granted`
 */
export function resolveBackgroundPermissionStatus(
  expoStatus: PermissionStatusString | null,
  nativeGranted: boolean | null,
): PermissionStatusString | null {
  if (expoStatus === "granted") return "granted";
  if (nativeGranted === true) return "granted";
  return expoStatus;
}

export function isBackgroundLocationGrantedStatus(
  status: PermissionStatusString | null | undefined,
): boolean {
  return status === "granted";
}

/**
 * Whether we should treat background as already satisfied and skip the
 * «Always» settings dialog / rationale.
 */
export function shouldSkipBackgroundPermissionPrompt(
  expoStatus: PermissionStatusString | null,
  nativeGranted: boolean | null,
): boolean {
  return isBackgroundLocationGrantedStatus(
    resolveBackgroundPermissionStatus(expoStatus, nativeGranted),
  );
}

/** Whether the «Always» / backgroundRequired dialog should be shown to the user. */
export function shouldShowBackgroundRequiredDialog(input: {
  foreground: PermissionStatusString;
  background: PermissionStatusString | null;
}): boolean {
  if (input.foreground !== "granted") return false;
  return !isBackgroundLocationGrantedStatus(input.background);
}
