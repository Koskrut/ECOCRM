import Constants from "expo-constants";

import {
  resolveFieldTrackingMode,
  shouldUseExpoTracking as shouldUseExpoTrackingCore,
  shouldUseNativeTracking as shouldUseNativeTrackingCore,
  type FieldTrackingModeFlag,
} from "./tracking-feature-flag-core";

export type { FieldTrackingModeFlag };
export { resolveFieldTrackingMode };

const ENV_KEY = "EXPO_PUBLIC_FIELD_TRACKING_MODE";

export function getFieldTrackingMode(): FieldTrackingModeFlag {
  const extra = Constants.expoConfig?.extra as Record<string, string> | undefined;
  return resolveFieldTrackingMode(
    typeof process !== "undefined" ? process.env?.[ENV_KEY] : undefined,
    extra,
  );
}

export function shouldUseNativeTracking(): boolean {
  return shouldUseNativeTrackingCore(getFieldTrackingMode());
}

export function shouldUseExpoTracking(): boolean {
  return shouldUseExpoTrackingCore(getFieldTrackingMode());
}
