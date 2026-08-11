import {
  resolveFieldTrackingMode,
  shouldUseNativeTracking,
  type FieldTrackingModeFlag,
} from "./tracking-feature-flag-core";

export type {
  FieldTrackingModeFlag,
  NativeAcceptHealthInput,
  NativeAcceptHealthResult,
  NativeWatchdogHealthInput,
} from "./native-tracking-gates-core";

export {
  displayPendingSamples,
  isNativeTrackingPipelineHealthy,
  resolveNativeRuntimeAcceptHealth,
  shouldShowJsPendingQueue,
  shouldSuppressNativeAcceptStaleAlert,
  shouldSuppressNativeFlushRetryAlert,
} from "./native-tracking-gates-core";

/** JS Expo buffer / flush / TaskManager must not run when native FGS owns the pipeline. */
export function isJsLocationPipelineDisabled(
  mode: FieldTrackingModeFlag = resolveFieldTrackingMode(),
): boolean {
  return shouldUseNativeTracking(mode);
}
