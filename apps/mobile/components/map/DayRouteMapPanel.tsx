import * as Location from "expo-location";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { Text } from "@/components/Themed";
import { EmptyState } from "@/components/EmptyState";
import { MapErrorBoundary } from "@/components/MapErrorBoundary";
import { StatTiles, type StatTile } from "@/components/today/StatTiles";
import { AppButton } from "@/components/ui/AppButton";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { useAuth } from "@/context/auth-context";
import { apiFetch } from "@/lib/api";
import { openDayRouteInMaps } from "@/lib/linking-actions";
import { canUseInteractiveMaps, resolveMapsApiKey } from "@/lib/maps-config";
import {
  buildStaticMapUrl,
  computeMapRegion,
  layerPath,
  layerWaypoints,
  normalizeGeometryBundle,
  type RouteGeometryBundle,
  type RouteGeometryResult,
} from "@/lib/route-map";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";

type LayerKey = "planned" | "fact_visits" | "fact_gps";

const LAYER_LABELS: Record<LayerKey, string> = {
  planned: "map.planned",
  fact_visits: "map.factVisits",
  fact_gps: "map.factGps",
};

type Props = {
  dateKey: string;
  ownerId?: string;
  contentPaddingBottom?: number;
  /** When provided, skips initial bundle fetch (e.g. parent already loaded it). */
  initialBundle?: RouteGeometryBundle | null;
};

function toGoogleMapColor(hex: string): string {
  return `0x${hex.replace("#", "")}`;
}

function geometryForLayer(bundle: RouteGeometryBundle, key: LayerKey): RouteGeometryResult {
  if (key === "planned") return bundle.planned;
  if (key === "fact_visits") return bundle.factVisits;
  return bundle.factGps;
}

function formatRouteStat(distanceKm: number | null, durationMin: number | null): string {
  const km = distanceKm != null && Number.isFinite(distanceKm) ? String(distanceKm) : "—";
  const min = durationMin != null && Number.isFinite(durationMin) ? String(Math.round(durationMin)) : "—";
  if (km === "—" && min === "—") return "—";
  return t("map.routeStat", { km, min });
}

function routeSourceSuffix(source: string | undefined): string {
  if (source === "osrm" || source === "google") return t("map.routeByRoads");
  if (source === "fallback") return t("map.routeApprox");
  if (source === "raw_gps") return t("map.routeRawGps");
  return "";
}

export function DayRouteMapPanel({
  dateKey,
  ownerId,
  contentPaddingBottom,
  initialBundle,
}: Props) {
  const { token } = useAuth();
  const theme = useTheme();
  const [bundle, setBundle] = useState<RouteGeometryBundle | null>(initialBundle ?? null);
  const [mapsKey, setMapsKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);
  const [staticImageError, setStaticImageError] = useState(false);
  /**
   * Android MapView SIGABRTs without com.google.android.geo.API_KEY in the binary.
   * Default to static; only flip off when the native build baked a Maps key.
   */
  const [forceStatic, setForceStatic] = useState(() => !canUseInteractiveMaps());
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    planned: true,
    fact_gps: true,
    fact_visits: false,
  });

  const layerThemeColors = useMemo(
    (): Record<LayerKey, string> => ({
      planned: theme.colors.primary,
      fact_visits: theme.colors.visit,
      fact_gps: theme.colors.warning,
    }),
    [theme],
  );

  const layerThemeBgs = useMemo(
    (): Record<LayerKey, string> => ({
      planned: theme.colors.primaryMuted,
      fact_visits: theme.colors.visitMuted,
      fact_gps: theme.colors.warningMuted,
    }),
    [theme],
  );

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setMapError(null);
    setStaticImageError(false);
    try {
      const ownerQs = ownerId ? `&ownerId=${encodeURIComponent(ownerId)}` : "";
      const [geo, key] = await Promise.all([
        apiFetch<unknown>(
          `/route-plans/geometry/bundle?date=${encodeURIComponent(dateKey)}${ownerQs}`,
          { token },
        ),
        resolveMapsApiKey(token),
      ]);
      setBundle(normalizeGeometryBundle(geo));
      setMapsKey(key);
    } catch {
      setBundle(null);
      setMapError(t("map.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [token, dateKey, ownerId]);

  useFocusEffect(
    useCallback(() => {
      if (initialBundle !== undefined) {
        setBundle(initialBundle);
        if (token) {
          void resolveMapsApiKey(token).then(setMapsKey).catch(() => setMapsKey(null));
        }
        setLoading(false);
        return;
      }
      void reload();
    }, [reload, initialBundle, token]),
  );

  const activeLayers = useMemo(() => {
    return (Object.keys(LAYER_LABELS) as LayerKey[]).filter((k) => layers[k]);
  }, [layers]);

  const polylines = useMemo(() => {
    if (!bundle) return [];
    return activeLayers
      .map((k) => ({
        key: k,
        path: layerPath(geometryForLayer(bundle, k)),
        color: layerThemeColors[k],
      }))
      .filter((p) => p.path.length >= 2);
  }, [bundle, activeLayers, layerThemeColors]);

  const visitMarkers = useMemo(() => {
    if (!bundle || !layers.planned) return [];
    return layerWaypoints(bundle.planned).map((wp, index) => ({
      key: wp.visitId ?? `visit-${index}`,
      lat: wp.lat,
      lng: wp.lng,
      label: wp.label,
    }));
  }, [bundle, layers.planned]);

  const hasMapContent = polylines.length > 0 || visitMarkers.length > 0;

  const mapRegion = useMemo(() => {
    const points = [
      ...polylines.flatMap((p) => p.path),
      ...visitMarkers.map((m) => ({ lat: m.lat, lng: m.lng })),
    ];
    return computeMapRegion(points);
  }, [polylines, visitMarkers]);

  const staticUrl = useMemo(() => {
    if (!mapsKey || !bundle || !hasMapContent) return null;
    try {
      return buildStaticMapUrl({
        apiKey: mapsKey,
        paths: activeLayers
          .map((k) => ({
            color: toGoogleMapColor(layerThemeColors[k]),
            points: layerPath(geometryForLayer(bundle, k)),
          }))
          .filter((p) => p.points.length >= 2),
        markers: visitMarkers.map((m, i) => ({
          lat: m.lat,
          lng: m.lng,
          color: "red",
          label: m.label ?? String(i + 1),
        })),
      });
    } catch {
      return null;
    }
  }, [mapsKey, bundle, activeLayers, layerThemeColors, hasMapContent, visitMarkers]);

  const statTiles = useMemo((): StatTile[] => {
    if (!bundle) return [];
    const tiles: Array<{ key: LayerKey; icon: StatTile["icon"]; geometry: RouteGeometryResult }> = [
      { key: "planned", icon: "navigate-outline", geometry: bundle.planned },
      { key: "fact_gps", icon: "locate-outline", geometry: bundle.factGps },
      { key: "fact_visits", icon: "footsteps-outline", geometry: bundle.factVisits },
    ];
    return tiles.map(({ key, icon, geometry }) => {
      const stat = formatRouteStat(geometry.distanceKm, geometry.durationMin);
      const suffix = routeSourceSuffix(geometry.source);
      return {
        key,
        label: t(LAYER_LABELS[key]),
        value: suffix ? `${stat} · ${suffix}` : stat,
        icon,
        color: layerThemeColors[key],
        bg: layerThemeBgs[key],
      };
    });
  }, [bundle, layerThemeColors, layerThemeBgs]);

  const gpsQuality = bundle?.factGps?.quality;
  const visitCount = bundle ? layerWaypoints(bundle.planned).length : 0;

  function toggleLayer(key: LayerKey) {
    setMapError(null);
    setStaticImageError(false);
    setLayers((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      const anyOn = Object.values(next).some(Boolean);
      return anyOn ? next : prev;
    });
  }

  async function onMyLocation() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(t("common.error"), t("actions.noCoords"));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        Alert.alert(t("common.error"), t("actions.noCoords"));
        return;
      }
      const url = Platform.select({
        ios: `maps://?q=${latitude},${longitude}`,
        android: `geo:${latitude},${longitude}?q=${latitude},${longitude}`,
        default: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
      });
      if (url) await Linking.openURL(url);
    } catch {
      Alert.alert(t("common.error"), t("actions.noCoords"));
    }
  }

  async function onOpenInMaps() {
    if (!token) return;
    await openDayRouteInMaps(token, dateKey);
  }

  function renderStaticMap() {
    if (!mapsKey) {
      return <EmptyState message={t("map.noApiKey")} />;
    }
    if (staticUrl && !staticImageError) {
      return (
        <Pressable onPress={() => void onOpenInMaps()} accessibilityRole="button">
          <Image
            key={staticUrl}
            source={{ uri: staticUrl }}
            style={[styles.mapImage, { backgroundColor: theme.colors.surfaceMuted }]}
            resizeMode="cover"
            onError={() => setStaticImageError(true)}
          />
        </Pressable>
      );
    }
    if (staticImageError) {
      return <EmptyState message={t("map.staticPreviewFailed")} onRetry={() => void reload()} />;
    }
    return (
      <Card style={styles.mapPlaceholder}>
        <Text style={[theme.typography.body, { color: theme.colors.textMuted, textAlign: "center" }]}>
          {t("map.previewUnavailable")}
        </Text>
      </Card>
    );
  }

  function renderInteractiveMap() {
    // Lazy-require so Android builds without a native Maps key never load MapView.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { RouteMapView } = require("@/components/RouteMapView") as typeof import("@/components/RouteMapView");
    return (
      <MapErrorBoundary onFallback={() => setForceStatic(true)}>
        <RouteMapView
          region={mapRegion}
          polylines={polylines}
          markers={visitMarkers}
        />
      </MapErrorBoundary>
    );
  }

  function renderMapSlot() {
    if (loading) {
      return <SkeletonCard />;
    }
    if (!hasMapContent) {
      return <EmptyState message={t("map.emptyRoute")} onRetry={() => void reload()} />;
    }
    // Belt-and-suspenders: never mount MapView on Android without a confirmed native key.
    if (forceStatic || !canUseInteractiveMaps()) {
      return renderStaticMap();
    }
    return renderInteractiveMap();
  }

  return (
    <View style={[styles.flex, { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md }]}>
      <View style={styles.layerRow}>
        {(Object.keys(LAYER_LABELS) as LayerKey[]).map((key) => (
          <Chip
            key={key}
            label={t(LAYER_LABELS[key])}
            selected={layers[key]}
            onPress={() => toggleLayer(key)}
          />
        ))}
      </View>

      {mapError ? (
        <Text style={[theme.typography.caption, { color: theme.colors.danger, marginBottom: theme.spacing.sm }]}>
          {mapError}
        </Text>
      ) : null}

      <View style={styles.mapSlot}>{renderMapSlot()}</View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: contentPaddingBottom ?? theme.spacing.xxl }}
        showsVerticalScrollIndicator={false}>
        {hasMapContent ? (
          <View style={[styles.actions, { marginTop: theme.spacing.md, gap: theme.spacing.sm }]}>
            <AppButton
              label={t("map.myLocation")}
              onPress={() => void onMyLocation()}
              variant="secondary"
              style={styles.actionBtn}
            />
            {visitCount > 0 ? (
              <AppButton
                label={t("map.openInMaps")}
                onPress={() => void onOpenInMaps()}
                style={styles.actionBtn}
              />
            ) : null}
          </View>
        ) : null}

        {visitCount > 0 ? (
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: theme.spacing.sm }]}>
            {t("map.visitsOnRoute", { count: visitCount })}
          </Text>
        ) : null}

        {bundle && statTiles.length > 0 ? (
          <View style={{ marginTop: theme.spacing.md }}>
            <StatTiles tiles={statTiles} />
          </View>
        ) : null}

        {gpsQuality ? (
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: theme.spacing.sm }]}>
            GPS: {gpsQuality.sampleCount} {t("map.samples")}
            {gpsQuality.degraded ? ` · ${t("today.weakGps")}` : ""}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  layerRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  mapSlot: { height: 340, borderRadius: 12, overflow: "hidden" },
  mapImage: { width: "100%", height: 340, borderRadius: 12 },
  mapPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 340 },
  scroll: { flex: 1 },
  actions: { flexDirection: "row" },
  actionBtn: { flex: 1 },
});
