import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { AppHeader } from "@/components/ui/AppHeader";
import { Card } from "@/components/ui/Card";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/context/auth-context";
import { apiFetch } from "@/lib/api";
import { useTheme } from "@/lib/design/theme-context";
import { gpsVerificationLabel } from "@/lib/labels";
import { t } from "@/lib/i18n";

type BreakdownRow = {
  id: string;
  title: string | null;
  completedAt: string | null;
  hasCoordinates: boolean;
  startGpsVerification: string | null;
  completeGpsVerification: string | null;
  includedInRoute: boolean;
};

type FuelDayResponse = {
  report: {
    plannedKm: number | null;
    actualKm: number | null;
    compensationKm: number | null;
    litersEstimated: number | null;
    amountEstimated: string | number | null;
    compensationStatus: string;
    managerNote: string | null;
  };
  breakdown: BreakdownRow[];
  warnings: string[];
  factMetrics: { source: string };
};

export default function FuelDayScreen() {
  const raw = useLocalSearchParams<{ date?: string | string[] }>().date;
  const date =
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : formatFallback();
  const { token } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const [data, setData] = useState<FuelDayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function formatFallback(): string {
    return new Date().toISOString().slice(0, 10);
  }

  const reload = useCallback(async () => {
    if (!token || !date) return;
    setLoading(true);
    try {
      const r = await apiFetch<FuelDayResponse>(
        `/field/fuel/day?date=${encodeURIComponent(date)}`,
        { token },
      );
      setData(r);
      setNote(r.report.managerNote ?? "");
    } catch (e) {
      Alert.alert(t("common.error"), String(e));
    } finally {
      setLoading(false);
    }
  }, [token, date]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const recalc = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await apiFetch(`/field/fuel/day/recalculate?date=${encodeURIComponent(date)}`, {
        method: "POST",
        token,
      });
      await reload();
    } catch (e) {
      Alert.alert(t("common.error"), String(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await apiFetch(`/field/fuel/day?date=${encodeURIComponent(date)}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          compensationStatus: "SUBMITTED",
          managerNote: note.trim() || null,
        }),
      });
      await reload();
      Alert.alert(t("common.done"), t("fuel.reportSubmitted"));
    } catch (e) {
      Alert.alert(t("common.error"), String(e));
    } finally {
      setBusy(false);
    }
  };

  const r = data?.report;

  return (
    <Screen contentStyle={styles.flex}>
      <KeyboardAwareScrollView
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={reload} tintColor={theme.colors.primary} />
        }>
        <AppHeader title={date} subtitle={t("fuel.dayHint")} large={false} />

        {loading && !data ? <ActivityIndicator color={theme.colors.primary} /> : null}

        {r ? (
          <>
            <View style={styles.cards}>
              <Card style={styles.metricCard}>
                <Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>{t("fuel.fact")}</Text>
                <Text style={[theme.typography.title, { marginTop: 4 }]}>
                  {r.actualKm ?? "—"} {t("common.km")}
                </Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                  {r.litersEstimated ?? "—"} л
                </Text>
              </Card>
              <Card style={styles.metricCard}>
                <Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>{t("fuel.plan")}</Text>
                <Text style={[theme.typography.title, { marginTop: 4 }]}>
                  {r.plannedKm ?? "—"} {t("common.km")}
                </Text>
              </Card>
              <Card style={[styles.metricCard, { backgroundColor: theme.colors.primaryMuted, borderColor: theme.colors.primary }]}>
                <Text style={[theme.typography.label, { color: theme.colors.primaryText }]}>{t("fuel.amount")}</Text>
                <Text style={[theme.typography.title, { marginTop: 4, color: theme.colors.primaryText }]}>
                  {r.amountEstimated != null
                    ? `${Number(r.amountEstimated)} ${t("common.currency")}`
                    : "—"}
                </Text>
              </Card>
            </View>

            {(data?.warnings ?? []).includes("insufficient_completed_visits") ? (
              <Text style={[theme.typography.caption, { color: theme.colors.warningText, marginBottom: 12 }]}>
                {t("fuel.insufficientVisits")}
              </Text>
            ) : null}

            {r.compensationStatus === "DRAFT" ? (
              <>
                <TextField
                  value={note}
                  onChangeText={setNote}
                  placeholder={t("fuel.notePlaceholder")}
                  multiline
                  style={{ minHeight: 60 }}
                />
                <AppButton
                  label={t("fuel.submit")}
                  onPress={() => void submit()}
                  disabled={busy || r.compensationKm == null}
                  loading={busy}
                  style={{ marginBottom: theme.spacing.sm }}
                />
              </>
            ) : null}

            <AppButton
              label={t("fuel.recalculate")}
              onPress={() => void recalc()}
              disabled={busy}
              loading={busy}
              variant="secondary"
              style={{ marginBottom: theme.spacing.md }}
            />

            <Text style={[theme.typography.section, { marginBottom: theme.spacing.sm }]}>{t("fuel.routeFact")}</Text>
            {(data?.breakdown ?? []).map((v, i) => (
              <Card key={v.id} style={{ marginBottom: theme.spacing.sm }}>
                <View style={styles.visitRow}>
                  <Text style={[theme.typography.caption, { color: theme.colors.textMuted, width: 20 }]}>
                    {i + 1}.
                  </Text>
                  <View style={styles.flex}>
                    <Text style={theme.typography.bodyMedium}>{v.title || t("fuel.visitFallback")}</Text>
                    <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                      {!v.hasCoordinates ? t("fuel.noMapPoint") : ""}
                      {v.includedInRoute ? t("fuel.inPlan") : t("fuel.outOfPlan")}
                    </Text>
                    <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                      {gpsVerificationLabel(v.completeGpsVerification) ||
                        gpsVerificationLabel(v.startGpsVerification) ||
                        "GPS —"}
                    </Text>
                  </View>
                </View>
              </Card>
            ))}

            {data?.factMetrics.source ? (
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                {t("fuel.kmSource", { source: data.factMetrics.source })}
              </Text>
            ) : null}
          </>
        ) : null}

        <AppButton
          label={t("fuel.backToMonth")}
          onPress={() => router.back()}
          variant="ghost"
          style={{ marginTop: theme.spacing.lg, alignSelf: "flex-start" }}
        />
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cards: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  metricCard: { flex: 1, minWidth: 100 },
  visitRow: { flexDirection: "row", gap: 8 },
});