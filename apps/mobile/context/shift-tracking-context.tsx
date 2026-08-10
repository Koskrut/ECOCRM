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
  captureImmediateFixAndFlush,
  ensureTrackingContinuity,
  flushPendingSamples,
  getPendingCount,
  getTrackingRuntimeHealth,
  maintainBackgroundTracking,
  pauseLocationTrackingKeepBuffer,
  purgePendingSamples,
  recoverDeadBackgroundTaskOnForeground,
  restartTrackingPipeline,
  resumeTrackingIfNeeded,
  startLocationTracking,
  stopLocationTracking,
  type TrackingMode,
} from "@/lib/location-tracking";
import { bootstrapShiftTrackingContext } from "@/lib/location-shift-bootstrap";
import { sendTrackingRestartEvent } from "@/lib/tracking-telemetry";
import {
  clearFlushBlockReason,
  getLastFlushBlockReason,
  hydrateSessionAuthFromStorage,
  isAuthRequired,
} from "@/lib/session-auth";
import {
  canStartLocationForegroundService,
  shouldPromptBatteryForRestarts,
  type BatteryOptimizationStatus,
} from "@/lib/location-tracking-restart";
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
import {
  resolveTrackingUnhealthyReason,
  type TrackingUnhealthyReason,
} from "@/lib/location-tracking-health";
import {
  canRunShiftOperation,
  shouldReuseActiveShift,
} from "@/lib/shift-ops-gate";
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
  lastAcceptedAt: string | null;
  trackingHealthy: boolean;
  /** No successful GPS accept (created>0 / keepalive) for >10 min. */
  acceptStale: boolean;
  pointStale: boolean;
  zombieFgs: boolean;
  recoveryState: string | null;
  /** Mapped CTA reason — never conflates unrestricted battery with dead task. */
  unhealthyReason: TrackingUnhealthyReason;
  flushBlockReason: string | null;
  backgroundTaskStarted: boolean;
  foregroundWatchActive: boolean;
  backgroundPermission: string | null;
  batteryOptimizationStatus: BatteryOptimizationStatus;
  /** Show battery hint only after a failed foreground restart attempt. */
  showBatteryHint: boolean;
  refresh: () => Promise<void>;
  startShift: () => Promise<void>;
  endShift: () => Promise<void>;
  restartShift: () => Promise<void>;
  restartTracking: () => Promise<void>;
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
  const [lastAcceptedAt, setLastAcceptedAt] = useState<string | null>(null);
  const [trackingHealthy, setTrackingHealthy] = useState(true);
  const [acceptStale, setAcceptStale] = useState(false);
  const [pointStale, setPointStale] = useState(false);
  const [zombieFgs, setZombieFgs] = useState(false);
  const [recoveryState, setRecoveryState] = useState<string | null>(null);
  const [flushBlockReason, setFlushBlockReason] = useState<string | null>(null);
  const [backgroundTaskStarted, setBackgroundTaskStarted] = useState(false);
  const [foregroundWatchActive, setForegroundWatchActive] = useState(false);
  const [backgroundPermission, setBackgroundPermission] = useState<string | null>(null);
  const [batteryOptimizationStatus, setBatteryOptimizationStatus] =
    useState<BatteryOptimizationStatus>("unknown");
  const [showBatteryHint, setShowBatteryHint] = useState(false);
  const [fgsRestartBlocked, setFgsRestartBlocked] = useState(false);
  const foregroundWarnedRef = useRef(false);
  const flushAlertShownRef = useRef(false);
  const staleAlertShownRef = useRef(false);
  const batteryUnknownAlertShownRef = useRef(false);
  const watchdogTelemetrySentRef = useRef(false);
  /** Blocks overlapping start/end/restart (Smoke thrash: 3 shifts / 2 min). */
  const opInFlightRef = useRef(false);

  const beginShiftOp = useCallback((): boolean => {
    if (!canRunShiftOperation(opInFlightRef.current)) return false;
    opInFlightRef.current = true;
    setLoading(true);
    return true;
  }, []);

  const endShiftOp = useCallback(() => {
    opInFlightRef.current = false;
    setLoading(false);
  }, []);

  const applyHealth = useCallback(
    (health: Awaited<ReturnType<typeof getTrackingRuntimeHealth>>) => {
      setTrackingMode(health.mode);
      setPendingSamples(health.pendingSamples);
      setLastFlushAt(health.lastFlushAt);
      setLastAcceptedAt(health.lastAcceptedAt ?? null);
      setTrackingHealthy(health.healthy);
      setAcceptStale(health.acceptStale === true);
      setPointStale(health.pointStale === true);
      setZombieFgs(health.zombieFgs === true);
      setRecoveryState(health.recoveryState ?? null);
      setFlushBlockReason(health.flushBlockReason ?? null);
      setBackgroundTaskStarted(health.backgroundTaskStarted);
      setForegroundWatchActive(health.foregroundWatchActive);
      setBackgroundPermission(health.backgroundPermission);
      setBatteryOptimizationStatus(health.batteryOptimizationStatus);
      return health;
    },
    [],
  );

  const unhealthyReason = useMemo(
    () =>
      resolveTrackingUnhealthyReason({
        healthy: trackingHealthy,
        claimedMode: trackingMode,
        backgroundTaskStarted,
        foregroundWatchActive,
        acceptStale,
        pointStale,
        zombieFgs,
        backgroundPermission,
        flushBlockReason,
        fgsRestartBlocked,
      }),
    [
      trackingHealthy,
      trackingMode,
      backgroundTaskStarted,
      foregroundWatchActive,
      acceptStale,
      pointStale,
      zombieFgs,
      backgroundPermission,
      flushBlockReason,
      fgsRestartBlocked,
    ],
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

  const maybePromptBatteryAfterFailedRestart = useCallback(async () => {
    if (!isAndroid()) return;

    const health = await getTrackingRuntimeHealth();
    const perms = await getTrackingPermissionStatus();
    if (perms.background !== "granted") return;
    if (health.backgroundTaskStarted) return;

    if (health.batteryOptimizationStatus === "unrestricted") return;
    if (
      health.batteryOptimizationStatus !== "restricted" &&
      health.batteryOptimizationStatus !== "unknown"
    ) {
      return;
    }
    if (
      !shouldPromptBatteryForRestarts(
        health.restartCountToday,
        health.lastRestartReason,
      )
    ) {
      return;
    }

    setShowBatteryHint(true);
    if (batteryUnknownAlertShownRef.current) return;
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
  }, []);

  /**
   * Dead background task while app is foreground: force-restart + immediate fix.
   * Battery prompt only if still dead after that AND restricted/unknown (never unrestricted).
   */
  const recoverDeadBackgroundTask = useCallback(async () => {
    if (AppState.currentState !== "active") return;

    let health = await getTrackingRuntimeHealth();
    if (health.claimedMode !== "background") return;
    // Also recover Expo #47595 zombie: task "started" but accept/point stale.
    if (health.backgroundTaskStarted && !health.acceptStale && !health.zombieFgs) return;

    const perms = await getTrackingPermissionStatus();
    if (perms.background !== "granted") return;

    const mode = await recoverDeadBackgroundTaskOnForeground();
    setTrackingMode(mode);
    health = await syncTrackingHealth();
    if (health.healthy && health.backgroundTaskStarted) {
      setShowBatteryHint(false);
      return;
    }

    await maybePromptBatteryAfterFailedRestart();
  }, [syncTrackingHealth, maybePromptBatteryAfterFailedRestart]);

  const alertBackgroundTaskStatus = useCallback((started: boolean) => {
    if (started) return;
    Alert.alert(t("gps.backgroundTaskDeadTitle"), t("gps.backgroundTaskDeadHint"), [
      {
        text: t("gps.restartTracking"),
        onPress: () => {
          void restartTrackingPipeline()
            .then(async (result) => {
              setTrackingMode(result.mode);
              await syncTrackingHealth();
              if (!result.ok) {
                if (result.errorCode === "app_not_active") {
                  Alert.alert(t("gps.openAppFirstTitle"), t("gps.openAppFirstHint"));
                } else {
                  Alert.alert(t("gps.restartFailedTitle"), t("gps.restartFailedHint"));
                }
              }
            })
            .catch(() => undefined);
        },
      },
      { text: t("common.later"), style: "cancel" },
    ]);
  }, [syncTrackingHealth]);

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
    void hydrateSessionAuthFromStorage();
  }, []);

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
        void (async () => {
          try {
            const before = await getTrackingRuntimeHealth();
            if (before.claimedMode === "background" || before.mode === "background") {
              // Always force-recover on foreground (dead FGS + poison #47595 + flush).
              const mode = await recoverDeadBackgroundTaskOnForeground();
              setTrackingMode(mode);
              await syncTrackingHealth();
            } else {
              const mode = await ensureTrackingContinuity();
              setTrackingMode(mode);
              if (mode === "foreground" && !foregroundWarnedRef.current) {
                foregroundWarnedRef.current = true;
                promptOpenSettings(t("gps.foregroundOnlyHint"));
              }
              await syncTrackingHealth();
            }
          } catch {
            /* best-effort */
          }
        })();
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
    recoverDeadBackgroundTask,
  ]);

  const startShift = useCallback(async () => {
    if (!token) return;
    if (!beginShiftOp()) return;
    flushAlertShownRef.current = false;
    staleAlertShownRef.current = false;
    clearFlushBlockReason();
    try {
      if (trackingEnabled) {
        if (!canStartLocationForegroundService(AppState.currentState)) {
          Alert.alert(t("gps.openAppFirstTitle"), t("gps.openAppFirstHint"));
          return;
        }
        const perms = await getTrackingPermissionStatus();
        if (perms.foreground !== "granted") {
          Alert.alert(t("gps.title"), t("gps.noneHint"), [
            { text: t("gps.openSettings"), onPress: () => void openLocationPermissionSettings() },
            { text: t("common.later"), style: "cancel" },
          ]);
          return;
        }
        if (perms.background !== "granted") {
          Alert.alert(t("gps.backgroundRequiredTitle"), t("gps.backgroundRequiredHint"), [
            { text: t("gps.openSettings"), onPress: () => void openLocationPermissionSettings() },
            { text: t("common.later"), style: "cancel" },
          ]);
          return;
        }
      }

      // Reuse today's ACTIVE instead of stacking empty shifts (backend also idempotent).
      if (shouldReuseActiveShift(activeShift?.status)) {
        if (trackingEnabled && activeShift) {
          const boot = await bootstrapShiftTrackingContext(activeShift.id);
          if (!boot.ok) {
            Alert.alert(
              t("common.error"),
              boot.reason === "no_token"
                ? t("gps.bootstrapFailedNoToken")
                : t("gps.bootstrapFailedNoShift"),
            );
            return;
          }
          const mode = await startLocationTracking(activeShift.id);
          setTrackingMode(mode);
          await flushPendingSamples(activeShift.id);
          await captureImmediateFixAndFlush();
          await syncTrackingHealth();
          if (mode === "none") {
            Alert.alert(t("gps.backgroundRequiredTitle"), t("gps.backgroundRequiredHint"), [
              { text: t("gps.openSettings"), onPress: () => void openLocationPermissionSettings() },
              { text: t("common.later"), style: "cancel" },
            ]);
          } else if (mode === "background") {
            void registerBackgroundTrackingWatchdog();
          }
        }
        return;
      }

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
        const boot = await bootstrapShiftTrackingContext(res.shift.id);
        if (!boot.ok) {
          Alert.alert(
            t("common.error"),
            boot.reason === "no_token"
              ? t("gps.bootstrapFailedNoToken")
              : t("gps.bootstrapFailedNoShift"),
          );
          return;
        }
        const mode = await startLocationTracking(res.shift.id);
        setTrackingMode(mode);
        await flushPendingSamples(res.shift.id);
        await captureImmediateFixAndFlush();
        const health = await syncTrackingHealth();

        if (mode === "none") {
          Alert.alert(t("gps.backgroundRequiredTitle"), t("gps.backgroundRequiredHint"), [
            { text: t("gps.openSettings"), onPress: () => void openLocationPermissionSettings() },
            { text: t("common.later"), style: "cancel" },
          ]);
        } else if (mode === "background") {
          alertBackgroundTaskStatus(health.backgroundTaskStarted);
          void registerBackgroundTrackingWatchdog();
        }
      } else {
        setTrackingMode("none");
      }
      await syncTrackingHealth();
    } catch (e) {
      Alert.alert(t("common.error"), String(e));
    } finally {
      endShiftOp();
    }
  }, [
    token,
    activeShift,
    trackingEnabled,
    syncTrackingHealth,
    alertBackgroundTaskStatus,
    beginShiftOp,
    endShiftOp,
  ]);

  const restartTracking = useCallback(async () => {
    if (AppState.currentState !== "active") {
      setFgsRestartBlocked(true);
      Alert.alert(t("gps.openAppFirstTitle"), t("gps.openAppFirstHint"));
      return;
    }
    if (!beginShiftOp()) return;
    setFgsRestartBlocked(false);
    try {
      staleAlertShownRef.current = false;
      const result = await restartTrackingPipeline();
      // Preserve claimed mode on app_not_active — never force UI to "none".
      if (result.errorCode !== "app_not_active") {
        setTrackingMode(result.mode);
      }
      const health = await syncTrackingHealth();
      if (result.ok && health.backgroundTaskStarted && result.mode === "background") {
        setShowBatteryHint(false);
        return;
      }
      if (result.errorCode === "app_not_active") {
        setFgsRestartBlocked(true);
        Alert.alert(t("gps.openAppFirstTitle"), t("gps.openAppFirstHint"));
        return;
      }
      await maybePromptBatteryAfterFailedRestart();
      Alert.alert(t("gps.restartFailedTitle"), t("gps.restartFailedForceCloseHint"));
    } catch (e) {
      Alert.alert(t("common.error"), String(e));
    } finally {
      endShiftOp();
    }
  }, [syncTrackingHealth, maybePromptBatteryAfterFailedRestart, beginShiftOp, endShiftOp]);

  const runRestartShiftConfirmed = useCallback(async () => {
    if (!token) return;
    if (!canStartLocationForegroundService(AppState.currentState)) {
      Alert.alert(t("gps.openAppFirstTitle"), t("gps.openAppFirstHint"));
      return;
    }
    if (!beginShiftOp()) return;
    try {
      const prev = activeShift;
      await stopLocationTracking();
      await purgePendingSamples();
      clearFlushBlockReason();
      if (prev) {
        await apiFetch(`/field/shifts/${prev.id}/end`, {
          method: "POST",
          token,
        });
      }
      setActiveShift(null);
      setTrackingMode("none");
      staleAlertShownRef.current = false;
      flushAlertShownRef.current = false;
      // Explicit end+start — do not reuse the ended shift id.
      const dateKey = formatKyivDateKey();
      let plannedDistanceKm: number | null = null;
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
        body: JSON.stringify({
          plannedDistanceKm,
          trackingEnabled: prev?.trackingEnabled ?? trackingEnabled,
        }),
      });
      setActiveShift(res.shift);
      if (res.shift.trackingEnabled) {
        const boot = await bootstrapShiftTrackingContext(res.shift.id);
        if (!boot.ok) {
          Alert.alert(
            t("common.error"),
            boot.reason === "no_token"
              ? t("gps.bootstrapFailedNoToken")
              : t("gps.bootstrapFailedNoShift"),
          );
          return;
        }
        const mode = await startLocationTracking(res.shift.id);
        setTrackingMode(mode);
        await flushPendingSamples(res.shift.id);
        await captureImmediateFixAndFlush();
        await syncTrackingHealth();
        if (mode === "none") {
          Alert.alert(t("gps.backgroundRequiredTitle"), t("gps.backgroundRequiredHint"), [
            { text: t("gps.openSettings"), onPress: () => void openLocationPermissionSettings() },
            { text: t("common.later"), style: "cancel" },
          ]);
        } else if (mode === "background") {
          void registerBackgroundTrackingWatchdog();
        }
      }
    } catch (e) {
      Alert.alert(t("common.error"), String(e));
    } finally {
      endShiftOp();
    }
  }, [activeShift, token, trackingEnabled, syncTrackingHealth, beginShiftOp, endShiftOp]);

  /** End+start only after explicit confirm — never primary GPS recovery. */
  const restartShiftAfterGpsBlock = useCallback(async () => {
    if (!canStartLocationForegroundService(AppState.currentState)) {
      Alert.alert(t("gps.openAppFirstTitle"), t("gps.openAppFirstHint"));
      return;
    }
    if (opInFlightRef.current) return;
    Alert.alert(t("gps.restartShiftConfirmTitle"), t("gps.restartShiftConfirmHint"), [
      {
        text: t("gps.closeAndReopenShift"),
        style: "destructive",
        onPress: () => void runRestartShiftConfirmed(),
      },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }, [runRestartShiftConfirmed]);

  useEffect(() => {
    if (!token || !activeShift || activeShift.status !== "ACTIVE" || !activeShift.trackingEnabled) {
      return;
    }

    const runWatchdog = async () => {
      if (AppState.currentState !== "active") return;

      const health = await syncTrackingHealth();

      // Dead / poison background task → forceRestart before any battery blame.
      if (
        health.claimedMode === "background" &&
        (!health.backgroundTaskStarted || health.acceptStale)
      ) {
        await recoverDeadBackgroundTask();
      } else if (!health.healthy && health.claimedMode !== "none") {
        const mode = await ensureTrackingContinuity();
        setTrackingMode(mode);
        if (health.acceptStale && activeShift?.id && !watchdogTelemetrySentRef.current) {
          watchdogTelemetrySentRef.current = true;
          void sendTrackingRestartEvent(activeShift.id, "watchdog");
        }
        if (health.acceptStale) {
          // ACTIVE + 0 accepts: poke native pipeline + one foreground fix.
          void captureImmediateFixAndFlush().catch(() => undefined);
        }
        await syncTrackingHealth();
      } else if (health.healthy) {
        watchdogTelemetrySentRef.current = false;
      }

      const after = await getTrackingRuntimeHealth();
      applyHealth(after);

      const flushStale =
        after.pendingSamples > 0 &&
        (!after.lastFlushAt ||
          Date.now() - new Date(after.lastFlushAt).getTime() > FLUSH_STALE_MS);

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

      // ACTIVE + no accepted samples >10 min → CTA (banner is persistent; alert once).
      const blockReason = after.flushBlockReason ?? getLastFlushBlockReason();
      if (after.acceptStale === true && !staleAlertShownRef.current) {
        staleAlertShownRef.current = true;
        if (blockReason === "auth_401") {
          Alert.alert(t("gps.sessionExpiredTitle"), t("gps.sessionExpiredHint"), [
            { text: t("gps.loginAgain"), style: "default" },
          ]);
        } else if (blockReason === "wrong_day") {
          Alert.alert(t("gps.wrongDayTitle"), t("gps.wrongDayHint"), [
            {
              text: t("gps.closeAndReopenShift"),
              onPress: () => void restartShiftAfterGpsBlock(),
            },
            { text: t("common.later"), style: "cancel" },
          ]);
        } else {
          // Primary recovery = restart tracking only (end+start thrash creates empty shifts).
          Alert.alert(t("gps.gpsNotWriting"), t("gps.gpsNotWritingHint"), [
            {
              text: t("gps.restartTracking"),
              onPress: () => void restartTracking(),
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
    applyHealth,
    recoverDeadBackgroundTask,
    restartShiftAfterGpsBlock,
    restartTracking,
  ]);

  const endShift = useCallback(async () => {
    if (!token || !activeShift) return;
    if (!beginShiftOp()) return;
    try {
      // Flush tail BEFORE ending: server rejects samples for ENDED shifts.
      await stopLocationTracking();
      if ((await getPendingCount()) > 0) {
        await flushPendingSamples(activeShift.id).catch(() => undefined);
      }
      await apiFetch(`/field/shifts/${activeShift.id}/end`, { method: "POST", token });
      // Purge only after the shift is ended for real — a failed end keeps the buffer.
      await purgePendingSamples();
      clearFlushBlockReason();
      await unregisterBackgroundTrackingWatchdog();
      setActiveShift(null);
      setTrackingMode("none");
      setTrackingHealthy(true);
      setAcceptStale(false);
      setBackgroundTaskStarted(false);
      await syncTrackingHealth();
    } catch (e) {
      Alert.alert(t("common.error"), String(e));
    } finally {
      endShiftOp();
    }
  }, [token, activeShift, syncTrackingHealth, beginShiftOp, endShiftOp]);

  const restartShift = restartShiftAfterGpsBlock;

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
      lastAcceptedAt,
      trackingHealthy,
      acceptStale,
      pointStale,
      zombieFgs,
      recoveryState,
      unhealthyReason,
      flushBlockReason,
      backgroundTaskStarted,
      foregroundWatchActive,
      backgroundPermission,
      batteryOptimizationStatus,
      showBatteryHint,
      refresh,
      startShift,
      endShift,
      restartShift,
      restartTracking,
      isTracking,
    }),
    [
      activeShift,
      loading,
      trackingMode,
      trackingEnabled,
      pendingSamples,
      lastFlushAt,
      lastAcceptedAt,
      trackingHealthy,
      acceptStale,
      pointStale,
      zombieFgs,
      recoveryState,
      unhealthyReason,
      flushBlockReason,
      backgroundTaskStarted,
      foregroundWatchActive,
      backgroundPermission,
      batteryOptimizationStatus,
      showBatteryHint,
      refresh,
      startShift,
      endShift,
      restartShift,
      restartTracking,
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
