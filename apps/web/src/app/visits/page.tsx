"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DateTime } from "luxon";
import {
  visitsApi,
  type Visit,
  routePlansApi,
  routeSessionsApi,
  type RoutePlan,
  type RouteSessionState,
  type RouteGeometryBundle,
  type RouteGeometryResult,
} from "@/lib/api";
import { apiHttp } from "@/lib/api/client";
import { RouteLayerControls, routeSourceLabel, type RouteLayerKey } from "@/components/visits/RouteLayerControls";
import { VisitsRouteMap } from "@/components/visits/VisitsRouteMap";
import { ChevronDown, ChevronUp, Save } from "lucide-react";
import { CRM_TIME_ZONE, jsDateToYmdKyiv, todayYmdInKyiv } from "@/lib/crmDatetime";
import { useConfirm, useToast } from "@/components/feedback";
import { HelpHint } from "@/components/help/HelpHint";
import { ManagerSelect } from "@/components/visits/ManagerSelect";
import { VisitsSubNav } from "./VisitsSubNav";
import { LogAdHocVisitModal } from "@/components/visits/LogAdHocVisitModal";
import { VisitLocationPicker } from "@/components/visits/VisitLocationPicker";
import { pickVisitReadyAddresses } from "@/components/EntityAddressesSection";
import { entityAddressesApi, type EntityAddress } from "@/lib/api/resources/entity-addresses";
import { geocodeText } from "@/lib/googlePlacesNew";
import {
  buildVisitLocationUpdatePayload,
  defaultVisitLocationFromAddresses,
  visitLocationFromVisit,
  visitLocationHasCoords,
  type VisitLocationValue,
} from "@/lib/visits/visit-location.types";
import { strings } from "@/locales";

function formatHmKyiv(iso: string): string {
  const d = DateTime.fromISO(iso, { setZone: true }).setZone(CRM_TIME_ZONE);
  return d.isValid ? d.toFormat("HH:mm") : "";
}

function sortScheduledVisitIds(visits: Visit[]): string[] {
  return [...visits]
    .filter((v) => v.status !== "CANCELED" && v.status !== "PLANNED_UNASSIGNED")
    .sort((a, b) => {
      const aTime = a.startsAt ? new Date(a.startsAt).getTime() : 0;
      const bTime = b.startsAt ? new Date(b.startsAt).getTime() : 0;
      if (aTime !== bTime) return aTime - bTime;
      return String(a.id).localeCompare(String(b.id));
    })
    .map((v) => v.id);
}

function mergeRouteOrder(planIds: string[], scheduledIds: string[]): string[] {
  const scheduledSet = new Set(scheduledIds);
  const result = planIds.filter((id) => scheduledSet.has(id));
  for (const id of scheduledIds) {
    if (!result.includes(id)) result.push(id);
  }
  return result;
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

function parseVisitDateFromUrl(raw: string | null): Date {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const dt = DateTime.fromISO(raw, { zone: CRM_TIME_ZONE }).startOf("day");
    if (dt.isValid) return dt.toJSDate();
  }
  return DateTime.now().setZone(CRM_TIME_ZONE).startOf("day").toJSDate();
}

export default function VisitsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-zinc-500">Завантаження візитів…</div>}>
      <VisitsPageContent />
    </Suspense>
  );
}

function VisitsPageContent() {
  const searchParams = useSearchParams();
  const { pushToast } = useToast();
  const { confirm } = useConfirm();
  const [date, setDate] = useState<Date>(() => parseVisitDateFromUrl(searchParams.get("date")));
  const highlightVisitIds = useMemo(() => {
    const raw = searchParams.get("ids");
    if (!raw) return new Set<string>();
    return new Set(raw.split(",").map((id) => id.trim()).filter(Boolean));
  }, [searchParams]);
  const [backlog, setBacklog] = useState<Visit[]>([]);
  const [dayVisits, setDayVisits] = useState<Visit[]>([]);
  const [routePlan, setRoutePlan] = useState<RoutePlan | null>(null);
  const [routeSessionState, setRouteSessionState] = useState<RouteSessionState | null>(null);
  const [routeSessionLoading, setRouteSessionLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingRoute, setSavingRoute] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routeGeometryBundle, setRouteGeometryBundle] = useState<RouteGeometryBundle | null>(null);
  const [plannedPreviewGeometry, setPlannedPreviewGeometry] =
    useState<RouteGeometryResult | null>(null);
  const [routeGeometryLoading, setRouteGeometryLoading] = useState(false);
  const [routeGeometryPreviewLoading, setRouteGeometryPreviewLoading] = useState(false);
  const [routeLayers, setRouteLayers] = useState<Record<RouteLayerKey, boolean>>({
    planned: true,
    fact_visits: false,
    fact_gps: false,
  });

  const [autoSaveRoutePlan, setAutoSaveRoutePlan] = useState(true);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSaveRouteRef = useRef<() => Promise<void>>(async () => {});
  const loadGenerationRef = useRef(0);
  const [routeOrderIds, setRouteOrderIds] = useState<string[]>([]);

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
  /** On narrow screens only one main pane is shown at a time. */
  const [mobilePane, setMobilePane] = useState<"backlog" | "schedule">("schedule");
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
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyHits, setCompanyHits] = useState<{ id: string; name: string; phone?: string | null }[]>(
    [],
  );
  const [backlogAddMode, setBacklogAddMode] = useState<"contact" | "company">("contact");
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [newVisitPurpose, setNewVisitPurpose] = useState("");
  const [creatingBacklogVisit, setCreatingBacklogVisit] = useState(false);
  const [pendingContactId, setPendingContactId] = useState<string | null>(null);
  const [pendingCompanyId, setPendingCompanyId] = useState<string | null>(null);
  const [scheduleBacklogVisit, setScheduleBacklogVisit] = useState<Visit | null>(null);
  const [scheduleBacklogAt, setScheduleBacklogAt] = useState("");
  const [schedulingBacklog, setSchedulingBacklog] = useState(false);
  const [logAdHocModalOpen, setLogAdHocModalOpen] = useState(false);

  const [locationEditVisit, setLocationEditVisit] = useState<Visit | null>(null);
  const [locationEditEntityType, setLocationEditEntityType] = useState<"contact" | "company">(
    "contact",
  );
  const [locationEditAddresses, setLocationEditAddresses] = useState<EntityAddress[]>([]);
  const [locationEditValue, setLocationEditValue] = useState<VisitLocationValue | null>(null);
  const [locationEditSaving, setLocationEditSaving] = useState(false);
  const [locationEditError, setLocationEditError] = useState(false);

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

  useEffect(() => {
    if (highlightVisitIds.size === 0 || loading) return;
    const firstId = [...highlightVisitIds].find((id) => dayVisits.some((v) => v.id === id));
    if (!firstId) return;
    const el = document.querySelector(`[data-visit-id="${firstId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [dayVisits, highlightVisitIds, loading]);
  const showOwnerFilter = role === "ADMIN" || role === "LEAD";
  const planOwnerOpts = useMemo(() => {
    if (viewOwnerId) return { ownerId: viewOwnerId };
    if (!showOwnerFilter && myUserId) return { ownerId: myUserId };
    // LEAD plans own route by default; ADMIN must pick a manager explicitly.
    if (showOwnerFilter && role === "LEAD" && myUserId) return { ownerId: myUserId };
    return undefined;
  }, [viewOwnerId, showOwnerFilter, myUserId, role]);
  const readOnlyPlan = Boolean(
    planOwnerOpts && myUserId && planOwnerOpts.ownerId !== myUserId,
  );
  const showMultiOwnerDay = showOwnerFilter && !viewOwnerId;
  const slots = useMemo(() => getSlotsForDate(date), [date]);

  const scheduledVisits = dayVisits;

  const timelineOrderVisitIds = useMemo(() => {
    const ownerId = planOwnerOpts?.ownerId;
    const forPlan = ownerId
      ? dayVisits.filter((v) => v.ownerId === ownerId)
      : dayVisits;
    return sortScheduledVisitIds(forPlan);
  }, [dayVisits, planOwnerOpts?.ownerId]);

  const currentOrderVisitIds = useMemo(() => {
    if (routeOrderIds.length === 0) return timelineOrderVisitIds;
    return mergeRouteOrder(routeOrderIds, timelineOrderVisitIds);
  }, [routeOrderIds, timelineOrderVisitIds]);

  const routeListVisits = useMemo(
    () =>
      currentOrderVisitIds
        .map((id) => dayVisits.find((v) => v.id === id))
        .filter((v): v is Visit => v != null),
    [currentOrderVisitIds, dayVisits],
  );

  const savedPlanVisitIds = useMemo(() => {
    if (!routePlan?.stops?.length) return [];
    return routePlan.stops.map((s) => s.visitId);
  }, [routePlan?.stops]);

  const hasUnsavedPlanOrder = useMemo(() => {
    if (currentOrderVisitIds.length === 0) return false;
    if (!routePlan?.stops?.length) return true;
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
    // Multi-owner day view mixes team visits — never auto-save into one person's RoutePlan.
    if (showMultiOwnerDay) return;
    if (!planOwnerOpts || readOnlyPlan) return;
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
    showMultiOwnerDay,
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
      setMapsConfigError("Не вдалося завантажити конфігурацію Google Maps.");
      setMapsApiKey(null);
    }
  }, []);

  const loadData = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
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
      if (generation !== loadGenerationRef.current) return;
      setBacklog(backlogRes);
      const dayItems = dayRes.items ?? [];
      setDayVisits(dayItems);
      setRoutePlan(planRes.plan ?? null);
      setRouteSessionState(sessionRes ?? null);
      const planOwnerId = planOwnerOpts?.ownerId;
      const planOwnerDayItems = planOwnerId
        ? dayItems.filter((v) => v.ownerId === planOwnerId)
        : dayItems;
      const scheduledIds = sortScheduledVisitIds(planOwnerDayItems);
      const planIds = (planRes.plan?.stops ?? [])
        .filter((s) => {
          const visit = dayItems.find((v) => v.id === s.visitId);
          // Keep stop if we can't resolve owner (single-owner day) or it matches plan owner.
          return !planOwnerId || !visit || visit.ownerId === planOwnerId;
        })
        .map((s) => s.visitId);
      setRouteOrderIds(planIds.length ? mergeRouteOrder(planIds, scheduledIds) : scheduledIds);
    } catch (e) {
      if (generation !== loadGenerationRef.current) return;
      setError(e instanceof Error ? e.message : "Не вдалося завантажити візити");
      setBacklog([]);
      setDayVisits([]);
      setRoutePlan(null);
      setRouteSessionState(null);
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [dateParam, planOwnerOpts, showOwnerFilter, viewOwnerId]);

  const loadGeometryBundle = useCallback(async () => {
    if (!planOwnerOpts) return;
    setRouteGeometryLoading(true);
    try {
      const b = await routePlansApi.geometryBundle(dateParam, planOwnerOpts);
      setRouteGeometryBundle(b);
    } catch {
      setRouteGeometryBundle(null);
    } finally {
      setRouteGeometryLoading(false);
    }
  }, [dateParam, planOwnerOpts]);

  useEffect(() => {
    void loadMapsConfig();
  }, [loadMapsConfig]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setRouteGeometryBundle(null);
    if (!planOwnerOpts) return;
    void loadGeometryBundle();
  }, [dateParam, planOwnerOpts, routePlan?.id, loadGeometryBundle]);

  useEffect(() => {
    setPlannedPreviewGeometry(null);
    if (!planOwnerOpts || currentOrderVisitIds.length === 0 || hasScheduledWithoutCoords) return;
    setRouteGeometryPreviewLoading(true);
    const t = window.setTimeout(() => {
      void routePlansApi
        .geometryPreview(dateParam, currentOrderVisitIds, planOwnerOpts)
        .then((g) => setPlannedPreviewGeometry(g))
        .catch(() => setPlannedPreviewGeometry(null))
        .finally(() => setRouteGeometryPreviewLoading(false));
    }, 300);
    return () => window.clearTimeout(t);
  }, [
    currentOrderVisitIds,
    dateParam,
    hasScheduledWithoutCoords,
    planOwnerOpts,
  ]);

  const savedPlanMetrics = routeGeometryBundle?.planned ?? null;
  const routeFactMetrics = routeGeometryBundle?.factVisits ?? null;
  const routeMetricsPreview = plannedPreviewGeometry;

  const mapGeometries = useMemo(
    () => ({
      planned: plannedPreviewGeometry ?? routeGeometryBundle?.planned ?? null,
      fact_visits: routeGeometryBundle?.factVisits ?? null,
      fact_gps: routeGeometryBundle?.factGps ?? null,
    }),
    [plannedPreviewGeometry, routeGeometryBundle],
  );

  const mapMarkers = useMemo(
    () =>
      scheduledVisits
        .filter((v) => v.lat != null && v.lng != null)
        .map((v, idx) => ({
          lat: v.lat as number,
          lng: v.lng as number,
          label: String(idx + 1),
          visitId: v.id,
        })),
    [scheduledVisits],
  );

  const toggleRouteLayer = (key: RouteLayerKey) => {
    setRouteLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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
    if (role === "ADMIN" || role === "LEAD") {
      setRouteLayers((prev) => ({ ...prev, fact_gps: true }));
    }
  }, [role]);

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

  useEffect(() => {
    const q = companyQuery.trim();
    if (q.length < 2) {
      setCompanyHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      void apiHttp
        .get<{ items?: { id: string; name: string; phone?: string | null }[] }>("/companies", {
          params: { search: q, pageSize: 15 },
        } as never)
        .then((r) => {
          setCompanyHits(r.data?.items ?? []);
        })
        .catch(() => setCompanyHits([]));
    }, 300);
    return () => window.clearTimeout(t);
  }, [companyQuery]);

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
      setRouteOrderIds((prev) =>
        prev.includes(updated.id) ? prev : [...prev, updated.id],
      );
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Не вдалося призначити візит", "error");
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
      pushToast(e instanceof Error ? e.message : "Не вдалося перемістити візит", "error");
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
      pushToast(e instanceof Error ? e.message : "Не вдалося змінити тривалість візиту", "error");
      void loadData();
    }
  };

  const moveInRouteOrder = useCallback((visitId: string, delta: number) => {
    setRouteOrderIds((prev) => {
      const base = prev.length ? mergeRouteOrder(prev, timelineOrderVisitIds) : [...timelineOrderVisitIds];
      const idx = base.indexOf(visitId);
      if (idx === -1) return base;
      const next = idx + delta;
      if (next < 0 || next >= base.length) return base;
      const copy = [...base];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });
  }, [timelineOrderVisitIds]);

  const refreshRouteSession = useCallback(async () => {
    if (!planOwnerOpts) return;
    try {
      const state = await routeSessionsApi.get(dateParam, planOwnerOpts);
      if (state?.session?.isActive) {
        setRouteSessionState(state);
      }
    } catch {
      // ignore
    }
  }, [dateParam, planOwnerOpts]);

  const handleSaveRoute = async () => {
    if (!planOwnerOpts || readOnlyPlan) return;
    if (showMultiOwnerDay) {
      pushToast("Оберіть менеджера, щоб зберегти маршрут", "error");
      return;
    }
    setSavingRoute(true);
    try {
      const ownerId = planOwnerOpts.ownerId;
      const ids = currentOrderVisitIds.filter((id) => {
        const v = dayVisits.find((x) => x.id === id);
        return !v || v.ownerId === ownerId;
      });
      const res = await routePlansApi.saveForDay(dateParam, ids, planOwnerOpts);
      setRoutePlan(res.plan ?? null);
      setRouteOrderIds(ids);
      if (res.plan?.stops?.length) {
        await loadGeometryBundle();
      } else {
        setRouteGeometryBundle(null);
      }
      await refreshRouteSession();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Не вдалося зберегти маршрут", "error");
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
      let addressText = visit.addressText ?? undefined;
      if (mapsApiKey) {
        const geo = await geocodeText(mapsApiKey, `${lat},${lng}`, { regionCode: "UA" });
        if (geo?.formattedAddress) {
          addressText = geo.formattedAddress;
        }
      }
      const updated = await visitsApi.update(visit.id, {
        lat,
        lng,
        addressText: addressText ?? null,
        locationSource: "PIN_ADJUSTED",
        contactAddressId: null,
        companyAddressId: null,
      });
      setDayVisits((prev) => prev.map((v) => (v.id === visit.id ? updated : v)));
      setBacklog((prev) => prev.map((v) => (v.id === visit.id ? updated : v)));
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Не вдалося оновити координати", "error");
    }
  };

  const openLocationEdit = async (visit: Visit) => {
    const entityType: "contact" | "company" = visit.contactId ? "contact" : "company";
    const entityId = visit.contactId ?? visit.companyId;
    if (!entityId) {
      pushToast("Візит не привʼязаний до картки клієнта.", "error");
      return;
    }
    try {
      const items = await entityAddressesApi.list(entityType, entityId);
      const ready = pickVisitReadyAddresses(items);
      const value =
        visitLocationFromVisit(visit, entityType, items) ??
        defaultVisitLocationFromAddresses(ready);
      setLocationEditEntityType(entityType);
      setLocationEditAddresses(items);
      setLocationEditValue(value);
      setLocationEditError(false);
      setLocationEditVisit(visit);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Не вдалося завантажити адреси", "error");
    }
  };

  const saveLocationEdit = async () => {
    if (!locationEditVisit) return;
    if (!locationEditValue || !visitLocationHasCoords(locationEditValue)) {
      setLocationEditError(true);
      return;
    }
    setLocationEditSaving(true);
    try {
      const updated = await visitsApi.update(
        locationEditVisit.id,
        buildVisitLocationUpdatePayload(locationEditValue, locationEditEntityType),
      );
      setDayVisits((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
      setBacklog((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
      setLocationEditVisit(null);
      setLocationEditValue(null);
      pushToast(strings.visitLocation.saveLocation, "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Не вдалося оновити локацію", "error");
    } finally {
      setLocationEditSaving(false);
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
      setRouteOrderIds((prev) => prev.filter((id) => id !== visit.id));
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Не вдалося перемістити візит to backlog", "error");
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
        setRouteOrderIds((prev) => prev.filter((id) => id !== visit.id));
      } catch (e) {
        pushToast(e instanceof Error ? e.message : "Не вдалося видалити візит", "error");
        void loadData();
      }
    },
    [confirm, loadData, pushToast],
  );

  const handleResultSubmit = async () => {
    if (!resultModalVisit || !resultOutcome.trim() || !resultNote.trim()) {
      pushToast("Вкажіть результат (outcome) і коментар (resultNote).", "error");
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
      pushToast(e instanceof Error ? e.message : "Не вдалося зберегти результат", "error");
    }
  };

  const OUTCOME_OPTIONS = [
    { value: "SUCCESS", label: "Успех" },
    { value: "FOLLOW_UP", label: "Дозвон / повтор" },
    { value: "NO_DECISION", label: "Без рішення" },
    { value: "NOT_RELEVANT", label: "Не релевантно" },
    { value: "FAILED", label: "Неудача" },
  ] as const;

  const handleCreateBacklogFromContact = async () => {
    if (!pendingContactId) return;
    if (!newVisitPurpose.trim()) {
      pushToast("Вкажіть мету зустрічі.", "error");
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
      pushToast(e instanceof Error ? e.message : "Не вдалося створити візит", "error");
    } finally {
      setCreatingBacklogVisit(false);
    }
  };

  const handleCreateBacklogFromCompany = async () => {
    if (!pendingCompanyId) return;
    if (!newVisitPurpose.trim()) {
      pushToast("Вкажіть мету зустрічі.", "error");
      return;
    }
    setCreatingBacklogVisit(true);
    try {
      const company = companyHits.find((c) => c.id === pendingCompanyId);
      const v = await visitsApi.create({
        companyId: pendingCompanyId,
        title: company?.name || "Візит",
        purpose: newVisitPurpose.trim(),
      });
      setBacklog((prev) => [v, ...prev]);
      setPendingCompanyId(null);
      setNewVisitPurpose("");
      setCompanyQuery("");
      setCompanyHits([]);
      setContactPickerOpen(false);
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Не вдалося створити візит", "error");
    } finally {
      setCreatingBacklogVisit(false);
    }
  };

  const openScheduleBacklog = (visit: Visit) => {
    const base = new Date(date);
    base.setHours(10, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    setScheduleBacklogAt(
      `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}T${pad(base.getHours())}:${pad(base.getMinutes())}`,
    );
    setScheduleBacklogVisit(visit);
  };

  const handleScheduleBacklogVisit = async () => {
    if (!scheduleBacklogVisit || !scheduleBacklogAt) return;
    const startsAt = new Date(scheduleBacklogAt);
    if (Number.isNaN(startsAt.getTime())) {
      pushToast("Вкажіть коректні дату і час.", "error");
      return;
    }
    const durationMin = scheduleBacklogVisit.durationMin ?? 60;
    const endsAt = new Date(startsAt.getTime() + durationMin * 60 * 1000);
    setSchedulingBacklog(true);
    try {
      const updated = await visitsApi.update(scheduleBacklogVisit.id, {
        status: "SCHEDULED",
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        durationMin,
      });
      setBacklog((prev) => prev.filter((v) => v.id !== updated.id));
      setDayVisits((prev) => {
        const rest = prev.filter((v) => v.id !== updated.id);
        return [...rest, updated].sort((a, b) => {
          const aTime = a.startsAt ? new Date(a.startsAt).getTime() : 0;
          const bTime = b.startsAt ? new Date(b.startsAt).getTime() : 0;
          return aTime - bTime;
        });
      });
      setScheduleBacklogVisit(null);
      setScheduleBacklogAt("");
      pushToast("Візит призначено на обрані дату і час.", "success");
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Не вдалося призначити візит", "error");
    } finally {
      setSchedulingBacklog(false);
    }
  };

  return (
    <div
      ref={visitsRootRef}
      className="-mx-4 -mt-4 mb-[-1rem] flex min-h-[calc(100vh-3.5rem)] flex-col bg-zinc-50 md:mx-0 md:mt-0 md:mb-0 md:min-h-screen"
    >
      <div className="border-b border-zinc-200 bg-white px-3 py-2 sm:px-6 sm:py-3">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-zinc-900 sm:text-xl">Візити</h1>
            <p className="hidden text-sm text-zinc-500 sm:block">
              Plan field visits for the day, arrange them on a timeline, and save the route.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <HelpHint routeKey="visits" />
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
                className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm hover:bg-zinc-50"
              >
                ←
              </button>
              <button
                type="button"
                onClick={handleToday}
                className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50"
              >
                Сьогодні
              </button>
              <button
                type="button"
                onClick={handleNextDay}
                className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm hover:bg-zinc-50"
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
                    pushToast(e instanceof Error ? e.message : "Не вдалося розпочати маршрут", "error");
                  } finally {
                    setRouteSessionLoading(false);
                  }
                }}
                className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 sm:w-auto sm:py-1.5"
              >
                {routeSessionLoading ? "…" : "Почати день/маршрут"}
              </button>
            ) : null}
          </div>
        </div>
        <div className="mx-auto max-w-7xl pt-1 sm:pt-2">
          <VisitsSubNav />
          {showOwnerFilter ? (
            <div className="mt-2 flex flex-wrap items-end gap-3 sm:mt-3">
              <div className="min-w-0 flex-1 sm:flex-none">
                <label className="block text-xs font-medium text-zinc-600">Менеджер</label>
                <ManagerSelect
                  users={users}
                  value={viewOwnerId}
                  onChange={setViewOwnerId}
                  allOptionLabel={
                    role === "ADMIN" ? "Усі менеджери (день)" : "Уся команда (день)"
                  }
                  className="mt-0.5 w-full min-w-0 sm:min-w-[220px]"
                />
              </div>
              {showMultiOwnerDay ? (
                <p className="text-xs text-amber-800">
                  Маршрут і км — оберіть конкретного менеджера. Зараз показано візити всіх.
                </p>
              ) : readOnlyPlan ? (
                <p className="text-xs text-zinc-600">Режим просмотра чужого плана</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-7xl gap-1 px-3 pt-3 md:hidden">
        <button
          type="button"
          onClick={() => setMobilePane("backlog")}
          className={[
            "flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium",
            mobilePane === "backlog"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : "border-zinc-200 bg-white text-zinc-700",
          ].join(" ")}
        >
          Backlog
          {backlog.length > 0 ? (
            <span className="ml-1 tabular-nums text-zinc-500">({backlog.length})</span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => setMobilePane("schedule")}
          className={[
            "flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium",
            mobilePane === "schedule"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : "border-zinc-200 bg-white text-zinc-700",
          ].join(" ")}
        >
          Розклад
          {scheduledVisits.length > 0 ? (
            <span className="ml-1 tabular-nums text-zinc-500">({scheduledVisits.length})</span>
          ) : null}
        </button>
      </div>

      {routeSessionState?.session?.isActive && (
        <div className="sticky top-14 z-20 border-b border-zinc-200 bg-white px-3 py-3 shadow-sm sm:px-4 md:top-0">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase text-zinc-500">
                Поточна / наступна зустріч
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
                <div className="mt-1 text-sm text-zinc-500">Немає запланованих зустрічей</div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <button
                type="button"
                onClick={() => setLogAdHocModalOpen(true)}
                className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100 sm:py-1.5"
              >
                {strings.visitsPage.logAdHoc.newClientButton}
              </button>
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
                className="rounded-md border border-zinc-300 px-2 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 sm:py-1.5"
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
                className="rounded-md border border-zinc-300 px-2 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 sm:py-1.5"
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
                className="rounded-md bg-zinc-800 px-2 py-2 text-xs font-medium text-white hover:bg-zinc-900 disabled:opacity-50 sm:py-1.5"
              >
                Завершити
              </button>
              <button
                type="button"
                onClick={async () => {
                  setRouteSessionLoading(true);
                  try {
                    const state = await routeSessionsApi.next(dateParam);
                    setRouteSessionState(state);
                  } catch (e) {
                    pushToast(e instanceof Error ? e.message : "Помилка", "error");
                  } finally {
                    setRouteSessionLoading(false);
                  }
                }}
                className="rounded-md border border-zinc-300 px-2 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 sm:py-1.5"
              >
                Наступна
              </button>
              <button
                type="button"
                onClick={async () => {
                  setRouteSessionLoading(true);
                  try {
                    const state = await routeSessionsApi.stop(dateParam);
                    setRouteSessionState(state ?? null);
                  } catch (e) {
                    pushToast(e instanceof Error ? e.message : "Помилка", "error");
                  } finally {
                    setRouteSessionLoading(false);
                  }
                }}
                className="rounded-md border border-red-200 px-2 py-2 text-xs font-medium text-red-700 hover:bg-red-50 sm:py-1.5"
              >
                Стоп
              </button>
            </div>
            <div className="w-full shrink-0 overflow-auto md:max-w-xs">
              <div className="text-xs font-semibold uppercase text-zinc-500">Точки маршрута</div>
              <p className="mt-0.5 text-[10px] text-zinc-500">
                Можна змінювати порядок і додавати візити протягом дня
              </p>
              <ul className="mt-1 flex flex-col gap-1">
                {routeListVisits.length === 0 ? (
                  <li className="text-[11px] text-zinc-500">Немає запланованих візитів</li>
                ) : (
                  routeListVisits.map((v, idx) => {
                    const isCurrent = v.id === routeSessionState.session.currentVisitId;
                    const isDone = v.status === "DONE";
                    const isInProgress = v.status === "IN_PROGRESS";
                    const isUnsuccessfulOutcome =
                      isDone &&
                      (v.outcome === "FAILED" ||
                        v.outcome === "NOT_RELEVANT" ||
                        v.outcome === "NO_DECISION");
                    return (
                      <li key={v.id} className="list-none flex items-stretch gap-0.5">
                        {!readOnlyPlan && !isDone ? (
                          <div className="flex shrink-0 flex-col">
                            <button
                              type="button"
                              disabled={idx === 0 || savingRoute}
                              onClick={() => moveInRouteOrder(v.id, -1)}
                              className="rounded border border-zinc-200 bg-white px-0.5 py-0 text-zinc-600 hover:bg-zinc-50 disabled:opacity-30"
                              title="Вище в маршруті"
                              aria-label="Вище в маршруті"
                            >
                              <ChevronUp className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === routeListVisits.length - 1 || savingRoute}
                              onClick={() => moveInRouteOrder(v.id, 1)}
                              className="rounded border border-zinc-200 bg-white px-0.5 py-0 text-zinc-600 hover:bg-zinc-50 disabled:opacity-30"
                              title="Ниже в маршруте"
                              aria-label="Ниже в маршруте"
                            >
                              <ChevronDown className="h-3 w-3" />
                            </button>
                          </div>
                        ) : null}
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
                                e instanceof Error ? e.message : "Не вдалося вибрати візит",
                                "error",
                              );
                            } finally {
                              setRouteSessionLoading(false);
                            }
                          }}
                          className={[
                            "min-w-0 flex-1 rounded px-2 py-0.5 text-left text-[11px] disabled:cursor-not-allowed disabled:opacity-60",
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
                          {v.startsAt ? ` · ${formatHmKyiv(v.startsAt)}` : ""}
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
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto grid min-h-0 w-full max-w-7xl flex-1 grid-cols-1 gap-3 p-3 sm:gap-4 sm:p-4 md:grid-cols-[minmax(240px,280px)_minmax(0,1fr)_minmax(260px,340px)] md:items-stretch">
        <div
          className={[
            "flex min-w-0 flex-col gap-3",
            mobilePane !== "backlog" ? "max-md:hidden" : "",
          ].join(" ")}
        >
          <section className="flex min-h-[min(60vh,520px)] w-full flex-col rounded-lg border border-zinc-200 bg-white md:min-h-0">
            <div className="border-b border-zinc-200 px-3 py-2">
              <div className="text-sm font-semibold text-zinc-900">
                Backlog (planned, unscheduled)
              </div>
              <p className="mt-1 text-[11px] text-zinc-500 md:hidden">
                На телефоні зручніше призначити час кнопкою 🕒 або ↓, ніж перетягуванням.
              </p>
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setBacklogAddMode("contact");
                      setContactPickerOpen((o) => !(o && backlogAddMode === "contact"));
                      setPendingCompanyId(null);
                    }}
                    className="text-xs font-medium text-emerald-700 hover:underline"
                  >
                    + Из контакта
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBacklogAddMode("company");
                      setContactPickerOpen((o) => !(o && backlogAddMode === "company"));
                      setPendingContactId(null);
                    }}
                    className="text-xs font-medium text-emerald-700 hover:underline"
                  >
                    + Из компании
                  </button>
                </div>
                {contactPickerOpen ? (
                  <div className="rounded border border-zinc-200 bg-zinc-50 p-2">
                    {backlogAddMode === "contact" ? (
                      <>
                        <input
                          type="search"
                          placeholder="Пошук контакту (мін. 2 символи)…"
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
                      </>
                    ) : (
                      <>
                        <input
                          type="search"
                          placeholder="Пошук компанії (мін. 2 символи)…"
                          className="w-full rounded border border-zinc-200 px-2 py-1 text-xs"
                          value={companyQuery}
                          onChange={(e) => setCompanyQuery(e.target.value)}
                        />
                        {companyHits.length > 0 ? (
                          <ul className="mt-1 max-h-32 overflow-auto text-xs">
                            {companyHits.map((c) => (
                              <li key={c.id}>
                                <button
                                  type="button"
                                  className={
                                    "w-full rounded px-1 py-1 text-left hover:bg-white " +
                                    (pendingCompanyId === c.id
                                      ? "bg-white ring-1 ring-emerald-300"
                                      : "")
                                  }
                                  onClick={() => {
                                    setPendingCompanyId(c.id);
                                    setNewVisitPurpose("");
                                  }}
                                >
                                  {c.name}
                                  {c.phone ? ` · ${c.phone}` : ""}
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </>
                    )}
                    {(pendingContactId || pendingCompanyId) ? (
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
                          onClick={() =>
                            void (pendingCompanyId
                              ? handleCreateBacklogFromCompany()
                              : handleCreateBacklogFromContact())
                          }
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
                  const companyName = v.company?.name?.trim() || "";
                  const nameLine = contactName || companyName || v.title?.trim() || "—";
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
                        setMobilePane("schedule");
                        requestAnimationFrame(() => {
                          scheduleSectionRef.current?.scrollIntoView({
                            behavior: "smooth",
                            block: "nearest",
                          });
                        });
                      }}
                      onDragEnd={() => setDragVisitId((cur) => (cur === v.id ? null : cur))}
                      className={[
                        "group/card relative cursor-grab rounded-md border px-2 py-2 text-xs shadow-sm hover:bg-zinc-100 sm:pr-[7.5rem] sm:py-1.5",
                        routeSessionState?.session?.isActive &&
                        routeSessionState.session.currentVisitId === v.id
                          ? "border-blue-400 bg-blue-50 ring-1 ring-blue-200"
                          : "border-zinc-200 bg-zinc-50",
                      ].join(" ")}
                    >
                      <div className="mb-1.5 flex items-center justify-end gap-1 sm:absolute sm:right-1 sm:top-1 sm:z-[1] sm:mb-0">
                        <span className="shrink-0 rounded-md bg-zinc-200/90 px-1.5 py-1 text-[10px] font-semibold tabular-nums leading-none text-zinc-900">
                          {v.durationMin ?? 60} хв
                        </span>
                        <div className="pointer-coarse:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover/card:opacity-100 flex items-center gap-1">
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              openScheduleBacklog(v);
                            }}
                            className="min-h-[36px] min-w-[36px] rounded-md px-1.5 py-1 text-[10px] font-medium leading-none text-emerald-700 hover:bg-emerald-100 sm:min-h-[28px] sm:min-w-0"
                            title="Назначить дату и время"
                          >
                            🕒
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              void openLocationEdit(v);
                            }}
                            className="min-h-[36px] min-w-[36px] rounded-md px-1.5 py-1 text-[10px] font-medium leading-none text-zinc-600 hover:bg-zinc-200 sm:min-h-[28px] sm:min-w-0"
                            title={strings.visitLocation.changeLocation}
                          >
                            📍
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              const slot = findNearestAvailableSlot(v, slots, dayVisits, date);
                              if (!slot) {
                                pushToast(
                                  "На обраний день немає вільного вікна під тривалість цього візиту.",
                                );
                                return;
                              }
                              setMobilePane("schedule");
                              handleDropToSlot(v, slot);
                              requestAnimationFrame(() => {
                                scheduleSectionRef.current?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "nearest",
                                });
                              });
                            }}
                            className="min-h-[36px] min-w-[36px] rounded-md px-1 py-1 text-sm font-semibold leading-none text-emerald-700 hover:bg-emerald-100 sm:min-h-[28px] sm:min-w-[28px]"
                            title="На найближчий вільний час в обраний день"
                            aria-label="На найближчий вільний час в обраний день"
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
                            className="min-h-[36px] min-w-[36px] rounded-md px-1 py-1 text-base font-medium leading-none text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 sm:min-h-[28px] sm:min-w-[28px]"
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
            mobilePane !== "schedule" ? "max-md:hidden" : "",
            isDraggingFromBacklog
              ? "border-blue-400 ring-2 ring-blue-200 ring-offset-2 ring-offset-zinc-50"
              : "border-zinc-200",
          ].join(" ")}
        >
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-200 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-zinc-900">Розклад дня</div>
              {dayConflicts.size > 0 && (
                <div className="mt-0.5 text-xs text-amber-600">
                  Some visits overlap in time — please review.
                </div>
              )}
              {!routeSessionState?.session?.isActive &&
              routeListVisits.length > 0 &&
              !readOnlyPlan ? (
                <div className="mt-2 hidden max-h-32 overflow-auto rounded border border-zinc-100 bg-zinc-50/80 p-2 md:block">
                  <div className="text-[11px] font-medium text-zinc-600">Порядок маршрута</div>
                  <ul className="mt-1 space-y-1">
                    {routeListVisits.map((v, idx) => (
                      <li key={v.id} className="flex items-center gap-1 text-[11px]">
                        <span className="w-4 shrink-0 tabular-nums text-zinc-400">{idx + 1}.</span>
                        <span className="min-w-0 flex-1 truncate text-zinc-800">
                          {v.title || v.addressText || "Visit"}
                          {v.startsAt ? ` · ${formatHmKyiv(v.startsAt)}` : ""}
                        </span>
                        <button
                          type="button"
                          disabled={idx === 0 || savingRoute}
                          onClick={() => moveInRouteOrder(v.id, -1)}
                          className="rounded border border-zinc-200 bg-white p-0.5 disabled:opacity-30"
                          title="Вище"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === routeListVisits.length - 1 || savingRoute}
                          onClick={() => moveInRouteOrder(v.id, 1)}
                          className="rounded border border-zinc-200 bg-white p-0.5 disabled:opacity-30"
                          title="Ниже"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="mt-2 space-y-1.5 md:hidden">
                {routeListVisits.length === 0 ? (
                  <p className="text-[11px] text-zinc-500">Немає запланованих візитів на цей день.</p>
                ) : (
                  routeListVisits.map((v, idx) => (
                    <div
                      key={`m-${v.id}`}
                      className="flex items-stretch gap-1 rounded-md border border-zinc-100 bg-zinc-50 px-2 py-1.5 text-[11px]"
                    >
                      {!readOnlyPlan && !routeSessionState?.session?.isActive ? (
                        <div className="flex shrink-0 flex-col justify-center gap-0.5">
                          <button
                            type="button"
                            disabled={idx === 0 || savingRoute}
                            onClick={() => moveInRouteOrder(v.id, -1)}
                            className="rounded border border-zinc-200 bg-white p-1 disabled:opacity-30"
                            aria-label="Вище"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === routeListVisits.length - 1 || savingRoute}
                            onClick={() => moveInRouteOrder(v.id, 1)}
                            className="rounded border border-zinc-200 bg-white p-1 disabled:opacity-30"
                            aria-label="Нижче"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-zinc-900">
                          {idx + 1}. {v.title || v.addressText || "Visit"}
                        </div>
                        <div className="tabular-nums text-zinc-600">
                          {v.startsAt ? formatHmKyiv(v.startsAt) : "—"}
                          {v.endsAt ? `–${formatHmKyiv(v.endsAt)}` : ""}
                          {v.durationMin != null ? ` · ${v.durationMin} хв` : ""}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-600">
                {currentOrderVisitIds.length > 0 ? (
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={autoSaveRoutePlan}
                      onChange={(e) => setAutoSaveRoutePlan(e.target.checked)}
                    />
                    Автосохранение
                  </label>
                ) : null}
                {hasUnsavedPlanOrder && !autoSaveRoutePlan ? (
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">
                    Є незбережені зміни
                  </span>
                ) : null}
                {coordQuality.zeroCount > 0 || coordQuality.duplicateCount > 0 ? (
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">
                    Координати:{" "}
                    {coordQuality.zeroCount > 0 ? `0,0 = ${coordQuality.zeroCount}` : ""}
                    {coordQuality.zeroCount > 0 && coordQuality.duplicateCount > 0 ? ", " : ""}
                    {coordQuality.duplicateCount > 0
                      ? `дублікати = ${coordQuality.duplicateCount}`
                      : ""}
                  </span>
                ) : null}
              </div>

              {routePlan?.stops?.length ? (
                <div className="mt-0.5 text-[11px] text-zinc-500">
                  {routeGeometryLoading ? (
                    "План: считаем…"
                  ) : savedPlanMetrics?.distanceKm != null ? (
                    <>
                      План: {savedPlanMetrics.distanceKm} км
                      {savedPlanMetrics.durationMin != null
                        ? ` · ~${savedPlanMetrics.durationMin} хв`
                        : ""}
                      {savedPlanMetrics.source === "fallback" ? " (примерно)" : ""}
                    </>
                  ) : (
                    "План: —"
                  )}
                  {" · "}
                  {routeGeometryPreviewLoading ? (
                    "Текущий: считаем…"
                  ) : routeMetricsPreview?.distanceKm != null ? (
                    <>
                      Текущий: {routeMetricsPreview.distanceKm} км
                      {routeMetricsPreview.durationMin != null
                        ? ` · ~${routeMetricsPreview.durationMin} хв`
                        : ""}
                      {routeMetricsPreview.source === "fallback" ? " (примерно)" : ""}
                    </>
                  ) : (
                    "Текущий: —"
                  )}
                  {" · "}
                  {routeGeometryLoading ? (
                    "Факт: …"
                  ) : routeFactMetrics?.distanceKm != null ? (
                    <>
                      Факт: {routeFactMetrics.distanceKm} км
                      {routeFactMetrics.durationMin != null
                        ? ` · ~${routeFactMetrics.durationMin} хв`
                        : ""}
                      {routeFactMetrics.source === "fallback" ? " (примерно)" : ""}
                    </>
                  ) : (
                    "Факт: —"
                  )}
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSaveRoute()}
              disabled={
                !planOwnerOpts ||
                readOnlyPlan ||
                showMultiOwnerDay ||
                savingRoute ||
                hasScheduledWithoutCoords ||
                scheduledVisits.length === 0
              }
              title={
                showMultiOwnerDay
                  ? "Оберіть менеджера, щоб зберегти маршрут"
                  : hasScheduledWithoutCoords
                  ? "Вкажіть точки для всіх"
                  : savingRoute
                    ? "Збереження…"
                    : "Зберегти маршрут"
              }
              className="inline-flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 p-2 text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" aria-hidden />
              <span className="sr-only">
                {hasScheduledWithoutCoords
                  ? "Вкажіть точки для всіх"
                  : savingRoute
                    ? "Збереження маршруту"
                    : "Зберегти маршрут"}
              </span>
            </button>
            {routePlan?.stops?.length ? (
              <button
                type="button"
                disabled={
                  !planOwnerOpts ||
                  readOnlyPlan ||
                  showMultiOwnerDay ||
                  savingRoute ||
                  hasScheduledWithoutCoords ||
                  currentOrderVisitIds.length < 3
                }
                onClick={async () => {
                  if (!planOwnerOpts || showMultiOwnerDay) return;
                  try {
                    const ownerId = planOwnerOpts.ownerId;
                    const ids = currentOrderVisitIds.filter((id) => {
                      const v = dayVisits.find((x) => x.id === id);
                      return !v || v.ownerId === ownerId;
                    });
                    const optimized = await routePlansApi.optimize(
                      dateParam,
                      ids,
                      planOwnerOpts,
                    );
                    const res = await routePlansApi.saveForDay(
                      dateParam,
                      optimized.visitIds,
                      planOwnerOpts,
                    );
                    setRoutePlan(res.plan ?? null);
                    setRouteOrderIds(optimized.visitIds);
                    await loadGeometryBundle();
                    await refreshRouteSession();
                  } catch (e) {
                    pushToast(e instanceof Error ? e.message : "Не вдалося оптимізувати маршрут", "error");
                  }
                }}
                className="rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                title="Оптимізувати порядок зупинок (локально, збереже маршрут)"
              >
                Оптимізувати
              </button>
            ) : null}
            </div>
          </div>
          <div className="flex flex-1 overflow-auto">
            {(() => {
              const dayStart = slots[0]?.start;
              const dayEnd = slots[slots.length - 1]?.end;
              if (!dayStart || !dayEnd) return null;
              return (
                <>
                  <div
                    className="flex shrink-0 flex-col border-r border-zinc-200 pr-1 text-right sm:pr-2"
                    style={{ width: 40 }}
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
                        const isHighlighted = highlightVisitIds.has(v.id);
                        return (
                          <div
                            key={v.id}
                            data-visit-id={v.id}
                            className={[
                              "group absolute rounded-md border px-2 py-1 text-xs shadow-sm transition-[min-height,box-shadow] duration-150",
                              isHighlighted ? "ring-2 ring-sky-400 ring-offset-1" : "",
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
                            draggable={!readOnlyPlan}
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
                              {v.addressText || <span className="text-amber-600">Немає адреси</span>}
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
                                  onClick={() => void openLocationEdit(v)}
                                >
                                  {strings.visitLocation.changeLocation}
                                </button>
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
            <div className="flex flex-col gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-900">Карта</div>
                {routePlan && routePlan.stops?.length ? (
                  <div className="text-[11px] text-zinc-500">
                    Маршрут збережено ({routePlan.stops.length} зупинок)
                    {" · "}
                    {routeGeometryLoading ? (
                      "считаем км…"
                    ) : savedPlanMetrics?.distanceKm != null ? (
                      <>
                        {savedPlanMetrics.distanceKm} км
                        {savedPlanMetrics.durationMin != null
                          ? ` · ~${savedPlanMetrics.durationMin} хв`
                          : ""}
                        {savedPlanMetrics.source === "fallback"
                          ? " (примерно)"
                          : savedPlanMetrics.source === "osrm"
                            ? " (по дорогам)"
                            : ""}
                      </>
                    ) : (
                      "км: —"
                    )}
                  </div>
                ) : (
                  <div className="text-[11px] text-zinc-500">Маршрут ще не збережено.</div>
                )}
              </div>
              <RouteLayerControls
                layers={routeLayers}
                onToggle={toggleRouteLayer}
                disabled={routeGeometryLoading}
              />
              {routeGeometryBundle?.factGps.quality?.degraded ? (
                <p className="text-[10px] text-amber-700">
                  GPS-трек слабкий ({routeGeometryBundle.factGps.quality?.sampleCount} точок) — для
                  палива використовується факт за візитами.
                </p>
              ) : null}
              {mapGeometries.planned?.source === "fallback" ? (
                <p className="text-[10px] text-amber-700">
                  {mapsApiKey
                    ? "Плановий маршрут приблизний — перевірте Routes API в Google Cloud."
                    : "Настройте Google Maps API key (Settings) для маршрутов по дорогам."}
                </p>
              ) : null}
              {routeGeometryBundle ? (
                <p className="text-[10px] text-zinc-500">
                  {[
                    mapGeometries.planned?.path.length
                      ? `План: ${routeSourceLabel(mapGeometries.planned?.source) ?? "—"}`
                      : null,
                    mapGeometries.fact_visits?.path.length
                      ? `Факт візити: ${routeSourceLabel(mapGeometries.fact_visits?.source) ?? "—"}`
                      : null,
                    mapGeometries.fact_gps?.path.length
                      ? `Факт GPS: ${routeSourceLabel(mapGeometries.fact_gps?.source) ?? "—"}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
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
              <VisitsRouteMap
                mapsApiKey={mapsApiKey}
                center={centerLatLng}
                layers={routeLayers}
                geometries={mapGeometries}
                markers={mapMarkers}
                routeAnchors={routeAnchors}
                draggableMarkers={!readOnlyPlan}
                onMarkerDragEnd={(idx, e) => {
                  const v = scheduledVisits.filter((x) => x.lat != null && x.lng != null)[idx];
                  if (v) void handleMarkerDragEnd(v, e);
                }}
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
            <p className="text-center text-xs text-zinc-600">Перетягніть візит на слот розкладу</p>
            <button
              type="button"
              onClick={() => cancelBacklogDrag()}
              className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
            >
              Скасувати
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
            aria-label="Закрити карту"
            className="min-h-0 flex-1 cursor-default"
            onClick={() => setMapSheetOpen(false)}
          />
          <div className="max-h-[85vh] rounded-t-xl border border-zinc-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Карта</div>
                {routePlan && routePlan.stops?.length ? (
                  <div className="text-[11px] text-zinc-500">
                    Маршрут збережено ({routePlan.stops.length} зупинок)
                  </div>
                ) : (
                  <div className="text-[11px] text-zinc-500">Маршрут ще не збережено.</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setMapSheetOpen(false)}
                className="rounded-md border border-zinc-200 px-2 py-1 text-sm text-zinc-700"
              >
                Закрити
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
                <VisitsRouteMap
                  mapsApiKey={mapsApiKey}
                  center={centerLatLng}
                  layers={routeLayers}
                  geometries={mapGeometries}
                  markers={mapMarkers}
                  routeAnchors={routeAnchors}
                  draggableMarkers={!readOnlyPlan}
                  onMarkerDragEnd={(idx, e) => {
                    const v = scheduledVisits.filter((x) => x.lat != null && x.lng != null)[idx];
                    if (v) void handleMarkerDragEnd(v, e);
                  }}
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
              {pendingSchedule.visit.title || pendingSchedule.visit.addressText || "Візит"}
            </p>
            <label className="mt-3 block text-xs font-medium text-zinc-700">Цель *</label>
            <textarea
              value={purposeDraft}
              onChange={(e) => setPurposeDraft(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              placeholder="Навіщо їдете до клієнта"
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
                Скасувати
              </button>
              <button
                type="button"
                onClick={() => {
                  const text = purposeDraft.trim();
                  if (!text) {
                    pushToast("Вкажіть мету зустрічі.", "error");
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

      {locationEditVisit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900">{strings.visitLocation.changeLocation}</h3>
            <p className="mt-1 text-sm text-zinc-500">
              {locationEditVisit.title ||
                locationEditVisit.addressText ||
                strings.visitLocation.meetingPlace}
            </p>
            <div className="mt-3">
              <VisitLocationPicker
                entityType={locationEditEntityType}
                addresses={locationEditAddresses}
                value={locationEditValue}
                onChange={(next) => {
                  setLocationEditValue(next);
                  setLocationEditError(false);
                }}
                mapsApiKey={mapsApiKey}
                error={locationEditError}
                disabled={locationEditSaving}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setLocationEditVisit(null);
                  setLocationEditValue(null);
                  setLocationEditError(false);
                }}
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                {strings.common.cancel}
              </button>
              <button
                type="button"
                disabled={locationEditSaving}
                onClick={() => void saveLocationEdit()}
                className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {locationEditSaving ? strings.common.loading : strings.visitLocation.saveLocation}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {routeAnchorsPromptOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="px-5 py-4">
              <div className="text-base font-semibold text-zinc-900">Маршрут візитів</div>
              <p className="mt-1 text-sm text-zinc-600">
                Для «Маршрут дня» нужна стартовая точка. Финиш по умолчанию будет таким же, как
                старт.
              </p>
              <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                Откройте співробітника → «Маршрут візитів» и заполните «Старт — подпись» через
                автокомпліт (координати підставляться автоматично).
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
                  Відкрити співробітників
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
                  <option value="">— оберіть —</option>
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
                Скасувати
              </button>
              <button
                type="button"
                onClick={() => void handleResultSubmit()}
                className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Зберегти
              </button>
            </div>
          </div>
        </div>
      )}

      <LogAdHocVisitModal
        open={logAdHocModalOpen}
        onClose={() => setLogAdHocModalOpen(false)}
        onSubmit={(payload) => visitsApi.logAdHoc(payload)}
        onSuccess={async () => {
          pushToast(strings.visitsPage.logAdHoc.success, "success");
          await loadData();
          try {
            const state = await routeSessionsApi.get(dateParam);
            setRouteSessionState(state ?? null);
          } catch {
            /* ignore */
          }
        }}
      />

      {scheduleBacklogVisit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-4 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900">Назначить дату и время</h3>
            <p className="mt-1 text-sm text-zinc-500">
              {scheduleBacklogVisit.contact
                ? formatContactNameLastFirst(scheduleBacklogVisit.contact)
                : scheduleBacklogVisit.company?.name ||
                  scheduleBacklogVisit.title ||
                  "Візит"}
            </p>
            <label className="mt-4 block text-xs font-medium text-zinc-700">
              Дата и время
              <input
                type="datetime-local"
                value={scheduleBacklogAt}
                onChange={(e) => setScheduleBacklogAt(e.target.value)}
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setScheduleBacklogVisit(null);
                  setScheduleBacklogAt("");
                }}
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                Скасувати
              </button>
              <button
                type="button"
                disabled={schedulingBacklog || !scheduleBacklogAt}
                onClick={() => void handleScheduleBacklogVisit()}
                className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {schedulingBacklog ? "…" : "Назначить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 shadow">
          {error}
        </div>
      )}
    </div>
  );
}
