"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { geoEqualEarth, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { Maximize2 } from "lucide-react";
import { formatMoneyUsd } from "@/app/analytics/analytics-ui";
import { apiHttp } from "@/lib/api/client";
import { MapRegionDrilldownModal } from "./MapRegionDrilldownModal";
import { formatDate } from "@/lib/crmDatetime";
import {
  ANALYTICS_REGION_BY_ISO,
  OBLAST_LABEL_UK,
  SALES_DEPARTMENTS,
  departmentById,
  departmentForIso,
  type SalesDepartmentId,
} from "./uaMapModel";

type OblastProps = { shapeISO: string; shapeName: string };
type OblastFeature = Feature<Geometry, OblastProps>;
type OblastFc = FeatureCollection<Geometry, OblastProps>;

type MapRegionRow = {
  region: string;
  regionIso: string | null;
  clientsCount: number;
  clientsTotalCount: number;
  ordersCount: number;
  salesTotal: number;
  assignedManagerId: string | null;
  assignedManagerName: string | null;
  assignedLeadId: string | null;
  assignedLeadName: string | null;
  assignedSlotId: string | null;
  topManagerId: string | null;
  topManagerName: string | null;
  topManagerSales: number;
  hasAssignment: boolean;
  hasActivity: boolean;
  mismatch: boolean;
};

type ManagerSummary = {
  managerId: string;
  managerName: string;
  leadId: string | null;
  leadName: string | null;
  slotId: string | null;
  assignedRegions: string[];
  regionsCount: number;
  activeRegionsCount: number;
  clientsCount: number;
  ordersCount: number;
  salesTotal: number;
  mismatchRegionsCount: number;
};

type MapResponse = {
  period: { from: string; to: string };
  view: "assigned" | "performance";
  rows: MapRegionRow[];
  managers: ManagerSummary[];
  totals: {
    totalRegions: number;
    assignedRegions: number;
    activeRegions: number;
    mismatchRegions: number;
    unassignedRegions: number;
  };
};

function deriveTotalsFromRows(rows: MapRegionRow[]): MapResponse["totals"] {
  let assignedRegions = 0;
  let activeRegions = 0;
  let mismatchRegions = 0;
  let unassignedRegions = 0;
  for (const r of rows) {
    if (r.hasAssignment) assignedRegions += 1;
    else unassignedRegions += 1;
    if (r.hasActivity) activeRegions += 1;
    if (r.mismatch) mismatchRegions += 1;
  }
  return {
    totalRegions: rows.length,
    assignedRegions,
    activeRegions,
    mismatchRegions,
    unassignedRegions,
  };
}

/** Backend may omit `totals` or return legacy array body; avoid runtime crashes. */
function normalizeMapResponse(raw: unknown): MapResponse | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Partial<MapResponse>;
  const rows = Array.isArray(o.rows) ? (o.rows as MapRegionRow[]) : [];
  const managers = Array.isArray(o.managers) ? (o.managers as ManagerSummary[]) : [];
  const view: MapResponse["view"] = o.view === "performance" ? "performance" : "assigned";
  const period =
    o.period?.from && o.period?.to
      ? { from: o.period.from, to: o.period.to }
      : { from: new Date().toISOString(), to: new Date().toISOString() };
  const derived = deriveTotalsFromRows(rows);
  const t = o.totals;
  const totals: MapResponse["totals"] =
    t && typeof t === "object"
      ? {
          totalRegions: Number(t.totalRegions ?? derived.totalRegions),
          assignedRegions: Number(t.assignedRegions ?? derived.assignedRegions),
          activeRegions: Number(t.activeRegions ?? derived.activeRegions),
          mismatchRegions: Number(t.mismatchRegions ?? derived.mismatchRegions),
          unassignedRegions: Number(t.unassignedRegions ?? derived.unassignedRegions),
        }
      : derived;
  return { period, view, rows, managers, totals };
}

function hashColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 52% 42%)`;
}

export function UkraineOblastMap() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const wrapRef = useRef<HTMLDivElement>(null);
  const infoPanelRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 720, h: 440 });
  const [geo, setGeo] = useState<OblastFc | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<MapResponse | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [focusedDeptId, setFocusedDeptId] = useState<SalesDepartmentId | null>(null);
  const [focusedManagerId, setFocusedManagerId] = useState<string | null>(null);
  const [hoveredIso, setHoveredIso] = useState<string | null>(null);
  const [hoverCursor, setHoverCursor] = useState<{ x: number; y: number } | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);
  const [drillRegion, setDrillRegion] = useState<string | null>(null);

  const period = (searchParams.get("mapPeriod") === "week" ? "week" : "month") as "week" | "month";
  const view =
    searchParams.get("mapView") === "performance" ? "performance" : ("assigned" as const);
  const problemOnly = searchParams.get("mapProblems") === "1" || searchParams.get("mapProblems") === "true";
  const managerFilter = searchParams.get("mapManagerId")?.trim() || "";

  const setQuery = useCallback(
    (updates: Record<string, string | null>) => {
      const p = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "") p.delete(k);
        else p.set(k, v);
      }
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr?.width) return;
      const w = Math.max(280, Math.floor(cr.width));
      const h = Math.max(260, Math.round(w * 0.58));
      setSize({ w, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    fetch("/maps/ukraine-adm1.geojson")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<OblastFc>;
      })
      .then(setGeo)
      .catch(() => setLoadError("Не вдалося завантажити геодані карти."));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("period", period);
    params.set("view", view);
    if (problemOnly) params.set("problemOnly", "true");
    if (managerFilter) params.set("managerId", managerFilter);
    apiHttp
      .get<unknown>(`/analytics/map?${params.toString()}`)
      .then((res) => {
        const raw = res.data;
        if (Array.isArray(raw)) {
          setData(null);
          setFetchError("Очікується новий формат відповіді карти (об’єкт з totals). Оновіть бекенд.");
          return;
        }
        const normalized = normalizeMapResponse(raw);
        if (!normalized) {
          setData(null);
          setFetchError("Некоректна відповідь сервера для карти.");
          return;
        }
        setData(normalized);
        setFetchError(null);
      })
      .catch((e) => {
        setData(null);
        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setFetchError(msg ?? "Не вдалося завантажити карту");
      });
  }, [period, view, problemOnly, managerFilter]);

  const statsByRegion = useMemo(() => {
    const m = new Map<string, MapRegionRow>();
    for (const r of data?.rows ?? []) m.set(r.region, r);
    return m;
  }, [data]);

  const maxSales = useMemo(() => {
    let m = 0;
    for (const r of data?.rows ?? []) m = Math.max(m, r.salesTotal);
    return m > 0 ? m : 1;
  }, [data]);

  const managerRegionSet = useMemo(() => {
    if (!focusedManagerId || !data) return null;
    const mgr = data.managers.find((x) => x.managerId === focusedManagerId);
    if (!mgr) return null;
    return new Set(mgr.assignedRegions);
  }, [focusedManagerId, data]);

  const fitTarget = useMemo((): OblastFc | null => {
    if (!geo) return null;
    if (focusedManagerId && managerRegionSet && managerRegionSet.size > 0) {
      const isos = new Set<string>();
      for (const [iso, reg] of Object.entries(ANALYTICS_REGION_BY_ISO)) {
        if (managerRegionSet.has(reg)) isos.add(iso);
      }
      const features = geo.features.filter((f) => isos.has((f as OblastFeature).properties.shapeISO));
      if (features.length > 0) return { type: "FeatureCollection", features };
    }
    if (!focusedDeptId) return geo;
    const dept = departmentById(focusedDeptId);
    if (!dept) return geo;
    const isos = new Set(dept.oblastIso);
    const features = geo.features.filter((f) => isos.has((f as OblastFeature).properties.shapeISO));
    return { type: "FeatureCollection", features };
  }, [geo, focusedDeptId, focusedManagerId, managerRegionSet]);

  const paths = useMemo(() => {
    if (!geo || !fitTarget || fitTarget.features.length === 0) return [];
    const projection = geoEqualEarth();
    projection.fitSize([size.w, size.h], fitTarget);
    const pathGen = geoPath(projection);
    return geo.features.map((f: OblastFeature, idx) => {
      const iso = f.properties.shapeISO;
      const dept = departmentForIso(iso);
      const d = pathGen(f);
      return { iso, d: d ?? "", dept, idx };
    });
  }, [geo, fitTarget, size.w, size.h]);

  const fillForIso = (iso: string): string => {
    const ar = ANALYTICS_REGION_BY_ISO[iso];
    const row = ar ? statsByRegion.get(ar) ?? null : null;
    if (!row) return "#94a3b8";
    if (view === "performance") {
      const t = row.salesTotal / maxSales;
      return `hsl(200 55% ${78 - t * 28}%)`;
    }
    if (row.assignedManagerId) return hashColor(row.assignedManagerId);
    return "#cbd5e1";
  };

  const panelInfo = useMemo(() => {
    const iso = hoveredIso;
    if (!iso) {
      return {
        title: "Наведіть на область",
        subtitle: "Дані з org-chart та замовлень за обраний період.",
        row: null as MapRegionRow | null,
        dept: null as ReturnType<typeof departmentForIso>,
      };
    }
    const title = OBLAST_LABEL_UK[iso] ?? iso;
    const dept = departmentForIso(iso);
    const ar = ANALYTICS_REGION_BY_ISO[iso];
    const row = ar ? (statsByRegion.get(ar) ?? null) : null;
    return { title, subtitle: null as string | null, row, dept };
  }, [hoveredIso, statsByRegion]);

  useEffect(() => {}, []);

  useEffect(() => {
    if (!hoveredIso || !hoverCursor) {
      setTooltipPos(null);
      return;
    }
    const panel = infoPanelRef.current;
    const gap = 14;
    const panelRect = panel?.getBoundingClientRect();
    const fallbackWidth = 340;
    const fallbackHeight = panelInfo.row ? 340 : 140;
    const panelWidth = panelRect?.width ?? fallbackWidth;
    const panelHeight = panelRect?.height ?? fallbackHeight;
    const vw = typeof window !== "undefined" ? window.innerWidth : 0;
    const vh = typeof window !== "undefined" ? window.innerHeight : 0;

    let left = hoverCursor.x + gap;
    let top = hoverCursor.y + gap;
    if (left + panelWidth > vw - 8) left = Math.max(8, hoverCursor.x - panelWidth - gap);
    if (top + panelHeight > vh - 8) top = Math.max(8, hoverCursor.y - panelHeight - gap);

    setTooltipPos({ left, top });
  }, [hoveredIso, hoverCursor, panelInfo]);

  const periodQueryForDrilldown = useMemo(() => {
    if (!data?.period) return "";
    const from = data.period.from.slice(0, 10);
    const to = data.period.to.slice(0, 10);
    const p = new URLSearchParams();
    p.set("dateFrom", from);
    p.set("dateTo", to);
    p.set("period", "custom");
    if (managerFilter) p.set("managerId", managerFilter);
    return `?${p.toString()}`;
  }, [data, managerFilter]);

  if (loadError) {
    return <p className="text-sm text-red-600">{loadError}</p>;
  }

  if (!geo) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
        Завантаження карти…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
          Період
          <select
            className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
            value={period}
            onChange={(e) => setQuery({ mapPeriod: e.target.value })}
          >
            <option value="month">Місяць (30 днів)</option>
            <option value="week">Тиждень (7 днів)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
          Режим
          <select
            className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
            value={view}
            onChange={(e) => setQuery({ mapView: e.target.value })}
          >
            <option value="assigned">За закріпленням (org-chart)</option>
            <option value="performance">За продажами (факт)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
          Менеджер
          <select
            className="min-w-[200px] rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
            value={managerFilter}
            onChange={(e) => setQuery({ mapManagerId: e.target.value || null })}
          >
            <option value="">Усі</option>
            {(data?.managers ?? []).map((m) => (
              <option key={m.managerId} value={m.managerId}>
                {m.managerName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={problemOnly}
            onChange={(e) => setQuery({ mapProblems: e.target.checked ? "true" : null })}
          />
          Лише проблемні (різні закріплення і факт)
        </label>
        <button
          type="button"
          className="ml-auto rounded-lg border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-50"
          onClick={() => {
            setQuery({
              mapPeriod: "month",
              mapView: "assigned",
              mapProblems: null,
              mapManagerId: null,
            });
          }}
        >
          Скинути
        </button>
      </div>

      {fetchError && <p className="text-sm text-red-600">{fetchError}</p>}

      {data && (
        <div className="grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 text-sm text-zinc-700 sm:grid-cols-5">
          <div>
            Закріплено: <strong>{data.totals.assignedRegions}</strong>
          </div>
          <div>
            Без закріплення: <strong>{data.totals.unassignedRegions}</strong>
          </div>
          <div>
            Активні області: <strong>{data.totals.activeRegions}</strong>
          </div>
          <div>
            Розбіжності: <strong>{data.totals.mismatchRegions}</strong>
          </div>
          <div className="text-xs text-zinc-500">
            Вікно:{" "}
            {data.period?.from ? formatDate(data.period.from) : "—"}{" "}
            —{" "}
            {data.period?.to ? formatDate(data.period.to) : "—"}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Менеджери</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Оберіть менеджера, щоб сфокусувати карту на його закріплених областях.
            </p>
          </div>
          {focusedManagerId ? (
            <button
              type="button"
              onClick={() => setFocusedManagerId(null)}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50"
            >
              <Maximize2 className="h-4 w-4" aria-hidden />
              Вся Україна
            </button>
          ) : null}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(data?.managers ?? []).map((m) => {
            const active = focusedManagerId === m.managerId;
            return (
              <button
                key={m.managerId}
                type="button"
                onClick={() => setFocusedManagerId((cur) => (cur === m.managerId ? null : m.managerId))}
                aria-pressed={active}
                className={`min-w-[220px] shrink-0 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  active
                    ? "border-zinc-900 bg-zinc-900 text-white shadow-md"
                    : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50"
                }`}
              >
                <span className="mb-1 flex items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white/30"
                    style={{ backgroundColor: hashColor(m.managerId) }}
                    aria-hidden
                  />
                  <span className="truncate">{m.managerName}</span>
                </span>
                <span className="block text-xs font-normal opacity-80">
                  {m.regionsCount} обл. · {formatMoneyUsd(m.salesTotal)}
                  {m.mismatchRegionsCount > 0 ? ` · ⚠ ${m.mismatchRegionsCount}` : ""}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div ref={wrapRef} className="min-w-0 flex-1">
          <div className="relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-gradient-to-br from-slate-50 via-white to-slate-100 shadow-sm">
            <svg
              width={size.w}
              height={size.h}
              className="mx-auto block h-auto w-full max-w-full"
              role="img"
              aria-label="Карта України за областями"
            >
              <defs>
                <filter id="ua-map-shadow" x="-15%" y="-15%" width="130%" height="130%">
                  <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodOpacity="0.14" />
                </filter>
              </defs>
              <g filter="url(#ua-map-shadow)">
                {paths.map(({ iso, d, dept, idx }) => {
                  const ar = ANALYTICS_REGION_BY_ISO[iso];
                  const row = ar ? statsByRegion.get(ar) ?? null : null;
                  const dimmed = Boolean(
                    focusedDeptId && dept?.id !== focusedDeptId,
                  );
                  const dimMgr =
                    focusedManagerId &&
                    managerRegionSet &&
                    ar &&
                    !managerRegionSet.has(ar);
                  const hovered = hoveredIso === iso;
                  const fill = fillForIso(iso);
                  const mismatchHighlighted = Boolean(row?.mismatch) && problemOnly;
                  const mismatchStroke = mismatchHighlighted ? "#b45309" : "#f1f5f9";
                  // Keep stroke width stable to avoid SVG hit-area jitter on hover.
                  const sw = mismatchHighlighted ? 1.6 : 0.85;
                  return (
                    <path
                      key={`${iso}-${idx}`}
                      d={d}
                      fill={fill}
                      fillOpacity={dimmed || dimMgr ? 0.22 : hovered ? 0.95 : 0.82}
                      stroke={mismatchStroke}
                      strokeWidth={sw}
                      strokeOpacity={dimmed || dimMgr ? 0.35 : 1}
                      className="cursor-pointer transition-[fill-opacity,stroke-width] duration-200 ease-out"
                      onMouseEnter={(event) => {
                        setHoveredIso(iso);
                        setHoverCursor({ x: event.clientX, y: event.clientY });
                      }}
                      onMouseMove={(event) => {
                        setHoverCursor({ x: event.clientX, y: event.clientY });
                      }}
                      onMouseLeave={() => {
                        setHoveredIso(null);
                        setHoverCursor(null);
                      }}
                      onClick={() => {
                        const next = departmentForIso(iso);
                        if (next) setFocusedDeptId(next.id);
                      }}
                    />
                  );
                })}
              </g>
            </svg>
            {hoveredIso && hoverCursor && tooltipPos ? (
              <div
                ref={infoPanelRef}
                className="pointer-events-none fixed z-30 w-[min(360px,calc(100vw-16px))] rounded-xl border border-zinc-200 bg-zinc-50/95 p-4 shadow-xl backdrop-blur-[1px]"
                style={{ left: tooltipPos.left, top: tooltipPos.top }}
              >
                <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Область</h2>
                <p className="mt-2 text-base font-semibold text-zinc-900">{panelInfo.title}</p>
                {panelInfo.dept ? (
                  <p className="mt-2 text-sm text-zinc-600">
                    Умовний відділ на карті:{" "}
                    <span className="font-medium text-zinc-800">{panelInfo.dept.label}</span>
                  </p>
                ) : null}
                {panelInfo.row ? (
                  <>
                    <dl className="mt-3 space-y-2 text-sm">
                      <div className="flex justify-between gap-2">
                        <dt className="text-zinc-500">Клієнти</dt>
                        <dd className="font-medium text-zinc-900">{panelInfo.row.clientsCount}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-zinc-500">Клієнтів у базі</dt>
                        <dd className="font-medium text-zinc-900">{panelInfo.row.clientsTotalCount ?? 0}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-zinc-500">Замовлень</dt>
                        <dd className="font-medium text-zinc-900">{panelInfo.row.ordersCount}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-zinc-500">Продажі</dt>
                        <dd className="font-medium text-zinc-900">{formatMoneyUsd(panelInfo.row.salesTotal)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-zinc-500">Закріплено</dt>
                        <dd className="text-right font-medium text-zinc-900">
                          {panelInfo.row.assignedManagerName ?? "—"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-zinc-500">Керівник (слот)</dt>
                        <dd className="text-right text-xs text-zinc-800">
                          {panelInfo.row.assignedLeadName ?? "—"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-zinc-500">Топ за фактом</dt>
                        <dd className="text-right font-medium text-zinc-900">
                          {panelInfo.row.topManagerName ?? "—"}
                        </dd>
                      </div>
                      {panelInfo.row.mismatch ? (
                        <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">
                          Розбіжність: відповідальний за угоди не збігається із закріпленням.
                        </p>
                      ) : null}
                    </dl>
                  </>
                ) : hoveredIso && ANALYTICS_REGION_BY_ISO[hoveredIso] ? (
                  <p className="mt-3 text-sm text-zinc-500">Немає угод за період у цьому регіоні.</p>
                ) : (
                  <p className="mt-3 text-sm text-zinc-500">Немає прив’язки CRM до цього полігону.</p>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-5 lg:w-80">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Захід / Схід (зум)</h2>
            <ul className="mt-2 flex flex-col gap-2">
              {SALES_DEPARTMENTS.map((d) => {
                const active = focusedDeptId === d.id;
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => setFocusedDeptId((cur) => (cur === d.id ? null : d.id))}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm ${
                        active ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white"
                      }`}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                      {d.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Область</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Наведіть курсор на область — детальна інформація з’явиться біля курсора.
            </p>
            {panelInfo.row?.region && periodQueryForDrilldown ? (
              <button
                type="button"
                className="mt-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                onClick={() => setDrillRegion(panelInfo.row!.region)}
              >
                Замовлення по області
              </button>
            ) : null}
          </div>
        </aside>
      </div>

      <MapRegionDrilldownModal
        open={Boolean(drillRegion)}
        onClose={() => setDrillRegion(null)}
        region={drillRegion}
        periodQuery={periodQueryForDrilldown}
      />
    </div>
  );
}
