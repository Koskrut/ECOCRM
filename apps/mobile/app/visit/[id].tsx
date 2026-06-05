import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { apiFetch } from "@/lib/api";
import {
  gpsVerificationLabel,
  visitOutcomeLabel,
  VISIT_OUTCOMES,
  type VisitOutcome,
} from "@/lib/labels";
import type { VisitSummary } from "@/types/crm";

function buildVisitTitle(v: VisitSummary): string {
  if (v.title?.trim()) return v.title.trim();
  if (v.contact) {
    return [v.contact.firstName, v.contact.lastName].filter(Boolean).join(" ");
  }
  if (v.company?.name) return v.company.name;
  return "Визит";
}

export default function VisitDetailScreen() {
  const router = useRouter();
  const raw = useLocalSearchParams<{ id?: string | string[] }>().id;
  const visitId = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  const { token } = useAuth();

  const [visit, setVisit] = useState<VisitSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [outcome, setOutcome] = useState<VisitOutcome>("SUCCESS");
  const [resultNote, setResultNote] = useState("");

  const load = useCallback(async () => {
    if (!token || !visitId) {
      setLoading(false);
      setVisit(null);
      return;
    }
    setLoading(true);
    try {
      const row = await apiFetch<VisitSummary>(`/visits/${visitId}`, { token });
      setVisit(row);
    } finally {
      setLoading(false);
    }
  }, [token, visitId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function gpsPayloadForRequest(): Promise<Record<string, unknown> | undefined> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Геолокация", "Разрешение не дано — визит будет без GPS-проверки.");
      return {
        permissionState: status,
      };
    }
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const c = pos.coords;
      const clientRecordedAt = new Date().toISOString();
      return {
        lat: c.latitude,
        lng: c.longitude,
        accuracyM:
          typeof c.accuracy === "number" && Number.isFinite(c.accuracy) ? c.accuracy : undefined,
        clientRecordedAt,
        permissionState: status,
        locationProvider: Platform.select({ ios: "ios-core", android: "android-fused", default: "expo-location" }),
      };
    } catch {
      Alert.alert("Геолокация", "Не удалось получить координаты.");
      return { permissionState: status };
    }
  }

  async function onStart() {
    if (!token || !visit) return;
    setActionBusy(true);
    try {
      const extra = await gpsPayloadForRequest();
      const body = extra ?? {};
      const updated = await apiFetch<VisitSummary>(`/visits/${visit.id}/start`, {
        method: "POST",
        body: JSON.stringify(body),
        token,
      });
      setVisit(updated);
      const vLabel = gpsVerificationLabel(updated.startGpsVerification ?? null);
      if (vLabel) Alert.alert("GPS", vLabel);
    } catch (e) {
      Alert.alert("Ошибка", String(e));
    } finally {
      setActionBusy(false);
    }
  }

  async function onComplete() {
    if (!token || !visit) return;
    if (!resultNote.trim()) {
      Alert.alert("Результат", "Укажите комментарий по визиту (resultNote).");
      return;
    }
    setActionBusy(true);
    try {
      const gps = await gpsPayloadForRequest();
      const payload = {
        outcome,
        resultNote: resultNote.trim(),
        ...gps,
      };
      const done = await apiFetch<VisitSummary>(`/visits/${visit.id}/complete`, {
        method: "POST",
        body: JSON.stringify(payload),
        token,
      });
      const vLabel = gpsVerificationLabel(done.completeGpsVerification ?? null);
      Alert.alert(
        "Готово",
        vLabel ? `Визит завершён.\n${vLabel}` : "Визит завершён",
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (e) {
      Alert.alert("Ошибка", String(e));
    } finally {
      setActionBusy(false);
    }
  }

  if (loading || !visit) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={{ marginTop: 12 }}>Загрузка…</Text>
      </View>
    );
  }

  const scheduled = visit.status === "SCHEDULED";
  const active = visit.status === "IN_PROGRESS";

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>{buildVisitTitle(visit)}</Text>
      <Text style={styles.meta}>
        Статус: {visit.status}
        {"\n"}
        {visit.addressText ? visit.addressText : "Адрес не указан"}
      </Text>

      <Pressable
        onPress={() => router.push("/(tabs)/map")}
        style={({ pressed }) => [styles.btnOutline, pressed && styles.pressed]}
        accessibilityRole="button">
        <Text style={styles.btnOutlineText}>Маршрут дня на карте</Text>
      </Pressable>

      {(visit.startGpsVerification ?? visit.completeGpsVerification) ? (
        <View style={styles.box}>
          {visit.startGpsVerification ? (
            <Text>Старт: {gpsVerificationLabel(visit.startGpsVerification)}</Text>
          ) : null}
          {visit.completeGpsVerification ? (
            <Text>Завершение: {gpsVerificationLabel(visit.completeGpsVerification)}</Text>
          ) : null}
        </View>
      ) : null}

      {scheduled ? (
        <Pressable
          disabled={actionBusy}
          onPress={onStart}
          style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]}
          accessibilityRole="button">
          <Text style={styles.btnPrimaryText}>{actionBusy ? "…" : "Начать визит (с GPS)"}</Text>
        </Pressable>
      ) : null}

      {active ? (
        <>
          <Text style={styles.sectionTitle}>Исход встречи</Text>
          <View style={styles.row}>
            {VISIT_OUTCOMES.map((code) => (
              <Pressable
                key={code}
                onPress={() => setOutcome(code)}
                style={[styles.chip, outcome === code && styles.chipActive]}
                accessibilityRole="button">
                <Text>{visitOutcomeLabel(code)}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Комментарий ({outcome})</Text>
          <TextInput
            value={resultNote}
            onChangeText={setResultNote}
            multiline
            placeholder="Кратко: что было договорено / следующий шаг"
            placeholderTextColor="#888"
            style={styles.note}
          />

          <Pressable
            disabled={actionBusy}
            onPress={onComplete}
            style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]}
            accessibilityRole="button">
            <Text style={styles.btnPrimaryText}>{actionBusy ? "…" : "Завершить с GPS-проверкой"}</Text>
          </Pressable>
        </>
      ) : visit.status === "DONE" ? (
        <Text style={styles.done}>Визит завершён</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  scroll: {
    padding: 20,
    gap: 14,
    paddingBottom: 48,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
  },
  meta: {
    fontSize: 15,
    opacity: 0.85,
    lineHeight: 22,
  },
  box: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: "rgba(128,128,128,0.12)",
    gap: 6,
  },
  btnOutline: {
    borderWidth: 1,
    borderColor: "#059669",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "rgba(5,150,105,0.08)",
  },
  btnOutlineText: {
    color: "#047857",
    fontWeight: "600",
    fontSize: 15,
  },
  btnPrimary: {
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnPrimaryText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  pressed: { opacity: 0.85 },
  sectionTitle: {
    fontWeight: "600",
    fontSize: 16,
    marginTop: 8,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  chipActive: {
    backgroundColor: "#dbeafe",
    borderColor: "#2563eb",
  },
  note: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    minHeight: 100,
    padding: 12,
    textAlignVertical: "top",
    fontSize: 16,
  },
  done: {
    fontSize: 16,
    opacity: 0.8,
    marginTop: 16,
  },
});
