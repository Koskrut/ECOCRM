import AsyncStorage from "@react-native-async-storage/async-storage";

import type { SamplingTier } from "./location-tracking-config";

export const RESTART_COOLDOWN_MS = 30_000;

export type TrackingRestartReason = "os_kill" | "tier_change" | "appstate" | "watchdog";

export type BatteryOptimizationStatus = "restricted" | "unrestricted" | "unknown";

export type TrackingRestartDiagnostics = {
  lastRestartAt: string | null;
  restartCountToday: number;
  lastRestartReason: TrackingRestartReason | null;
  batteryOptimizationStatus: BatteryOptimizationStatus;
};

const STORAGE_KEY = "field_tracking_restart_diagnostics";
const PENDING_TIER_KEY = "field_pending_adaptive_tier";

type StoredDiagnostics = {
  lastRestartAt: string | null;
  restartCountToday: number;
  restartCountDate: string | null;
  lastRestartReason: TrackingRestartReason | null;
  batteryOptimizationStatus: BatteryOptimizationStatus;
};

let inMemoryLastRestartAt = 0;

/** @internal test helper */
export function _setLastRestartAtForTests(ts: number): void {
  inMemoryLastRestartAt = ts;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultStored(): StoredDiagnostics {
  return {
    lastRestartAt: null,
    restartCountToday: 0,
    restartCountDate: null,
    lastRestartReason: null,
    batteryOptimizationStatus: "unknown",
  };
}

async function readStored(): Promise<StoredDiagnostics> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultStored();
    const parsed = JSON.parse(raw) as Partial<StoredDiagnostics>;
    return { ...defaultStored(), ...parsed };
  } catch {
    return defaultStored();
  }
}

async function writeStored(data: StoredDiagnostics): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function shouldMaintainOnAppState(state: string): boolean {
  return state === "background";
}

/**
 * Android 12+ forbids starting a location FGS while the app is backgrounded.
 * Only attempt Location.startLocationUpdatesAsync when AppState is active.
 */
export function canStartLocationForegroundService(appState: string): boolean {
  return appState === "active";
}

/**
 * After a skipped/failed background restart, never report `"background"` if the
 * OS task is still dead (cooldown used to lie and look like a silent success).
 */
export function reportedModeAfterBackgroundRestartAttempt(
  claimedMode: "background" | "foreground" | "none",
  taskStarted: boolean,
): "background" | "foreground" | "none" {
  if (taskStarted && claimedMode === "background") return "background";
  if (claimedMode === "foreground") return "foreground";
  if (claimedMode === "none") return "none";
  // claimed background + dead task
  return "none";
}

export function isFgsBlockedFromBackgroundError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("couldn't start the foreground service") ||
    m.includes("foreground service cannot be started") ||
    (m.includes("startlocationupdatesasync") && m.includes("foreground service"))
  );
}

export function canRestartNow(nowMs = Date.now()): boolean {
  return nowMs - inMemoryLastRestartAt >= RESTART_COOLDOWN_MS;
}

export function mapRestartContextToReason(context: string): TrackingRestartReason {
  const normalized = context.toLowerCase();
  if (normalized.includes("watchdog")) return "watchdog";
  if (normalized.includes("tier")) return "tier_change";
  if (normalized.includes("manual") || normalized.includes("foregroundrecover")) return "os_kill";
  if (normalized.includes("maintainbackgroundtracking") || normalized.includes("appstate")) {
    return "appstate";
  }
  return "os_kill";
}

export async function getTrackingRestartDiagnostics(): Promise<TrackingRestartDiagnostics> {
  const stored = await readStored();
  const day = todayKey();
  const restartCountToday =
    stored.restartCountDate === day ? stored.restartCountToday : 0;
  return {
    lastRestartAt: stored.lastRestartAt,
    restartCountToday,
    lastRestartReason: stored.lastRestartReason,
    batteryOptimizationStatus: stored.batteryOptimizationStatus,
  };
}

export async function setBatteryOptimizationStatus(
  status: BatteryOptimizationStatus,
): Promise<void> {
  const stored = await readStored();
  await writeStored({ ...stored, batteryOptimizationStatus: status });
}

export async function recordRestartAttempt(
  reason: TrackingRestartReason,
  nowMs = Date.now(),
  opts?: { bypassCooldown?: boolean },
): Promise<{ allowed: boolean; diagnostics: TrackingRestartDiagnostics }> {
  const stored = await readStored();
  if (!opts?.bypassCooldown) {
    // Cooldown must survive process kills — check persisted lastRestartAt, not only memory.
    const storedMs = stored.lastRestartAt ? new Date(stored.lastRestartAt).getTime() : 0;
    const lastMs = Math.max(inMemoryLastRestartAt, Number.isFinite(storedMs) ? storedMs : 0);
    if (nowMs - lastMs < RESTART_COOLDOWN_MS) {
      const diagnostics = await getTrackingRestartDiagnostics();
      return { allowed: false, diagnostics };
    }
  }

  inMemoryLastRestartAt = nowMs;
  const day = todayKey();
  const restartCountToday =
    stored.restartCountDate === day ? stored.restartCountToday + 1 : 1;

  const next: StoredDiagnostics = {
    ...stored,
    lastRestartAt: new Date(nowMs).toISOString(),
    restartCountToday,
    restartCountDate: day,
    lastRestartReason: reason,
  };
  await writeStored(next);

  return {
    allowed: true,
    diagnostics: {
      lastRestartAt: next.lastRestartAt,
      restartCountToday,
      lastRestartReason: reason,
      batteryOptimizationStatus: next.batteryOptimizationStatus,
    },
  };
}

export async function resetTrackingRestartDiagnostics(): Promise<void> {
  inMemoryLastRestartAt = 0;
  await AsyncStorage.removeItem(STORAGE_KEY);
  await AsyncStorage.removeItem(PENDING_TIER_KEY);
}

export async function setPendingAdaptiveTier(tier: SamplingTier): Promise<void> {
  await AsyncStorage.setItem(PENDING_TIER_KEY, tier);
}

export async function getPendingAdaptiveTier(): Promise<SamplingTier | null> {
  const raw = await AsyncStorage.getItem(PENDING_TIER_KEY);
  if (raw === "moving" || raw === "city" || raw === "idle") return raw;
  return null;
}

export async function clearPendingAdaptiveTier(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_TIER_KEY);
}

export function shouldPromptBatteryForRestarts(
  restartCountToday: number,
  lastRestartReason: TrackingRestartReason | null,
): boolean {
  if (restartCountToday > 2) return true;
  return lastRestartReason === "os_kill" || lastRestartReason === "watchdog";
}
