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
  lastFlushAt: string | null;
  lastRejectReasons: string | null;
  nativeLastSeenAt: string | null;
  pendingUploadCount: number;
  serviceRunning: boolean;
  activeShiftId: string | null;
  recoveryState: string | null;
};

type CrmNativeTrackingModule = {
  startTracking(shiftId: string): Promise<boolean>;
  stopTracking(): Promise<boolean>;
  getTrackingHealth(): Promise<Partial<NativeTrackingHealth> | Record<string, unknown>>;
  flushPendingSamples(): Promise<number>;
  purgePendingSamples(): Promise<number>;
  isNativeTrackingAvailable(): Promise<boolean>;
  syncSession(authToken: string, apiBaseUrl: string): Promise<boolean>;
  clearSession(): Promise<boolean>;
};

/**
 * Cache only a successful require. Import-time / early require can throw before the
 * native registry is ready — a sticky null caused syncSession failed + no FGS.
 */
let nativeModule: CrmNativeTrackingModule | null = null;

function getNativeModule(): CrmNativeTrackingModule | null {
  if (Platform.OS !== "android") return null;
  if (nativeModule) return nativeModule;
  try {
    nativeModule = requireNativeModule<CrmNativeTrackingModule>("CrmNativeTracking");
  } catch {
    return null;
  }
  return nativeModule;
}

/** Test helper — drop cached bridge so the next call re-requires. */
export function resetNativeTrackingModuleCacheForTests(): void {
  nativeModule = null;
}

export function isNativeTrackingModuleLoaded(): boolean {
  return getNativeModule() != null;
}

export function getActiveTrackingMode(): FieldTrackingModeFlag {
  return getFieldTrackingMode();
}

export async function syncNativeTrackingCredentials(
  authToken: string,
  apiBaseUrl: string,
): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod || Platform.OS !== "android") return false;
  const base = apiBaseUrl.trim().replace(/\/+$/, "");
  if (!authToken || !base) return false;
  try {
    return await mod.syncSession(authToken, base);
  } catch {
    nativeModule = null;
    return false;
  }
}

export async function clearNativeTrackingCredentials(): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod || Platform.OS !== "android") return false;
  try {
    return await mod.clearSession();
  } catch {
    nativeModule = null;
    return false;
  }
}

export async function startNativeTracking(shiftId: string): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod || getFieldTrackingMode() !== "native_android") return false;
  try {
    return await mod.startTracking(shiftId);
  } catch {
    nativeModule = null;
    return false;
  }
}

export async function stopNativeTracking(): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod) return false;
  try {
    return await mod.stopTracking();
  } catch {
    nativeModule = null;
    return false;
  }
}

function normalizeNativeHealth(
  raw: Partial<NativeTrackingHealth> | Record<string, unknown> | null | undefined,
): NativeTrackingHealth | null {
  if (!raw || typeof raw !== "object") return null;
  const serviceRunning = raw.serviceRunning;
  const trackingHealthState = raw.trackingHealthState;
  const activeShiftId = raw.activeShiftId;
  // Empty map from Kotlin when context was null — treat as unavailable.
  if (
    serviceRunning == null &&
    trackingHealthState == null &&
    (activeShiftId == null || activeShiftId === "")
  ) {
    return null;
  }
  return {
    trackingHealthState:
      typeof trackingHealthState === "string" ? trackingHealthState : "SERVICE_DEAD",
    lastGpsCapturedAt:
      typeof raw.lastGpsCapturedAt === "string" ? raw.lastGpsCapturedAt : null,
    lastServerAcceptAt:
      typeof raw.lastServerAcceptAt === "string" ? raw.lastServerAcceptAt : null,
    lastFlushAt: typeof raw.lastFlushAt === "string" ? raw.lastFlushAt : null,
    lastRejectReasons:
      typeof raw.lastRejectReasons === "string" ? raw.lastRejectReasons : null,
    nativeLastSeenAt:
      typeof raw.nativeLastSeenAt === "string" ? raw.nativeLastSeenAt : null,
    pendingUploadCount:
      typeof raw.pendingUploadCount === "number" ? raw.pendingUploadCount : 0,
    serviceRunning: serviceRunning === true,
    activeShiftId: typeof activeShiftId === "string" ? activeShiftId : null,
    recoveryState: typeof raw.recoveryState === "string" ? raw.recoveryState : null,
  };
}

export async function getNativeTrackingHealth(): Promise<NativeTrackingHealth | null> {
  const mod = getNativeModule();
  if (!mod) return null;
  try {
    return normalizeNativeHealth(await mod.getTrackingHealth());
  } catch {
    nativeModule = null;
    return null;
  }
}

export async function flushNativePendingSamples(): Promise<number> {
  const mod = getNativeModule();
  if (!mod) return 0;
  try {
    return await mod.flushPendingSamples();
  } catch {
    nativeModule = null;
    return 0;
  }
}

export async function purgeNativePendingSamples(): Promise<number> {
  const mod = getNativeModule();
  if (!mod) return 0;
  try {
    return await mod.purgePendingSamples();
  } catch {
    nativeModule = null;
    return 0;
  }
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
