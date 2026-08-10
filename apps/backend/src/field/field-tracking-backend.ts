/** Backend field tracking mode — mirrors mobile flag; default legacy_expo until native proven. */
export type FieldTrackingModeFlag = "legacy_expo" | "native_android";

const VALID: FieldTrackingModeFlag[] = ["legacy_expo", "native_android"];

/** Resolve from env / config map (testable without process.env side effects). */
export function resolveFieldTrackingMode(
  envValue?: string,
  extra?: Record<string, string | undefined>,
): FieldTrackingModeFlag {
  const raw =
    envValue ??
    extra?.FIELD_TRACKING_MODE ??
    extra?.fieldTrackingMode ??
    process.env.FIELD_TRACKING_MODE;
  if (raw === "native_android") return "native_android";
  return "legacy_expo";
}

export function isValidFieldTrackingMode(value: string): value is FieldTrackingModeFlag {
  return (VALID as string[]).includes(value);
}

export function shouldUseNativeTracking(mode = resolveFieldTrackingMode()): boolean {
  return mode === "native_android";
}

export function shouldUseExpoTracking(mode = resolveFieldTrackingMode()): boolean {
  return mode === "legacy_expo";
}
