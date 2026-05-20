import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { apiFetch } from "@/lib/api";
import { formatLocalDateKey } from "@/lib/date";

type FuelRangeResponse = {
  from: string;
  to: string;
  profile: {
    fuelLitersPer100km: number;
    fuelPricePerLiter: string | number | null;
    vehicleLabel: string | null;
  };
  totals: {
    totalKm: number;
    totalLiters: number;
    totalAmount: number;
    daysWithReport: number;
    daysDraft: number;
    daysWithoutCalc: number;
  };
  days: Array<{
    date: string;
    report: {
      compensationKm: number | null;
      litersEstimated: number | null;
      amountEstimated: string | number | null;
      compensationStatus: string;
      visitCount: number | null;
    };
  }>;
};

const STATUS: Record<string, string> = {
  DRAFT: "Черновик",
  SUBMITTED: "Отправлен",
  APPROVED: "Утверждён",
  REJECTED: "Отклонён",
  PAID: "Выплачен",
};

function monthBounds(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const from = `${ym}-01`;
  const last = new Date(Date.UTC(y, m, 0));
  const to = last.toISOString().slice(0, 10);
  return { from, to };
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export default function FuelMonthScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [monthKey, setMonthKey] = useState(() => formatLocalDateKey().slice(0, 7));
  const [data, setData] = useState<FuelRangeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const { from, to } = useMemo(() => monthBounds(monthKey), [monthKey]);

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const r = await apiFetch<FuelRangeResponse>(
        `/field/fuel/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { token },
      );
      setData(r);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token, from, to]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => setMonthKey(shiftMonth(monthKey, -1))} style={styles.navBtn}>
          <Text>◀</Text>
        </Pressable>
        <Text style={styles.h1}>{monthKey}</Text>
        <Pressable onPress={() => setMonthKey(shiftMonth(monthKey, 1))} style={styles.navBtn}>
          <Text>▶</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => router.push("/fuel/profile")} style={styles.profileBox}>
        <Text style={styles.profileTitle}>
          {data?.profile.vehicleLabel || "Профиль авто"}
        </Text>
        <Text style={styles.muted}>
          {data?.profile.fuelLitersPer100km ?? "—"} л/100 км
          {data?.profile.fuelPricePerLiter != null
            ? ` · ${Number(data.profile.fuelPricePerLiter)} грн/л`
            : ""}
        </Text>
      </Pressable>

      {data ? (
        <View style={styles.totalsBox}>
          <Text style={styles.totalsLine}>
            {data.totals.totalKm} км · {data.totals.totalLiters} л · {data.totals.totalAmount} грн
          </Text>
          <Text style={styles.muted}>
            {data.totals.daysWithReport} дн. с расчётом · {data.totals.daysDraft} черновиков
          </Text>
        </View>
      ) : null}

      <Text style={styles.hint}>
        Полный экспорт CSV/Excel — в веб-CRM: Визиты → Паливо
      </Text>

      {loading && !data ? <ActivityIndicator style={{ marginTop: 24 }} /> : null}

      {data?.days.map((d) => (
        <Pressable
          key={d.date}
          style={styles.dayRow}
          onPress={() => router.push(`/fuel/${d.date}`)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dayDate}>{d.date}</Text>
            <Text style={styles.muted}>
              {d.report.visitCount ?? 0} визитов · {d.report.compensationKm ?? "—"} км
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.amount}>
              {d.report.amountEstimated != null ? `${Number(d.report.amountEstimated)} грн` : "—"}
            </Text>
            <Text style={styles.muted}>{STATUS[d.report.compensationStatus] ?? d.report.compensationStatus}</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  navBtn: { padding: 8 },
  h1: { fontSize: 20, fontWeight: "700" },
  profileBox: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(128,128,128,0.08)",
    marginBottom: 12,
  },
  profileTitle: { fontWeight: "600", fontSize: 15 },
  totalsBox: { marginBottom: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#ddd" },
  totalsLine: { fontSize: 16, fontWeight: "600" },
  hint: { fontSize: 12, opacity: 0.65, marginBottom: 16 },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ccc",
  },
  dayDate: { fontWeight: "600", fontSize: 15 },
  amount: { fontWeight: "600" },
  muted: { fontSize: 12, opacity: 0.7, marginTop: 2 },
});
