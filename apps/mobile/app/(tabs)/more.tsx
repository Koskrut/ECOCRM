import React, { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View as RNView } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { Card } from "@/components/ui/Card";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Text, View } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { useModules } from "@/context/modules-context";
import { useOfflineQueue } from "@/context/offline-queue-context";
import { useShiftTracking } from "@/context/shift-tracking-context";
import { colors, spacing } from "@/lib/design/tokens";
import { getApiBaseUrl } from "@/lib/config";
import { getErrorLog, type ErrorLogEntry } from "@/lib/error-log";
import { t } from "@/lib/i18n";

export default function MoreScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { visitsEnabled } = useModules();
  const { jobs, flushNow, lastError } = useOfflineQueue();
  const [errorLog, setErrorLog] = useState<ErrorLogEntry[]>([]);
  const [showDebug, setShowDebug] = useState(false);
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

  useFocusEffect(
    useCallback(() => {
      void getErrorLog().then(setErrorLog);
    }, []),
  );

  const trackingLabel =
    trackingMode === "background"
      ? t("more.trackBackground")
      : trackingMode === "foreground"
        ? t("more.trackForeground")
        : t("more.trackOff");

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <ScreenHeader title={t("more.title")} />

      {user ? (
        <Card>
          <Text style={styles.userName}>{user.fullName}</Text>
          <Text style={styles.userEmail}>{user.email}</Text>
        </Card>
      ) : null}

      <Text style={styles.section}>Робота</Text>
      <Pressable onPress={() => router.push("/orders")} accessibilityRole="button" style={styles.btnGhost}>
        <Text style={styles.btnGhostTitle}>Замовлення</Text>
        <Text style={styles.btnGhostMeta}>Список, створення, ТТН</Text>
      </Pressable>
      <Pressable
        onPress={() => router.push("/orders/new")}
        accessibilityRole="button"
        style={styles.btnGhost}>
        <Text style={styles.btnGhostTitle}>+ Нове замовлення</Text>
      </Pressable>

      {visitsEnabled ? (
        <>
          <Text style={styles.section}>{t("more.shift")}</Text>
          {isTracking ? (
            <RNView style={styles.trackingBanner}>
              <Text style={styles.trackingBannerText}>{t("today.trackingActive")}</Text>
            </RNView>
          ) : null}

          {!activeShift ? (
            <PrimaryButton
              label={loading ? "…" : t("today.startShift")}
              onPress={() => void startShift()}
              disabled={loading}
              style={{ marginBottom: spacing.sm }}
            />
          ) : (
            <>
              <Text style={styles.meta}>
                {t("more.shiftActive")} · {trackingLabel}
                {pendingSamples > 0 ? ` · ${t("more.queue")} ${pendingSamples}` : ""}
              </Text>
              <RNView style={styles.toggleLine}>
                <Text>{t("more.trackCollection")}</Text>
                <Switch value={trackingEnabled} onValueChange={setTrackingEnabled} disabled={!!activeShift} />
              </RNView>
              <PrimaryButton
                label={loading ? "…" : t("today.endShift")}
                onPress={() => void endShift()}
                disabled={loading}
                variant="secondary"
                style={{ marginBottom: spacing.sm }}
              />
            </>
          )}

          <Text style={styles.section}>{t("more.fuel")}</Text>
          <Pressable onPress={() => router.push("/fuel")} accessibilityRole="button" style={styles.btnGhost}>
            <Text style={styles.btnGhostTitle}>{t("more.fuelReports")}</Text>
          </Pressable>
        </>
      ) : (
        <RNView style={styles.moduleBanner}>
          <Text style={styles.moduleBannerTitle}>{t("modules.unavailableTitle")}</Text>
          <Text style={styles.moduleBannerBody}>{t("modules.unavailableBody")}</Text>
        </RNView>
      )}

      <Text style={styles.section}>Офлайн</Text>
      <Card>
        <Text style={styles.meta}>
          {jobs.length > 0 ? `${jobs.length} дій очікують відправки` : "Черга порожня"}
        </Text>
        {jobs.length > 0 ? (
          <PrimaryButton label="Надіслати зараз" onPress={() => void flushNow()} style={{ marginTop: spacing.sm }} />
        ) : null}
        {lastError ? <Text style={styles.errorMeta}>Остання помилка: {lastError}</Text> : null}
      </Card>

      <Pressable onPress={() => setShowDebug((v) => !v)} style={styles.debugToggle}>
        <Text style={styles.debugToggleText}>{showDebug ? "Сховати діагностику" : "Діагностика"}</Text>
      </Pressable>

      {showDebug ? (
        <Card>
          <Text style={styles.meta}>API: {getApiBaseUrl()}</Text>
          {errorLog.slice(0, 5).map((e) => (
            <Text key={`${e.at}-${e.message}`} style={styles.errorMeta}>
              {new Date(e.at).toLocaleString()} · {e.type}
              {"\n"}
              {e.message}
            </Text>
          ))}
        </Card>
      ) : null}

      <PrimaryButton
        label={t("more.logout")}
        onPress={() => logout()}
        variant="danger"
        style={{ marginTop: spacing.xl }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: 44 },
  section: { fontWeight: "700", fontSize: 16, marginTop: spacing.lg, marginBottom: spacing.sm },
  userName: { fontWeight: "700", fontSize: 17 },
  userEmail: { marginTop: 4, opacity: 0.75 },
  btnGhost: {
    paddingVertical: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  btnGhostTitle: { fontWeight: "700" },
  btnGhostMeta: { fontSize: 13, opacity: 0.7, marginTop: 4 },
  meta: { fontSize: 13, opacity: 0.75, lineHeight: 20 },
  errorMeta: { fontSize: 12, opacity: 0.65, marginTop: spacing.sm, lineHeight: 18 },
  trackingBanner: {
    backgroundColor: colors.primaryMuted,
    borderRadius: 10,
    padding: 10,
    marginBottom: spacing.sm,
  },
  trackingBannerText: { color: colors.primaryText, fontWeight: "600", fontSize: 13 },
  toggleLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  debugToggle: { marginTop: spacing.lg, paddingVertical: spacing.sm },
  debugToggleText: { opacity: 0.55, fontSize: 13 },
  moduleBanner: {
    marginTop: spacing.sm,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "rgba(234,179,8,0.12)",
  },
  moduleBannerTitle: { fontWeight: "700", fontSize: 15, color: "#a16207" },
  moduleBannerBody: { marginTop: 6, lineHeight: 20, opacity: 0.85, fontSize: 14 },
});
