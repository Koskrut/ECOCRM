import React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View as RNView } from "react-native";
import { useRouter } from "expo-router";

import { Text, View } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { useShiftTracking } from "@/context/shift-tracking-context";
import { getApiBaseUrl } from "@/lib/config";

export default function MoreScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const {
    activeShift,
    loading,
    trackingMode,
    trackingEnabled,
    setTrackingEnabled,
    pendingSamples,
    lastFlushAt,
    startShift,
    endShift,
    isTracking,
  } = useShiftTracking();

  async function copyBaseUrl() {
    Alert.alert("API backend", `${getApiBaseUrl()}\n\nДля Android‑эмулятора задайте EXPO_PUBLIC_API_URL=http://10.0.2.2:3001`);
  }

  const trackingLabel =
    trackingMode === "background"
      ? "Фоновий трек"
      : trackingMode === "foreground"
        ? "Трек (лише у застосунку)"
        : "Трек вимкнено";

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.h1}>Ще</Text>

      {user ? (
        <Text style={styles.box}>
          {user.fullName}
          {"\n"}
          {user.email}
        </Text>
      ) : null}

      <Pressable accessibilityRole="button" onPress={copyBaseUrl} style={styles.btnGhost}>
        <Text style={{ fontWeight: "600" }}>Базовий адрес API</Text>
        <Text style={{ fontSize: 13, opacity: 0.8, marginTop: 6 }}>
          {getApiBaseUrl()}
        </Text>
      </Pressable>

      <Text style={styles.section}>Зміна</Text>
      <RNView style={{ flexDirection: "row", alignItems: "center", marginVertical: 8 }}>
        <Text>Збір треку</Text>
        <Switch
          value={trackingEnabled}
          onValueChange={setTrackingEnabled}
          disabled={!!activeShift}
          style={{ marginLeft: 12 }}
        />
      </RNView>

      {activeShift ? (
        <Text style={styles.meta}>
          Зміна активна · {trackingLabel}
          {pendingSamples > 0 ? ` · в черзі ${pendingSamples}` : ""}
          {lastFlushAt ? `\nОстання відправка: ${new Date(lastFlushAt).toLocaleTimeString()}` : ""}
        </Text>
      ) : null}

      {isTracking ? (
        <RNView style={styles.trackingBanner}>
          <Text style={styles.trackingBannerText}>Збір локацій активний</Text>
        </RNView>
      ) : null}

      {!activeShift ? (
        <Pressable
          onPress={() => void startShift()}
          disabled={loading}
          accessibilityRole="button"
          style={[styles.btn, { marginBottom: 8 }]}>
          <Text style={styles.btnTxt}>{loading ? "…" : "Почати зміну"}</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => void endShift()}
          disabled={loading}
          accessibilityRole="button"
          style={[styles.btn, { backgroundColor: "#475569", marginBottom: 8 }]}>
          <Text style={styles.btnTxt}>{loading ? "…" : "Завершити зміну"}</Text>
        </Pressable>
      )}

      <Text style={styles.section}>Паливо</Text>
      <Pressable
        onPress={() => router.push("/fuel")}
        accessibilityRole="button"
        style={styles.btnGhost}>
        <Text style={{ fontWeight: "600" }}>Звіти та компенсація</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => logout()}
        style={[styles.btn, { marginTop: 28, backgroundColor: "#991b1b" }]}>
        <Text style={styles.btnTxt}>Вийти</Text>
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
  meta: { fontSize: 13, opacity: 0.75, marginBottom: 8, lineHeight: 20 },
  trackingBanner: {
    backgroundColor: "rgba(37,99,235,0.12)",
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  trackingBannerText: { color: "#1d4ed8", fontWeight: "600", fontSize: 13 },
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
