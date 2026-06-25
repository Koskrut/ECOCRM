import React, { useMemo } from "react";
import { StyleSheet } from "react-native";
import MapView, { Marker, Polyline, type Region } from "react-native-maps";

import { downsamplePath, sanitizePath, type LatLng } from "@/lib/route-map";

export type MapPolyline = {
  key: string;
  path: LatLng[];
  color: string;
};

type Props = {
  region: Region;
  polylines: MapPolyline[];
  userCoordinate?: { latitude: number; longitude: number } | null;
};

const MAX_POLYLINE_POINTS = 120;

function toMapCoords(path: LatLng[]) {
  return downsamplePath(sanitizePath(path), MAX_POLYLINE_POINTS).map((pt) => ({
    latitude: pt.lat,
    longitude: pt.lng,
  }));
}

export function RouteMapView({ region, polylines, userCoordinate }: Props) {
  const safePolylines = useMemo(
    () =>
      polylines
        .map((p) => ({ ...p, coords: toMapCoords(p.path) }))
        .filter((p) => p.coords.length >= 2),
    [polylines],
  );

  const layerKey = safePolylines.map((p) => p.key).join(",");

  return (
    <MapView
      key={layerKey}
      style={styles.map}
      initialRegion={region}
      scrollEnabled={false}
      zoomEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}>
      {safePolylines.map((p) => (
        <Polyline
          key={p.key}
          coordinates={p.coords}
          strokeWidth={4}
          strokeColor={p.color}
          geodesic
        />
      ))}
      {userCoordinate &&
      Number.isFinite(userCoordinate.latitude) &&
      Number.isFinite(userCoordinate.longitude) ? (
        <Marker coordinate={userCoordinate} title="Ви тут" />
      ) : null}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1, borderRadius: 12 },
});
