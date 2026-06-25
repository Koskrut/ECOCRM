import { useFocusEffect } from "@react-navigation/native";
import * as Location from "expo-location";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import MapView, { Marker, Polyline, type Region } from "react-native-maps";

import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { useModules } from "@/context/modules-context";
import { apiFetch } from "@/lib/api";
import { formatLocalDateKey } from "@/lib/date";
import { t } from "@/lib/i18n";
import { buildStaticMapUrl, sanitizePath, type RouteGeometryBundle } from "@/lib/route-map";

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

export default function MapScreen() {
  const { token } = useAuth();
  const { visitsEnabled } = useModules();
  const dateKey = formatLocalDateKey();
  const [bundle, setBundle] = useState<RouteGeometryBundle | null>(null);
  const [mapsKey, setMapsKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [interactive, setInteractive] = useState(false);
  const [userRegion, setUserRegion] = useState<Region | null>(null);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    planned: true,
    fact_gps: true,
    fact_visits: false,
  });

  const reload = useCallback(async () => {
    if (!token || !visitsEnabled) return;
    setLoading(true);
    try {
      const [geo, cfg] = await Promise.all([
        apiFetch<RouteGeometryBundle>(
          `/route-plans/geometry/bundle?date=${encodeURIComponent(dateKey)}`,
          { token },
        ),
        apiFetch<{ mapsApiKey?: string | null }>("/settings/google-maps/public", { token }).catch(
          () => ({ mapsApiKey: null }),
        ),
      ]);
      setBundle(geo);
      setMapsKey(typeof cfg.mapsApiKey === "string" ? cfg.mapsApiKey : null);
    } catch {
      setBundle(null);
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
      setUserRegion({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
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

  const staticUrl =
    mapsKey && bundle
      ? buildStaticMapUrl({
          apiKey: mapsKey,
          paths: (
            [
              ["planned", bundle.planned] as const,
              ["fact_visits", bundle.factVisits] as const,
              ["fact_gps", bundle.factGps] as const,
            ] as const
          )
            .filter(([k]) => layers[k])
            .map(([k, g]) => ({ color: LAYER_COLORS[k], points: sanitizePath(g?.path) }))
            .filter((p) => p.points.length >= 2),
        })
      : null;

  const gpsQuality = bundle?.factGps?.quality;

  const polylines = useMemo(() => {
    if (!bundle) return [];
    const entries = [
      ["planned", bundle.planned] as const,
      ["fact_visits", bundle.factVisits] as const,
      ["fact_gps", bundle.factGps] as const,
    ] as const;
    return entries
      .filter(([k]) => layers[k])
      .map(([k, g]) => ({ key: k, path: sanitizePath(g?.path) }))
      .filter((p) => p.path.length >= 2)
      .map((p) => ({
        key: p.key,
        coords: p.path.map((pt) => ({ latitude: pt.lat, longitude: pt.lng })),
      }));
  }, [bundle, layers]);

  const defaultRegion = useMemo<Region | null>(() => {
    if (userRegion) return userRegion;
    const pts = sanitizePath(
      bundle?.planned?.path ?? bundle?.factGps?.path ?? bundle?.factVisits?.path,
    );
    const c = pts[Math.floor(pts.length / 2)];
    if (!c) return null;
    return {
      latitude: c.lat,
      longitude: c.lng,
      latitudeDelta: 0.18,
      longitudeDelta: 0.18,
    };
  }, [bundle, userRegion]);

  const showInteractiveMap = interactive && !!mapsKey && !!defaultRegion && !loading;

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
      <ScrollView contentContainerStyle={styles.content} nestedScrollEnabled>
        <Text style={styles.heading}>{t("tabs.map")}</Text>
        <Text style={styles.dateLine}>{dateKey}</Text>

        <View style={styles.toggleRow}>
          <Text style={{ fontWeight: "600" }}>Інтерактивна карта</Text>
          <Switch
            value={interactive}
            onValueChange={setInteractive}
            disabled={!mapsKey}
          />
        </View>
        {!mapsKey && !loading ? (
          <Text style={styles.hint}>Google Maps API key не налаштовано — лише статична карта.</Text>
        ) : null}

        <View style={styles.layerRow}>
          {(Object.keys(LAYER_LABELS) as LayerKey[]).map((key) => (
            <Pressable
              key={key}
              onPress={() => setLayers((p) => ({ ...p, [key]: !p[key] }))}
              style={[styles.layerChip, layers[key] && styles.layerChipOn]}>
              <Text style={[styles.layerChipText, layers[key] && styles.layerChipTextOn]}>
                {t(LAYER_LABELS[key])}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} />
        ) : !mapsKey ? (
          <Text style={styles.hint}>Google Maps API key не налаштовано.</Text>
        ) : !interactive ? (
          !staticUrl ? (
            <Text style={styles.hint}>{t("map.noPoints")}</Text>
          ) : (
            <Image source={{ uri: staticUrl }} style={styles.mapImage} resizeMode="cover" />
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

      {showInteractiveMap ? (
        <View style={styles.mapSlot}>
          <MapView style={styles.mapLive} initialRegion={defaultRegion} scrollEnabled={false}>
            {polylines.map((p) => (
              <Polyline
                key={p.key}
                coordinates={p.coords}
                strokeWidth={4}
                strokeColor={
                  p.key === "planned"
                    ? "#2563eb"
                    : p.key === "fact_visits"
                      ? "#059669"
                      : "#d97706"
                }
              />
            ))}
            {userRegion ? (
              <Marker
                coordinate={{ latitude: userRegion.latitude, longitude: userRegion.longitude }}
                title="Ви тут"
              />
            ) : null}
          </MapView>
        </View>
      ) : interactive && mapsKey && !defaultRegion && !loading ? (
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
  mapSlot: {
    height: 320,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  mapLive: { flex: 1, borderRadius: 12 },
  hint: { marginTop: 16, lineHeight: 22, opacity: 0.8, fontSize: 14 },
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
