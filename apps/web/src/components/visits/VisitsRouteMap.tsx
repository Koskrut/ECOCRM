"use client";

import { GoogleMap, Marker, Polyline, useLoadScript } from "@react-google-maps/api";
import { useMemo } from "react";
import type { RouteGeometryResult } from "@/lib/api/resources/visits";
import { routePolylineOptions, type RouteLayerKey } from "./RouteLayerControls";

export type VisitsRouteMapProps = {
  mapsApiKey: string;
  center: { lat: number; lng: number };
  layers: Record<RouteLayerKey, boolean>;
  geometries: {
    planned?: RouteGeometryResult | null;
    fact_visits?: RouteGeometryResult | null;
    fact_gps?: RouteGeometryResult | null;
  };
  markers?: Array<{ lat: number; lng: number; label?: string }>;
  routeAnchors?: { start?: { lat: number; lng: number }; end?: { lat: number; lng: number } };
  onMarkerDragEnd?: (index: number, e: google.maps.MapMouseEvent) => void;
  draggableMarkers?: boolean;
};

function layerPath(geom: RouteGeometryResult | null | undefined): google.maps.LatLngLiteral[] {
  if (!geom?.path?.length) return [];
  return geom.path.map((p) => ({ lat: p.lat, lng: p.lng }));
}

export function VisitsRouteMap({
  mapsApiKey,
  center,
  layers,
  geometries,
  markers = [],
  routeAnchors,
  onMarkerDragEnd,
  draggableMarkers,
}: VisitsRouteMapProps) {
  const { isLoaded, loadError } = useLoadScript({
    id: "google-map-script-visits-route",
    googleMapsApiKey: mapsApiKey,
  });

  const bounds = useMemo(() => {
    const pts: google.maps.LatLngLiteral[] = [];
    for (const key of ["planned", "fact_visits", "fact_gps"] as RouteLayerKey[]) {
      if (!layers[key]) continue;
      const g = geometries[key];
      if (g?.path) pts.push(...g.path.map((p) => ({ lat: p.lat, lng: p.lng })));
    }
    for (const m of markers) pts.push({ lat: m.lat, lng: m.lng });
    if (routeAnchors?.start) pts.push(routeAnchors.start);
    if (routeAnchors?.end) pts.push(routeAnchors.end);
    return pts;
  }, [geometries, layers, markers, routeAnchors]);

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center px-3 text-center text-xs text-amber-600">
        Failed to load Google Maps
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-zinc-500">
        Загрузка карты…
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={{ width: "100%", height: "100%" }}
      center={center}
      zoom={12}
      onLoad={(map) => {
        if (bounds.length > 1) {
          const b = new google.maps.LatLngBounds();
          for (const p of bounds) b.extend(p);
          map.fitBounds(b, 48);
        }
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

      {layers.planned && layerPath(geometries.planned).length > 1 ? (
        <Polyline
          path={layerPath(geometries.planned)}
          options={routePolylineOptions(geometries.planned, "planned")}
        />
      ) : null}
      {layers.fact_visits && layerPath(geometries.fact_visits).length > 1 ? (
        <Polyline
          path={layerPath(geometries.fact_visits)}
          options={routePolylineOptions(geometries.fact_visits, "fact_visits")}
        />
      ) : null}
      {layers.fact_gps && layerPath(geometries.fact_gps).length > 1 ? (
        <Polyline
          path={layerPath(geometries.fact_gps)}
          options={routePolylineOptions(geometries.fact_gps, "fact_gps")}
        />
      ) : null}

      {markers.map((m, idx) => (
        <Marker
          key={`${m.lat}-${m.lng}-${idx}`}
          position={{ lat: m.lat, lng: m.lng }}
          label={m.label ?? String(idx + 1)}
          draggable={draggableMarkers}
          onDragEnd={onMarkerDragEnd ? (e) => onMarkerDragEnd(idx, e) : undefined}
        />
      ))}
    </GoogleMap>
  );
}
