"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  routePlansApi,
  type RouteGeometryBundle,
  type RouteGeometryLayer,
} from "@/lib/api/resources/visits";
import { RouteLayerControls, routeSourceLabel, type RouteLayerKey } from "@/components/visits/RouteLayerControls";
import { VisitsRouteMap } from "@/components/visits/VisitsRouteMap";
import { todayYmdInKyiv } from "@/lib/crmDatetime";
import { strings } from "@/locales";

type Props = {
  dateKey: string;
  ownerId: string;
  mapsApiKey: string | null;
  showTeamLink?: boolean;
  mapHeightClass?: string;
  /** History: fact_visits first with numbered stops; planning keeps default layers. */
  mode?: "default" | "history";
};

function stopMarkersFromWaypoints(
  waypoints: NonNullable<RouteGeometryLayer["waypoints"]> | undefined,
): Array<{ lat: number; lng: number; label: string; title?: string }> {
  if (!waypoints?.length) return [];
  return waypoints.map((wp, i) => ({
    lat: wp.lat,
    lng: wp.lng,
    label: String(i + 1),
    title: wp.label?.trim() || undefined,
  }));
}

function defaultLayers(mode: "default" | "history"): Record<RouteLayerKey, boolean> {
  if (mode === "history") {
    return { planned: false, fact_visits: true, fact_gps: false, fact_visits_gps: false };
  }
  return { planned: true, fact_visits: false, fact_gps: true, fact_visits_gps: false };
}

export function DayRouteMapPanel({
  dateKey,
  ownerId,
  mapsApiKey,
  showTeamLink = false,
  mapHeightClass = "h-[320px]",
  mode = "default",
}: Props) {
  const t = strings.visitsRouteMap;
  const [bundle, setBundle] = useState<RouteGeometryBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [layers, setLayers] = useState<Record<RouteLayerKey, boolean>>(() => defaultLayers(mode));

  useEffect(() => {
    setLayers(defaultLayers(mode));
  }, [mode]);

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

  const hybridAvailable = useMemo(
    () => (bundle?.factVisitsGps?.path?.length ?? 0) >= 2,
    [bundle?.factVisitsGps?.path?.length],
  );

  useEffect(() => {
    if (!bundle) return;
    if (bundle.factGps.source !== "osrm") {
      setLayers((p) => ({ ...p, fact_gps: false }));
    }
  }, [bundle?.factGps.source]);

  const compareKpi = useMemo(() => {
    if (!bundle) return null;
    const plan = bundle.planned.distanceKm;
    const factGps = bundle.factGps.distanceKm;
    const factVisits = bundle.factVisits.distanceKm;
    const compensationKm =
      bundle.compensationFactKind === "fact_gps" && factGps != null
        ? factGps
        : bundle.compensationFactKind === "fact_visits_gps"
          ? bundle.factVisitsGps?.distanceKm ?? null
          : bundle.compensationFactKind === "none"
            ? null
            : factVisits;
    const deviationPct =
      plan != null && compensationKm != null && plan > 0
        ? Math.round(((compensationKm - plan) / plan) * 100)
        : null;
    return { plan, factGps, factVisits, compensationKm, deviationPct };
  }, [bundle]);

  const layerStats = useMemo(() => {
    if (!bundle) return [];
    const planLabel = bundle.planIncludesScheduled ? t.layerPlanAllStops : t.layerPlan;
    const rows: Array<{
      key: RouteLayerKey;
      label: string;
      km: number | null;
      min: number | null;
      source: string | null;
    }> = [
      {
        key: "planned",
        label: planLabel,
        km: bundle.planned.distanceKm,
        min: bundle.planned.durationMin,
        source: routeSourceLabel(bundle.planned.source, bundle.planned.quality, bundle.planned.kind),
      },
      {
        key: "fact_gps",
        label: t.layerFactGps,
        km: bundle.factGps.distanceKm,
        min: bundle.factGps.durationMin,
        source: routeSourceLabel(bundle.factGps.source, bundle.factGps.quality, bundle.factGps.kind),
      },
      {
        key: "fact_visits",
        label: t.layerFactVisits,
        km: bundle.factVisits.distanceKm,
        min: bundle.factVisits.durationMin,
        source: routeSourceLabel(bundle.factVisits.source, bundle.factVisits.quality, bundle.factVisits.kind),
      },
    ];
    if (hybridAvailable && bundle.factVisitsGps) {
      rows.push({
        key: "fact_visits_gps",
        label: t.layerFactVisitsGps,
        km: bundle.factVisitsGps.distanceKm,
        min: bundle.factVisitsGps.durationMin,
        source: routeSourceLabel(
          bundle.factVisitsGps.source,
          bundle.factVisitsGps.quality,
          bundle.factVisitsGps.kind,
        ),
      });
    }
    return rows;
  }, [bundle, hybridAvailable, t]);

  const mapCenter = useMemo(() => {
    if (mode === "history") {
      const g2 = bundle?.factVisits;
      if (g2?.path?.[0]) return { lat: g2.path[0].lat, lng: g2.path[0].lng };
      if (g2?.waypoints?.[0]) return { lat: g2.waypoints[0].lat, lng: g2.waypoints[0].lng };
    }
    const g = bundle?.planned;
    if (g?.path?.[0]) return { lat: g.path[0].lat, lng: g.path[0].lng };
    const g2 = bundle?.factVisits;
    if (g2?.path?.[0]) return { lat: g2.path[0].lat, lng: g2.path[0].lng };
    const g3 = bundle?.factGps;
    if (g3?.path?.[0]) return { lat: g3.path[0].lat, lng: g3.path[0].lng };
    return { lat: 50.4501, lng: 30.5234 };
  }, [bundle, mode]);

  const markers = useMemo(() => {
    if (!bundle) return [];
    if (layers.fact_visits && bundle.factVisits?.waypoints?.length) {
      return stopMarkersFromWaypoints(bundle.factVisits.waypoints);
    }
    if (layers.planned && bundle.planned?.waypoints?.length) {
      return stopMarkersFromWaypoints(bundle.planned.waypoints);
    }
    return [];
  }, [bundle, layers.fact_visits, layers.planned]);

  const stopList = useMemo(() => {
    if (mode !== "history" || !bundle) return [];
    const wps =
      layers.fact_visits && bundle.factVisits?.waypoints?.length
        ? bundle.factVisits.waypoints
        : layers.planned && bundle.planned?.waypoints?.length
          ? bundle.planned.waypoints
          : [];
    return wps.map((wp, i) => ({
      n: i + 1,
      name: wp.label?.trim() || t.stopN(i + 1),
    }));
  }, [bundle, layers.fact_visits, layers.planned, mode, t]);

  const gpsQuality = bundle?.factGps?.quality;

  const compensationLabel = useMemo(() => {
    if (!bundle?.compensationFactKind) return "";
    if (bundle.compensationFactKind === "fact_gps") return t.compensationGps;
    if (bundle.compensationFactKind === "fact_visits_gps") return t.compensationHybrid;
    if (bundle.compensationFactKind === "none") return t.compensationReview;
    return t.compensationVisits;
  }, [bundle?.compensationFactKind, t]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          {showTeamLink && dateKey === todayYmdInKyiv() ? (
            <Link
              href={`/visits/team?owner=${ownerId}`}
              className="mb-1 inline-block text-xs font-medium text-blue-700 hover:underline"
            >
              {t.openLiveTeam}
            </Link>
          ) : null}
          {compareKpi ? (
            <p className="text-xs text-zinc-600">
              {t.kpiPlan}: {compareKpi.plan ?? "—"} км · {t.kpiFactGps}: {compareKpi.factGps ?? "—"} км ·{" "}
              {t.kpiFactVisits}: {compareKpi.factVisits ?? "—"} км
              {compareKpi.deviationPct != null && compareKpi.compensationKm != null ? (
                <span className="ml-1 font-medium">
                  · {t.deviation} {compareKpi.deviationPct > 0 ? "+" : ""}
                  {compareKpi.deviationPct}%
                </span>
              ) : null}
            </p>
          ) : !loading ? (
            <p className="text-xs text-zinc-500">{t.noData}</p>
          ) : null}
          {bundle?.incompleteTour ? (
            <p className="mt-1 text-xs text-amber-800">{t.incompleteTourFootnote}</p>
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
            {t.mapUnavailable}
          </div>
        ) : loading ? (
          <div className="flex h-full items-center justify-center text-xs text-zinc-500">
            {t.loading}
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
              fact_visits_gps: bundle?.factVisitsGps ?? null,
            }}
            markers={markers}
            loadingLabel={t.loading}
          />
        )}
      </div>

      {stopList.length > 0 ? (
        <ol className="mt-3 max-h-40 list-none space-y-1 overflow-y-auto text-xs text-zinc-700">
          {stopList.map((s) => (
            <li key={s.n} className="flex gap-2">
              <span className="w-5 shrink-0 font-semibold text-emerald-700">{s.n}.</span>
              <span className="truncate">{s.name}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {bundle && layerStats.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {layerStats.map((row) => (
            <div key={row.key} className="rounded-md border border-zinc-100 bg-zinc-50 px-3 py-2 text-xs">
              <div className="font-medium text-zinc-700">{row.label}</div>
              <div className="mt-0.5 text-zinc-600">
                {row.km ?? "—"} км · {row.min != null ? Math.round(row.min) : "—"} хв
                {row.source ? <span className="text-zinc-400"> · {row.source}</span> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {gpsQuality ? (
        <p className="mt-2 text-xs text-zinc-500">
          {t.gpsPoints(gpsQuality.sampleCount ?? 0)}
          {gpsQuality.coverageRatio != null
            ? t.coverage(Math.round(gpsQuality.coverageRatio * 100))
            : ""}
          {bundle?.compensationIneligibleReason === "gps_ended_before_last_visit" ||
          (gpsQuality.lastSampleAt &&
            gpsQuality.lastDoneVisitCompletedAt &&
            new Date(gpsQuality.lastSampleAt).getTime() <
              new Date(gpsQuality.lastDoneVisitCompletedAt).getTime() - 45 * 60_000)
            ? t.trackTruncated
            : gpsQuality.degradedReason === "gps_stitch_gaps" || gpsQuality.hasUnfilledGaps
              ? t.gpsGaps
              : gpsQuality.degraded &&
                  !(gpsQuality.coverageRatio != null && gpsQuality.coverageRatio < 0.7)
                ? t.weakGps
                : ""}
          {compensationLabel}
          {bundle?.compensationIneligibleReason === "gps_snap_loop_collapse"
            ? t.loopCollapseReview
            : ""}
        </p>
      ) : null}
    </div>
  );
}
