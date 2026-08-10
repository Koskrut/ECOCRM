/** Field GPS pipeline: legacy Expo TaskManager vs native Android FGS. */
export type FieldTrackingModeFlag = "legacy_expo" | "native_android";

/** Pure resolver — testable without Expo runtime. */
export function resolveFieldTrackingMode(
  envValue?: string,
  extra?: Record<string, string | undefined>,
): FieldTrackingModeFlag {
  const fromEnv = envValue || extra?.fieldTrackingMode || extra?.FIELD_TRACKING_MODE;
  if (fromEnv === "native_android") return "native_android";
  return "legacy_expo";
}

export function shouldUseNativeTracking(mode = resolveFieldTrackingMode()): boolean {
  return mode === "native_android";
}

export function shouldUseExpoTracking(mode = resolveFieldTrackingMode()): boolean {
  return mode === "legacy_expo";
}
