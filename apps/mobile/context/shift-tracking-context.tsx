import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Alert } from "react-native";

import { useAuth } from "@/context/auth-context";
import { apiFetch } from "@/lib/api";
import { formatLocalDateKey } from "@/lib/date";
import {
  getTrackingState,
  resumeTrackingIfNeeded,
  startLocationTracking,
  stopLocationTracking,
  type TrackingMode,
} from "@/lib/location-tracking";
import type { FieldShift } from "@/types/crm";

type ShiftTrackingCtx = {
  activeShift: FieldShift | null;
  loading: boolean;
  trackingMode: TrackingMode;
  trackingEnabled: boolean;
  setTrackingEnabled: (v: boolean) => void;
  pendingSamples: number;
  lastFlushAt: string | null;
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

  const syncTrackingState = useCallback(async () => {
    const state = await getTrackingState();
    setTrackingMode(state.mode);
    setPendingSamples(state.pendingSamples);
    setLastFlushAt(state.lastFlushAt);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) {
      setActiveShift(null);
      setTrackingMode("none");
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{ shift: FieldShift | null }>("/field/shifts/active", { token });
      setActiveShift(res.shift);
      if (res.shift?.trackingEnabled !== undefined) {
        setTrackingEnabled(res.shift.trackingEnabled);
      }
      const mode = await resumeTrackingIfNeeded(res.shift);
      setTrackingMode(mode);
      await syncTrackingState();
    } catch {
      setActiveShift(null);
    } finally {
      setLoading(false);
    }
  }, [token, syncTrackingState]);

  useEffect(() => {
    if (!ready) return;
    void refresh();
  }, [ready, refresh]);

  useEffect(() => {
    if (!token) {
      void stopLocationTracking();
      setActiveShift(null);
      setTrackingMode("none");
    }
  }, [token]);

  useEffect(() => {
    if (!token || trackingMode === "none") return;
    const id = setInterval(() => {
      void syncTrackingState();
    }, 15_000);
    return () => clearInterval(id);
  }, [token, trackingMode, syncTrackingState]);

  const startShift = useCallback(async () => {
    if (!token) return;
    setLoading(true);
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
        if (mode === "foreground") {
          Alert.alert(
            "Геолокація",
            "Фоновий доступ не надано — трек працює лише поки застосунок відкритий.",
          );
        } else if (mode === "none") {
          Alert.alert("Геолокація", "Дозвіл не надано — трек не збирається.");
        }
      } else {
        setTrackingMode("none");
      }
      await syncTrackingState();
    } catch (e) {
      Alert.alert("Помилка", String(e));
    } finally {
      setLoading(false);
    }
  }, [token, trackingEnabled, syncTrackingState]);

  const endShift = useCallback(async () => {
    if (!token || !activeShift) return;
    setLoading(true);
    try {
      await stopLocationTracking();
      await apiFetch(`/field/shifts/${activeShift.id}/end`, { method: "POST", token });
      setActiveShift(null);
      setTrackingMode("none");
      await syncTrackingState();
    } catch (e) {
      Alert.alert("Помилка", String(e));
    } finally {
      setLoading(false);
    }
  }, [token, activeShift, syncTrackingState]);

  const isTracking = trackingMode !== "none" && activeShift?.status === "ACTIVE";

  const value = useMemo<ShiftTrackingCtx>(
    () => ({
      activeShift,
      loading,
      trackingMode,
      trackingEnabled,
      setTrackingEnabled,
      pendingSamples,
      lastFlushAt,
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
