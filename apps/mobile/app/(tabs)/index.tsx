import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  View as RNView,
} from "react-native";

import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EntityActionBar } from "@/components/EntityActionBar";
import { VisitCard } from "@/components/VisitCard";
import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { useModules } from "@/context/modules-context";
import { useShiftTracking } from "@/context/shift-tracking-context";
import { apiFetch } from "@/lib/api";
import { formatLocalDateKey } from "@/lib/date";
import { t } from "@/lib/i18n";
import type { RouteGeometryBundle } from "@/lib/route-map";
import {
  findNearestVisit,
  visitPhone,
  visitProgress,
  visitTimeRange,
  visitLabel,
} from "@/lib/visit-utils";
import type { VisitSummary } from "@/types/crm";

export default function TodayScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { visitsEnabled } = useModules();
  const { activeShift, isTracking, startShift, endShift, loading: shiftLoading } =
    useShiftTracking();
  const [items, setItems] = useState<VisitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [fuelBanner, setFuelBanner] = useState<string | null>(null);
  const [routeBanner, setRouteBanner] = useState<string | null>(null);

  const dateKey = formatLocalDateKey();

  const nearest = useMemo(() => findNearestVisit(items), [items]);
  const progress = useMemo(() => visitProgress(items), [items]);
  const listItems = useMemo(
    () => (nearest ? items.filter((v) => v.id !== nearest.id) : items),
    [items, nearest],
  );

  const reload = useCallback(async () => {
    if (!token || !visitsEnabled) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [day, fuel, route] = await Promise.all([
        apiFetch<{ items: VisitSummary[] }>(`/visits/day?date=${encodeURIComponent(dateKey)}`, {
          token,
        }),
        apiFetch<{
          report: {
            compensationKm: number | null;
            amountEstimated: string | number | null;
          };
        }>(`/field/fuel/day?date=${encodeURIComponent(dateKey)}`, { token }).catch(() => null),
        apiFetch<RouteGeometryBundle>(
          `/route-plans/geometry/bundle?date=${encodeURIComponent(dateKey)}`,
          { token },
        ).catch(() => null),
      ]);
      setItems(day.items ?? []);
      const km = fuel?.report?.compensationKm;
      const amt = fuel?.report?.amountEstimated;
      if (km != null) {
        const sum =
          amt != null && Number.isFinite(Number(amt)) ? ` · ${Number(amt)} ${t("common.currency")}` : "";
        setFuelBanner(`${km} ${t("common.km")}${sum}`);
      } else {
        setFuelBanner(null);
      }
      if (route?.planned?.distanceKm != null) {
        const plan = route.planned.distanceKm;
        const gps = route.factGps?.distanceKm;
        const visits = route.factVisits?.distanceKm;
        const gpsNote =
          route.factGps?.quality?.degraded && gps != null ? ` · ${t("today.weakGps")}` : "";
        setRouteBanner(
          t("today.planKm", { km: plan }) +
            (gps != null ? ` · ${t("today.gpsKm", { km: gps })}` : "") +
            (visits != null ? ` · ${t("today.visitsKm", { km: visits })}` : "") +
            gpsNote,
        );
      } else {
        setRouteBanner(null);
      }
    } finally {
      setLoading(false);
    }
  }, [token, dateKey, visitsEnabled]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  if (!visitsEnabled) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>{t("today.heading")}</Text>
        <RNView style={styles.moduleBanner}>
          <Text style={styles.moduleBannerTitle}>{t("modules.unavailableTitle")}</Text>
          <Text style={styles.moduleBannerBody}>{t("modules.unavailableBody")}</Text>
        </RNView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t("today.heading")}
        actionLabel="+ Візит"
        onAction={() => router.push("/visits/new")}
      />
      <Text style={styles.dateLine}>{dateKey}</Text>

      {progress.total > 0 ? (
        <Text style={styles.progress}>
          {t("today.progress", { done: progress.done, total: progress.total })}
        </Text>
      ) : null}

      <View style={styles.quickRow}>
        <Pressable
          onPress={() => router.push("/(tabs)/work")}
          accessibilityRole="button"
          style={({ pressed }) => [styles.smallBtn, pressed && { opacity: 0.75 }]}>
          <Text style={styles.smallBtnText}>{t("tabs.work")}</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/visits/backlog")}
          accessibilityRole="button"
          style={({ pressed }) => [styles.smallBtn, pressed && { opacity: 0.75 }]}>
          <Text style={styles.smallBtnText}>Беклог</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/visits/history")}
          accessibilityRole="button"
          style={({ pressed }) => [styles.smallBtn, pressed && { opacity: 0.75 }]}>
          <Text style={styles.smallBtnText}>Історія</Text>
        </Pressable>
      </View>

      {isTracking ? (
        <RNView style={styles.trackingBanner}>
          <Text style={styles.trackingBannerText}>{t("today.trackingActive")}</Text>
        </RNView>
      ) : null}

      <RNView style={styles.shiftRow}>
        {activeShift ? (
          <Pressable
            onPress={() => void endShift()}
            disabled={shiftLoading}
            accessibilityRole="button"
            style={[styles.shiftBtn, styles.shiftBtnEnd]}>
            <Text style={styles.shiftBtnTxt}>
              {shiftLoading ? "…" : t("today.endShift")}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => void startShift()}
            disabled={shiftLoading}
            accessibilityRole="button"
            style={styles.shiftBtn}>
            <Text style={styles.shiftBtnTxt}>
              {shiftLoading ? "…" : t("today.startShift")}
            </Text>
          </Pressable>
        )}
      </RNView>

      {nearest ? (
        <RNView style={styles.hero}>
          <Text style={styles.heroLabel}>{t("today.nearestVisit")}</Text>
          <Text style={styles.heroTitle}>{visitLabel(nearest)}</Text>
          <Text style={styles.heroMeta}>
            {visitTimeRange(nearest)}
            {visitTimeRange(nearest) ? " · " : ""}
            {nearest.status}
          </Text>
          {nearest.addressText ? (
            <Text style={styles.heroAddress} numberOfLines={2}>
              {nearest.addressText}
            </Text>
          ) : null}
          <EntityActionBar
            token={token!}
            date={dateKey}
            phone={visitPhone(nearest)}
            visitId={nearest.id}
            contactId={nearest.contactId ?? nearest.contact?.id}
            lat={nearest.lat}
            lng={nearest.lng}
            compact
          />
          <Pressable
            onPress={() => router.push(`/visit/${nearest.id}`)}
            style={({ pressed }) => [styles.heroOpen, pressed && { opacity: 0.8 }]}
            accessibilityRole="button">
            <Text style={styles.heroOpenText}>{t("visit.title")} ›</Text>
          </Pressable>
        </RNView>
      ) : null}

      {routeBanner ? (
        <Pressable
          onPress={() => router.push("/map")}
          style={styles.routeBanner}
          accessibilityRole="button">
          <Text style={styles.routeBannerText}>
            {t("today.route")}: {routeBanner}
          </Text>
          <Text style={styles.routeBannerChev}>›</Text>
        </Pressable>
      ) : null}

      {fuelBanner ? (
        <Pressable
          onPress={() => router.push(`/fuel/${dateKey}`)}
          style={styles.fuelBanner}
          accessibilityRole="button">
          <Text style={styles.fuelBannerText}>
            {t("today.fuel")}: {fuelBanner}
          </Text>
          <Text style={styles.fuelBannerChev}>›</Text>
        </Pressable>
      ) : null}

      <FlatList
        data={listItems}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          !nearest ? (
            <Text style={styles.empty}>
              {loading ? t("common.loading") : t("today.empty")}
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <VisitCard visit={item} onPress={() => router.push(`/visit/${item.id}`)} />
        )}
      />

      <Text style={styles.footerHint}>{t("today.footerHint")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  heading: { fontSize: 26, fontWeight: "700" },
  headerBtn: {
    backgroundColor: "rgba(37,99,235,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  headerBtnText: { color: "#1d4ed8", fontWeight: "700" },
  dateLine: { marginTop: 4, marginBottom: 4, opacity: 0.75, fontSize: 14 },
  quickRow: { flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap" },
  progress: { fontSize: 14, fontWeight: "600", color: "#047857", marginBottom: 8 },
  smallBtn: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(120,120,128,0.06)",
  },
  smallBtnText: { fontWeight: "600", fontSize: 13, opacity: 0.9 },
  trackingBanner: {
    backgroundColor: "rgba(37,99,235,0.12)",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  trackingBannerText: { color: "#1d4ed8", fontWeight: "600", fontSize: 13 },
  shiftRow: { marginBottom: 12 },
  shiftBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#2563eb",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  shiftBtnEnd: { backgroundColor: "#475569" },
  shiftBtnTxt: { color: "#fff", fontWeight: "600", fontSize: 14 },
  hero: {
    backgroundColor: "rgba(37,99,235,0.08)",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.2)",
  },
  heroLabel: { fontSize: 12, fontWeight: "700", color: "#1d4ed8", textTransform: "uppercase" },
  heroTitle: { fontSize: 18, fontWeight: "700", marginTop: 6 },
  heroMeta: { opacity: 0.75, marginTop: 4, fontSize: 14 },
  heroAddress: { opacity: 0.7, marginTop: 6, fontSize: 13, lineHeight: 18 },
  heroOpen: { marginTop: 10, alignSelf: "flex-start" },
  heroOpenText: { color: "#2563eb", fontWeight: "600", fontSize: 15 },
  routeBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(5,150,105,0.1)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  routeBannerText: { flex: 1, fontWeight: "600", color: "#047857", fontSize: 13 },
  routeBannerChev: { fontSize: 20, color: "#047857", opacity: 0.6 },
  fuelBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(37,99,235,0.1)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  fuelBannerText: { flex: 1, fontWeight: "600", color: "#1d4ed8" },
  fuelBannerChev: { fontSize: 20, color: "#1d4ed8", opacity: 0.6 },
  empty: {
    marginTop: 32,
    textAlign: "center",
    opacity: 0.7,
    paddingHorizontal: 20,
    lineHeight: 22,
  },
  footerHint: {
    fontSize: 12,
    opacity: 0.55,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 8,
  },
  moduleBanner: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "rgba(234,179,8,0.12)",
  },
  moduleBannerTitle: { fontWeight: "700", fontSize: 16, color: "#a16207" },
  moduleBannerBody: { marginTop: 8, lineHeight: 22, opacity: 0.85 },
});
