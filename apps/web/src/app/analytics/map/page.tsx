"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { Map as MapIcon, TrendingUp, Users, ArrowLeft } from "lucide-react";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";
import { apiHttp } from "@/lib/api/client";
import { apiGet } from "@/lib/api/client";

type MeResponse = { user?: { role?: string } };

export type MapRegionRow = {
  region: string;
  clientsCount: number;
  salesTotal: number;
  managerId: string | null;
  managerName: string | null;
};

/** geoBoundaries shapeName (English) -> API region (Ukrainian, Bitrix) */
const SHAPE_NAME_TO_REGION: Record<string, string> = {
  "Cherkasy Oblast": "Черкаська",
  "Chernihiv Oblast": "Чернігівська",
  "Chernivtsi Oblast": "Чернівецька",
  "Dnipropetrovsk Oblast": "Дніпропетровська",
  "Donetsk Oblast": "Донецька",
  "Ivano-Frankivsk Oblast": "Івано-Франківська",
  "Kharkiv Oblast": "Харківська",
  "Kherson Oblast": "Херсонська",
  "Khmelnytskyi Oblast": "Хмельницька",
  "Kyiv Oblast": "Київська",
  Kyiv: "Київська",
  "Kirovohrad Oblast": "Кіровоградська",
  "Luhansk Oblast": "Луганська",
  "Lviv Oblast": "Львівська",
  "Mykolaiv Oblast": "Миколаївська",
  "Odessa Oblast": "Одеська",
  "Poltava Oblast": "Полтавська",
  "Rivne Oblast": "Рівненська",
  "Sumy Oblast": "Сумська",
  "Ternopil Oblast": "Тернопільська",
  "Vinnytsia Oblast": "Вінницька",
  "Volyn Oblast": "Волинська",
  "Zakarpattia Oblast": "Закарпатська",
  "Zaporizhia Oblast": "Запорізька",
  "Zhytomyr Oblast": "Житомирська",
};

const MANAGER_COLORS = [
  "#0ea5e9",
  "#06b6d4",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#6366f1",
  "#14b8a6",
];

const GEO_URL = "/maps/ukraine-adm1.geojson";

/** Approximate centroids [lng, lat] for each region (for drill-down points). */
const REGION_CENTROIDS: Record<string, [number, number]> = {
  Вінницька: [28.48, 49.23],
  Волинська: [25.34, 50.45],
  Дніпропетровська: [35.04, 48.46],
  Донецька: [37.8, 48.02],
  Житомирська: [28.68, 50.25],
  Закарпатська: [22.3, 48.62],
  Запорізька: [35.14, 47.84],
  "Івано-Франківська": [24.71, 48.92],
  Київська: [30.52, 50.45],
  Кіровоградська: [32.27, 48.51],
  Луганська: [39.32, 48.57],
  Львівська: [24.03, 49.84],
  Миколаївська: [31.98, 46.98],
  Одеська: [30.73, 46.48],
  Полтавська: [34.54, 49.59],
  Рівненська: [26.25, 50.62],
  Сумська: [34.8, 50.91],
  Тернопільська: [25.59, 49.55],
  Харківська: [36.23, 49.99],
  Херсонська: [32.62, 46.64],
  Хмельницька: [26.99, 49.42],
  Черкаська: [32.06, 49.44],
  Чернівецька: [25.94, 48.29],
  Чернігівська: [31.28, 51.5],
};

export default function AnalyticsMapPage() {
  const [role, setRole] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [period, setPeriod] = useState<"week" | "month">("month");
  const [data, setData] = useState<MapRegionRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"managers" | "sales">("managers");
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; row: MapRegionRow; shapeName: string } | null>(null);
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);
  const [selectedManagerName, setSelectedManagerName] = useState<string | null>(null);
  const [drillDownVisible, setDrillDownVisible] = useState(false);

  useEffect(() => {
    apiHttp
      .get<MeResponse>("/auth/me")
      .then((res) => setRole(res.data?.user?.role ?? null))
      .catch(() => setRole(null))
      .finally(() => setRoleLoading(false));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<MapRegionRow[]>("/analytics/map", { period });
      setData(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    if (role === "ADMIN") void load();
  }, [role, load]);

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 p-6">
        <div className="mx-auto max-w-6xl">
          <div className="animate-pulse rounded-lg bg-zinc-200 py-8" />
        </div>
      </div>
    );
  }

  if (role !== "ADMIN") {
    return (
      <div className="min-h-screen bg-zinc-50 p-6">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
            <h1 className="text-xl font-semibold text-zinc-900">Доступ заборонено</h1>
            <p className="mt-2 text-sm text-zinc-600">
              Розділ «Аналітика» доступний лише для адміністратора.
            </p>
            <Link
              href="/"
              className="mt-4 inline-block text-sm font-medium text-accent-600 hover:underline"
            >
              На головну
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const regionByApi = new Map<string, MapRegionRow>();
  if (data) for (const r of data) regionByApi.set(r.region, r);

  const managerIds = data
    ? Array.from(new Set(data.map((r) => r.managerId).filter(Boolean))) as string[]
    : [];
  const managerColorById = new Map<string | null, string>();
  managerIds.forEach((id, i) => managerColorById.set(id, MANAGER_COLORS[i % MANAGER_COLORS.length]));
  managerColorById.set(null, "#e4e4e7");

  const totalSales = data ? data.reduce((s, r) => s + r.salesTotal, 0) : 0;
  const totalClients = data ? data.reduce((s, r) => s + r.clientsCount, 0) : 0;
  const maxSales = data && data.length ? Math.max(...data.map((r) => r.salesTotal), 1) : 1;

  const getFill = (apiRegion: string | undefined, forDrillDown = false) => {
    if (!apiRegion) return "#e4e4e7";
    const row = regionByApi.get(apiRegion);
    if (!row) return "#f4f4f5";
    if (forDrillDown && selectedManagerId) {
      if (row.managerId === selectedManagerId) return managerColorById.get(row.managerId) ?? "#0ea5e9";
      return "#e4e4e7";
    }
    if (viewMode === "managers") return managerColorById.get(row.managerId) ?? "#e4e4e7";
    const p = maxSales > 0 ? row.salesTotal / maxSales : 0;
    const intensity = 0.2 + 0.8 * p;
    return `rgba(14, 165, 233, ${intensity})`;
  };

  const selectedManagerRegions =
    data && selectedManagerId
      ? data.filter((r) => r.managerId === selectedManagerId && r.clientsCount > 0)
      : [];

  const handleSelectManager = (managerId: string | null, managerName: string | null) => {
    if (selectedManagerId === managerId) {
      setDrillDownVisible(false);
      setTimeout(() => {
        setSelectedManagerId(null);
        setSelectedManagerName(null);
      }, 200);
      return;
    }
    setSelectedManagerId(managerId);
    setSelectedManagerName(managerName);
    setDrillDownVisible(true);
  };

  const handleBackFromDrillDown = () => {
    setDrillDownVisible(false);
    setTimeout(() => {
      setSelectedManagerId(null);
      setSelectedManagerName(null);
    }, 200);
  };

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/analytics" className="hover:text-zinc-700">
            Аналітика
          </Link>
          <span className="text-zinc-400">/</span>
          <span className="font-medium text-zinc-700">Карта</span>
        </div>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-900">
            <MapIcon className="h-7 w-7 text-zinc-600" />
            Карта
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as "week" | "month")}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            >
              <option value="week">Тиждень</option>
              <option value="month">Місяць</option>
            </select>
            <div className="flex rounded-lg border border-zinc-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("managers")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === "managers" ? "bg-zinc-200 text-zinc-900" : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                По менеджерах
              </button>
              <button
                type="button"
                onClick={() => setViewMode("sales")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === "sales" ? "bg-zinc-200 text-zinc-900" : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                По сумі продаж
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
          {loading && !data ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="h-[400px] w-full max-w-2xl animate-pulse rounded-xl bg-zinc-100" />
              <p className="mt-4 text-sm text-zinc-500">Завантаження даних…</p>
            </div>
          ) : error ? (
            <div className="py-12 text-center">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : (
            <>
              <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-zinc-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-500">
                    <TrendingUp className="h-4 w-4" />
                    Сума продаж за період
                  </div>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">
                    {totalSales.toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴
                  </p>
                </div>
                <div className="rounded-xl bg-zinc-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-500">
                    <Users className="h-4 w-4" />
                    Клієнтів за період
                  </div>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">{totalClients}</p>
                </div>
              </div>

              <div className="relative min-h-[420px]">
                {/* Main map */}
                <div
                  className="overflow-hidden rounded-xl bg-zinc-50/50 transition-all duration-200 ease-out"
                  style={{
                    opacity: selectedManagerId && drillDownVisible ? 0 : 1,
                    position: selectedManagerId ? "absolute" : "relative",
                    inset: 0,
                    pointerEvents: selectedManagerId && drillDownVisible ? "none" : "auto",
                    transform: selectedManagerId && drillDownVisible ? "translateY(-8px)" : "translateY(0)",
                  }}
                >
                  <ComposableMap
                    projection="geoMercator"
                    projectionConfig={{
                      center: [31.5, 49],
                      scale: 2800,
                    }}
                    width={800}
                    height={500}
                    style={{ width: "100%", height: "auto" }}
                  >
                    <Geographies geography={GEO_URL}>
                      {({ geographies }: { geographies: Array<{ rsmKey: string; properties: Record<string, unknown> }> }) =>
                        geographies.map((geo) => {
                          const shapeName = geo.properties?.shapeName as string | undefined;
                          const apiRegion = shapeName ? SHAPE_NAME_TO_REGION[shapeName] : undefined;
                          const row = apiRegion ? regionByApi.get(apiRegion) : undefined;
                          const fill = getFill(apiRegion);
                          const isHovered = hoveredRegion === apiRegion;
                          return (
                            <Geography
                              key={geo.rsmKey}
                              geography={geo}
                              fill={isHovered ? (viewMode === "managers" ? fill : "#0284c7") : fill}
                              stroke="#ffffff"
                              strokeWidth={1.2}
                              style={{
                                default: { outline: "none", transition: "fill 0.15s ease" },
                                hover: { outline: "none", cursor: "pointer" },
                                pressed: { outline: "none" },
                              }}
                              onMouseEnter={(evt: MouseEvent<SVGPathElement>) => {
                                setHoveredRegion(apiRegion ?? null);
                                if (row !== undefined && evt.clientX != null && evt.clientY != null) {
                                  setTooltip({
                                    x: evt.clientX,
                                    y: evt.clientY,
                                    row,
                                    shapeName: shapeName ?? apiRegion ?? "",
                                  });
                                }
                              }}
                              onMouseMove={(evt: MouseEvent<SVGPathElement>) => {
                                if (tooltip && evt.clientX != null && evt.clientY != null)
                                  setTooltip((t) => (t ? { ...t, x: evt.clientX!, y: evt.clientY! } : null));
                              }}
                              onMouseLeave={() => {
                                setHoveredRegion(null);
                                setTooltip(null);
                              }}
                            />
                          );
                        })
                      }
                    </Geographies>
                  </ComposableMap>
                </div>

                {/* Drill-down: only selected manager's regions + points */}
                {selectedManagerId && selectedManagerName && (
                  <div
                    className="overflow-hidden rounded-xl bg-zinc-50/50 transition-all duration-200 ease-out"
                    style={{
                      opacity: drillDownVisible ? 1 : 0,
                      position: "absolute",
                      inset: 0,
                      pointerEvents: drillDownVisible ? "auto" : "none",
                      transform: drillDownVisible ? "translateY(0)" : "translateY(8px)",
                    }}
                  >
                    <div className="mb-3 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleBackFromDrillDown}
                        className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Назад до всієї карти
                      </button>
                      <span className="text-sm font-medium text-zinc-600">
                        Області: <span className="text-zinc-900">{selectedManagerName}</span>
                      </span>
                    </div>
                    <ComposableMap
                      projection="geoMercator"
                      projectionConfig={{
                        center: [31.5, 49],
                        scale: 2800,
                      }}
                      width={800}
                      height={500}
                      style={{ width: "100%", height: "auto" }}
                    >
                      <Geographies geography={GEO_URL}>
                        {({ geographies }: { geographies: Array<{ rsmKey: string; properties: Record<string, unknown> }> }) =>
                          geographies.map((geo) => {
                            const shapeName = geo.properties?.shapeName as string | undefined;
                            const apiRegion = shapeName ? SHAPE_NAME_TO_REGION[shapeName] : undefined;
                            const row = apiRegion ? regionByApi.get(apiRegion) : undefined;
                            const fill = getFill(apiRegion, true);
                            return (
                              <Geography
                                key={geo.rsmKey}
                                geography={geo}
                                fill={fill}
                                stroke="#ffffff"
                                strokeWidth={1.2}
                                style={{
                                  default: { outline: "none", transition: "fill 0.15s ease" },
                                  hover: { outline: "none" },
                                  pressed: { outline: "none" },
                                }}
                              />
                            );
                          })
                        }
                      </Geographies>
                      {selectedManagerRegions.map((row, idx) => {
                        const coords = REGION_CENTROIDS[row.region];
                        if (!coords) return null;
                        return (
                          <Marker key={row.region} coordinates={coords}>
                            <g
                              style={{
                                animation: `drill-down-marker 0.3s ease-out ${idx * 0.05}s both`,
                              }}
                            >
                              <circle
                                r={8}
                                fill={managerColorById.get(row.managerId) ?? "#0ea5e9"}
                                stroke="#fff"
                                strokeWidth={2}
                              />
                              <circle r={4} fill="rgba(255,255,255,0.6)" />
                            </g>
                          </Marker>
                        );
                      })}
                    </ComposableMap>
                  </div>
                )}

                {tooltip && !selectedManagerId && (
                  <div
                    className="pointer-events-none fixed z-50 min-w-[200px] rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-lg"
                    style={{
                      left: tooltip.x + 12,
                      top: tooltip.y + 8,
                    }}
                  >
                    <p className="font-semibold text-zinc-900">{tooltip.shapeName}</p>
                    {tooltip.row.managerName && (
                      <p className="mt-0.5 text-sm text-zinc-600">Менеджер: {tooltip.row.managerName}</p>
                    )}
                    <p className="mt-1 text-sm tabular-nums text-zinc-700">
                      Клієнтів: {tooltip.row.clientsCount} · Продажі: {tooltip.row.salesTotal.toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴
                    </p>
                  </div>
                )}
              </div>

              {viewMode === "managers" && data && (
                <div className="mt-6 flex flex-wrap gap-3 border-t border-zinc-200 pt-4">
                  <span className="mr-1 self-center text-xs font-medium text-zinc-500">Клік — області та точки:</span>
                  {(Array.from(new Set(data.map((r) => r.managerName).filter(Boolean))) as string[]).map(
                    (name) => {
                      const managerId = data.find((r) => r.managerName === name)?.managerId ?? null;
                      const color = managerColorById.get(managerId) ?? "#e4e4e7";
                      const isSelected = selectedManagerId === managerId;
                      const hasRegions = data.some((r) => r.managerId === managerId && r.clientsCount > 0);
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => hasRegions && handleSelectManager(managerId, name)}
                          disabled={!hasRegions}
                          className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-all ${
                            isSelected
                              ? "border-accent-500 bg-sky-50 text-zinc-900 ring-1 ring-accent-500/30"
                              : hasRegions
                                ? "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
                                : "cursor-default border-zinc-100 bg-zinc-50 text-zinc-400"
                          }`}
                        >
                          <div
                            className="h-3.5 w-3.5 shrink-0 rounded border border-zinc-200"
                            style={{ backgroundColor: color }}
                          />
                          {name}
                        </button>
                      );
                    }
                  )}
                  <div className="flex items-center gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-2.5 py-1.5">
                    <div className="h-3.5 w-3.5 shrink-0 rounded border border-zinc-200 bg-zinc-200" />
                    <span className="text-sm text-zinc-500">Без відповідального</span>
                  </div>
                </div>
              )}

              {viewMode === "sales" && (
                <div className="mt-6 flex items-center gap-3 border-t border-zinc-200 pt-4 text-sm text-zinc-500">
                  <span>Мін</span>
                  <div className="h-3 flex-1 max-w-[200px] rounded-full bg-gradient-to-r from-sky-200 to-sky-500" />
                  <span>Макс</span>
                </div>
              )}

              {data && totalClients === 0 && totalSales === 0 && (
                <p className="mt-4 text-center text-sm text-zinc-500">Немає даних за обраний період.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
