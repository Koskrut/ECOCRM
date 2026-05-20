import React, { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View as RNView } from "react-native";
import { useRouter } from "expo-router";

import { Text, View } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { apiFetch } from "@/lib/api";
import { getApiBaseUrl } from "@/lib/config";
import { formatLocalDateKey } from "@/lib/date";

export default function MoreScreen() {
  const router = useRouter();
  const { user, token, logout } = useAuth();
  const [trackingEnabled, setTrackingEnabled] = useState(true);

  async function copyBaseUrl() {
    Alert.alert("API backend", `${getApiBaseUrl()}\n\nДля Android‑эмулятора задайте EXPO_PUBLIC_API_URL=http://10.0.2.2:3001`);
  }

  const startShift = useCallback(async () => {
    if (!token) return;
    try {
      let plannedDistanceKm: number | null = null;
      const dateKey = formatLocalDateKey();
      try {
        const m = await apiFetch<{ distanceKm: number | null }>(
          `/route-plans/metrics?date=${encodeURIComponent(dateKey)}`,
          { token },
        );
        if (m.distanceKm != null && Number.isFinite(m.distanceKm)) {
          plannedDistanceKm = m.distanceKm;
        }
      } catch {
        // metrics optional
      }
      await apiFetch("/field/shifts/start", {
        method: "POST",
        token,
        body: JSON.stringify({
          plannedDistanceKm,
          trackingEnabled,
        }),
      });
      Alert.alert("", "Смена запущена (или уже была активной).");
    } catch (e) {
      Alert.alert("Ошибка", String(e));
    }
  }, [token, trackingEnabled]);

  const endShift = useCallback(async () => {
    if (!token) return;
    try {
      const r = await apiFetch<{ shift: { id: string } | null }>("/field/shifts/active", { token });
      const id = r.shift?.id;
      if (!id) {
        Alert.alert("", "Нет активной смены");
        return;
      }
      await apiFetch(`/field/shifts/${id}/end`, { method: "POST", token });
      Alert.alert("", "Смена завершена");
    } catch (e) {
      Alert.alert("Ошибка", String(e));
    }
  }, [token]);

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.h1}>Ещё</Text>

      {user ? (
        <Text style={styles.box}>
          {user.fullName}
          {"\n"}
          {user.email}
        </Text>
      ) : null}

      <Pressable accessibilityRole="button" onPress={copyBaseUrl} style={styles.btnGhost}>
        <Text style={{ fontWeight: "600" }}>Базовый адрес API</Text>
        <Text style={{ fontSize: 13, opacity: 0.8, marginTop: 6 }}>
          {getApiBaseUrl()}
        </Text>
        <Text style={{ fontSize: 12, opacity: 0.65, marginTop: 10 }}>
          Android emulator: экспортируйте EXPO_PUBLIC_API_URL=http://10.0.2.2:3001
        </Text>
      </Pressable>

      <Text style={styles.section}>Смена</Text>
      <RNView style={{ flexDirection: "row", alignItems: "center", marginVertical: 8 }}>
        <Text>Сбор трека</Text>
        <Switch value={trackingEnabled} onValueChange={setTrackingEnabled} style={{ marginLeft: 12 }} />
      </RNView>
      <Pressable onPress={startShift} accessibilityRole="button" style={[styles.btn, { marginBottom: 8 }]}>
        <Text style={styles.btnTxt}>Начать смену</Text>
      </Pressable>
      <Pressable onPress={endShift} accessibilityRole="button" style={[styles.btn, { backgroundColor: "#475569" }]}>
        <Text style={styles.btnTxt}>Завершить смену</Text>
      </Pressable>

      <Text style={styles.section}>Топливо</Text>
      <Pressable
        onPress={() => router.push("/fuel")}
        accessibilityRole="button"
        style={styles.btnGhost}>
        <Text style={{ fontWeight: "600" }}>Отчёты и компенсация</Text>
        <Text style={{ fontSize: 12, opacity: 0.65, marginTop: 8 }}>
          Пробег по завершённым визитам, месяц, отправка
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => logout()}
        style={[styles.btn, { marginTop: 28, backgroundColor: "#991b1b" }]}>
        <Text style={styles.btnTxt}>Выйти</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, gap: 6, paddingBottom: 44 },
  h1: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  box: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(128,128,128,0.08)",
    marginBottom: 8,
    lineHeight: 22,
  },
  btnGhost: {
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#bbb",
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  section: { fontWeight: "700", fontSize: 16, marginTop: 12 },
  btn: {
    alignSelf: "flex-start",
    backgroundColor: "#2563eb",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
  },
  btnTxt: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
});
