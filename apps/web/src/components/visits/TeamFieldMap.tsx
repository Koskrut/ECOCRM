"use client";

import { useMemo } from "react";
import type { FieldShiftTeamItem } from "@/lib/api/resources/field-shifts";
import type { RouteGeometryLayer } from "@/lib/api/resources/visits";
import { shouldShowGpsFallbackBanner, collectTeamFitBoundsPoints } from "@/lib/visits/route-map-style";
import { teamMarkerTitle } from "@/components/visits/TeamFieldList";
import { RouteLayerControls, routeSourceLabel, type RouteLayerKey } from "@/components/visits/RouteLayerControls";
import { VisitsRouteMap } from "@/components/visits/VisitsRouteMap";
import { strings } from "@/locales";

const t = strings.visitsTeam;

type TeamFieldMapProps = {
  mapsApiKey: string;
  items: FieldShiftTeamItem[];
  selectedOwnerId: string | null;
  layers: Record<RouteLayerKey, boolean>;
  geometries: {
    planned?: RouteGeometryLayer | null;
    fact_visits?: RouteGeometryLayer | null;
    fact_gps?: RouteGeometryLayer | null;
  };
  shiftOnlyPath?: Array<{ lat: number; lng: number }> | null;
  routeLoading?: boolean;
  distanceKm?: number | null;
  onToggleLayer?: (key: RouteLayerKey) => void;
};

export function TeamFieldMap({
  mapsApiKey,
  items,
  selectedOwnerId,
  layers,
  geometries,
  shiftOnlyPath,
  routeLoading,
  distanceKm,
  onToggleLayer,
}: TeamFieldMapProps) {
  const overlayMarkers = useMemo(
    () =>
      items
        .filter((i) => i.lastSample)
        .map((i) => ({
          lat: i.lastSample!.lat,
          lng: i.lastSample!.lng,
          label: i.owner.fullName.charAt(0).toUpperCase(),
          selected: i.owner.id === selectedOwnerId,
          title: teamMarkerTitle(i),
        })),
    [items, selectedOwnerId],
  );

  const center = useMemo(() => {
    const selected = overlayMarkers.find((m) => m.selected);
    if (selected) return { lat: selected.lat, lng: selected.lng };
    const gpsPath = geometries.fact_gps?.path;
    if (gpsPath?.length) return gpsPath[gpsPath.length - 1]!;
    if (overlayMarkers[0]) return { lat: overlayMarkers[0].lat, lng: overlayMarkers[0].lng };
    return { lat: 50.4501, lng: 30.5234 };
  }, [geometries.fact_gps, overlayMarkers]);

  const extraPaths = useMemo(() => {
    if (!shiftOnlyPath || shiftOnlyPath.length < 2) return [];
    return [
      {
        path: shiftOnlyPath,
        options: {
          strokeColor: "#7c3aed",
          strokeOpacity: 0.85,
          strokeWeight: 3,
          icons: [
            {
              icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 2 },
              offset: "0",
              repeat: "10px",
            },
          ],
        },
      },
    ];
  }, [shiftOnlyPath]);

  const factGpsSource = geometries.fact_gps?.source;
  const showFallbackBanner = shouldShowGpsFallbackBanner(
    factGpsSource,
    geometries.fact_gps?.path?.length ?? 0,
    layers.fact_gps,
  );

  const fitBoundsPoints = useMemo(() => {
    const selected = overlayMarkers.find((m) => m.selected);
    return collectTeamFitBoundsPoints({
      trackPath: geometries.fact_gps?.path,
      shiftOnlyPath,
      selectedMarker: selected ? { lat: selected.lat, lng: selected.lng } : null,
    });
  }, [geometries.fact_gps, shiftOnlyPath, overlayMarkers]);

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-white px-3 py-2">
        <p className="text-xs text-zinc-600">
          {distanceKm != null ? (
            <>
              GPS за день: <span className="font-medium text-zinc-900">{distanceKm} км</span>
              {factGpsSource ? (
                <span className="text-zinc-400"> · {routeSourceLabel(factGpsSource) ?? factGpsSource}</span>
              ) : null}
            </>
          ) : routeLoading ? (
            "Завантаження маршруту…"
          ) : (
            "Немає GPS-треку за сьогодні"
          )}
        </p>
        {onToggleLayer ? (
          <RouteLayerControls layers={layers} onToggle={onToggleLayer} disabled={routeLoading} />
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1">
        <VisitsRouteMap
          mapsApiKey={mapsApiKey}
          center={center}
          layers={layers}
          geometries={geometries}
          overlayMarkers={overlayMarkers}
          extraPaths={extraPaths}
          fitBoundsPoints={fitBoundsPoints}
          loadingLabel={routeLoading ? "Будуємо маршрут…" : "Завантаження карти…"}
        />
        {routeLoading && !geometries.fact_gps ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/60">
            <span className="text-sm text-zinc-500">Будуємо маршрут…</span>
          </div>
        ) : null}
        {showFallbackBanner ? (
          <p className="pointer-events-none absolute bottom-2 left-2 right-2 rounded bg-white/90 px-2 py-1 text-center text-xs text-amber-800 shadow-sm">
            {t.routeGpsFallback}
          </p>
        ) : null}
      </div>
    </div>
  );
}
