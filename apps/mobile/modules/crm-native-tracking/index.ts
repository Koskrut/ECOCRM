/**
 * Native Android field tracking — RN bridge only.
 * GPS → Room → HTTP upload runs in LocationForegroundService without JS.
 */
import { Platform } from "react-native";
import { requireNativeModule } from "expo-modules-core";

import {
  getFieldTrackingMode,
  type FieldTrackingModeFlag,
} from "../../lib/tracking-feature-flag";

export type NativeTrackingHealth = {
  trackingHealthState: string;
  lastGpsCapturedAt: string | null;
  lastServerAcceptAt: string | null;
  nativeLastSeenAt: string | null;
  pendingUploadCount: number;
  serviceRunning: boolean;
  activeShiftId: string | null;
  recoveryState: string | null;
};

type CrmNativeTrackingModule = {
  startTracking(shiftId: string): Promise<boolean>;
  stopTracking(): Promise<boolean>;
  getTrackingHealth(): Promise<NativeTrackingHealth>;
  flushPendingSamples(): Promise<number>;
  isNativeTrackingAvailable(): Promise<boolean>;
  syncSession(authToken: string, apiBaseUrl: string): Promise<boolean>;
  clearSession(): Promise<boolean>;
};

let nativeModule: CrmNativeTrackingModule | null = null;

try {
  if (Platform.OS === "android") {
    nativeModule = requireNativeModule<CrmNativeTrackingModule>("CrmNativeTracking");
  }
} catch {
  nativeModule = null;
}

export function isNativeTrackingModuleLoaded(): boolean {
  return nativeModule != null;
}

export function getActiveTrackingMode(): FieldTrackingModeFlag {
  return getFieldTrackingMode();
}

export async function syncNativeTrackingCredentials(
  authToken: string,
  apiBaseUrl: string,
): Promise<boolean> {
  if (!nativeModule || Platform.OS !== "android") return false;
  const base = apiBaseUrl.trim().replace(/\/+$/, "");
  if (!authToken || !base) return false;
  return nativeModule.syncSession(authToken, base);
}

export async function clearNativeTrackingCredentials(): Promise<boolean> {
  if (!nativeModule || Platform.OS !== "android") return false;
  return nativeModule.clearSession();
}

export async function startNativeTracking(shiftId: string): Promise<boolean> {
  if (!nativeModule || getFieldTrackingMode() !== "native_android") return false;
  return nativeModule.startTracking(shiftId);
}

export async function stopNativeTracking(): Promise<boolean> {
  if (!nativeModule) return false;
  return nativeModule.stopTracking();
}

export async function getNativeTrackingHealth(): Promise<NativeTrackingHealth | null> {
  if (!nativeModule) return null;
  return nativeModule.getTrackingHealth();
}

export async function flushNativePendingSamples(): Promise<number> {
  if (!nativeModule) return 0;
  return nativeModule.flushPendingSamples();
}

/** Acceptance test hooks (Phase 8 — tests A–E). */
export const nativeTrackingDiagnostics = {
  async runAcceptanceProbe(testId: "A" | "B" | "C" | "D" | "E"): Promise<Record<string, unknown>> {
    const health = await getNativeTrackingHealth();
    return {
      testId,
      mode: getFieldTrackingMode(),
      moduleLoaded: isNativeTrackingModuleLoaded(),
      health,
      timestamp: new Date().toISOString(),
    };
  },
};
