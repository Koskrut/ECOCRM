"use client";

import { GoogleMap, Marker, Polyline, useLoadScript } from "@react-google-maps/api";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { RouteGeometryLayer, RouteGeometryResult } from "@/lib/api/resources/visits";
import { routePolylineOptions, type RouteLayerKey } from "./RouteLayerControls";

export type VisitsRouteMapOverlayMarker = {
  lat: number;
  lng: number;
  label?: string;
  title?: string;
  selected?: boolean;
};

export type VisitsRouteMapExtraPath = {
  path: Array<{ lat: number; lng: number }>;
  options: google.maps.PolylineOptions;
};

export type VisitsRouteMapProps = {
  mapsApiKey: string;
  center: { lat: number; lng: number };
  layers: Record<RouteLayerKey, boolean>;
  geometries: {
    planned?: RouteGeometryLayer | null;
    fact_visits?: RouteGeometryLayer | null;
    fact_gps?: RouteGeometryLayer | null;
    fact_visits_gps?: RouteGeometryLayer | null;
  };
  markers?: Array<{ lat: number; lng: number; label?: string; title?: string }>;
  overlayMarkers?: VisitsRouteMapOverlayMarker[];
  extraPaths?: VisitsRouteMapExtraPath[];
  routeAnchors?: { start?: { lat: number; lng: number }; end?: { lat: number; lng: number } };
  onMarkerDragEnd?: (index: number, e: google.maps.MapMouseEvent) => void;
  draggableMarkers?: boolean;
  loadingLabel?: string;
  /** When provided, fitBounds uses these points instead of all layers/markers. Re-fits on change. */
  fitBoundsPoints?: Array<{ lat: number; lng: number }>;
};

function layerPath(geom: RouteGeometryLayer | null | undefined): google.maps.LatLngLiteral[] {
  if (!geom?.path?.length) return [];
  return geom.path.map((p) => ({ lat: p.lat, lng: p.lng }));
}

const LAYER_DRAW_ORDER: RouteLayerKey[] = [
  "planned",
  "fact_visits_gps",
  "fact_visits",
  "fact_gps",
];

export function VisitsRouteMap({
  mapsApiKey,
  center,
  layers,
  geometries,
  markers = [],
  overlayMarkers = [],
  extraPaths = [],
  routeAnchors,
  onMarkerDragEnd,
  draggableMarkers,
  loadingLabel = "Завантаження карти…",
  fitBoundsPoints,
}: VisitsRouteMapProps) {
  const mapRef = useRef<google.maps.Map | null>(null);

  const { isLoaded, loadError } = useLoadScript({
    id: "google-map-script-visits-route",
    googleMapsApiKey: mapsApiKey,
  });

  const bounds = useMemo(() => {
    const pts: google.maps.LatLngLiteral[] = [];
    for (const key of LAYER_DRAW_ORDER) {
      if (!layers[key]) continue;
      const g = geometries[key];
      if (g?.path) pts.push(...g.path.map((p) => ({ lat: p.lat, lng: p.lng })));
    }
    for (const m of markers) pts.push({ lat: m.lat, lng: m.lng });
    for (const m of overlayMarkers) pts.push({ lat: m.lat, lng: m.lng });
    for (const extra of extraPaths) pts.push(...extra.path);
    if (routeAnchors?.start) pts.push(routeAnchors.start);
    if (routeAnchors?.end) pts.push(routeAnchors.end);
    return pts;
  }, [geometries, layers, markers, overlayMarkers, extraPaths, routeAnchors]);

  const effectiveBounds = fitBoundsPoints && fitBoundsPoints.length > 1 ? fitBoundsPoints : bounds;

  const applyFitBounds = useCallback((pts: Array<{ lat: number; lng: number }>) => {
    const map = mapRef.current;
    if (!map || pts.length < 2) return;
    const b = new google.maps.LatLngBounds();
    for (const p of pts) b.extend(p);
    map.fitBounds(b, 48);
  }, []);

  useEffect(() => {
    applyFitBounds(effectiveBounds);
  }, [effectiveBounds, applyFitBounds]);

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center px-3 text-center text-xs text-amber-600">
        Не вдалося завантажити Google Maps
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-zinc-500">
        {loadingLabel}
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={{ width: "100%", height: "100%" }}
      center={center}
      zoom={12}
      onLoad={(map) => {
        mapRef.current = map;
        applyFitBounds(effectiveBounds);
      }}
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

      {LAYER_DRAW_ORDER.map((key) => {
        if (!layers[key]) return null;
        const geom = geometries[key];
        const path = layerPath(geom);
        if (path.length < 2) return null;
        return (
          <Polyline
            key={key}
            path={path}
            options={routePolylineOptions(geom, key)}
          />
        );
      })}

      {extraPaths.map((extra, idx) =>
        extra.path.length > 1 ? (
          <Polyline key={`extra-${idx}`} path={extra.path} options={extra.options} />
        ) : null,
      )}

      {overlayMarkers.map((m) => (
        <Marker
          key={`overlay-${m.lat}-${m.lng}-${m.label ?? ""}`}
          position={{ lat: m.lat, lng: m.lng }}
          label={m.label}
          title={m.title}
          icon={
            m.selected
              ? {
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 10,
                  fillColor: "#2563eb",
                  fillOpacity: 1,
                  strokeColor: "#fff",
                  strokeWeight: 2,
                }
              : undefined
          }
        />
      ))}

      {markers.map((m, idx) => (
        <Marker
          key={`${m.lat}-${m.lng}-${idx}`}
          position={{ lat: m.lat, lng: m.lng }}
          label={m.label ?? String(idx + 1)}
          title={m.title}
          draggable={draggableMarkers}
          onDragEnd={onMarkerDragEnd ? (e) => onMarkerDragEnd(idx, e) : undefined}
        />
      ))}
    </GoogleMap>
  );
}
