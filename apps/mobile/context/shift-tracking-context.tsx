import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, AppState, InteractionManager, type AppStateStatus } from "react-native";

import { useAuth } from "@/context/auth-context";
import { apiFetch } from "@/lib/api";
import { formatLocalDateKey } from "@/lib/date";
import { t } from "@/lib/i18n";
import {
  ensureTrackingContinuity,
  flushPendingSamples,
  getTrackingRuntimeHealth,
  maintainBackgroundTracking,
  resumeTrackingIfNeeded,
  startLocationTracking,
  stopLocationTracking,
  type TrackingMode,
} from "@/lib/location-tracking";
import {
  registerBackgroundTrackingWatchdog,
  unregisterBackgroundTrackingWatchdog,
} from "@/lib/location-tracking-watchdog";
import {
  getTrackingPermissionStatus,
  isAndroid,
  openBatteryOptimizationSettings,
  openLocationPermissionSettings,
} from "@/lib/location-permissions";
import { shouldPromptBatteryForRestarts } from "@/lib/location-tracking-restart";
import type { FieldShift } from "@/types/crm";

const WATCHDOG_INTERVAL_MS = 2 * 60 * 1000;
const FLUSH_STALE_MS = 3 * 60 * 1000;

type ShiftTrackingCtx = {
  activeShift: FieldShift | null;
  loading: boolean;
  trackingMode: TrackingMode;
  trackingEnabled: boolean;
  setTrackingEnabled: (v: boolean) => void;
  pendingSamples: number;
  lastFlushAt: string | null;
  trackingHealthy: boolean;
  backgroundTaskStarted: boolean;
  refresh: () => Promise<void>;
  startShift: () => Promise<void>;
  endShift: () => Promise<void>;
  isTracking: boolean;
};

const ShiftTrackingContext = createContext<ShiftTrackingCtx | null>(null);

export function ShiftTrackingProvider({ children }: { children: React.ReactNode }) {
  const { token, ready } = useAuth();
  const [activeShift, setActiveShift] = useState<FieldShift | null>(null);
  const [loading, setLoading] = useState(false);
  const [trackingMode, setTrackingMode] = useState<TrackingMode>("none");
  const [trackingEnabled, setTrackingEnabled] = useState(true);
  const [pendingSamples, setPendingSamples] = useState(0);
  const [lastFlushAt, setLastFlushAt] = useState<string | null>(null);
  const [trackingHealthy, setTrackingHealthy] = useState(true);
  const [backgroundTaskStarted, setBackgroundTaskStarted] = useState(false);
  const foregroundWarnedRef = useRef(false);
  const flushAlertShownRef = useRef(false);

  const applyHealth = useCallback(
    (health: Awaited<ReturnType<typeof getTrackingRuntimeHealth>>) => {
      setTrackingMode(health.mode);
      setPendingSamples(health.pendingSamples);
      setLastFlushAt(health.lastFlushAt);
      setTrackingHealthy(health.healthy);
      setBackgroundTaskStarted(health.backgroundTaskStarted);
      return health;
    },
    [],
  );

  const syncTrackingHealth = useCallback(async () => {
    const health = await getTrackingRuntimeHealth();
    return applyHealth(health);
  }, [applyHealth]);

  const promptOpenSettings = useCallback((message: string) => {
    Alert.alert(t("gps.title"), message, [
      { text: t("gps.openSettings"), onPress: () => void openLocationPermissionSettings() },
      { text: t("common.later"), style: "cancel" },
    ]);
  }, []);

  const maybePromptBatteryOptimization = useCallback(async () => {
    if (!isAndroid()) return;

    const health = await getTrackingRuntimeHealth();
    if (health.backgroundTaskStarted) return;

    const perms = await getTrackingPermissionStatus();
    if (perms.background !== "granted") return;

    if (
      !shouldPromptBatteryForRestarts(
        health.restartCountToday,
        health.lastRestartReason,
      )
    ) {
      return;
    }

    Alert.alert(t("gps.batteryTitle"), t("gps.batteryHint"), [
      {
        text: t("gps.batteryOpen"),
        onPress: () => void openBatteryOptimizationSettings(),
      },
      { text: t("common.later"), style: "cancel" },
    ]);
  }, []);

  const maybePromptBatteryIfTaskDead = useCallback(async () => {
    if (!isAndroid()) return;
    const health = await getTrackingRuntimeHealth();
    if (health.backgroundTaskStarted) return;

    const perms = await getTrackingPermissionStatus();
    if (perms.background !== "granted") return;

    if (
      !shouldPromptBatteryForRestarts(
        health.restartCountToday,
        health.lastRestartReason,
      )
    ) {
      return;
    }

    Alert.alert(t("gps.batteryTitle"), t("gps.batteryHint"), [
      {
        text: t("gps.batteryOpen"),
        onPress: () => void openBatteryOptimizationSettings(),
      },
      { text: t("common.later"), style: "cancel" },
    ]);
  }, []);

  const alertBackgroundTaskStatus = useCallback((started: boolean) => {
    if (started) return;
    Alert.alert(t("gps.taskFailedTitle"), t("gps.taskFailedHint"), [
      { text: t("gps.openSettings"), onPress: () => void openLocationPermissionSettings() },
      { text: t("common.later"), style: "cancel" },
    ]);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) {
      setActiveShift(null);
      setTrackingMode("none");
      setTrackingHealthy(true);
      setBackgroundTaskStarted(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{ shift: FieldShift | null }>("/field/shifts/active", { token });
      let shift = res.shift;

      const todayKey = formatLocalDateKey();
      const shiftDateKey = shift?.date ? shift.date.slice(0, 10) : null;
      const isStaleActiveShift =
        !!shift && shift.status === "ACTIVE" && typeof shiftDateKey === "string" && shiftDateKey !== todayKey;

      if (isStaleActiveShift) {
        try {
          await stopLocationTracking();
          await apiFetch(`/field/shifts/${shift!.id}/end`, { method: "POST", token });
          Alert.alert(t("common.done"), t("today.staleShiftAutoEnded"));
        } catch {
          // If closing fails, backend will still close via cron / next refresh.
        }
        shift = null;
        setTrackingMode("none");
        setTrackingHealthy(true);
        setBackgroundTaskStarted(false);
      }

      setActiveShift(shift);
      if (shift?.trackingEnabled !== undefined) {
        setTrackingEnabled(shift.trackingEnabled);
      }
      const mode = await resumeTrackingIfNeeded(shift);
      setTrackingMode(mode);
      if (mode === "background") {
        void registerBackgroundTrackingWatchdog();
      }
      if (mode === "foreground" && !foregroundWarnedRef.current) {
        foregroundWarnedRef.current = true;
        promptOpenSettings(t("gps.foregroundOnlyHint"));
      }
      await syncTrackingHealth();
    } catch {
      setActiveShift(null);
      setTrackingMode("none");
      setTrackingHealthy(true);
      setBackgroundTaskStarted(false);
    } finally {
      setLoading(false);
    }
  }, [token, syncTrackingHealth, promptOpenSettings]);

  useEffect(() => {
    if (!ready || !token) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const handle = InteractionManager.runAfterInteractions(() => {
      timeoutId = setTimeout(() => {
        if (!cancelled) void refresh();
      }, 500);
    });

    return () => {
      cancelled = true;
      handle.cancel();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [ready, token, refresh]);

  useEffect(() => {
    if (!token) {
      void stopLocationTracking().catch(() => undefined);
      setActiveShift(null);
      setTrackingMode("none");
      setTrackingHealthy(true);
      setBackgroundTaskStarted(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token || trackingMode === "none") return;
    const id = setInterval(() => {
      void syncTrackingHealth();
    }, 15_000);
    return () => clearInterval(id);
  }, [token, trackingMode, syncTrackingHealth]);

  useEffect(() => {
    if (!token || !activeShift || activeShift.status !== "ACTIVE" || !activeShift.trackingEnabled) {
      return;
    }

    const onAppState = (state: AppStateStatus) => {
      if (state === "active") {
        void ensureTrackingContinuity()
          .then(async (mode) => {
            setTrackingMode(mode);
            if (mode === "foreground" && !foregroundWarnedRef.current) {
              foregroundWarnedRef.current = true;
              promptOpenSettings(t("gps.foregroundOnlyHint"));
            }
            const health = await syncTrackingHealth();
            if (!health.healthy) {
              void maybePromptBatteryIfTaskDead();
            }
          })
          .catch(() => undefined);
        return;
      }
      if (state === "background") {
        void maintainBackgroundTracking()
          .then((mode) => {
            setTrackingMode(mode);
            return syncTrackingHealth();
          })
          .catch(() => undefined);
        return;
      }
      if (state === "inactive") {
        void syncTrackingHealth().catch(() => undefined);
      }
    };

    const sub = AppState.addEventListener("change", onAppState);
    return () => sub.remove();
  }, [
    token,
    activeShift,
    syncTrackingHealth,
    promptOpenSettings,
    maybePromptBatteryIfTaskDead,
  ]);

  useEffect(() => {
    if (!token || !activeShift || activeShift.status !== "ACTIVE" || !activeShift.trackingEnabled) {
      return;
    }

    const runWatchdog = async () => {
      if (AppState.currentState !== "active") return;

      const health = await syncTrackingHealth();

      if (!health.healthy && health.claimedMode !== "none") {
        const mode = await ensureTrackingContinuity();
        setTrackingMode(mode);
        await syncTrackingHealth();
        if (health.claimedMode === "background") {
          void maybePromptBatteryIfTaskDead();
        }
      }

      const flushStale =
        health.pendingSamples > 0 &&
        (!health.lastFlushAt ||
          Date.now() - new Date(health.lastFlushAt).getTime() > FLUSH_STALE_MS);

      if (flushStale && !flushAlertShownRef.current) {
        flushAlertShownRef.current = true;
        try {
          await flushPendingSamples();
          await syncTrackingHealth();
        } catch {
          /* retry next watchdog tick */
        }
        Alert.alert(t("gps.flushRetryTitle"), t("gps.flushRetryHint"), [
          { text: t("common.ok"), style: "default" },
        ]);
      }
    };

    const id = setInterval(() => {
      void runWatchdog().catch(() => undefined);
    }, WATCHDOG_INTERVAL_MS);

    return () => clearInterval(id);
  }, [token, activeShift, syncTrackingHealth, maybePromptBatteryIfTaskDead]);

  const startShift = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    flushAlertShownRef.current = false;
    try {
      let plannedDistanceKm: number | null = null;
      const dateKey = formatLocalDateKey();
      try {
        const m = await apiFetch<{ distanceKm: number | null }>(
          `/route-plans/metrics?date=${encodeURIComponent(dateKey)}`,
          { token },
        );
        if (m.distanceKm != null && Number.isFinite(m.distanceKm)) {
          plannedDistanceKm = m.distanceKm;
        }
      } catch {
        /* optional */
      }

      const res = await apiFetch<{ shift: FieldShift }>("/field/shifts/start", {
        method: "POST",
        token,
        body: JSON.stringify({ plannedDistanceKm, trackingEnabled }),
      });
      setActiveShift(res.shift);

      if (trackingEnabled) {
        const mode = await startLocationTracking(res.shift.id);
        setTrackingMode(mode);
        const health = await syncTrackingHealth();

        if (mode === "foreground") {
          foregroundWarnedRef.current = true;
          promptOpenSettings(t("gps.foregroundOnlyHint"));
        } else if (mode === "none") {
          Alert.alert(t("gps.title"), t("gps.noneHint"), [
            { text: t("gps.openSettings"), onPress: () => void openLocationPermissionSettings() },
            { text: t("common.later"), style: "cancel" },
          ]);
        } else if (mode === "background") {
          alertBackgroundTaskStatus(health.backgroundTaskStarted);
          await maybePromptBatteryOptimization();
          void registerBackgroundTrackingWatchdog();
        }
      } else {
        setTrackingMode("none");
      }
      await syncTrackingHealth();
    } catch (e) {
      Alert.alert(t("common.error"), String(e));
    } finally {
      setLoading(false);
    }
  }, [
    token,
    trackingEnabled,
    syncTrackingHealth,
    promptOpenSettings,
    maybePromptBatteryOptimization,
    alertBackgroundTaskStatus,
  ]);

  const endShift = useCallback(async () => {
    if (!token || !activeShift) return;
    setLoading(true);
    try {
      await stopLocationTracking();
      await unregisterBackgroundTrackingWatchdog();
      await apiFetch(`/field/shifts/${activeShift.id}/end`, { method: "POST", token });
      setActiveShift(null);
      setTrackingMode("none");
      setTrackingHealthy(true);
      setBackgroundTaskStarted(false);
      await syncTrackingHealth();
    } catch (e) {
      Alert.alert(t("common.error"), String(e));
    } finally {
      setLoading(false);
    }
  }, [token, activeShift, syncTrackingHealth]);

  const isTracking =
    trackingMode !== "none" && activeShift?.status === "ACTIVE" && trackingHealthy;

  const value = useMemo<ShiftTrackingCtx>(
    () => ({
      activeShift,
      loading,
      trackingMode,
      trackingEnabled,
      setTrackingEnabled,
      pendingSamples,
      lastFlushAt,
      trackingHealthy,
      backgroundTaskStarted,
      refresh,
      startShift,
      endShift,
      isTracking,
    }),
    [
      activeShift,
      loading,
      trackingMode,
      trackingEnabled,
      pendingSamples,
      lastFlushAt,
      trackingHealthy,
      backgroundTaskStarted,
      refresh,
      startShift,
      endShift,
      isTracking,
    ],
  );

  return <ShiftTrackingContext.Provider value={value}>{children}</ShiftTrackingContext.Provider>;
}

export function useShiftTracking(): ShiftTrackingCtx {
  const ctx = useContext(ShiftTrackingContext);
  if (!ctx) {
    throw new Error("useShiftTracking must be inside ShiftTrackingProvider");
  }
  return ctx;
}
