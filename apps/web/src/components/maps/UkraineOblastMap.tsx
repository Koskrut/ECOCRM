"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { geoEqualEarth, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { Maximize2 } from "lucide-react";
import { apiHttp } from "@/lib/api/client";
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

type MapRow = {
  region: string;
  clientsCount: number;
  salesTotal: number;
  managerId: string | null;
  managerName: string | null;
};

function formatMoney(n: number): string {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    maximumFractionDigits: 0,
  }).format(n);
}

export function UkraineOblastMap() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 720, h: 440 });
  const [geo, setGeo] = useState<OblastFc | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<MapRow[] | null>(null);
  const [focusedDeptId, setFocusedDeptId] = useState<SalesDepartmentId | null>(null);
  const [hoveredIso, setHoveredIso] = useState<string | null>(null);
  const [period] = useState<"week" | "month">("month");

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
    apiHttp
      .get<MapRow[]>(`/analytics/map?period=${period}`)
      .then((res) => setRows(Array.isArray(res.data) ? res.data : []))
      .catch(() => setRows([]));
  }, [period]);

  const statsByRegion = useMemo(() => {
    const m = new Map<string, MapRow>();
    for (const r of rows ?? []) m.set(r.region, r);
    return m;
  }, [rows]);

  const fitTarget = useMemo((): OblastFc | null => {
    if (!geo) return null;
    if (!focusedDeptId) return geo;
    const dept = departmentById(focusedDeptId);
    if (!dept) return geo;
    const isos = new Set(dept.oblastIso);
    const features = geo.features.filter((f) => isos.has(f.properties.shapeISO));
    return { type: "FeatureCollection", features };
  }, [geo, focusedDeptId]);

  const paths = useMemo(() => {
    if (!geo || !fitTarget || fitTarget.features.length === 0) return [];
    const projection = geoEqualEarth();
    projection.fitSize([size.w, size.h], fitTarget);
    const pathGen = geoPath(projection);
    return geo.features.map((f: OblastFeature) => {
      const iso = f.properties.shapeISO;
      const dept = departmentForIso(iso);
      const d = pathGen(f);
      return { iso, d: d ?? "", dept };
    });
  }, [geo, fitTarget, size.w, size.h]);

  const panelInfo = useMemo(() => {
    const iso = hoveredIso;
    if (!iso) {
      return {
        title: "Наведіть на область",
        subtitle: "Показуються дані за обраний період у бекенді.",
        row: null as MapRow | null,
        dept: null as ReturnType<typeof departmentForIso>,
      };
    }
    const title = OBLAST_LABEL_UK[iso] ?? iso;
    const dept = departmentForIso(iso);
    const ar = ANALYTICS_REGION_BY_ISO[iso];
    const row = ar ? (statsByRegion.get(ar) ?? null) : null;
    return { title, subtitle: null as string | null, row, dept };
  }, [hoveredIso, statsByRegion]);

  const toggleDeptFocus = (id: SalesDepartmentId) => {
    setFocusedDeptId((cur) => (cur === id ? null : id));
  };

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
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      <div ref={wrapRef} className="min-w-0 flex-1">
        <div className="relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-gradient-to-br from-slate-50 via-white to-slate-100 shadow-sm">
          <svg
            width={size.w}
            height={size.h}
            className="mx-auto block h-auto w-full max-w-full"
            role="img"
            aria-label="Карта України за областями та відділами продажів"
          >
            <defs>
              <filter id="ua-map-shadow" x="-15%" y="-15%" width="130%" height="130%">
                <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodOpacity="0.14" />
              </filter>
            </defs>
            <g filter="url(#ua-map-shadow)">
              {paths.map(({ iso, d, dept }) => {
                const dimmed = Boolean(focusedDeptId && dept?.id !== focusedDeptId);
                const hovered = hoveredIso === iso;
                const fill = dept?.color ?? "#94a3b8";
                return (
                  <path
                    key={iso}
                    d={d}
                    fill={fill}
                    fillOpacity={dimmed ? 0.2 : hovered ? 0.92 : 0.78}
                    stroke="#f1f5f9"
                    strokeWidth={hovered ? 2.25 : 0.85}
                    strokeOpacity={dimmed ? 0.4 : 1}
                    className="cursor-pointer transition-[fill-opacity,stroke-width] duration-200 ease-out"
                    onMouseEnter={() => setHoveredIso(iso)}
                    onMouseLeave={() => setHoveredIso(null)}
                    onClick={() => {
                      const next = departmentForIso(iso);
                      if (next) setFocusedDeptId(next.id);
                    }}
                  />
                );
              })}
            </g>
          </svg>
        </div>
      </div>

      <aside className="flex w-full shrink-0 flex-col gap-5 lg:w-80">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Відділи</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Натисніть відділ, щоб збільшити лише його області. Повторний клік або кнопка нижче —
            повний вигляд.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {SALES_DEPARTMENTS.map((d) => {
              const active = focusedDeptId === d.id;
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => toggleDeptFocus(d.id)}
                    aria-pressed={active}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                      active
                        ? "border-zinc-900 bg-zinc-900 text-white shadow-md"
                        : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50"
                    }`}
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white/30"
                      style={{ backgroundColor: d.color }}
                      aria-hidden
                    />
                    {d.label}
                  </button>
                </li>
              );
            })}
          </ul>
          {focusedDeptId ? (
            <button
              type="button"
              onClick={() => setFocusedDeptId(null)}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50"
            >
              <Maximize2 className="h-4 w-4" aria-hidden />
              Вся Україна
            </button>
          ) : null}
        </div>

        <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Область</h2>
          <p className="mt-2 text-base font-semibold text-zinc-900">{panelInfo.title}</p>
          {panelInfo.subtitle ? (
            <p className="mt-1 text-sm text-zinc-500">{panelInfo.subtitle}</p>
          ) : null}
          {panelInfo.dept ? (
            <p className="mt-2 text-sm text-zinc-600">
              Відділ: <span className="font-medium text-zinc-800">{panelInfo.dept.label}</span>
            </p>
          ) : null}
          {panelInfo.row ? (
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-zinc-500">Клієнти</dt>
                <dd className="font-medium text-zinc-900">{panelInfo.row.clientsCount}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-zinc-500">Продажі</dt>
                <dd className="font-medium text-zinc-900">
                  {formatMoney(panelInfo.row.salesTotal)}
                </dd>
              </div>
              {panelInfo.row.managerName ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-zinc-500">Менеджер</dt>
                  <dd className="text-right font-medium text-zinc-900">
                    {panelInfo.row.managerName}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : hoveredIso && ANALYTICS_REGION_BY_ISO[hoveredIso] ? (
            <p className="mt-3 text-sm text-zinc-500">Немає угод за період у цьому регіоні.</p>
          ) : hoveredIso ? (
            <p className="mt-3 text-sm text-zinc-500">
              Статистика CRM для цього регіону не підключена.
            </p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
