"use client";

import { GoogleMap, Marker, Polyline, useLoadScript } from "@react-google-maps/api";
import { useMemo } from "react";
import type { FieldShiftTeamItem } from "@/lib/api/resources/field-shifts";
import { teamMarkerTitle } from "@/components/visits/TeamFieldList";

type TeamFieldMapProps = {
  mapsApiKey: string;
  items: FieldShiftTeamItem[];
  selectedOwnerId: string | null;
  trackPath: Array<{ lat: number; lng: number }>;
  routeSource?: "google" | "fallback" | "none" | null;
  routeLoading?: boolean;
};

export function TeamFieldMap({
  mapsApiKey,
  items,
  selectedOwnerId,
  trackPath,
  routeSource,
  routeLoading,
}: TeamFieldMapProps) {
  const { isLoaded, loadError } = useLoadScript({
    id: "google-map-script-team-field",
    googleMapsApiKey: mapsApiKey,
  });

  const markers = useMemo(
    () =>
      items
        .filter((i) => i.lastSample)
        .map((i) => ({
          id: i.owner.id,
          item: i,
          lat: i.lastSample!.lat,
          lng: i.lastSample!.lng,
          label: i.owner.fullName.charAt(0).toUpperCase(),
          selected: i.owner.id === selectedOwnerId,
          title: teamMarkerTitle(i),
        })),
    [items, selectedOwnerId],
  );

  const center = useMemo(() => {
    if (trackPath.length > 0) {
      return trackPath[trackPath.length - 1]!;
    }
    if (markers.length > 0) {
      return { lat: markers[0]!.lat, lng: markers[0]!.lng };
    }
    return { lat: 50.4501, lng: 30.5234 };
  }, [trackPath, markers]);

  const boundsPts = useMemo(() => {
    const pts = [...trackPath, ...markers.map((m) => ({ lat: m.lat, lng: m.lng }))];
    return pts;
  }, [trackPath, markers]);

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
        {routeLoading ? "Будуємо маршрут по вулицях…" : "Завантаження карти…"}
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={{ width: "100%", height: "100%" }}
      center={center}
      zoom={11}
      onLoad={(map) => {
        if (boundsPts.length > 1) {
          const b = new google.maps.LatLngBounds();
          for (const p of boundsPts) b.extend(p);
          map.fitBounds(b, 48);
        }
      }}
      options={{
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      }}>
      {trackPath.length > 1 ? (
        <Polyline
          path={trackPath}
          options={{
            strokeColor: routeSource === "google" ? "#d97706" : "#f59e0b",
            strokeOpacity: routeSource === "google" ? 0.95 : 0.65,
            strokeWeight: routeSource === "google" ? 4 : 3,
            ...(routeSource !== "google"
              ? {
                  icons: [
                    {
                      icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 2 },
                      offset: "0",
                      repeat: "12px",
                    },
                  ],
                }
              : {}),
          }}
        />
      ) : null}
      {markers.map((m) => (
        <Marker
          key={m.id}
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
    </GoogleMap>
  );
}
