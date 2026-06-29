import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { Text } from "@/components/Themed";
import { AppHeader } from "@/components/ui/AppHeader";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/context/auth-context";
import { apiFetch } from "@/lib/api";
import { formatLocalDateKey } from "@/lib/date";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";

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

const STATUS_KEYS: Record<string, string> = {
  DRAFT: "fuel.statusDraft",
  SUBMITTED: "fuel.statusSubmitted",
  APPROVED: "fuel.statusApproved",
  REJECTED: "fuel.statusRejected",
  PAID: "fuel.statusPaid",
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
  const theme = useTheme();
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

  function statusLabel(code: string): string {
    const key = STATUS_KEYS[code];
    return key ? t(key) : code;
  }

  return (
    <Screen contentStyle={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ paddingBottom: theme.spacing.xl }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={reload} tintColor={theme.colors.primary} />
        }>
        <AppHeader title={t("fuel.title")} />

        <View style={styles.headerRow}>
          <IconButton name="chevron-back" onPress={() => setMonthKey(shiftMonth(monthKey, -1))} />
          <Text style={theme.typography.title}>{monthKey}</Text>
          <IconButton name="chevron-forward" onPress={() => setMonthKey(shiftMonth(monthKey, 1))} />
        </View>

        <Card onPress={() => router.push("/fuel/profile")} style={{ marginBottom: theme.spacing.md }}>
          <Text style={theme.typography.bodyMedium}>
            {data?.profile.vehicleLabel || t("fuel.vehicleDefault")}
          </Text>
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
            {t("fuel.litersPer100", { value: data?.profile.fuelLitersPer100km ?? "—" })}
            {data?.profile.fuelPricePerLiter != null
              ? t("fuel.pricePerLiter", { value: Number(data.profile.fuelPricePerLiter) })
              : ""}
          </Text>
        </Card>

        {data ? (
          <Card style={{ marginBottom: theme.spacing.md }}>
            <Text style={theme.typography.bodyMedium}>
              {t("fuel.totalsLine", {
                km: data.totals.totalKm,
                liters: data.totals.totalLiters,
                amount: data.totals.totalAmount,
              })}
            </Text>
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
              {t("fuel.daysSummary", {
                withReport: data.totals.daysWithReport,
                drafts: data.totals.daysDraft,
              })}
            </Text>
          </Card>
        ) : null}

        <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: theme.spacing.md }]}>
          {t("fuel.exportHint")}
        </Text>

        {loading && !data ? <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 24 }} /> : null}

        {data?.days.map((d) => (
          <Card
            key={d.date}
            onPress={() => router.push(`/fuel/${d.date}`)}
            style={{ marginBottom: theme.spacing.sm }}>
            <View style={styles.dayRow}>
              <View style={styles.flex}>
                <Text style={theme.typography.bodyMedium}>{d.date}</Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                  {t("fuel.visitsKm", {
                    visits: d.report.visitCount ?? 0,
                    km: d.report.compensationKm ?? "—",
                  })}
                </Text>
              </View>
              <View style={styles.dayEnd}>
                <Text style={theme.typography.bodyMedium}>
                  {d.report.amountEstimated != null
                    ? `${Number(d.report.amountEstimated)} ${t("common.currency")}`
                    : "—"}
                </Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                  {statusLabel(d.report.compensationStatus)}
                </Text>
              </View>
            </View>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  dayRow: { flexDirection: "row", alignItems: "center" },
  dayEnd: { alignItems: "flex-end" },
});
