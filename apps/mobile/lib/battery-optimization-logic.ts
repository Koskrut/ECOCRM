import type { BatteryOptimizationStatus } from "./location-tracking-restart";

/** Hide battery nag when tracking is clearly alive despite unknown module read. */
export function shouldShowBatteryOptimizationWarning(input: {
  batteryStatus: BatteryOptimizationStatus;
  trackingMode: "background" | "foreground" | "none";
  healthy: boolean;
  backgroundTaskStarted: boolean;
  lastAcceptedAt: string | null;
  showBatteryHint?: boolean;
  freshAcceptThresholdMs?: number;
  nowMs?: number;
}): boolean {
  if (input.trackingMode === "none") return false;
  if (input.batteryStatus === "unrestricted") return false;

  const threshold = input.freshAcceptThresholdMs ?? 5 * 60 * 1000;
  const now = input.nowMs ?? Date.now();
  const acceptAt = input.lastAcceptedAt ? new Date(input.lastAcceptedAt).getTime() : NaN;
  const freshAccept =
    Number.isFinite(acceptAt) && now - acceptAt <= threshold;

  if (
    input.healthy &&
    input.backgroundTaskStarted &&
    freshAccept &&
    input.batteryStatus === "unknown"
  ) {
    return false;
  }

  // Restricted API read is common on Samsung/Xiaomi — hide when native/legacy tracking is clearly alive.
  if (
    input.healthy &&
    input.backgroundTaskStarted &&
    freshAccept &&
    input.batteryStatus === "restricted"
  ) {
    return false;
  }

  if (input.batteryStatus === "restricted") return true;
  if (input.batteryStatus === "unknown" && input.showBatteryHint) return true;
  if (input.batteryStatus === "unknown" && !freshAccept && input.trackingMode === "background") {
    return true;
  }
  return input.showBatteryHint === true;
}
