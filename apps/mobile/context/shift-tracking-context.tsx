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
import { formatKyivDateKey } from "@/lib/date";
import { t } from "@/lib/i18n";
import {
  ensureTrackingContinuity,
  flushPendingSamples,
  getTrackingRuntimeHealth,
  maintainBackgroundTracking,
  pauseLocationTrackingKeepBuffer,
  purgePendingSamples,
  resumeTrackingIfNeeded,
  startLocationTracking,
  stopLocationTracking,
  type TrackingMode,
} from "@/lib/location-tracking";
import {
  clearFlushBlockReason,
  getLastFlushBlockReason,
  isAuthRequired,
} from "@/lib/session-auth";
import {
  registerBackgroundTrackingWatchdog,
  unregisterBackgroundTrackingWatchdog,
} from "@/lib/location-tracking-watchdog";
import type { BatteryOptimizationStatus } from "@/lib/location-tracking-restart";
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
  backgroundPermission: string | null;
  batteryOptimizationStatus: BatteryOptimizationStatus;
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
  const [backgroundPermission, setBackgroundPermission] = useState<string | null>(null);
  const [batteryOptimizationStatus, setBatteryOptimizationStatus] =
    useState<BatteryOptimizationStatus>("unknown");
  const foregroundWarnedRef = useRef(false);
  const flushAlertShownRef = useRef(false);
  const staleAlertShownRef = useRef(false);
  const batteryUnknownAlertShownRef = useRef(false);

  const applyHealth = useCallback(
    (health: Awaited<ReturnType<typeof getTrackingRuntimeHealth>>) => {
      setTrackingMode(health.mode);
      setPendingSamples(health.pendingSamples);
      setLastFlushAt(health.lastFlushAt);
      setTrackingHealthy(health.healthy);
      setBackgroundTaskStarted(health.backgroundTaskStarted);
      setBackgroundPermission(health.backgroundPermission);
      setBatteryOptimizationStatus(health.batteryOptimizationStatus);
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
    const perms = await getTrackingPermissionStatus();
    if (perms.background !== "granted") return;

    const batteryRisky =
      health.batteryOptimizationStatus === "unknown" ||
      health.batteryOptimizationStatus === "restricted";

    // Warn on restricted/unknown battery policy even when the task looks alive —
    // OEM killers often report "started" while samples never arrive.
    if (batteryRisky && !batteryUnknownAlertShownRef.current) {
      batteryUnknownAlertShownRef.current = true;
      Alert.alert(
        t("gps.batteryTitle"),
        health.batteryOptimizationStatus === "unknown"
          ? t("gps.batteryUnknownHint")
          : t("gps.batteryHint"),
        [
          {
            text: t("gps.batteryOpen"),
            onPress: () => void openBatteryOptimizationSettings(),
          },
          { text: t("common.later"), style: "cancel" },
        ],
      );
      return;
    }

    if (health.backgroundTaskStarted) return;
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

      const todayKey = formatKyivDateKey();
      const shiftDateKey = shift?.date ? shift.date.slice(0, 10) : null;
      const isStaleActiveShift =
        !!shift && shift.status === "ACTIVE" && typeof shiftDateKey === "string" && shiftDateKey !== todayKey;

      if (isStaleActiveShift) {
        try {
          await stopLocationTracking();
          await purgePendingSamples();
          clearFlushBlockReason();
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
      // 401 session expiry: pause native GPS but KEEP buffer + shift id for post-login flush.
      // Voluntary logout: full stop (shift id cleared; buffer may still flush if token existed).
      if (isAuthRequired()) {
        void pauseLocationTrackingKeepBuffer().catch(() => undefined);
      } else {
        void stopLocationTracking().catch(() => undefined);
      }
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

  const startShift = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    flushAlertShownRef.current = false;
    staleAlertShownRef.current = false;
    clearFlushBlockReason();
    try {
      let plannedDistanceKm: number | null = null;
      const dateKey = formatKyivDateKey();
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

  const restartShiftAfterGpsBlock = useCallback(async () => {
    try {
      await stopLocationTracking();
      await purgePendingSamples();
      clearFlushBlockReason();
      if (activeShift && token) {
        await apiFetch(`/field/shifts/${activeShift.id}/end`, {
          method: "POST",
          token,
        });
      }
      setActiveShift(null);
      staleAlertShownRef.current = false;
      flushAlertShownRef.current = false;
      await startShift();
    } catch (e) {
      Alert.alert(t("common.error"), String(e));
    }
  }, [activeShift, token, startShift]);

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

      // ACTIVE + no accepted samples >10 min → CTA by last error (wrong_day vs 401).
      const blockReason = health.flushBlockReason ?? getLastFlushBlockReason();
      if (health.acceptStale === true && !staleAlertShownRef.current) {
        staleAlertShownRef.current = true;
        if (blockReason === "auth_401") {
          Alert.alert(t("gps.sessionExpiredTitle"), t("gps.sessionExpiredHint"), [
            { text: t("gps.loginAgain"), style: "default" },
          ]);
        } else if (blockReason === "wrong_day") {
          Alert.alert(t("gps.wrongDayTitle"), t("gps.wrongDayHint"), [
            {
              text: t("gps.restartShift"),
              onPress: () => void restartShiftAfterGpsBlock(),
            },
            { text: t("common.later"), style: "cancel" },
          ]);
        } else {
          Alert.alert(t("gps.staleGpsTitle"), t("gps.staleGpsHint"), [
            {
              text: t("gps.restartShift"),
              onPress: () => void restartShiftAfterGpsBlock(),
            },
            { text: t("common.later"), style: "cancel" },
          ]);
        }
      }
    };

    const id = setInterval(() => {
      void runWatchdog().catch(() => undefined);
    }, WATCHDOG_INTERVAL_MS);

    return () => clearInterval(id);
  }, [
    token,
    activeShift,
    syncTrackingHealth,
    maybePromptBatteryIfTaskDead,
    restartShiftAfterGpsBlock,
  ]);

  const endShift = useCallback(async () => {
    if (!token || !activeShift) return;
    setLoading(true);
    try {
      await stopLocationTracking();
      await purgePendingSamples();
      clearFlushBlockReason();
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
      backgroundPermission,
      batteryOptimizationStatus,
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
      backgroundPermission,
      batteryOptimizationStatus,
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
