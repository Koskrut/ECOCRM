import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAuth } from "@/context/auth-context";
import { useModules } from "@/context/modules-context";
import { useShiftTracking } from "@/context/shift-tracking-context";
import { apiFetch } from "@/lib/api";
import { formatLocalDateKey } from "@/lib/date";
import { onProcessedLocation } from "@/lib/location-tracking";
import {
  handleGeofenceLocationUpdate,
  resetGeofenceNotifications,
} from "@/lib/visit-geofence-watcher";
import type { VisitSummary } from "@/types/crm";

type VisitGeofenceCtx = {
  todayVisits: VisitSummary[];
  refreshVisits: () => Promise<void>;
};

const VisitGeofenceContext = createContext<VisitGeofenceCtx | null>(null);

export function VisitGeofenceProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const { visitsEnabled } = useModules();
  const { isTracking } = useShiftTracking();
  const [todayVisits, setTodayVisits] = useState<VisitSummary[]>([]);
  const visitsRef = useRef<VisitSummary[]>([]);
  const dateKey = formatLocalDateKey();

  const refreshVisits = useCallback(async () => {
    if (!token || !visitsEnabled) {
      setTodayVisits([]);
      visitsRef.current = [];
      return;
    }
    try {
      const res = await apiFetch<{ items: VisitSummary[] }>(
        `/visits/day?date=${encodeURIComponent(dateKey)}`,
        { token },
      );
      setTodayVisits(res.items);
      visitsRef.current = res.items;
    } catch {
      setTodayVisits([]);
      visitsRef.current = [];
    }
  }, [token, visitsEnabled, dateKey]);

  useEffect(() => {
    void refreshVisits();
  }, [refreshVisits]);

  useEffect(() => {
    void resetGeofenceNotifications(dateKey);
  }, [isTracking, dateKey]);

  useEffect(() => {
    if (!isTracking || !visitsEnabled) return;

    const unsubscribe = onProcessedLocation((result) => {
      void handleGeofenceLocationUpdate(result, visitsRef.current, dateKey);
    });

    const refreshId = setInterval(() => {
      void refreshVisits();
    }, 5 * 60_000);

    return () => {
      unsubscribe();
      clearInterval(refreshId);
    };
  }, [isTracking, visitsEnabled, dateKey, refreshVisits]);

  const value = useMemo(
    () => ({ todayVisits, refreshVisits }),
    [todayVisits, refreshVisits],
  );

  return (
    <VisitGeofenceContext.Provider value={value}>{children}</VisitGeofenceContext.Provider>
  );
}

export function useVisitGeofence(): VisitGeofenceCtx {
  const ctx = useContext(VisitGeofenceContext);
  if (!ctx) {
    throw new Error("useVisitGeofence must be inside VisitGeofenceProvider");
  }
  return ctx;
}
