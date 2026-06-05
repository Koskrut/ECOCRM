import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { apiFetch } from "@/lib/api";
import { formatLocalDateKey } from "@/lib/date";
import {
  buildStaticMapUrl,
  type RouteGeometryBundle,
} from "@/lib/route-map";

type LayerKey = "planned" | "fact_visits" | "fact_gps";

const LAYER_LABELS: Record<LayerKey, string> = {
  planned: "План",
  fact_visits: "Факт (визиты)",
  fact_gps: "Факт (GPS)",
};

const LAYER_COLORS: Record<LayerKey, string> = {
  planned: "0x2563eb",
  fact_visits: "0x059669",
  fact_gps: "0xd97706",
};

export default function MapScreen() {
  const { token } = useAuth();
  const dateKey = formatLocalDateKey();
  const [bundle, setBundle] = useState<RouteGeometryBundle | null>(null);
  const [mapsKey, setMapsKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    planned: true,
    fact_gps: true,
    fact_visits: false,
  });

  const reload = useCallback(async () => {
    if (!token) return;
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
  }, [token, dateKey]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
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
            .filter(([, g]) => g.path.length >= 2)
            .map(([k, g]) => ({ color: LAYER_COLORS[k], points: g.path })),
        })
      : null;

  const gpsQuality = bundle?.factGps.quality;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Маршрут дня</Text>
      <Text style={styles.dateLine}>{dateKey}</Text>

      <View style={styles.layerRow}>
        {(Object.keys(LAYER_LABELS) as LayerKey[]).map((key) => (
          <Pressable
            key={key}
            onPress={() => setLayers((p) => ({ ...p, [key]: !p[key] }))}
            style={[styles.layerChip, layers[key] && styles.layerChipOn]}>
            <Text style={[styles.layerChipText, layers[key] && styles.layerChipTextOn]}>
              {LAYER_LABELS[key]}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : !mapsKey ? (
        <Text style={styles.hint}>Карта недоступна: не настроен Google Maps API key.</Text>
      ) : !staticUrl ? (
        <Text style={styles.hint}>
          Нет точек для выбранных слоёв. Запланируйте визиты или включите GPS-смену.
        </Text>
      ) : (
        <Image source={{ uri: staticUrl }} style={styles.mapImage} resizeMode="cover" />
      )}

      {bundle ? (
        <View style={styles.metrics}>
          <Text style={styles.metricLine}>
            План: {bundle.planned.distanceKm ?? "—"} км
          </Text>
          <Text style={styles.metricLine}>
            Факт GPS: {bundle.factGps.distanceKm ?? "—"} км
            {gpsQuality?.degraded ? " (слабый сигнал)" : ""}
          </Text>
          <Text style={styles.metricLine}>
            Факт визиты: {bundle.factVisits.distanceKm ?? "—"} км
          </Text>
          {gpsQuality ? (
            <Text style={styles.gpsMeta}>
              GPS: {gpsQuality.sampleCount} точек
              {gpsQuality.coverageRatio != null
                ? ` · покрытие ~${Math.round(gpsQuality.coverageRatio * 100)}%`
                : ""}
            </Text>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  heading: { fontSize: 22, fontWeight: "700" },
  dateLine: { marginTop: 4, opacity: 0.75, fontSize: 14, marginBottom: 12 },
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
