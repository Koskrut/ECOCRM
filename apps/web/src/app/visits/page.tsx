"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";
import {
  visitsApi,
  type Visit,
  routePlansApi,
  routeSessionsApi,
  type RoutePlan,
  type RouteSessionState,
} from "@/lib/api";
import { apiHttp } from "@/lib/api/client";
import { GoogleMap, Marker, useLoadScript } from "@react-google-maps/api";
import { Save } from "lucide-react";
import { CRM_TIME_ZONE, jsDateToYmdKyiv, todayYmdInKyiv } from "@/lib/crmDatetime";
import { useConfirm, useToast } from "@/components/feedback";
import { VisitsSubNav } from "./VisitsSubNav";

function formatHmKyiv(iso: string): string {
  const d = DateTime.fromISO(iso, { setZone: true }).setZone(CRM_TIME_ZONE);
  return d.isValid ? d.toFormat("HH:mm") : "";
}

type GoogleMapsPublicConfig = {
  mapsApiKey: string | null;
};

const DAY_START_HOUR = 9;
const DAY_END_HOUR = 22;
const SLOT_MINUTES = 30;
const ROW_HEIGHT_PX = 44;
const TOTAL_SLOTS = ((DAY_END_HOUR - DAY_START_HOUR) * 60) / SLOT_MINUTES;

type TimelineSlot = {
  start: Date;
  end: Date;
  key: string;
};

type VisitInterval = {
  id: string;
  startsAt: Date;
  endsAt: Date;
};

type VisitLayout = {
  column: number;
  columns: number;
};

type VisitsMapContentProps = {
  mapsApiKey: string;
  centerLatLng: { lat: number; lng: number };
  scheduledVisits: Visit[];
  onMarkerDragEnd: (visit: Visit, e: google.maps.MapMouseEvent) => void;
  routeAnchors?: { start?: { lat: number; lng: number }; end?: { lat: number; lng: number } };
};

function computeVisitLayout(visits: VisitInterval[]): Map<string, VisitLayout> {
  const sorted = [...visits].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  type TempMeta = { column: number; groupId: number };
  const temp = new Map<string, TempMeta>();
  const groupMaxColumn = new Map<number, number>();
  let groupId = 0;
  let active: { v: VisitInterval; column: number; groupId: number }[] = [];

  for (const v of sorted) {
    const startTime = v.startsAt.getTime();
    active = active.filter((a) => a.v.endsAt.getTime() > startTime);
    if (active.length === 0) {
      groupId += 1;
    }
    const usedColumns = new Set(active.map((a) => a.column));
    let column = 0;
    while (usedColumns.has(column)) column += 1;
    active.push({ v, column, groupId });
    temp.set(v.id, { column, groupId });
    const currentMax = groupMaxColumn.get(groupId) ?? 0;
    if (column + 1 > currentMax) {
      groupMaxColumn.set(groupId, column + 1);
    }
  }

  const result = new Map<string, VisitLayout>();
  for (const [id, meta] of temp.entries()) {
    const columns = groupMaxColumn.get(meta.groupId) ?? 1;
    result.set(id, { column: meta.column, columns });
  }
  return result;
}

function getSlotsForDate(date: Date): TimelineSlot[] {
  const slots: TimelineSlot[] = [];
  const base = DateTime.fromJSDate(date).setZone(CRM_TIME_ZONE);
  const y = base.year;
  const mo = base.month;
  const d = base.day;
  for (let hour = DAY_START_HOUR; hour < DAY_END_HOUR; hour++) {
    for (let m = 0; m < 60; m += SLOT_MINUTES) {
      const start = DateTime.fromObject(
        { year: y, month: mo, day: d, hour, minute: m, second: 0 },
        { zone: CRM_TIME_ZONE },
      ).toJSDate();
      const end = new Date(start.getTime() + SLOT_MINUTES * 60 * 1000);
      slots.push({
        start,
        end,
        key: `${hour}:${m}`,
      });
    }
  }
  return slots;
}

function isOverlapping(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** First timeline slot on `selectedDate` where the visit fits without overlapping scheduled visits; from now onward if the selected day is today. */
/** Русский порядок: фамилия, имя, отчество. */
function formatContactNameLastFirst(c: {
  lastName: string;
  firstName: string;
  middleName?: string | null;
}): string {
  return [c.lastName, c.firstName, c.middleName]
    .filter((s) => Boolean(s?.trim()))
    .join(" ")
    .trim();
}

function findNearestAvailableSlot(
  visit: Visit,
  slots: TimelineSlot[],
  scheduledOnDay: Visit[],
  selectedDate: Date,
): TimelineSlot | null {
  const durationMin = visit.durationMin ?? 60;
  const durationMs = durationMin * 60 * 1000;
  const dayStart = slots[0]?.start;
  const dayEnd = slots[slots.length - 1]?.end;
  if (!dayStart || !dayEnd) return null;

  const selectedStr = jsDateToYmdKyiv(selectedDate);
  const todayStr = todayYmdInKyiv();
  const isSelectedToday = selectedStr === todayStr;

  const intervals = scheduledOnDay
    .filter((v) => v.startsAt && v.endsAt)
    .map((v) => ({
      s: new Date(v.startsAt!).getTime(),
      e: new Date(v.endsAt!).getTime(),
    }))
    .sort((a, b) => a.s - b.s);

  const overlaps = (startMs: number, endMs: number) => {
    for (const iv of intervals) {
      if (startMs < iv.e && endMs > iv.s) return true;
    }
    return false;
  };

  const minStartMs = isSelectedToday
    ? Math.max(dayStart.getTime(), Date.now())
    : dayStart.getTime();

  for (const slot of slots) {
    const startMs = slot.start.getTime();
    if (startMs < minStartMs) continue;
    const endMs = startMs + durationMs;
    if (endMs > dayEnd.getTime()) break;
    if (!overlaps(startMs, endMs)) return slot;
  }
  return null;
}

function VisitsMapContent({
  mapsApiKey,
  centerLatLng,
  scheduledVisits,
  onMarkerDragEnd,
  routeAnchors,
}: VisitsMapContentProps) {
  const { isLoaded, loadError } = useLoadScript({
    id: "google-map-script",
    googleMapsApiKey: mapsApiKey,
  });

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center px-3 text-center text-xs text-amber-600">
        Failed to load Google Maps script. Check API key restrictions and billing.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-zinc-500">
        Loading map…
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={{ width: "100%", height: "100%" }}
      center={centerLatLng}
      zoom={12}
      options={{
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      }}
    >
      {routeAnchors?.start ? <Marker position={routeAnchors.start} label="A" /> : null}
      {routeAnchors?.end &&
      (routeAnchors.end.lat !== routeAnchors.start?.lat ||
        routeAnchors.end.lng !== routeAnchors.start?.lng) ? (
        <Marker position={routeAnchors.end} label="B" />
      ) : null}
      {scheduledVisits
        .filter((v) => v.lat != null && v.lng != null)
        .map((v, idx) => (
          <Marker
            key={v.id}
            position={{ lat: v.lat as number, lng: v.lng as number }}
            label={String(idx + 1)}
            draggable
            onDragEnd={(e) => void onMarkerDragEnd(v, e)}
          />
        ))}
    </GoogleMap>
  );
}

export default function VisitsPage() {
  const { pushToast } = useToast();
  const { confirm } = useConfirm();
  const [date, setDate] = useState<Date>(() =>
    DateTime.now().setZone(CRM_TIME_ZONE).startOf("day").toJSDate(),
  );
  const [backlog, setBacklog] = useState<Visit[]>([]);
  const [dayVisits, setDayVisits] = useState<Visit[]>([]);
  const [routePlan, setRoutePlan] = useState<RoutePlan | null>(null);
  const [routeSessionState, setRouteSessionState] = useState<RouteSessionState | null>(null);
  const [routeSessionLoading, setRouteSessionLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingRoute, setSavingRoute] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routeMetrics, setRouteMetrics] = useState<{
    distanceKm: number | null;
    durationMin: number | null;
    source: "google" | "fallback" | "none";
  } | null>(null);
  const [routeMetricsLoading, setRouteMetricsLoading] = useState(false);
  const [routeMetricsPreview, setRouteMetricsPreview] = useState<{
    distanceKm: number | null;
    durationMin: number | null;
    source: "google" | "fallback" | "none";
  } | null>(null);
  const [routeMetricsPreviewLoading, setRouteMetricsPreviewLoading] = useState(false);
  const [routeFactMetrics, setRouteFactMetrics] = useState<{
    distanceKm: number | null;
    durationMin: number | null;
    source: "google" | "fallback" | "none";
  } | null>(null);
  const [routeFactMetricsLoading, setRouteFactMetricsLoading] = useState(false);

  const [useTrafficAware, setUseTrafficAware] = useState(false);
  const [autoSaveRoutePlan, setAutoSaveRoutePlan] = useState(true);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSaveRouteRef = useRef<() => Promise<void>>(async () => {});

  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [resultModalVisit, setResultModalVisit] = useState<Visit | null>(null);
  const [resultOutcome, setResultOutcome] = useState<string>("");
  const [resultNote, setResultNote] = useState("");
  const [resultNextActionAt, setResultNextActionAt] = useState("");
  const [resultNextActionNote, setResultNextActionNote] = useState("");

  const [dragVisitId, setDragVisitId] = useState<string | null>(null);
  const [hoverSlotKey, setHoverSlotKey] = useState<string | null>(null);
  const [hoveredVisitId, setHoveredVisitId] = useState<string | null>(null);

  const scheduleSectionRef = useRef<HTMLElement | null>(null);
  const visitsRootRef = useRef<HTMLDivElement | null>(null);
  const dragSessionRef = useRef(0);
  const cancelledDragSessionRef = useRef<number | null>(null);

  const [mapsApiKey, setMapsApiKey] = useState<string | null>(null);
  const [mapsConfigError, setMapsConfigError] = useState<string | null>(null);
  const [mapSheetOpen, setMapSheetOpen] = useState(false);
  const [routeAnchors, setRouteAnchors] = useState<{
    start?: { lat: number; lng: number };
    end?: { lat: number; lng: number };
  }>({});
  const [routeAnchorsPromptOpen, setRouteAnchorsPromptOpen] = useState(false);

  const [pendingSchedule, setPendingSchedule] = useState<{
    visit: Visit;
    slot: TimelineSlot;
  } | null>(null);
  const [purposeDraft, setPurposeDraft] = useState("");

  const [contactQuery, setContactQuery] = useState("");
  const [contactHits, setContactHits] = useState<
    { id: string; firstName: string; lastName: string; phone: string }[]
  >([]);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [newVisitPurpose, setNewVisitPurpose] = useState("");
  const [creatingBacklogVisit, setCreatingBacklogVisit] = useState(false);
  const [pendingContactId, setPendingContactId] = useState<string | null>(null);

  const [role, setRole] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<
    {
      id: string;
      fullName: string;
      email: string;
      role: string;
      routeStartLat?: number | null;
      routeStartLng?: number | null;
      routeEndLat?: number | null;
      routeEndLng?: number | null;
    }[]
  >([]);
  const [viewOwnerId, setViewOwnerId] = useState("");

  const dateParam = useMemo(() => jsDateToYmdKyiv(date), [date]);
  const showOwnerFilter = role === "ADMIN" || role === "LEAD";
  const planOwnerOpts = viewOwnerId ? { ownerId: viewOwnerId } : undefined;
  const readOnlyPlan = Boolean(
    planOwnerOpts && myUserId && planOwnerOpts.ownerId !== myUserId,
  );
  const showMultiOwnerDay = showOwnerFilter && !viewOwnerId;
  const slots = useMemo(() => getSlotsForDate(date), [date]);

  const scheduledVisits = dayVisits;

  const currentOrderVisitIds = useMemo(() => {
    const sorted = [...dayVisits]
      .filter((v) => v.status !== "CANCELED" && v.status !== "PLANNED_UNASSIGNED")
      .sort((a, b) => {
        const aTime = a.startsAt ? new Date(a.startsAt).getTime() : 0;
        const bTime = b.startsAt ? new Date(b.startsAt).getTime() : 0;
        if (aTime !== bTime) return aTime - bTime;
        return String(a.id).localeCompare(String(b.id));
      });
    return sorted.map((v) => v.id);
  }, [dayVisits]);

  const savedPlanVisitIds = useMemo(() => {
    if (!routePlan?.stops?.length) return [];
    return routePlan.stops.map((s) => s.visitId);
  }, [routePlan?.stops]);

  const hasUnsavedPlanOrder = useMemo(() => {
    if (!routePlan?.stops?.length) return false;
    if (savedPlanVisitIds.length !== currentOrderVisitIds.length) return true;
    for (let i = 0; i < savedPlanVisitIds.length; i++) {
      if (savedPlanVisitIds[i] !== currentOrderVisitIds[i]) return true;
    }
    return false;
  }, [currentOrderVisitIds, routePlan?.stops?.length, savedPlanVisitIds]);

  const isDraggingFromBacklog = useMemo(
    () => dragVisitId != null && backlog.some((v) => v.id === dragVisitId),
    [dragVisitId, backlog],
  );

  const cancelBacklogDrag = useCallback(() => {
    if (!isDraggingFromBacklog) return;
    cancelledDragSessionRef.current = dragSessionRef.current;
    setDragVisitId(null);
    setHoverSlotKey(null);
  }, [isDraggingFromBacklog]);

  useEffect(() => {
    if (!isDraggingFromBacklog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelBacklogDrag();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDraggingFromBacklog, cancelBacklogDrag]);

  const hasScheduledWithoutCoords = scheduledVisits.some((v) => v.lat == null || v.lng == null);

  const coordQuality = useMemo(() => {
    const scheduled = dayVisits.filter(
      (v) => v.status !== "CANCELED" && v.status !== "PLANNED_UNASSIGNED",
    );
    const zero = scheduled.filter((v) => v.lat === 0 && v.lng === 0);
    const key = (v: Visit) => (v.lat != null && v.lng != null ? `${v.lat},${v.lng}` : "");
    const counts = new Map<string, number>();
    for (const v of scheduled) {
      const k = key(v);
      if (!k) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const dupKeys = new Set(
      Array.from(counts.entries())
        .filter(([, c]) => c >= 2)
        .map(([k]) => k),
    );
    const duplicates = scheduled.filter((v) => dupKeys.has(key(v)));
    return { zeroCount: zero.length, duplicateCount: duplicates.length };
  }, [dayVisits]);

  useEffect(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (!autoSaveRoutePlan) return;
    if (!planOwnerOpts || readOnlyPlan) return;
    if (!routePlan?.stops?.length) return;
    if (!hasUnsavedPlanOrder) return;
    if (savingRoute || loading) return;
    if (hasScheduledWithoutCoords) return;
    if (currentOrderVisitIds.length === 0) return;
    autoSaveTimerRef.current = setTimeout(() => {
      void handleSaveRouteRef.current();
    }, 1200);
  }, [
    autoSaveRoutePlan,
    currentOrderVisitIds,
    hasScheduledWithoutCoords,
    hasUnsavedPlanOrder,
    loading,
    planOwnerOpts,
    readOnlyPlan,
    routePlan?.id,
    routePlan?.stops?.length,
    savingRoute,
  ]);

  const loadMapsConfig = useCallback(async () => {
    try {
      const res = await apiHttp.get<GoogleMapsPublicConfig>("/settings/google-maps/public");
      const key = res.data?.mapsApiKey ?? null;
      if (!key) {
        setMapsConfigError(
          "Google Maps API key is not configured. Ask ADMIN to set it in Settings → Google Maps.",
        );
      } else {
        setMapsApiKey(key);
        setMapsConfigError(null);
      }
    } catch {
      setMapsConfigError("Failed to load Google Maps configuration.");
      setMapsApiKey(null);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const dayOpts = showOwnerFilter
        ? viewOwnerId
          ? { ownerId: viewOwnerId }
          : {}
        : undefined;
      const [backlogRes, dayRes, planRes, sessionRes] = await Promise.all([
        visitsApi.backlog(),
        visitsApi.day(dateParam, dayOpts),
        planOwnerOpts
          ? routePlansApi.getForDay(dateParam, planOwnerOpts)
          : Promise.resolve({ plan: null }),
        planOwnerOpts
          ? routeSessionsApi.get(dateParam, planOwnerOpts)
          : Promise.resolve(null),
      ]);
      setBacklog(backlogRes);
      setDayVisits(dayRes.items ?? []);
      setRoutePlan(planRes.plan ?? null);
      setRouteSessionState(sessionRes ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load visits");
      setBacklog([]);
      setDayVisits([]);
      setRoutePlan(null);
      setRouteSessionState(null);
    } finally {
      setLoading(false);
    }
  }, [dateParam, planOwnerOpts, showOwnerFilter, viewOwnerId]);

  useEffect(() => {
    void loadMapsConfig();
  }, [loadMapsConfig]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setRouteMetrics(null);
    if (!planOwnerOpts || !routePlan?.stops?.length) return;
    setRouteMetricsLoading(true);
    void routePlansApi
      .metrics(dateParam, { traffic: useTrafficAware, ...planOwnerOpts })
      .then((m) => setRouteMetrics(m))
      .catch(() => setRouteMetrics(null))
      .finally(() => setRouteMetricsLoading(false));
  }, [dateParam, planOwnerOpts, routePlan?.id, routePlan?.stops?.length, useTrafficAware]);

  useEffect(() => {
    // Preview metrics for current (unsaved) order to show instant km effect.
    setRouteMetricsPreview(null);
    if (!planOwnerOpts || currentOrderVisitIds.length === 0) return;
    if (hasScheduledWithoutCoords) return;
    setRouteMetricsPreviewLoading(true);
    const t = window.setTimeout(() => {
      void routePlansApi
        .metricsPreview(dateParam, currentOrderVisitIds, {
          traffic: useTrafficAware,
          ...planOwnerOpts,
        })
        .then((m) => setRouteMetricsPreview(m))
        .catch(() => setRouteMetricsPreview(null))
        .finally(() => setRouteMetricsPreviewLoading(false));
    }, 250);
    return () => window.clearTimeout(t);
  }, [currentOrderVisitIds, dateParam, hasScheduledWithoutCoords, planOwnerOpts, useTrafficAware]);

  useEffect(() => {
    // Fact metrics: order of completed visits for the day.
    setRouteFactMetrics(null);
    if (!planOwnerOpts) return;
    setRouteFactMetricsLoading(true);
    void routePlansApi
      .factMetrics(dateParam, { traffic: useTrafficAware, ...planOwnerOpts })
      .then((m) => setRouteFactMetrics(m))
      .catch(() => setRouteFactMetrics(null))
      .finally(() => setRouteFactMetricsLoading(false));
  }, [dateParam, planOwnerOpts, useTrafficAware]);

  useEffect(() => {
    apiHttp
      .get<{ user?: { id?: string; role?: string } }>("/auth/me")
      .then((res) => {
        setRole(res.data?.user?.role ?? null);
        setMyUserId(res.data?.user?.id ?? null);
      })
      .catch(() => {
        setRole(null);
        setMyUserId(null);
      });
  }, []);

  useEffect(() => {
    if (!showOwnerFilter) return;
    apiHttp
      .get<{ items?: typeof users }>("/users")
      .then((r) => setUsers(r.data?.items ?? []))
      .catch(() => setUsers([]));
  }, [showOwnerFilter]);

  useEffect(() => {
    const applyAnchors = (u: {
      routeStartLat?: number | null;
      routeStartLng?: number | null;
      routeEndLat?: number | null;
      routeEndLng?: number | null;
    }) => {
      const start =
        u.routeStartLat != null && u.routeStartLng != null
          ? { lat: u.routeStartLat, lng: u.routeStartLng }
          : undefined;
      const endRaw =
        u.routeEndLat != null && u.routeEndLng != null
          ? { lat: u.routeEndLat, lng: u.routeEndLng }
          : start;
      setRouteAnchors({ start, end: endRaw });
    };

    if (viewOwnerId) {
      const u = users.find((x) => x.id === viewOwnerId);
      if (u) {
        applyAnchors(u);
        return;
      }
    }
    apiHttp
      .get<{
        user?: {
          routeStartLat?: number | null;
          routeStartLng?: number | null;
          routeEndLat?: number | null;
          routeEndLng?: number | null;
        };
      }>("/auth/me")
      .then((res) => {
        const u = res.data?.user;
        if (u) applyAnchors(u);
      })
      .catch(() => {});
  }, [users, viewOwnerId]);

  useEffect(() => {
    const q = contactQuery.trim();
    if (q.length < 2) {
      setContactHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      void apiHttp
        .get<{
          items?: { id: string; firstName: string; lastName: string; phone: string }[];
          total?: number;
        }>("/contacts", { params: { q, pageSize: 15 } } as never)
        .then((r) => {
          setContactHits(r.data?.items ?? []);
        })
        .catch(() => setContactHits([]));
    }, 300);
    return () => window.clearTimeout(t);
  }, [contactQuery]);

  const applyScheduleToSlot = async (visit: Visit, slot: TimelineSlot, purpose: string) => {
    const durationMinutes = visit.durationMin ?? 60;
    const startsAt = slot.start;
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);
    try {
      const updated = await visitsApi.update(visit.id, {
        status: "SCHEDULED",
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        purpose: purpose.trim(),
      });
      setBacklog((prev) => prev.filter((v) => v.id !== visit.id));
      setDayVisits((prev) => {
        const rest = prev.filter((v) => v.id !== visit.id);
        return [...rest, updated].sort((a, b) => {
          const aTime = a.startsAt ? new Date(a.startsAt).getTime() : 0;
          const bTime = b.startsAt ? new Date(b.startsAt).getTime() : 0;
          return aTime - bTime;
        });
      });
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Failed to schedule visit", "error");
      void loadData();
    }
  };

  const handleDropToSlot = (visit: Visit, slot: TimelineSlot) => {
    if (visit.status === "PLANNED_UNASSIGNED") {
      setPurposeDraft(visit.purpose?.trim() ?? "");
      setPendingSchedule({ visit, slot });
      return;
    }
    void applyScheduleToSlot(visit, slot, visit.purpose ?? "");
  };

  const handleMoveOnTimeline = async (visit: Visit, deltaMinutes: number) => {
    if (!visit.startsAt || !visit.endsAt) return;
    const start = new Date(visit.startsAt);
    const end = new Date(visit.endsAt);
    const startsAt = new Date(start.getTime() + deltaMinutes * 60 * 1000);
    const endsAt = new Date(end.getTime() + deltaMinutes * 60 * 1000);
    try {
      const updated = await visitsApi.update(visit.id, {
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      });
      setDayVisits((prev) =>
        prev
          .map((v) => (v.id === visit.id ? updated : v))
          .sort((a, b) => {
            const aTime = a.startsAt ? new Date(a.startsAt).getTime() : 0;
            const bTime = b.startsAt ? new Date(b.startsAt).getTime() : 0;
            return aTime - bTime;
          }),
      );
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Failed to move visit", "error");
      void loadData();
    }
  };

  const handleResizeVisit = async (visit: Visit, newDurationMinutes: number) => {
    if (!visit.startsAt) return;
    const startsAt = new Date(visit.startsAt);
    const durationMinutes = Math.max(30, Math.trunc(newDurationMinutes));
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);
    try {
      const updated = await visitsApi.update(visit.id, {
        durationMin: durationMinutes,
        endsAt: endsAt.toISOString(),
      });
      setDayVisits((prev) => prev.map((v) => (v.id === visit.id ? updated : v)));
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Failed to resize visit", "error");
      void loadData();
    }
  };

  const handleSaveRoute = async () => {
    if (!planOwnerOpts || readOnlyPlan) return;
    setSavingRoute(true);
    try {
      const sorted = [...dayVisits].sort((a, b) => {
        const aTime = a.startsAt ? new Date(a.startsAt).getTime() : 0;
        const bTime = b.startsAt ? new Date(b.startsAt).getTime() : 0;
        return aTime - bTime;
      });
      const ids = sorted.map((v) => v.id);
      const res = await routePlansApi.saveForDay(dateParam, ids, planOwnerOpts);
      setRoutePlan(res.plan ?? null);
      // Refresh km immediately after saving a new plan order.
      if (res.plan?.stops?.length) {
        setRouteMetricsLoading(true);
        try {
          const m = await routePlansApi.metrics(dateParam, {
            traffic: useTrafficAware,
            ...planOwnerOpts,
          });
          setRouteMetrics(m);
        } catch {
          setRouteMetrics(null);
        } finally {
          setRouteMetricsLoading(false);
        }
      } else {
        setRouteMetrics(null);
      }
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Failed to save route", "error");
    } finally {
      setSavingRoute(false);
    }
  };

  handleSaveRouteRef.current = handleSaveRoute;

  const centerLatLng = useMemo(() => {
    const withCoords = scheduledVisits.filter((v) => v.lat != null && v.lng != null);
    if (withCoords.length > 0) {
      const first = withCoords[0];
      return { lat: first.lat as number, lng: first.lng as number };
    }
    if (routeAnchors.start) {
      return routeAnchors.start;
    }
    return { lat: 50.4501, lng: 30.5234 }; // Kyiv as default
  }, [scheduledVisits, routeAnchors.start]);

  const handleMarkerDragEnd = async (visit: Visit, e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    try {
      const updated = await visitsApi.update(visit.id, {
        lat,
        lng,
        locationSource: "PIN_ADJUSTED",
      });
      setDayVisits((prev) => prev.map((v) => (v.id === visit.id ? updated : v)));
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Failed to update coordinates", "error");
    }
  };

  const dayConflicts = useMemo(() => {
    const conflicts = new Set<string>();
    const items = [...dayVisits].sort((a, b) => {
      const aTime = a.startsAt ? new Date(a.startsAt).getTime() : 0;
      const bTime = b.startsAt ? new Date(b.startsAt).getTime() : 0;
      return aTime - bTime;
    });
    for (let i = 0; i < items.length; i++) {
      const vi = items[i];
      if (!vi.startsAt || !vi.endsAt) continue;
      const si = new Date(vi.startsAt);
      const ei = new Date(vi.endsAt);
      for (let j = i + 1; j < items.length; j++) {
        const vj = items[j];
        if (!vj.startsAt || !vj.endsAt) continue;
        const sj = new Date(vj.startsAt);
        const ej = new Date(vj.endsAt);
        if (isOverlapping(si, ei, sj, ej)) {
          conflicts.add(vi.id);
          conflicts.add(vj.id);
        }
      }
    }
    return conflicts;
  }, [dayVisits]);

  const sortedForTimeline = useMemo(
    () =>
      [...dayVisits].sort((a, b) => {
        const aTime = a.startsAt ? new Date(a.startsAt).getTime() : 0;
        const bTime = b.startsAt ? new Date(b.startsAt).getTime() : 0;
        return aTime - bTime;
      }),
    [dayVisits],
  );

  const handlePrevDay = () => {
    setDate((prev) =>
      DateTime.fromJSDate(prev).setZone(CRM_TIME_ZONE).minus({ days: 1 }).startOf("day").toJSDate(),
    );
  };
  const handleNextDay = () => {
    setDate((prev) =>
      DateTime.fromJSDate(prev).setZone(CRM_TIME_ZONE).plus({ days: 1 }).startOf("day").toJSDate(),
    );
  };

  const handleToday = () => {
    setDate(DateTime.now().setZone(CRM_TIME_ZONE).startOf("day").toJSDate());
  };

  const handleMoveToBacklog = async (visit: Visit) => {
    try {
      const updated = await visitsApi.update(visit.id, {
        status: "PLANNED_UNASSIGNED",
      });
      setDayVisits((prev) => prev.filter((v) => v.id !== visit.id));
      setBacklog((prev) => [updated, ...prev.filter((v) => v.id !== visit.id)]);
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Failed to move visit to backlog", "error");
      void loadData();
    }
  };

  const handleRemoveVisit = useCallback(
    async (visit: Visit) => {
      const ok = await confirm({
        title: "Remove visit",
        message: "Remove this visit from the plan?",
        confirmText: "Remove",
        destructive: true,
      });
      if (!ok) return;
      try {
        await visitsApi.update(visit.id, { status: "CANCELED" });
        setBacklog((prev) => prev.filter((v) => v.id !== visit.id));
        setDayVisits((prev) => prev.filter((v) => v.id !== visit.id));
      } catch (e) {
        pushToast(e instanceof Error ? e.message : "Failed to remove visit", "error");
        void loadData();
      }
    },
    [confirm, loadData, pushToast],
  );

  const handleResultSubmit = async () => {
    if (!resultModalVisit || !resultOutcome.trim() || !resultNote.trim()) {
      pushToast("Укажите результат (outcome) и комментарий (resultNote).", "error");
      return;
    }
    try {
      const updated = await visitsApi.complete(resultModalVisit.id, {
        outcome: resultOutcome.trim(),
        resultNote: resultNote.trim(),
        nextActionAt: resultNextActionAt ? new Date(resultNextActionAt).toISOString() : undefined,
        nextActionNote: resultNextActionNote.trim() || undefined,
      });
      setDayVisits((prev) => prev.map((v) => (v.id === resultModalVisit.id ? updated : v)));
      setResultModalOpen(false);
      setResultModalVisit(null);
      setResultOutcome("");
      setResultNote("");
      setResultNextActionAt("");
      setResultNextActionNote("");
      setRouteSessionLoading(true);
      try {
        const state = await routeSessionsApi.next(dateParam);
        setRouteSessionState(state);
      } catch {
        const state = await routeSessionsApi.get(dateParam);
        setRouteSessionState(state ?? null);
      } finally {
        setRouteSessionLoading(false);
      }
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Failed to save result", "error");
    }
  };

  const OUTCOME_OPTIONS = [
    { value: "SUCCESS", label: "Успех" },
    { value: "FOLLOW_UP", label: "Дозвон / повтор" },
    { value: "NO_DECISION", label: "Без решения" },
    { value: "NOT_RELEVANT", label: "Не релевантно" },
    { value: "FAILED", label: "Неудача" },
  ] as const;

  const handleCreateBacklogFromContact = async () => {
    if (!pendingContactId) return;
    if (!newVisitPurpose.trim()) {
      pushToast("Укажите цель встречи.", "error");
      return;
    }
    setCreatingBacklogVisit(true);
    try {
      const v = await visitsApi.create({
        contactId: pendingContactId,
        purpose: newVisitPurpose.trim(),
      });
      setBacklog((prev) => [v, ...prev]);
      setPendingContactId(null);
      setNewVisitPurpose("");
      setContactQuery("");
      setContactHits([]);
      setContactPickerOpen(false);
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Не удалось создать визит", "error");
    } finally {
      setCreatingBacklogVisit(false);
    }
  };

  return (
    <div ref={visitsRootRef} className="flex min-h-screen flex-col bg-zinc-50">
      <div className="border-b border-zinc-200 bg-white px-4 py-2 sm:px-6 sm:py-3">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-zinc-900 sm:text-xl">Visits planning</h1>
            <p className="hidden text-sm text-zinc-500 sm:block">
              Plan field visits for the day, arrange them on a timeline, and save the route.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMapSheetOpen(true)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 md:hidden"
            >
              Карта
            </button>
            <div className="flex flex-wrap items-center gap-2 px-0 py-1 sm:py-1.5">
              <button
                type="button"
                onClick={handlePrevDay}
                className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm hover:bg-zinc-50"
              >
                ←
              </button>
              <button
                type="button"
                onClick={handleToday}
                className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50"
              >
                Today
              </button>
              <button
                type="button"
                onClick={handleNextDay}
                className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm hover:bg-zinc-50"
              >
                →
              </button>
              <div className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm tabular-nums text-zinc-700">
                {dateParam}
              </div>
            </div>
            {!routeSessionState?.session?.isActive && planOwnerOpts && !readOnlyPlan ? (
              <button
                type="button"
                disabled={routeSessionLoading || loading}
                onClick={async () => {
                  setRouteSessionLoading(true);
                  try {
                    const state = await routeSessionsApi.start(dateParam);
                    setRouteSessionState(state);
                  } catch (e) {
                    pushToast(e instanceof Error ? e.message : "Failed to start route", "error");
                  } finally {
                    setRouteSessionLoading(false);
                  }
                }}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {routeSessionLoading ? "…" : "Начать день/маршрут"}
              </button>
            ) : null}
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 pb-2 sm:px-6">
          <VisitsSubNav />
          {showOwnerFilter ? (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600">Менеджер</label>
                <select
                  value={viewOwnerId}
                  onChange={(e) => setViewOwnerId(e.target.value)}
                  className="mt-0.5 min-w-[220px] rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm"
                >
                  <option value="">
                    {role === "ADMIN" ? "Все менеджеры (день)" : "Вся команда (день)"}
                  </option>
                  {users
                    .filter((u) => u.role === "MANAGER" || u.role === "USER" || u.role === "LEAD")
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName || u.email}
                      </option>
                    ))}
                </select>
              </div>
              {showMultiOwnerDay ? (
                <p className="text-xs text-amber-800">
                  Маршрут и км — выберите конкретного менеджера. Сейчас показаны визиты всех.
                </p>
              ) : readOnlyPlan ? (
                <p className="text-xs text-zinc-600">Режим просмотра чужого плана</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {routeSessionState?.session?.isActive && (
        <div className="sticky top-0 z-20 border-b border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <div className="mx-auto flex max-w-6xl flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase text-zinc-500">
                Текущая / следующая встреча
              </div>
              {routeSessionState.currentVisit ? (
                <div className="mt-1 text-sm">
                  <div className="font-medium text-zinc-900">
                    {routeSessionState.currentVisit.title ||
                      routeSessionState.currentVisit.addressText ||
                      "Visit"}
                  </div>
                  <div className="mt-0.5 text-zinc-600">
                    {routeSessionState.currentVisit.addressText || "—"}
                  </div>
                  <div className="mt-0.5 text-zinc-500">
                    {routeSessionState.currentVisit.phone ? (
                      <a
                        href={`tel:${routeSessionState.currentVisit.phone}`}
                        className="hover:underline"
                      >
                        {routeSessionState.currentVisit.phone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </div>
                  {routeSessionState.currentVisit.startsAt &&
                    routeSessionState.currentVisit.endsAt && (
                      <div className="mt-0.5 text-zinc-500">
                        {formatHmKyiv(routeSessionState.currentVisit.startsAt)}–
                        {formatHmKyiv(routeSessionState.currentVisit.endsAt)}
                      </div>
                    )}
                </div>
              ) : (
                <div className="mt-1 text-sm text-zinc-500">Нет запланированных встреч</div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!routeSessionState.currentVisit}
                onClick={async () => {
                  if (!routeSessionState.currentVisit?.id) return;
                  try {
                    const { url } = await routePlansApi.navigation(
                      dateParam,
                      "single",
                      routeSessionState.currentVisit.id,
                      planOwnerOpts,
                    );
                    window.open(url, "_blank");
                  } catch (e) {
                    pushToast(e instanceof Error ? e.message : "No coordinates", "error");
                  }
                }}
                className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Маршрут
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    if (!routeAnchors.start) {
                      setRouteAnchorsPromptOpen(true);
                      return;
                    }
                    const { url } = await routePlansApi.navigation(dateParam, "multi", undefined, planOwnerOpts);
                    window.open(url, "_blank");
                  } catch (e) {
                    pushToast(
                      e instanceof Error ? e.message : "No route plan or coordinates",
                      "error",
                    );
                  }
                }}
                className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Маршрут дня
              </button>
              <button
                type="button"
                disabled={!routeSessionState.currentVisit}
                onClick={() => {
                  if (routeSessionState.currentVisit) {
                    setResultModalVisit(routeSessionState.currentVisit as Visit);
                    setResultOutcome("");
                    setResultNote("");
                    setResultNextActionAt("");
                    setResultNextActionNote("");
                    setResultModalOpen(true);
                  }
                }}
                className="rounded-md bg-zinc-800 px-2 py-1.5 text-xs font-medium text-white hover:bg-zinc-900 disabled:opacity-50"
              >
                Завершить
              </button>
              <button
                type="button"
                onClick={async () => {
                  setRouteSessionLoading(true);
                  try {
                    const state = await routeSessionsApi.next(dateParam);
                    setRouteSessionState(state);
                  } catch (e) {
                    pushToast(e instanceof Error ? e.message : "Failed", "error");
                  } finally {
                    setRouteSessionLoading(false);
                  }
                }}
                className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Следующая
              </button>
              <button
                type="button"
                onClick={async () => {
                  setRouteSessionLoading(true);
                  try {
                    const state = await routeSessionsApi.stop(dateParam);
                    setRouteSessionState(state ?? null);
                  } catch (e) {
                    pushToast(e instanceof Error ? e.message : "Failed", "error");
                  } finally {
                    setRouteSessionLoading(false);
                  }
                }}
                className="rounded-md border border-red-200 px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                Стоп
              </button>
            </div>
            <div className="w-full shrink-0 overflow-auto md:max-w-xs">
              <div className="text-xs font-semibold uppercase text-zinc-500">Точки маршрута</div>
              <ul className="mt-1 flex flex-wrap gap-1">
                {(routeSessionState.routePlan?.stops ?? []).length > 0
                  ? routeSessionState.routePlan!.stops.map((s) => {
                      const v = s.visit as Visit;
                      const isCurrent = v.id === routeSessionState.session.currentVisitId;
                      const isDone = v.status === "DONE";
                      const isInProgress = v.status === "IN_PROGRESS";
                      const isUnsuccessfulOutcome =
                        isDone &&
                        (v.outcome === "FAILED" ||
                          v.outcome === "NOT_RELEVANT" ||
                          v.outcome === "NO_DECISION");
                      return (
                        <li key={s.id} className="list-none">
                          <button
                            type="button"
                            disabled={isDone || routeSessionLoading}
                            title={isDone ? undefined : "Сделать текущей встречей"}
                            onClick={async () => {
                              if (isDone || isCurrent) return;
                              setRouteSessionLoading(true);
                              try {
                                const state = await routeSessionsApi.setCurrent(dateParam, v.id);
                                setRouteSessionState(state);
                              } catch (e) {
                                pushToast(
                                  e instanceof Error ? e.message : "Не удалось выбрать визит",
                                  "error",
                                );
                              } finally {
                                setRouteSessionLoading(false);
                              }
                            }}
                            className={[
                              "w-full rounded px-2 py-0.5 text-left text-[11px] disabled:cursor-not-allowed disabled:opacity-60",
                              !isDone ? "hover:ring-1 hover:ring-zinc-300" : "",
                              isCurrent
                                ? "bg-blue-100 font-medium text-blue-900 ring-1 ring-blue-300"
                                : isUnsuccessfulOutcome
                                  ? "bg-red-100 text-red-800"
                                  : isDone
                                    ? "bg-emerald-100 text-emerald-800"
                                    : isInProgress
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-zinc-100 text-zinc-700",
                            ].join(" ")}
                          >
                            {s.position}. {v.title || v.addressText || "Visit"}
                            {isDone
                              ? isUnsuccessfulOutcome
                                ? " ✗"
                                : " ✓"
                              : isCurrent
                                ? " (текущая)"
                                : ""}
                          </button>
                        </li>
                      );
                    })
                  : dayVisits
                      .filter((v) => v.status !== "CANCELED" && v.status !== "PLANNED_UNASSIGNED")
                      .sort((a, b) => {
                        const at = a.startsAt ? new Date(a.startsAt).getTime() : 0;
                        const bt = b.startsAt ? new Date(b.startsAt).getTime() : 0;
                        return at - bt;
                      })
                      .map((v, idx) => {
                        const isCurrent = v.id === routeSessionState.session.currentVisitId;
                        const isDone = v.status === "DONE";
                        const isInProgress = v.status === "IN_PROGRESS";
                        const isUnsuccessfulOutcome =
                          isDone &&
                          (v.outcome === "FAILED" ||
                            v.outcome === "NOT_RELEVANT" ||
                            v.outcome === "NO_DECISION");
                        return (
                          <li key={v.id} className="list-none">
                            <button
                              type="button"
                              disabled={isDone || routeSessionLoading}
                              title={isDone ? undefined : "Сделать текущей встречей"}
                              onClick={async () => {
                                if (isDone || isCurrent) return;
                                setRouteSessionLoading(true);
                                try {
                                  const state = await routeSessionsApi.setCurrent(dateParam, v.id);
                                  setRouteSessionState(state);
                                } catch (e) {
                                  pushToast(
                                    e instanceof Error ? e.message : "Не удалось выбрать визит",
                                    "error",
                                  );
                                } finally {
                                  setRouteSessionLoading(false);
                                }
                              }}
                              className={[
                                "w-full rounded px-2 py-0.5 text-left text-[11px] disabled:cursor-not-allowed disabled:opacity-60",
                                !isDone ? "hover:ring-1 hover:ring-zinc-300" : "",
                                isCurrent
                                  ? "bg-blue-100 font-medium text-blue-900 ring-1 ring-blue-300"
                                  : isUnsuccessfulOutcome
                                    ? "bg-red-100 text-red-800"
                                    : isDone
                                      ? "bg-emerald-100 text-emerald-800"
                                      : isInProgress
                                        ? "bg-amber-100 text-amber-800"
                                        : "bg-zinc-100 text-zinc-700",
                              ].join(" ")}
                            >
                              {idx + 1}. {v.title || v.addressText || "Visit"}
                              {isDone
                                ? isUnsuccessfulOutcome
                                  ? " ✗"
                                  : " ✓"
                                : isCurrent
                                  ? " (текущая)"
                                  : ""}
                            </button>
                          </li>
                        );
                      })}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto grid min-h-0 w-full max-w-7xl flex-1 grid-cols-1 gap-4 p-4 md:grid-cols-[minmax(240px,280px)_minmax(0,1fr)_minmax(260px,340px)] md:items-stretch">
        <div className="flex min-w-0 flex-col gap-3">
          <section className="flex min-h-[280px] w-full flex-col rounded-lg border border-zinc-200 bg-white md:min-h-0">
            <div className="border-b border-zinc-200 px-3 py-2">
              <div className="text-sm font-semibold text-zinc-900">
                Backlog (planned, unscheduled)
              </div>
              <div className="mt-2 space-y-2">
                <button
                  type="button"
                  onClick={() => setContactPickerOpen((o) => !o)}
                  className="text-xs font-medium text-emerald-700 hover:underline"
                >
                  + Добавить из контакта
                </button>
                {contactPickerOpen ? (
                  <div className="rounded border border-zinc-200 bg-zinc-50 p-2">
                    <input
                      type="search"
                      placeholder="Поиск контакта (мин. 2 символа)…"
                      className="w-full rounded border border-zinc-200 px-2 py-1 text-xs"
                      value={contactQuery}
                      onChange={(e) => setContactQuery(e.target.value)}
                    />
                    {contactHits.length > 0 ? (
                      <ul className="mt-1 max-h-32 overflow-auto text-xs">
                        {contactHits.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              className={
                                "w-full rounded px-1 py-1 text-left hover:bg-white " +
                                (pendingContactId === c.id
                                  ? "bg-white ring-1 ring-emerald-300"
                                  : "")
                              }
                              onClick={() => {
                                setPendingContactId(c.id);
                                setNewVisitPurpose("");
                              }}
                            >
                              {c.firstName} {c.lastName} · {c.phone}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {pendingContactId ? (
                      <div className="mt-2 space-y-1 border-t border-zinc-200 pt-2">
                        <label className="text-[10px] font-medium text-zinc-600">
                          Цель встречи *
                        </label>
                        <input
                          className="w-full rounded border border-zinc-200 px-2 py-1 text-xs"
                          value={newVisitPurpose}
                          onChange={(e) => setNewVisitPurpose(e.target.value)}
                          placeholder="Например: презентация, оплата…"
                        />
                        <button
                          type="button"
                          disabled={creatingBacklogVisit}
                          onClick={() => void handleCreateBacklogFromContact()}
                          className="mt-1 w-full rounded bg-zinc-900 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                        >
                          {creatingBacklogVisit ? "…" : "В backlog"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            <div
              className="flex-1 space-y-2 overflow-auto p-3"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                let visitId = dragVisitId;
                const payload = e.dataTransfer.getData("application/json");
                if (payload) {
                  try {
                    const parsed = JSON.parse(payload) as { visitId?: string };
                    if (parsed.visitId) visitId = parsed.visitId;
                  } catch {
                    // ignore malformed payload
                  }
                }
                if (!visitId) return;
                const visit = dayVisits.find((v) => v.id === visitId);
                if (!visit) {
                  setDragVisitId(null);
                  return;
                }
                setDragVisitId(null);
                setHoverSlotKey(null);
                void handleMoveToBacklog(visit);
              }}
            >
              {backlog.length === 0 ? (
                <div className="text-xs text-zinc-500">No backlog visits.</div>
              ) : (
                backlog.map((v) => {
                  const contactName = v.contact ? formatContactNameLastFirst(v.contact) : "";
                  const nameLine = contactName || v.title?.trim() || "—";
                  return (
                    <div
                      key={v.id}
                      draggable
                      onDragStart={(e) => {
                        dragSessionRef.current += 1;
                        const session = dragSessionRef.current;
                        cancelledDragSessionRef.current = null;
                        e.dataTransfer.setData(
                          "application/json",
                          JSON.stringify({ visitId: v.id, session }),
                        );
                        e.dataTransfer.effectAllowed = "move";
                        setDragVisitId(v.id);
                        requestAnimationFrame(() => {
                          scheduleSectionRef.current?.scrollIntoView({
                            behavior: "smooth",
                            block: "nearest",
                          });
                        });
                      }}
                      onDragEnd={() => setDragVisitId((cur) => (cur === v.id ? null : cur))}
                      className={[
                        "group/card relative cursor-grab rounded-md border px-2 py-1.5 pr-[7.5rem] text-xs shadow-sm hover:bg-zinc-100",
                        routeSessionState?.session?.isActive &&
                        routeSessionState.session.currentVisitId === v.id
                          ? "border-blue-400 bg-blue-50 ring-1 ring-blue-200"
                          : "border-zinc-200 bg-zinc-50",
                      ].join(" ")}
                    >
                      <div className="absolute right-1 top-1 z-[1] flex items-center gap-1">
                        <span className="shrink-0 rounded-md bg-zinc-200/90 px-1.5 py-1 text-[10px] font-semibold tabular-nums leading-none text-zinc-900">
                          {v.durationMin ?? 60} мин
                        </span>
                        <div className="pointer-coarse:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover/card:opacity-100 flex items-center gap-1">
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              const slot = findNearestAvailableSlot(v, slots, dayVisits, date);
                              if (!slot) {
                                pushToast(
                                  "На выбранный день нет свободного окна под длительность этого визита.",
                                );
                                return;
                              }
                              handleDropToSlot(v, slot);
                              requestAnimationFrame(() => {
                                scheduleSectionRef.current?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "nearest",
                                });
                              });
                            }}
                            className="min-h-[28px] min-w-[28px] rounded-md px-1 py-1 text-sm font-semibold leading-none text-emerald-700 hover:bg-emerald-100"
                            title="На ближайшее свободное время в выбранный день"
                            aria-label="На ближайшее свободное время в выбранный день"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleRemoveVisit(v);
                            }}
                            className="min-h-[28px] min-w-[28px] rounded-md px-1 py-1 text-base font-medium leading-none text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800"
                            title="Remove visit"
                            aria-label="Remove visit"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      <div className="min-w-0 w-full">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="min-w-0 truncate font-medium leading-tight text-zinc-900">
                            {nameLine}
                          </span>
                          <span className="min-w-0 truncate text-[11px] tabular-nums text-zinc-600">
                            {v.phone ?? "—"}
                          </span>
                        </div>
                        <div className="mt-1 w-full min-w-0 text-[11px] leading-snug text-zinc-600">
                          <div className="line-clamp-2 break-words">
                            {v.addressText?.trim() ? (
                              v.addressText
                            ) : (
                              <span className="text-amber-800">Адрес не указан</span>
                            )}
                          </div>
                          {v.purpose?.trim() ? (
                            <div className="mt-0.5 line-clamp-2 break-words text-zinc-700">
                              {v.purpose}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>

        <section
          ref={scheduleSectionRef}
          className={[
            "flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border bg-white transition-shadow md:min-h-0",
            isDraggingFromBacklog
              ? "border-blue-400 ring-2 ring-blue-200 ring-offset-2 ring-offset-zinc-50"
              : "border-zinc-200",
          ].join(" ")}
        >
          <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Day schedule</div>
              {dayConflicts.size > 0 && (
                <div className="mt-0.5 text-xs text-amber-600">
                  Some visits overlap in time — please review.
                </div>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-600">
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={useTrafficAware}
                    onChange={(e) => setUseTrafficAware(e.target.checked)}
                  />
                  Учитывать пробки
                </label>
                {routePlan?.stops?.length ? (
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={autoSaveRoutePlan}
                      onChange={(e) => setAutoSaveRoutePlan(e.target.checked)}
                    />
                    Автосохранение
                  </label>
                ) : null}
                {routePlan?.stops?.length && hasUnsavedPlanOrder && !autoSaveRoutePlan ? (
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">
                    Есть несохранённые изменения
                  </span>
                ) : null}
                {coordQuality.zeroCount > 0 || coordQuality.duplicateCount > 0 ? (
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">
                    Координаты:{" "}
                    {coordQuality.zeroCount > 0 ? `0,0 = ${coordQuality.zeroCount}` : ""}
                    {coordQuality.zeroCount > 0 && coordQuality.duplicateCount > 0 ? ", " : ""}
                    {coordQuality.duplicateCount > 0
                      ? `дубликаты = ${coordQuality.duplicateCount}`
                      : ""}
                  </span>
                ) : null}
              </div>

              {routePlan?.stops?.length ? (
                <div className="mt-0.5 text-[11px] text-zinc-500">
                  {routeMetricsLoading ? (
                    "План: считаем…"
                  ) : routeMetrics?.distanceKm != null ? (
                    <>
                      План: {routeMetrics.distanceKm} км
                      {routeMetrics.durationMin != null
                        ? ` · ~${routeMetrics.durationMin} мин`
                        : ""}
                      {routeMetrics.source === "fallback" ? " (примерно)" : ""}
                    </>
                  ) : (
                    "План: —"
                  )}
                  {" · "}
                  {routeMetricsPreviewLoading ? (
                    "Текущий: считаем…"
                  ) : routeMetricsPreview?.distanceKm != null ? (
                    <>
                      Текущий: {routeMetricsPreview.distanceKm} км
                      {routeMetricsPreview.durationMin != null
                        ? ` · ~${routeMetricsPreview.durationMin} мин`
                        : ""}
                      {routeMetricsPreview.source === "fallback" ? " (примерно)" : ""}
                    </>
                  ) : (
                    "Текущий: —"
                  )}
                  {" · "}
                  {routeFactMetricsLoading ? (
                    "Факт: …"
                  ) : routeFactMetrics?.distanceKm != null ? (
                    <>
                      Факт: {routeFactMetrics.distanceKm} км
                      {routeFactMetrics.durationMin != null
                        ? ` · ~${routeFactMetrics.durationMin} мин`
                        : ""}
                      {routeFactMetrics.source === "fallback" ? " (примерно)" : ""}
                    </>
                  ) : (
                    "Факт: —"
                  )}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void handleSaveRoute()}
              disabled={
                !planOwnerOpts ||
                readOnlyPlan ||
                savingRoute ||
                hasScheduledWithoutCoords ||
                scheduledVisits.length === 0
              }
              title={
                hasScheduledWithoutCoords
                  ? "Укажите точки для всех"
                  : savingRoute
                    ? "Сохранение…"
                    : "Сохранить маршрут"
              }
              className="inline-flex shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 p-2 text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" aria-hidden />
              <span className="sr-only">
                {hasScheduledWithoutCoords
                  ? "Укажите точки для всех"
                  : savingRoute
                    ? "Сохранение маршрута"
                    : "Сохранить маршрут"}
              </span>
            </button>
            {routePlan?.stops?.length ? (
              <button
                type="button"
                disabled={
                  !planOwnerOpts ||
                  readOnlyPlan ||
                  savingRoute ||
                  hasScheduledWithoutCoords ||
                  currentOrderVisitIds.length < 3
                }
                onClick={async () => {
                  if (!planOwnerOpts) return;
                  try {
                    const optimized = await routePlansApi.optimize(
                      dateParam,
                      currentOrderVisitIds,
                      {
                        traffic: useTrafficAware,
                        ...planOwnerOpts,
                      },
                    );
                    const res = await routePlansApi.saveForDay(
                      dateParam,
                      optimized.visitIds,
                      planOwnerOpts,
                    );
                    setRoutePlan(res.plan ?? null);
                    setRouteMetricsLoading(true);
                    try {
                      const m = await routePlansApi.metrics(dateParam, {
                        traffic: useTrafficAware,
                        ...planOwnerOpts,
                      });
                      setRouteMetrics(m);
                    } finally {
                      setRouteMetricsLoading(false);
                    }
                  } catch (e) {
                    pushToast(e instanceof Error ? e.message : "Failed to optimize route", "error");
                  }
                }}
                className="ml-2 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                title="Оптимизировать порядок остановок (сохранит маршрут)"
              >
                Оптимизировать
              </button>
            ) : null}
          </div>
          <div className="flex flex-1 overflow-auto">
            {(() => {
              const dayStart = slots[0]?.start;
              const dayEnd = slots[slots.length - 1]?.end;
              if (!dayStart || !dayEnd) return null;
              return (
                <>
                  <div
                    className="flex shrink-0 flex-col border-r border-zinc-200 pr-2 text-right"
                    style={{ width: 44 }}
                  >
                    {slots.map((slot) => {
                      const isHour = slot.start.getMinutes() === 0;
                      return (
                        <div
                          key={slot.key}
                          className="text-[11px] text-zinc-400"
                          style={{
                            height: ROW_HEIGHT_PX,
                            lineHeight: `${ROW_HEIGHT_PX}px`,
                          }}
                        >
                          {isHour ? `${String(slot.start.getHours()).padStart(2, "0")}:00` : ""}
                        </div>
                      );
                    })}
                  </div>
                  <div
                    className="relative min-w-0 flex-1"
                    style={{ height: TOTAL_SLOTS * ROW_HEIGHT_PX }}
                  >
                    {/** Drop grid — выше карточек при перетаскивании, чтобы ловить дроп на строку ниже */}
                    {slots.map((slot, slotIndex) => (
                      <div
                        key={slot.key}
                        className={[
                          "absolute left-0 right-0",
                          slot.end.getMinutes() === 0
                            ? "border-b-2 border-zinc-300"
                            : "border-b border-zinc-100",
                        ].join(" ")}
                        style={{
                          top: slotIndex * ROW_HEIGHT_PX,
                          height: ROW_HEIGHT_PX,
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          setHoverSlotKey(slot.key);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          let visitId = dragVisitId;
                          const payload = e.dataTransfer.getData("application/json");
                          if (payload) {
                            try {
                              const parsed = JSON.parse(payload) as {
                                visitId?: string;
                                session?: number;
                              };
                              if (
                                typeof parsed.session === "number" &&
                                cancelledDragSessionRef.current !== null &&
                                parsed.session === cancelledDragSessionRef.current
                              ) {
                                cancelledDragSessionRef.current = null;
                                setDragVisitId(null);
                                setHoverSlotKey(null);
                                return;
                              }
                              if (parsed.visitId) visitId = parsed.visitId;
                            } catch {
                              // ignore malformed payload
                            }
                          }
                          const visit = visitId
                            ? backlog.find((v) => v.id === visitId) ||
                              dayVisits.find((v) => v.id === visitId)
                            : null;
                          if (!visit || !visitId) return;
                          setDragVisitId(null);
                          setHoverSlotKey(null);
                          void handleDropToSlot(visit, slot);
                        }}
                      />
                    ))}
                    {dragVisitId && hoverSlotKey
                      ? (() => {
                          const slotIndex = slots.findIndex((s) => s.key === hoverSlotKey);
                          if (slotIndex === -1) return null;
                          const visit =
                            backlog.find((v) => v.id === dragVisitId) ||
                            dayVisits.find((v) => v.id === dragVisitId);
                          if (!visit) return null;
                          const durationMin = visit.durationMin ?? 60;
                          const topPx = slotIndex * ROW_HEIGHT_PX;
                          const heightPx = (durationMin / SLOT_MINUTES) * ROW_HEIGHT_PX;
                          return (
                            <div
                              className="pointer-events-none absolute left-0 right-0 rounded-md border-2 border-dashed border-blue-300 bg-blue-50/30"
                              style={{
                                top: topPx,
                                height: Math.max(heightPx, 28),
                                minHeight: 28,
                              }}
                            />
                          );
                        })()
                      : null}
                    {(() => {
                      const visible = sortedForTimeline.filter((v) => {
                        if (!v.startsAt || !v.endsAt) return false;
                        const s = new Date(v.startsAt);
                        return s.getTime() >= dayStart.getTime() && s.getTime() < dayEnd.getTime();
                      });
                      const layout = computeVisitLayout(
                        visible.map((v) => ({
                          id: v.id,
                          startsAt: new Date(v.startsAt!),
                          endsAt: new Date(v.endsAt!),
                        })),
                      );
                      return visible.map((v) => {
                        const isConflict = dayConflicts.has(v.id);
                        const start = new Date(v.startsAt!);
                        const startMinutesFromDayStart =
                          (start.getTime() - dayStart.getTime()) / (60 * 1000);
                        const durationMin = v.durationMin ?? 60;
                        const topPx = (startMinutesFromDayStart / SLOT_MINUTES) * ROW_HEIGHT_PX;
                        const heightPx = (durationMin / SLOT_MINUTES) * ROW_HEIGHT_PX;
                        const layoutInfo = layout.get(v.id);
                        const column = layoutInfo?.column ?? 0;
                        const columns = layoutInfo?.columns ?? 1;
                        const widthPercent = 100 / columns;
                        const leftPercent = column * widthPercent;
                        const isHovered = hoveredVisitId === v.id;
                        const isDragging = dragVisitId === v.id;
                        const isExpanded = isHovered && !isDragging;
                        const minH = isExpanded ? Math.max(heightPx, 112) : 28;
                        return (
                          <div
                            key={v.id}
                            className={[
                              "group absolute rounded-md border px-2 py-1 text-xs shadow-sm transition-[min-height,box-shadow] duration-150",
                              isConflict
                                ? "border-amber-400 bg-amber-50"
                                : v.status === "DONE" &&
                                    (v.outcome === "FAILED" ||
                                      v.outcome === "NOT_RELEVANT" ||
                                      v.outcome === "NO_DECISION")
                                  ? "border-red-300 bg-red-50 hover:border-red-400"
                                  : v.status === "DONE"
                                    ? "border-emerald-300 bg-emerald-50 hover:border-emerald-400"
                                    : v.status === "IN_PROGRESS"
                                      ? "border-amber-300 bg-amber-50 hover:border-amber-400"
                                      : routeSessionState?.session?.isActive &&
                                          routeSessionState.session.currentVisitId === v.id
                                        ? "border-blue-400 bg-blue-50 ring-1 ring-blue-200"
                                        : "border-zinc-200 bg-zinc-50 hover:border-zinc-400 hover:bg-zinc-50",
                              isExpanded ? "z-10 shadow-md" : "",
                            ].join(" ")}
                            style={{
                              top: topPx,
                              height: Math.max(heightPx, 28),
                              minHeight: minH,
                              width: `${widthPercent}%`,
                              left: `${leftPercent}%`,
                            }}
                            draggable
                            onMouseEnter={() => setHoveredVisitId(v.id)}
                            onMouseLeave={() => setHoveredVisitId(null)}
                            onDragStart={(e) => {
                              e.dataTransfer.setData(
                                "application/json",
                                JSON.stringify({ visitId: v.id }),
                              );
                              e.dataTransfer.effectAllowed = "move";
                              setDragVisitId(v.id);
                              setHoveredVisitId(null);
                            }}
                            onDragEnd={() => setDragVisitId((cur) => (cur === v.id ? null : cur))}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 truncate font-medium text-zinc-900">
                                {v.title || v.addressText || "Visit"}
                              </div>
                              <span className="shrink-0 text-[10px] text-zinc-500">
                                {v.startsAt && v.endsAt
                                  ? `${formatHmKyiv(v.startsAt)}–${formatHmKyiv(v.endsAt)}`
                                  : ""}
                              </span>
                            </div>
                            {v.purpose ? (
                              <div className="mt-0.5 line-clamp-2 text-[10px] text-zinc-600">
                                {v.purpose}
                              </div>
                            ) : null}
                            <div className="mt-0.5 truncate text-[11px] text-zinc-500">
                              {v.addressText || <span className="text-amber-600">Нет адреса</span>}
                            </div>
                            <div
                              className={
                                "mt-1 space-y-1 pb-3 text-[11px] text-zinc-500 transition-opacity " +
                                (isExpanded ? "opacity-100" : "opacity-0 group-hover:opacity-100")
                              }
                            >
                              <div>Duration: {v.durationMin ?? 60} min</div>
                              <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
                                <button
                                  type="button"
                                  className="rounded border border-zinc-200 px-1 py-0.5 hover:bg-zinc-100"
                                  onClick={() => void handleMoveOnTimeline(v, -SLOT_MINUTES)}
                                >
                                  ↑ earlier
                                </button>
                                <button
                                  type="button"
                                  className="rounded border border-zinc-200 px-1 py-0.5 hover:bg-zinc-100"
                                  onClick={() => void handleMoveOnTimeline(v, SLOT_MINUTES)}
                                >
                                  ↓ later
                                </button>
                                <button
                                  type="button"
                                  className="rounded border border-zinc-200 px-1 py-0.5 hover:bg-zinc-100"
                                  onClick={() =>
                                    void handleResizeVisit(v, (v.durationMin ?? 60) + SLOT_MINUTES)
                                  }
                                >
                                  +30m
                                </button>
                                <button
                                  type="button"
                                  className="rounded border border-zinc-200 px-1 py-0.5 hover:bg-zinc-100"
                                  onClick={() =>
                                    void handleResizeVisit(v, (v.durationMin ?? 60) - SLOT_MINUTES)
                                  }
                                >
                                  -30m
                                </button>
                                <button
                                  type="button"
                                  className="rounded border border-red-200 px-1 py-0.5 text-red-600 hover:bg-red-50"
                                  onClick={() => void handleRemoveVisit(v)}
                                >
                                  Remove
                                </button>
                              </div>
                              {v.lat == null || v.lng == null ? (
                                <div className="text-[10px] text-amber-600">
                                  Нужно указать точку на карте
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </>
              );
            })()}
          </div>
        </section>

        <section
          className="max-md:hidden flex min-h-0 min-w-0 flex-col rounded-lg border border-zinc-200 bg-white md:min-h-[min(560px,calc(100vh-200px))]"
          aria-label="Карта маршрута"
        >
          <div className="shrink-0 border-b border-zinc-200 px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-900">Карта</div>
                {routePlan && routePlan.stops?.length ? (
                  <div className="text-[11px] text-zinc-500">
                    Маршрут сохранён ({routePlan.stops.length} остановок)
                    {" · "}
                    {routeMetricsLoading ? (
                      "считаем км…"
                    ) : routeMetrics?.distanceKm != null ? (
                      <>
                        {routeMetrics.distanceKm} км
                        {routeMetrics.durationMin != null
                          ? ` · ~${routeMetrics.durationMin} мин`
                          : ""}
                        {routeMetrics.source === "fallback" ? " (примерно)" : ""}
                      </>
                    ) : (
                      "км: —"
                    )}
                  </div>
                ) : (
                  <div className="text-[11px] text-zinc-500">Маршрут ещё не сохранён.</div>
                )}
              </div>
            </div>
          </div>
          <div className="relative min-h-[280px] flex-1 p-2">
            {mapsConfigError ? (
              <div className="flex h-full min-h-[200px] items-center justify-center px-3 text-center text-xs text-amber-600">
                {mapsConfigError}
              </div>
            ) : !mapsApiKey ? (
              <div className="flex h-full min-h-[200px] items-center justify-center px-3 text-center text-xs text-zinc-500">
                Loading Google Maps configuration…
              </div>
            ) : (
              <VisitsMapContent
                mapsApiKey={mapsApiKey}
                centerLatLng={centerLatLng}
                scheduledVisits={scheduledVisits}
                onMarkerDragEnd={handleMarkerDragEnd}
                routeAnchors={routeAnchors}
              />
            )}
          </div>
        </section>
      </div>

      {isDraggingFromBacklog ? (
        <div
          className="pointer-events-none fixed inset-0 z-[35] flex items-end justify-center p-4 pb-28 md:items-center md:justify-end md:pb-4 md:pr-6"
          aria-live="polite"
        >
          <div className="pointer-events-auto flex max-w-[220px] flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg">
            <p className="text-center text-xs text-zinc-600">Перетащите визит на слот расписания</p>
            <button
              type="button"
              onClick={() => cancelBacklogDrag()}
              className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
            >
              Отмена
            </button>
            <p className="text-center text-[10px] text-zinc-400">или Esc</p>
          </div>
        </div>
      ) : null}

      {mapSheetOpen ? (
        <div
          className="fixed inset-0 z-40 flex flex-col justify-end bg-black/40 md:hidden"
          role="presentation"
        >
          <button
            type="button"
            aria-label="Close map"
            className="min-h-0 flex-1 cursor-default"
            onClick={() => setMapSheetOpen(false)}
          />
          <div className="max-h-[85vh] rounded-t-xl border border-zinc-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Карта</div>
                {routePlan && routePlan.stops?.length ? (
                  <div className="text-[11px] text-zinc-500">
                    Маршрут сохранён ({routePlan.stops.length} остановок)
                  </div>
                ) : (
                  <div className="text-[11px] text-zinc-500">Маршрут ещё не сохранён.</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setMapSheetOpen(false)}
                className="rounded-md border border-zinc-200 px-2 py-1 text-sm text-zinc-700"
              >
                Закрыть
              </button>
            </div>
            <div className="h-2 w-12 shrink-0 self-center rounded-full bg-zinc-200" aria-hidden />
            <div className="w-full shrink-0" style={{ height: "min(55vh, 480px)" }}>
              {mapsConfigError ? (
                <div className="flex h-full items-center justify-center px-3 text-center text-xs text-amber-600">
                  {mapsConfigError}
                </div>
              ) : !mapsApiKey ? (
                <div className="flex h-full items-center justify-center px-3 text-center text-xs text-zinc-500">
                  Loading Google Maps configuration…
                </div>
              ) : (
                <VisitsMapContent
                  mapsApiKey={mapsApiKey}
                  centerLatLng={centerLatLng}
                  scheduledVisits={scheduledVisits}
                  onMarkerDragEnd={handleMarkerDragEnd}
                  routeAnchors={routeAnchors}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}

      {pendingSchedule ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900">Цель встречи</h3>
            <p className="mt-1 text-sm text-zinc-500">
              {pendingSchedule.visit.title || pendingSchedule.visit.addressText || "Визит"}
            </p>
            <label className="mt-3 block text-xs font-medium text-zinc-700">Цель *</label>
            <textarea
              value={purposeDraft}
              onChange={(e) => setPurposeDraft(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              placeholder="Зачем едете к клиенту"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingSchedule(null);
                  setPurposeDraft("");
                }}
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  const text = purposeDraft.trim();
                  if (!text) {
                    pushToast("Укажите цель встречи.", "error");
                    return;
                  }
                  const ps = pendingSchedule;
                  if (!ps) return;
                  setPendingSchedule(null);
                  setPurposeDraft("");
                  void applyScheduleToSlot(ps.visit, ps.slot, text);
                }}
                className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
              >
                В план
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {routeAnchorsPromptOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="px-5 py-4">
              <div className="text-base font-semibold text-zinc-900">Маршрут визитов</div>
              <p className="mt-1 text-sm text-zinc-600">
                Для «Маршрут дня» нужна стартовая точка. Финиш по умолчанию будет таким же, как
                старт.
              </p>
              <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                Откройте сотрудника → «Маршрут визитов» и заполните «Старт — подпись» через
                автокомплит (координаты подставятся автоматически).
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-zinc-200 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setRouteAnchorsPromptOpen(false);
                  }}
                  className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  Понятно
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRouteAnchorsPromptOpen(false);
                    // Employees page contains per-user start/end route settings in EmployeeModal.
                    window.location.href = "/employees";
                  }}
                  className="btn-primary"
                >
                  Открыть сотрудников
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {resultModalOpen && resultModalVisit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900">Результат встречи</h3>
            <p className="mt-1 text-sm text-zinc-500">
              {resultModalVisit.title || resultModalVisit.addressText || "Visit"}
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700">Результат *</label>
                <select
                  value={resultOutcome}
                  onChange={(e) => setResultOutcome(e.target.value)}
                  className="mt-0.5 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                >
                  <option value="">— выберите —</option>
                  {OUTCOME_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700">Комментарий *</label>
                <textarea
                  value={resultNote}
                  onChange={(e) => setResultNote(e.target.value)}
                  rows={3}
                  className="mt-0.5 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                  placeholder="Кратко опишите итог встречи"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700">
                  Следующее действие (дата)
                </label>
                <input
                  type="datetime-local"
                  value={resultNextActionAt}
                  onChange={(e) => setResultNextActionAt(e.target.value)}
                  className="mt-0.5 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700">
                  Заметка к следующему действию
                </label>
                <textarea
                  value={resultNextActionNote}
                  onChange={(e) => setResultNextActionNote(e.target.value)}
                  rows={2}
                  className="mt-0.5 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setResultModalOpen(false);
                  setResultModalVisit(null);
                }}
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => void handleResultSubmit()}
                className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 shadow">
          {error}
        </div>
      )}
    </div>
  );
}
