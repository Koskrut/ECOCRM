import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  View as RNView,
} from "react-native";

import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { useShiftTracking } from "@/context/shift-tracking-context";
import { apiFetch } from "@/lib/api";
import { formatLocalDateKey } from "@/lib/date";
import type { RouteGeometryBundle } from "@/lib/route-map";
import type { VisitSummary } from "@/types/crm";

function visitLabel(v: VisitSummary): string {
  if (v.title?.trim()) return v.title.trim();
  if (v.contact) {
    return [v.contact.firstName, v.contact.lastName].filter(Boolean).join(" ");
  }
  if (v.company?.name) return v.company.name;
  return "Визит";
}

function timeRange(v: VisitSummary): string {
  if (!v.startsAt) return "";
  const start = new Date(v.startsAt);
  const h = start.getHours();
  const m = String(start.getMinutes()).padStart(2, "0");
  if (v.endsAt) {
    const end = new Date(v.endsAt);
    const eh = end.getHours();
    const em = String(end.getMinutes()).padStart(2, "0");
    return `${h}:${m}–${eh}:${em}`;
  }
  return `${h}:${m}`;
}

export default function TodayScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { activeShift, isTracking, startShift, endShift, loading: shiftLoading } = useShiftTracking();
  const [items, setItems] = useState<VisitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [fuelBanner, setFuelBanner] = useState<string | null>(null);
  const [routeBanner, setRouteBanner] = useState<string | null>(null);

  const dateKey = formatLocalDateKey();

  const reload = useCallback(async () => {
    if (!token) return;
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
          amt != null && Number.isFinite(Number(amt)) ? ` · ${Number(amt)} грн` : "";
        setFuelBanner(`${km} км${sum}`);
      } else {
        setFuelBanner(null);
      }
      if (route?.planned.distanceKm != null) {
        const plan = route.planned.distanceKm;
        const gps = route.factGps.distanceKm;
        const visits = route.factVisits.distanceKm;
        const gpsNote =
          route.factGps.quality.degraded && gps != null ? " · GPS слабый" : "";
        setRouteBanner(
          `План ${plan} км` +
            (gps != null ? ` · GPS ${gps} км` : "") +
            (visits != null ? ` · визиты ${visits} км` : "") +
            gpsNote,
        );
      } else {
        setRouteBanner(null);
      }
    } finally {
      setLoading(false);
    }
  }, [token, dateKey]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Сегодня</Text>
      <Text style={styles.dateLine}>{dateKey}</Text>

      {isTracking ? (
        <RNView style={styles.trackingBanner}>
          <Text style={styles.trackingBannerText}>Збір локацій активний</Text>
        </RNView>
      ) : null}

      <RNView style={styles.shiftRow}>
        {activeShift ? (
          <Pressable
            onPress={() => void endShift()}
            disabled={shiftLoading}
            accessibilityRole="button"
            style={[styles.shiftBtn, styles.shiftBtnEnd]}>
            <Text style={styles.shiftBtnTxt}>{shiftLoading ? "…" : "Завершити зміну"}</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => void startShift()}
            disabled={shiftLoading}
            accessibilityRole="button"
            style={styles.shiftBtn}>
            <Text style={styles.shiftBtnTxt}>{shiftLoading ? "…" : "Почати зміну"}</Text>
          </Pressable>
        )}
      </RNView>

      {routeBanner ? (
        <Pressable
          onPress={() => router.push("/(tabs)/map")}
          style={styles.routeBanner}
          accessibilityRole="button">
          <Text style={styles.routeBannerText}>Маршрут: {routeBanner}</Text>
          <Text style={styles.routeBannerChev}>›</Text>
        </Pressable>
      ) : null}

      {fuelBanner ? (
        <Pressable
          onPress={() => router.push(`/fuel/${dateKey}`)}
          style={styles.fuelBanner}
          accessibilityRole="button">
          <Text style={styles.fuelBannerText}>Топливо за день: {fuelBanner}</Text>
          <Text style={styles.fuelBannerChev}>›</Text>
        </Pressable>
      ) : null}

      <FlatList
        data={items}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {loading ? "Загрузка…" : "Нет визитов на этот день. Добавьте их в веб-CRM."}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/visit/${item.id}`)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.72 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.visitTitle}>{visitLabel(item)}</Text>
              <Text style={styles.visitMeta}>
                {timeRange(item)} · {item.status}
              </Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        )}
      />

      <Text style={styles.footerHint}>
        Маршрут — вкладка «Карта». Паливо — «Ще».
      </Text>
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
  heading: {
    fontSize: 26,
    fontWeight: "700",
  },
  dateLine: {
    marginTop: 4,
    marginBottom: 8,
    opacity: 0.75,
    fontSize: 14,
  },
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
  routeBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(5,150,105,0.1)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  routeBannerText: {
    flex: 1,
    fontWeight: "600",
    color: "#047857",
    fontSize: 13,
  },
  routeBannerChev: {
    fontSize: 20,
    color: "#047857",
    opacity: 0.6,
  },
  fuelBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(37,99,235,0.1)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  fuelBannerText: {
    flex: 1,
    fontWeight: "600",
    color: "#1d4ed8",
  },
  fuelBannerChev: {
    fontSize: 20,
    color: "#1d4ed8",
    opacity: 0.6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(120,120,128,0.08)",
    marginBottom: 8,
  },
  visitTitle: {
    fontWeight: "600",
    fontSize: 17,
  },
  visitMeta: {
    opacity: 0.7,
    marginTop: 4,
    fontSize: 14,
  },
  chev: {
    fontSize: 24,
    opacity: 0.4,
    marginLeft: 8,
  },
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
});
