import { useFocusEffect } from "@react-navigation/native";
import * as Location from "expo-location";
import React, { Suspense, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import type { Region } from "react-native-maps";

import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { useModules } from "@/context/modules-context";
import { apiFetch } from "@/lib/api";
import { formatLocalDateKey } from "@/lib/date";
import { t } from "@/lib/i18n";
import {
  buildStaticMapUrl,
  layerPath,
  normalizeGeometryBundle,
  type RouteGeometryBundle,
} from "@/lib/route-map";

const RouteMapView = React.lazy(() =>
  import("@/components/RouteMapView").then((m) => ({ default: m.RouteMapView })),
);

type LayerKey = "planned" | "fact_visits" | "fact_gps";

const LAYER_LABELS: Record<LayerKey, string> = {
  planned: "map.planned",
  fact_visits: "map.factVisits",
  fact_gps: "map.factGps",
};

const LAYER_COLORS: Record<LayerKey, string> = {
  planned: "0x2563eb",
  fact_visits: "0x059669",
  fact_gps: "0xd97706",
};

const STROKE_COLORS: Record<LayerKey, string> = {
  planned: "#2563eb",
  fact_visits: "#059669",
  fact_gps: "#d97706",
};

function geometryForLayer(bundle: RouteGeometryBundle, key: LayerKey) {
  if (key === "planned") return bundle.planned;
  if (key === "fact_visits") return bundle.factVisits;
  return bundle.factGps;
}

export default function MapScreen() {
  const { token } = useAuth();
  const { visitsEnabled } = useModules();
  const dateKey = formatLocalDateKey();
  const [bundle, setBundle] = useState<RouteGeometryBundle | null>(null);
  const [mapsKey, setMapsKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [interactive, setInteractive] = useState(false);
  const [userRegion, setUserRegion] = useState<Region | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [staticImageError, setStaticImageError] = useState(false);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    planned: true,
    fact_gps: true,
    fact_visits: false,
  });

  const reload = useCallback(async () => {
    if (!token || !visitsEnabled) return;
    setLoading(true);
    setMapError(null);
    setStaticImageError(false);
    try {
      const [geo, cfg] = await Promise.all([
        apiFetch<unknown>(
          `/route-plans/geometry/bundle?date=${encodeURIComponent(dateKey)}`,
          { token },
        ),
        apiFetch<{ mapsApiKey?: string | null }>("/settings/google-maps/public", { token }).catch(
          () => ({ mapsApiKey: null }),
        ),
      ]);
      setBundle(normalizeGeometryBundle(geo));
      setMapsKey(typeof cfg.mapsApiKey === "string" ? cfg.mapsApiKey : null);
    } catch {
      setBundle(null);
      setMapError("Не вдалося завантажити маршрут");
    } finally {
      setLoading(false);
    }
  }, [token, dateKey, visitsEnabled]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const loadUserLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      setUserRegion({
        latitude,
        longitude,
        latitudeDelta: 0.12,
        longitudeDelta: 0.12,
      });
    } catch {
      // ignore
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadUserLocation();
    }, [loadUserLocation]),
  );

  const activeLayers = useMemo(() => {
    return (Object.keys(LAYER_LABELS) as LayerKey[]).filter((k) => layers[k]);
  }, [layers]);

  const staticUrl = useMemo(() => {
    if (!mapsKey || !bundle) return null;
    try {
      return buildStaticMapUrl({
        apiKey: mapsKey,
        paths: activeLayers
          .map((k) => ({
            color: LAYER_COLORS[k],
            points: layerPath(geometryForLayer(bundle, k)),
          }))
          .filter((p) => p.points.length >= 2),
      });
    } catch {
      return null;
    }
  }, [mapsKey, bundle, activeLayers]);

  const polylines = useMemo(() => {
    if (!bundle) return [];
    return activeLayers
      .map((k) => ({
        key: k,
        path: layerPath(geometryForLayer(bundle, k)),
        color: STROKE_COLORS[k],
      }))
      .filter((p) => p.path.length >= 2);
  }, [bundle, activeLayers]);

  const defaultRegion = useMemo<Region | null>(() => {
    if (userRegion) return userRegion;
    if (!bundle) return null;
    const pts = layerPath(bundle.planned).length
      ? layerPath(bundle.planned)
      : layerPath(bundle.factGps).length
        ? layerPath(bundle.factGps)
        : layerPath(bundle.factVisits);
    const c = pts[Math.floor(pts.length / 2)];
    if (!c) return null;
    return {
      latitude: c.lat,
      longitude: c.lng,
      latitudeDelta: 0.18,
      longitudeDelta: 0.18,
    };
  }, [bundle, userRegion]);

  const showInteractiveMap = interactive && !!defaultRegion && !loading && polylines.length > 0;

  function toggleLayer(key: LayerKey) {
    setMapError(null);
    setStaticImageError(false);
    setLayers((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      const anyOn = Object.values(next).some(Boolean);
      return anyOn ? next : prev;
    });
  }

  const gpsQuality = bundle?.factGps?.quality;

  if (!visitsEnabled) {
    return (
      <View style={styles.unavailable}>
        <Text style={styles.heading}>{t("tabs.map")}</Text>
        <Text style={styles.hint}>{t("modules.unavailableBody")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>{t("tabs.map")}</Text>
        <Text style={styles.dateLine}>{dateKey}</Text>

        <View style={styles.toggleRow}>
          <Text style={{ fontWeight: "600" }}>Інтерактивна карта</Text>
          <Switch
            value={interactive}
            onValueChange={(v) => {
              setMapError(null);
              setInteractive(v);
            }}
            disabled={!mapsKey || polylines.length === 0}
          />
        </View>
        {!mapsKey && !loading ? (
          <Text style={styles.hint}>Google Maps API key не налаштовано.</Text>
        ) : null}
        {interactive && !mapsKey ? (
          <Text style={styles.hint}>Інтерактивна карта потребує Google Maps API key.</Text>
        ) : null}

        <View style={styles.layerRow}>
          {(Object.keys(LAYER_LABELS) as LayerKey[]).map((key) => (
            <Pressable
              key={key}
              onPress={() => toggleLayer(key)}
              style={[styles.layerChip, layers[key] && styles.layerChipOn]}>
              <Text style={[styles.layerChipText, layers[key] && styles.layerChipTextOn]}>
                {t(LAYER_LABELS[key])}
              </Text>
            </Pressable>
          ))}
        </View>

        {mapError ? <Text style={styles.errorText}>{mapError}</Text> : null}

        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} />
        ) : !interactive ? (
          !mapsKey ? (
            <Text style={styles.hint}>Google Maps API key не налаштовано.</Text>
          ) : !staticUrl || staticImageError ? (
            <Text style={styles.hint}>{t("map.noPoints")}</Text>
          ) : (
            <Image
              key={staticUrl}
              source={{ uri: staticUrl }}
              style={styles.mapImage}
              resizeMode="cover"
              onError={() => setStaticImageError(true)}
            />
          )
        ) : null}

        {bundle ? (
          <View style={styles.metrics}>
            <Text style={styles.metricLine}>
              {t("map.planned")}: {bundle.planned?.distanceKm ?? "—"} {t("common.km")}
            </Text>
            <Text style={styles.metricLine}>
              {t("map.factGpsKm")}: {bundle.factGps?.distanceKm ?? "—"} {t("common.km")}
              {gpsQuality?.degraded ? ` (${t("today.weakGps")})` : ""}
            </Text>
            <Text style={styles.metricLine}>
              {t("map.factVisitsKm")}: {bundle.factVisits?.distanceKm ?? "—"} {t("common.km")}
            </Text>
            {gpsQuality ? (
              <Text style={styles.gpsMeta}>
                GPS: {gpsQuality.sampleCount} {t("map.samples")}
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {showInteractiveMap && defaultRegion ? (
        <View style={styles.mapSlotFixed}>
          <Suspense fallback={<ActivityIndicator style={{ marginTop: 24 }} />}>
            <RouteMapView
              region={defaultRegion}
              polylines={polylines}
              userCoordinate={
                userRegion
                  ? { latitude: userRegion.latitude, longitude: userRegion.longitude }
                  : null
              }
            />
          </Suspense>
        </View>
      ) : interactive && !loading && !defaultRegion ? (
        <Text style={[styles.hint, { paddingHorizontal: 16 }]}>{t("map.noPoints")}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  unavailable: { flex: 1, padding: 16 },
  heading: { fontSize: 22, fontWeight: "700" },
  dateLine: { marginTop: 4, opacity: 0.75, fontSize: 14, marginBottom: 12 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  layerRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  layerChip: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(120,120,128,0.12)",
  },
  layerChipOn: { backgroundColor: "rgba(37,99,235,0.15)" },
  layerChipText: { fontSize: 13, opacity: 0.7 },
  layerChipTextOn: { fontWeight: "600", opacity: 1, color: "#1d4ed8" },
  mapImage: {
    width: "100%",
    height: 280,
    borderRadius: 12,
    backgroundColor: "rgba(120,120,128,0.1)",
  },
  mapSlotFixed: {
    height: 320,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  hint: { marginTop: 16, lineHeight: 22, opacity: 0.8, fontSize: 14 },
  errorText: { color: "#ef4444", marginBottom: 8, lineHeight: 20 },
  metrics: {
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "rgba(120,120,128,0.08)",
    gap: 6,
  },
  metricLine: { fontSize: 14 },
  gpsMeta: { fontSize: 12, opacity: 0.65, marginTop: 4 },
});
