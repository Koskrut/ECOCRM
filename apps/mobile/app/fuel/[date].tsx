import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { apiFetch } from "@/lib/api";
import { gpsVerificationLabel } from "@/lib/labels";

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
      Alert.alert("Ошибка", String(e));
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
      Alert.alert("Ошибка", String(e));
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
      Alert.alert("", "Отчёт отправлен");
    } catch (e) {
      Alert.alert("Ошибка", String(e));
    } finally {
      setBusy(false);
    }
  };

  const r = data?.report;

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}>
      <Text style={styles.h1}>{date}</Text>
      <Text style={styles.hint}>К оплате — по завершённым визитам; план — для сравнения.</Text>

      {loading && !data ? <ActivityIndicator /> : null}

      {r ? (
        <>
          <View style={styles.cards}>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Факт</Text>
              <Text style={styles.cardValue}>{r.actualKm ?? "—"} км</Text>
              <Text style={styles.muted}>{r.litersEstimated ?? "—"} л</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>План</Text>
              <Text style={styles.cardValue}>{r.plannedKm ?? "—"} км</Text>
            </View>
            <View style={[styles.card, styles.cardAccent]}>
              <Text style={styles.cardLabel}>Сумма</Text>
              <Text style={styles.cardValue}>
                {r.amountEstimated != null ? `${Number(r.amountEstimated)} грн` : "—"}
              </Text>
            </View>
          </View>

          {(data?.warnings ?? []).includes("insufficient_completed_visits") ? (
            <Text style={styles.warn}>
              Завершите минимум 2 визита с адресом на карте — тогда посчитаем пробег.
            </Text>
          ) : null}

          {r.compensationStatus === "DRAFT" ? (
            <>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Примечание (необязательно)"
                style={styles.input}
                multiline
              />
              <Pressable
                style={[styles.btn, busy && styles.btnDisabled]}
                disabled={busy || r.compensationKm == null}
                onPress={() => void submit()}>
                <Text style={styles.btnTxt}>Отправить</Text>
              </Pressable>
            </>
          ) : null}

          <Pressable
            style={[styles.btnGhost, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={() => void recalc()}>
            <Text style={{ fontWeight: "600" }}>Пересчитать</Text>
          </Pressable>

          <Text style={styles.section}>Маршрут по факту</Text>
          {(data?.breakdown ?? []).map((v, i) => (
            <View key={v.id} style={styles.visitRow}>
              <Text style={styles.visitIdx}>{i + 1}.</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.visitTitle}>{v.title || "Визит"}</Text>
                <Text style={styles.muted}>
                  {!v.hasCoordinates ? "Нет точки на карте · " : ""}
                  {v.includedInRoute ? "в плане" : "вне плана"}
                </Text>
                <Text style={styles.muted}>
                  {gpsVerificationLabel(v.completeGpsVerification) ||
                    gpsVerificationLabel(v.startGpsVerification) ||
                    "GPS —"}
                </Text>
              </View>
            </View>
          ))}

          {data?.factMetrics.source ? (
            <Text style={styles.muted}>Источник км: {data.factMetrics.source}</Text>
          ) : null}
        </>
      ) : null}

      <Pressable style={{ marginTop: 16 }} onPress={() => router.back()}>
        <Text style={{ color: "#2563eb", fontWeight: "600" }}>← К месяцу</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40 },
  h1: { fontSize: 22, fontWeight: "700", marginBottom: 4 },
  hint: { fontSize: 13, opacity: 0.75, marginBottom: 16 },
  cards: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  card: {
    flex: 1,
    minWidth: 100,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  cardAccent: { backgroundColor: "rgba(37,99,235,0.08)", borderColor: "#93c5fd" },
  cardLabel: { fontSize: 11, opacity: 0.7, textTransform: "uppercase" },
  cardValue: { fontSize: 18, fontWeight: "700", marginTop: 4 },
  muted: { fontSize: 12, opacity: 0.7, marginTop: 2 },
  warn: { color: "#b45309", fontSize: 13, marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#bbb",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    minHeight: 60,
  },
  btn: {
    backgroundColor: "#2563eb",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 8,
  },
  btnGhost: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#bbb",
    alignItems: "center",
    marginBottom: 16,
  },
  btnDisabled: { opacity: 0.5 },
  btnTxt: { color: "#fff", fontWeight: "600" },
  section: { fontWeight: "700", fontSize: 16, marginBottom: 8 },
  visitRow: { flexDirection: "row", gap: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#ccc" },
  visitIdx: { width: 20, opacity: 0.5 },
  visitTitle: { fontWeight: "600" },
});
