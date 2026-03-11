"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
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
};

function computeVisitLayout(visits: VisitInterval[]): Map<string, VisitLayout> {
  const sorted = [...visits].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  );
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
  // Selected day in local TZ so grid and labels match user's 9–22
  const y = date.getUTCFullYear();
  const mo = date.getUTCMonth();
  const d = date.getUTCDate();
  for (let hour = DAY_START_HOUR; hour < DAY_END_HOUR; hour++) {
    for (let m = 0; m < 60; m += SLOT_MINUTES) {
      const start = new Date(y, mo, d, hour, m, 0, 0);
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

function VisitsMapContent({
  mapsApiKey,
  centerLatLng,
  scheduledVisits,
  onMarkerDragEnd,
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
  const [date, setDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  });
  const [backlog, setBacklog] = useState<Visit[]>([]);
  const [dayVisits, setDayVisits] = useState<Visit[]>([]);
  const [routePlan, setRoutePlan] = useState<RoutePlan | null>(null);
  const [routeSessionState, setRouteSessionState] = useState<RouteSessionState | null>(null);
  const [routeSessionLoading, setRouteSessionLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingRoute, setSavingRoute] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [resultModalVisit, setResultModalVisit] = useState<Visit | null>(null);
  const [resultOutcome, setResultOutcome] = useState<string>("");
  const [resultNote, setResultNote] = useState("");
  const [resultNextActionAt, setResultNextActionAt] = useState("");
  const [resultNextActionNote, setResultNextActionNote] = useState("");

  const [dragVisitId, setDragVisitId] = useState<string | null>(null);
  const [hoverSlotKey, setHoverSlotKey] = useState<string | null>(null);
  const [hoveredVisitId, setHoveredVisitId] = useState<string | null>(null);

  const [mapsApiKey, setMapsApiKey] = useState<string | null>(null);
  const [mapsConfigError, setMapsConfigError] = useState<string | null>(null);

  const dateParam = useMemo(() => format(date, "yyyy-MM-dd"), [date]);
  const slots = useMemo(() => getSlotsForDate(date), [date]);

  const scheduledVisits = dayVisits;

  const hasScheduledWithoutCoords = scheduledVisits.some((v) => v.lat == null || v.lng == null);

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
      const [backlogRes, dayRes, planRes, sessionRes] = await Promise.all([
        visitsApi.backlog(),
        visitsApi.day(dateParam),
        routePlansApi.getForDay(dateParam),
        routeSessionsApi.get(dateParam),
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
  }, [dateParam]);

  useEffect(() => {
    void loadMapsConfig();
  }, [loadMapsConfig]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleDropToSlot = async (visit: Visit, slot: TimelineSlot) => {
    const durationMinutes = visit.durationMin ?? 60;
    const startsAt = slot.start;
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);
    try {
      const updated = await visitsApi.update(visit.id, {
        status: "SCHEDULED",
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
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
      alert(e instanceof Error ? e.message : "Failed to schedule visit");
      void loadData();
    }
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
      alert(e instanceof Error ? e.message : "Failed to move visit");
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
      alert(e instanceof Error ? e.message : "Failed to resize visit");
      void loadData();
    }
  };

  const handleSaveRoute = async () => {
    setSavingRoute(true);
    try {
      const sorted = [...dayVisits].sort((a, b) => {
        const aTime = a.startsAt ? new Date(a.startsAt).getTime() : 0;
        const bTime = b.startsAt ? new Date(b.startsAt).getTime() : 0;
        return aTime - bTime;
      });
      const ids = sorted.map((v) => v.id);
      const res = await routePlansApi.saveForDay(dateParam, ids);
      setRoutePlan(res.plan ?? null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save route");
    } finally {
      setSavingRoute(false);
    }
  };

  const centerLatLng = useMemo(() => {
    const withCoords = scheduledVisits.filter((v) => v.lat != null && v.lng != null);
    if (withCoords.length === 0) {
      return { lat: 50.4501, lng: 30.5234 }; // Kyiv as default
    }
    const first = withCoords[0];
    return { lat: first.lat as number, lng: first.lng as number };
  }, [scheduledVisits]);

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
      alert(err instanceof Error ? err.message : "Failed to update coordinates");
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
    setDate((prev) => new Date(prev.getTime() - 24 * 60 * 60 * 1000));
  };
  const handleNextDay = () => {
    setDate((prev) => new Date(prev.getTime() + 24 * 60 * 60 * 1000));
  };

  const handleToday = () => {
    const now = new Date();
    setDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));
  };

  const handleMoveToBacklog = async (visit: Visit) => {
    try {
      const updated = await visitsApi.update(visit.id, {
        status: "PLANNED_UNASSIGNED",
      });
      setDayVisits((prev) => prev.filter((v) => v.id !== visit.id));
      setBacklog((prev) => [updated, ...prev.filter((v) => v.id !== visit.id)]);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to move visit to backlog");
      void loadData();
    }
  };

  const handleRemoveVisit = useCallback(
    async (visit: Visit) => {
      if (!confirm("Remove this visit from the plan?")) return;
      try {
        await visitsApi.update(visit.id, { status: "CANCELED" });
        setBacklog((prev) => prev.filter((v) => v.id !== visit.id));
        setDayVisits((prev) => prev.filter((v) => v.id !== visit.id));
      } catch (e) {
        alert(e instanceof Error ? e.message : "Failed to remove visit");
        void loadData();
      }
    },
    [],
  );

  const handleResultSubmit = async () => {
    if (!resultModalVisit || !resultOutcome.trim() || !resultNote.trim()) {
      alert("Укажите результат (outcome) и комментарий (resultNote).");
      return;
    }
    try {
      const updated = await visitsApi.complete(resultModalVisit.id, {
        outcome: resultOutcome.trim(),
        resultNote: resultNote.trim(),
        nextActionAt: resultNextActionAt ? new Date(resultNextActionAt).toISOString() : undefined,
        nextActionNote: resultNextActionNote.trim() || undefined,
      });
      setDayVisits((prev) =>
        prev.map((v) => (v.id === resultModalVisit.id ? updated : v)),
      );
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
      alert(e instanceof Error ? e.message : "Failed to save result");
    }
  };

  const OUTCOME_OPTIONS = [
    { value: "SUCCESS", label: "Успех" },
    { value: "FOLLOW_UP", label: "Дозвон / повтор" },
    { value: "NO_DECISION", label: "Без решения" },
    { value: "NOT_RELEVANT", label: "Не релевантно" },
    { value: "FAILED", label: "Неудача" },
  ] as const;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <div className="border-b border-zinc-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Visits planning</h1>
            <p className="text-sm text-zinc-500">
              Plan field visits for the day, arrange them on a timeline, and save the route.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevDay}
              className="rounded-md border border-zinc-200 px-2 py-1 text-sm hover:bg-zinc-50"
            >
              ←
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-50"
            >
              Today
            </button>
            <button
              type="button"
              onClick={handleNextDay}
              className="rounded-md border border-zinc-200 px-2 py-1 text-sm hover:bg-zinc-50"
            >
              →
            </button>
            <div className="ml-2 rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700">
              {format(date, "yyyy-MM-dd")}
            </div>
            {!routeSessionState?.session?.isActive ? (
              <button
                type="button"
                disabled={routeSessionLoading || loading}
                onClick={async () => {
                  setRouteSessionLoading(true);
                  try {
                    const state = await routeSessionsApi.start(dateParam);
                    setRouteSessionState(state);
                  } catch (e) {
                    alert(e instanceof Error ? e.message : "Failed to start route");
                  } finally {
                    setRouteSessionLoading(false);
                  }
                }}
                className="ml-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {routeSessionLoading ? "…" : "Начать день/маршрут"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {routeSessionState?.session?.isActive && (
        <div className="sticky top-0 z-20 border-b border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <div className="mx-auto flex max-w-6xl flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase text-zinc-500">Текущая / следующая встреча</div>
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
                      <a href={`tel:${routeSessionState.currentVisit.phone}`} className="hover:underline">
                        {routeSessionState.currentVisit.phone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </div>
                  {routeSessionState.currentVisit.startsAt && routeSessionState.currentVisit.endsAt && (
                    <div className="mt-0.5 text-zinc-500">
                      {new Date(routeSessionState.currentVisit.startsAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      –{new Date(routeSessionState.currentVisit.endsAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
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
                    );
                    window.open(url, "_blank");
                  } catch (e) {
                    alert(e instanceof Error ? e.message : "No coordinates");
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
                    const { url } = await routePlansApi.navigation(dateParam, "multi");
                    window.open(url, "_blank");
                  } catch (e) {
                    alert(e instanceof Error ? e.message : "No route plan or coordinates");
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
                    alert(e instanceof Error ? e.message : "Failed");
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
                    alert(e instanceof Error ? e.message : "Failed");
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
                        <li
                          key={s.id}
                          className={[
                            "rounded px-2 py-0.5 text-[11px]",
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
                          <li
                            key={v.id}
                            className={[
                              "rounded px-2 py-0.5 text-[11px]",
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
                          </li>
                        );
                      })}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-4 p-4">
        <section className="flex w-1/4 flex-col rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-3 py-2">
            <div className="text-sm font-semibold text-zinc-900">Backlog (planned, unscheduled)</div>
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
              backlog.map((v) => (
                <div
                  key={v.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      "application/json",
                      JSON.stringify({ visitId: v.id }),
                    );
                    e.dataTransfer.effectAllowed = "move";
                    setDragVisitId(v.id);
                  }}
                  onDragEnd={() => setDragVisitId((cur) => (cur === v.id ? null : cur))}
                  className={[
                    "group relative cursor-grab rounded-md border px-3 py-2 pr-8 text-xs shadow-sm hover:bg-zinc-100",
                    routeSessionState?.session?.isActive && routeSessionState.session.currentVisitId === v.id
                      ? "border-blue-400 bg-blue-50 ring-1 ring-blue-200"
                      : "border-zinc-200 bg-zinc-50",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleRemoveVisit(v);
                    }}
                    className="absolute right-1.5 top-1.5 rounded p-0.5 text-zinc-400 opacity-0 hover:bg-zinc-200 hover:text-zinc-600 group-hover:opacity-100"
                    title="Remove visit"
                    aria-label="Remove visit"
                  >
                    ×
                  </button>
                  <div className="font-medium text-zinc-900">
                    {v.title || v.addressText || "Visit"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-zinc-500">
                    {v.phone ? v.phone : "Phone not set"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-zinc-500">
                    {v.addressText || <span className="text-amber-600">Нужно указать точку</span>}
                  </div>
                  <div className="mt-0.5 text-[11px] text-zinc-500">
                    Duration: {v.durationMin ?? 60} min
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="flex min-w-0 w-[45%] flex-col rounded-lg border border-zinc-200 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Day schedule</div>
              {dayConflicts.size > 0 && (
                <div className="mt-0.5 text-xs text-amber-600">
                  Some visits overlap in time — please review.
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => void handleSaveRoute()}
              disabled={savingRoute || hasScheduledWithoutCoords || scheduledVisits.length === 0}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {hasScheduledWithoutCoords
                ? "Укажите точки для всех"
                : savingRoute
                  ? "Saving…"
                  : "Save route"}
            </button>
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
                    {slots.map((slot, i) => {
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
                          {isHour
                            ? `${String(slot.start.getHours()).padStart(2, "0")}:00`
                            : ""}
                        </div>
                      );
                    })}
                  </div>
                  <div className="relative min-w-0 flex-1" style={{ height: TOTAL_SLOTS * ROW_HEIGHT_PX }}>
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
                              const parsed = JSON.parse(payload) as { visitId?: string };
                              if (parsed.visitId) visitId = parsed.visitId;
                            } catch {
                              // ignore malformed payload
                            }
                          }
                          const visit =
                            visitId
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
                          const slotIndex = slots.findIndex(
                            (s) => s.key === hoverSlotKey,
                          );
                          if (slotIndex === -1) return null;
                          const slot = slots[slotIndex]!;
                          const visit =
                            backlog.find((v) => v.id === dragVisitId) ||
                            dayVisits.find((v) => v.id === dragVisitId);
                          if (!visit) return null;
                          const durationMin = visit.durationMin ?? 60;
                          const topPx = slotIndex * ROW_HEIGHT_PX;
                          const heightPx =
                            (durationMin / SLOT_MINUTES) * ROW_HEIGHT_PX;
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
                        return (
                          s.getTime() >= dayStart.getTime() &&
                          s.getTime() < dayEnd.getTime()
                        );
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
                        const topPx =
                          (startMinutesFromDayStart / SLOT_MINUTES) *
                          ROW_HEIGHT_PX;
                        const heightPx =
                          (durationMin / SLOT_MINUTES) * ROW_HEIGHT_PX;
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
                            onDragEnd={() =>
                              setDragVisitId((cur) => (cur === v.id ? null : cur))
                            }
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="truncate font-medium text-zinc-900">
                                {v.title || v.addressText || "Visit"}
                              </div>
                              <span className="shrink-0 text-[10px] text-zinc-500">
                                {v.startsAt && v.endsAt
                                  ? `${new Date(
                                      v.startsAt,
                                    ).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}–${new Date(
                                      v.endsAt,
                                    ).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}`
                                  : ""}
                              </span>
                            </div>
                            <div className="mt-0.5 truncate text-[11px] text-zinc-500">
                              {v.addressText || (
                                <span className="text-amber-600">
                                  Нет адреса
                                </span>
                              )}
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
                                  onClick={() =>
                                    void handleMoveOnTimeline(
                                      v,
                                      -SLOT_MINUTES,
                                    )
                                  }
                                >
                                  ↑ earlier
                                </button>
                                <button
                                  type="button"
                                  className="rounded border border-zinc-200 px-1 py-0.5 hover:bg-zinc-100"
                                  onClick={() =>
                                    void handleMoveOnTimeline(v, SLOT_MINUTES)
                                  }
                                >
                                  ↓ later
                                </button>
                                <button
                                  type="button"
                                  className="rounded border border-zinc-200 px-1 py-0.5 hover:bg-zinc-100"
                                  onClick={() =>
                                    void handleResizeVisit(
                                      v,
                                      (v.durationMin ?? 60) + SLOT_MINUTES,
                                    )
                                  }
                                >
                                  +30m
                                </button>
                                <button
                                  type="button"
                                  className="rounded border border-zinc-200 px-1 py-0.5 hover:bg-zinc-100"
                                  onClick={() =>
                                    void handleResizeVisit(
                                      v,
                                      (v.durationMin ?? 60) - SLOT_MINUTES,
                                    )
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

        <section className="sticky top-4 flex w-[30%] min-w-[200px] max-h-[70vh] flex-col self-start overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <div className="shrink-0 border-b border-zinc-200 px-3 py-2">
            <div className="text-sm font-semibold text-zinc-900">Map</div>
            {routePlan && routePlan.stops?.length ? (
              <div className="mt-0.5 text-[11px] text-zinc-500">
                Route saved for this date ({routePlan.stops.length} stops)
              </div>
            ) : (
              <div className="mt-0.5 text-[11px] text-zinc-500">
                Route is not saved yet.
              </div>
            )}
          </div>
          <div className="shrink-0 w-full" style={{ height: "min(50vh, 400px)" }}>
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
              />
            )}
          </div>
        </section>
      </div>

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
                <label className="block text-xs font-medium text-zinc-700">Следующее действие (дата)</label>
                <input
                  type="datetime-local"
                  value={resultNextActionAt}
                  onChange={(e) => setResultNextActionAt(e.target.value)}
                  className="mt-0.5 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700">Заметка к следующему действию</label>
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

