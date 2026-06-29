import React, { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { Platform, StyleSheet } from "react-native";
import MapView, { Marker, Polyline, type Region } from "react-native-maps";

import { downsamplePath, isValidLatLng, sanitizePath, type LatLng } from "@/lib/route-map";
import { t } from "@/lib/i18n";

export type MapPolyline = {
  key: string;
  path: LatLng[];
  color: string;
};

export type MapMarker = {
  key: string;
  lat: number;
  lng: number;
  label?: string | null;
};

export type RouteMapViewRef = {
  animateToRegion: (region: Region) => void;
};

type Props = {
  region: Region;
  polylines: MapPolyline[];
  markers?: MapMarker[];
  userCoordinate?: { latitude: number; longitude: number } | null;
};

const MAX_POLYLINE_POINTS = 120;

function toMapCoords(path: LatLng[]) {
  return downsamplePath(sanitizePath(path), MAX_POLYLINE_POINTS).map((pt) => ({
    latitude: pt.lat,
    longitude: pt.lng,
  }));
}

function isValidRegion(region: Region): boolean {
  return (
    Number.isFinite(region.latitude) &&
    Number.isFinite(region.longitude) &&
    Number.isFinite(region.latitudeDelta) &&
    Number.isFinite(region.longitudeDelta) &&
    region.latitudeDelta > 0 &&
    region.longitudeDelta > 0 &&
    isValidLatLng({ lat: region.latitude, lng: region.longitude })
  );
}

export const RouteMapView = forwardRef<RouteMapViewRef, Props>(function RouteMapView(
  { region, polylines, markers = [], userCoordinate },
  ref,
) {
  const mapRef = useRef<MapView>(null);

  useImperativeHandle(ref, () => ({
    animateToRegion: (next: Region) => {
      if (!isValidRegion(next)) return;
      mapRef.current?.animateToRegion(next, 350);
    },
  }));

  const safePolylines = useMemo(
    () =>
      polylines
        .map((p) => ({ ...p, coords: toMapCoords(p.path) }))
        .filter((p) => p.coords.length >= 2),
    [polylines],
  );

  const safeMarkers = useMemo(
    () => markers.filter((m) => isValidLatLng({ lat: m.lat, lng: m.lng })),
    [markers],
  );

  if (!isValidRegion(region)) {
    return null;
  }

  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      initialRegion={region}
      scrollEnabled
      zoomEnabled
      rotateEnabled={false}
      pitchEnabled={false}
      moveOnMarkerPress={false}
      loadingEnabled
      showsUserLocation={false}
      showsMyLocationButton={false}
      collapsable={false}>
      {safePolylines.map((p) => (
        <Polyline
          key={p.key}
          coordinates={p.coords}
          strokeWidth={4}
          strokeColor={p.color}
          geodesic
        />
      ))}
      {safeMarkers.map((m) => (
        <Marker
          key={m.key}
          coordinate={{ latitude: m.lat, longitude: m.lng }}
          title={m.label ?? undefined}
        />
      ))}
      {userCoordinate &&
      Number.isFinite(userCoordinate.latitude) &&
      Number.isFinite(userCoordinate.longitude) &&
      isValidLatLng({ lat: userCoordinate.latitude, lng: userCoordinate.longitude }) ? (
        <Marker
          coordinate={userCoordinate}
          title={t("map.myLocation")}
          pinColor={Platform.OS === "ios" ? "blue" : undefined}
        />
      ) : null}
    </MapView>
  );
});

const styles = StyleSheet.create({
  map: { flex: 1, borderRadius: 12 },
});
