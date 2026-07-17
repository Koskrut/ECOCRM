"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  routePlansApi,
  type RouteGeometryBundle,
} from "@/lib/api/resources/visits";
import { RouteLayerControls, routeSourceLabel, type RouteLayerKey } from "@/components/visits/RouteLayerControls";
import { VisitsRouteMap } from "@/components/visits/VisitsRouteMap";
import { todayYmdInKyiv } from "@/lib/crmDatetime";

type Props = {
  dateKey: string;
  ownerId: string;
  mapsApiKey: string | null;
  showTeamLink?: boolean;
  mapHeightClass?: string;
};

function plannedMarkers(bundle: RouteGeometryBundle | null) {
  if (!bundle?.planned?.waypoints?.length) return [];
  return bundle.planned.waypoints.map((wp, i) => ({
    lat: wp.lat,
    lng: wp.lng,
    label: wp.label?.slice(0, 1) ?? String(i + 1),
  }));
}

export function DayRouteMapPanel({
  dateKey,
  ownerId,
  mapsApiKey,
  showTeamLink = false,
  mapHeightClass = "h-[320px]",
}: Props) {
  const [bundle, setBundle] = useState<RouteGeometryBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [layers, setLayers] = useState<Record<RouteLayerKey, boolean>>({
    planned: true,
    fact_visits: false,
    fact_gps: true,
  });

  const load = useCallback(async () => {
    if (!dateKey || !ownerId) return;
    setLoading(true);
    try {
      const b = await routePlansApi.geometryBundle(dateKey, {
        ownerId,
        traffic: true,
      });
      setBundle(b);
    } catch {
      setBundle(null);
    } finally {
      setLoading(false);
    }
  }, [dateKey, ownerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const compareKpi = useMemo(() => {
    if (!bundle) return null;
    const plan = bundle.planned.distanceKm;
    const factGps = bundle.factGps.distanceKm;
    const factVisits = bundle.factVisits.distanceKm;
    const fact =
      bundle.compensationFactKind === "fact_gps" && factGps != null ? factGps : factVisits;
    const deviationPct =
      plan != null && fact != null && plan > 0
        ? Math.round(((fact - plan) / plan) * 100)
        : null;
    return { plan, factGps, factVisits, deviationPct };
  }, [bundle]);

  const layerStats = useMemo(() => {
    if (!bundle) return [];
    const rows: Array<{ key: RouteLayerKey; label: string; km: number | null; min: number | null; source: string | null }> = [
      { key: "planned", label: "План", km: bundle.planned.distanceKm, min: bundle.planned.durationMin, source: routeSourceLabel(bundle.planned.source) },
      { key: "fact_gps", label: "Факт (GPS)", km: bundle.factGps.distanceKm, min: bundle.factGps.durationMin, source: routeSourceLabel(bundle.factGps.source) },
      { key: "fact_visits", label: "Факт (визиты)", km: bundle.factVisits.distanceKm, min: bundle.factVisits.durationMin, source: routeSourceLabel(bundle.factVisits.source) },
    ];
    return rows;
  }, [bundle]);

  const mapCenter = useMemo(() => {
    const g = bundle?.planned;
    if (g?.path?.[0]) return { lat: g.path[0].lat, lng: g.path[0].lng };
    const g2 = bundle?.factVisits;
    if (g2?.path?.[0]) return { lat: g2.path[0].lat, lng: g2.path[0].lng };
    const g3 = bundle?.factGps;
    if (g3?.path?.[0]) return { lat: g3.path[0].lat, lng: g3.path[0].lng };
    return { lat: 50.4501, lng: 30.5234 };
  }, [bundle]);

  const markers = useMemo(() => plannedMarkers(bundle), [bundle]);
  const gpsQuality = bundle?.factGps?.quality;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          {showTeamLink && dateKey === todayYmdInKyiv() ? (
            <Link
              href={`/visits/team?owner=${ownerId}`}
              className="mb-1 inline-block text-xs font-medium text-blue-700 hover:underline"
            >
              Открыть live-карту команды
            </Link>
          ) : null}
          {compareKpi ? (
            <p className="text-xs text-zinc-600">
              План: {compareKpi.plan ?? "—"} км · Факт GPS: {compareKpi.factGps ?? "—"} км · Факт
              (визиты): {compareKpi.factVisits ?? "—"} км
              {compareKpi.deviationPct != null ? (
                <span className="ml-1 font-medium">
                  · отклонение {compareKpi.deviationPct > 0 ? "+" : ""}
                  {compareKpi.deviationPct}%
                </span>
              ) : null}
            </p>
          ) : !loading ? (
            <p className="text-xs text-zinc-500">Нет данных маршрута за этот день.</p>
          ) : null}
        </div>
        <RouteLayerControls
          layers={layers}
          onToggle={(key) => setLayers((p) => ({ ...p, [key]: !p[key] }))}
          disabled={loading}
        />
      </div>

      <div className={`overflow-hidden rounded-md border border-zinc-100 ${mapHeightClass}`}>
        {!mapsApiKey ? (
          <div className="flex h-full items-center justify-center text-xs text-zinc-500">
            Карта недоступна (нет Google Maps API key)
          </div>
        ) : loading ? (
          <div className="flex h-full items-center justify-center text-xs text-zinc-500">
            Загрузка маршрута…
          </div>
        ) : (
          <VisitsRouteMap
            mapsApiKey={mapsApiKey}
            center={mapCenter}
            layers={layers}
            geometries={{
              planned: bundle?.planned ?? null,
              fact_visits: bundle?.factVisits ?? null,
              fact_gps: bundle?.factGps ?? null,
            }}
            markers={layers.planned ? markers : []}
          />
        )}
      </div>

      {bundle && layerStats.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {layerStats.map((row) => (
            <div key={row.key} className="rounded-md border border-zinc-100 bg-zinc-50 px-3 py-2 text-xs">
              <div className="font-medium text-zinc-700">{row.label}</div>
              <div className="mt-0.5 text-zinc-600">
                {row.km ?? "—"} км · {row.min != null ? Math.round(row.min) : "—"} мин
                {row.source ? <span className="text-zinc-400"> · {row.source}</span> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {gpsQuality ? (
        <p className="mt-2 text-xs text-zinc-500">
          GPS: {gpsQuality.sampleCount} точек
          {gpsQuality.coverageRatio != null
            ? ` · покрытие ${Math.round(gpsQuality.coverageRatio * 100)}%`
            : ""}
          {bundle?.compensationIneligibleReason === "gps_ended_before_last_visit" ||
          (gpsQuality.lastSampleAt &&
            gpsQuality.lastDoneVisitCompletedAt &&
            new Date(gpsQuality.lastSampleAt).getTime() <
              new Date(gpsQuality.lastDoneVisitCompletedAt).getTime() - 45 * 60_000)
            ? " · трек оборвался"
            : gpsQuality.degraded &&
                !(gpsQuality.coverageRatio != null && gpsQuality.coverageRatio < 0.7)
              ? " · слабый сигнал GPS"
              : ""}
          {bundle?.compensationFactKind
            ? ` · компенсация: ${bundle.compensationFactKind === "fact_gps" ? "GPS" : "визиты"}`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
