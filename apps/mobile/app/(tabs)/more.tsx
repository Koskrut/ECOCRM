import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { AppHeader } from "@/components/ui/AppHeader";
import { Card } from "@/components/ui/Card";
import { ListItem } from "@/components/ui/ListItem";
import { Screen } from "@/components/ui/Screen";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { useAuth } from "@/context/auth-context";
import { useModules } from "@/context/modules-context";
import { useOfflineQueue } from "@/context/offline-queue-context";
import { useShiftTracking } from "@/context/shift-tracking-context";
import { getApiBaseUrl } from "@/lib/config";
import { useTheme } from "@/lib/design/theme-context";
import { getErrorLog, type ErrorLogEntry } from "@/lib/error-log";
import { getTrackingDiagnostics, type TrackingDiagnostics } from "@/lib/location-tracking";
import { t } from "@/lib/i18n";

export default function MoreScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { user, logout } = useAuth();
  const { visitsEnabled } = useModules();
  const { jobs, flushNow, lastError } = useOfflineQueue();
  const [errorLog, setErrorLog] = useState<ErrorLogEntry[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [trackingDebug, setTrackingDebug] = useState<TrackingDiagnostics | null>(null);
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

  useEffect(() => {
    if (!showDebug) {
      setTrackingDebug(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      void getTrackingDiagnostics().then((d) => {
        if (!cancelled) setTrackingDebug(d);
      });
    };
    load();
    const id = setInterval(load, 5_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [showDebug]);

  const trackingLabel =
    trackingMode === "background"
      ? t("more.trackBackground")
      : trackingMode === "foreground"
        ? t("more.trackForeground")
        : t("more.trackOff");

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.md,
            paddingBottom: theme.spacing.md,
          },
        ]}>
        <AppHeader title={t("more.title")} large={false} />

        {user ? (
          <Card style={{ marginBottom: theme.spacing.sm }}>
            <Text style={theme.typography.bodyMedium}>{user.fullName}</Text>
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
              {user.email}
            </Text>
          </Card>
        ) : null}

        <SectionTitle title={t("more.menu")} />
        <ListItem title={t("leads.title")} onPress={() => router.push("/leads")} />
        <ListItem title={t("map.title")} onPress={() => router.push("/map")} />
        <ListItem
          title={t("tabs.work")}
          subtitle={t("more.workSubtitle")}
          onPress={() => router.push("/(tabs)/work")}
        />

        {visitsEnabled ? (
          <>
            <SectionTitle title={t("more.shift")} />
            {isTracking ? (
              <View
                style={[
                  styles.banner,
                  {
                    backgroundColor: theme.colors.primaryMuted,
                    borderRadius: theme.radius.md,
                    marginBottom: theme.spacing.sm,
                  },
                ]}>
                <Text style={[theme.typography.caption, { color: theme.colors.primaryText, fontWeight: "600" }]}>
                  {t("today.trackingActive")}
                </Text>
              </View>
            ) : null}

            {!activeShift ? (
              <AppButton
                label={t("today.startShift")}
                onPress={() => void startShift()}
                disabled={loading}
                loading={loading}
                style={{ marginBottom: theme.spacing.sm }}
              />
            ) : (
              <>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: theme.spacing.sm }]}>
                  {t("more.shiftActive")} · {trackingLabel}
                  {pendingSamples > 0 ? ` · ${t("more.queue")} ${pendingSamples}` : ""}
                </Text>
                <View style={[styles.toggleLine, { marginBottom: theme.spacing.sm }]}>
                  <Text style={theme.typography.body}>{t("more.trackCollection")}</Text>
                  <Switch
                    value={trackingEnabled}
                    onValueChange={setTrackingEnabled}
                    disabled={!!activeShift}
                    trackColor={{ false: theme.colors.border, true: theme.colors.primaryMuted }}
                    thumbColor={trackingEnabled ? theme.colors.primary : theme.colors.surface}
                  />
                </View>
                <AppButton
                  label={t("today.endShift")}
                  onPress={() => void endShift()}
                  disabled={loading}
                  loading={loading}
                  variant="secondary"
                  style={{ marginBottom: theme.spacing.sm }}
                />
              </>
            )}

            <SectionTitle title={t("more.fuel")} />
            <ListItem title={t("more.fuelReports")} onPress={() => router.push("/fuel")} />
          </>
        ) : (
          <View
            style={[
              styles.banner,
              {
                marginTop: theme.spacing.sm,
                backgroundColor: theme.colors.warningMuted,
                borderRadius: theme.radius.md,
              },
            ]}>
            <Text style={[theme.typography.bodyMedium, { color: theme.colors.warningText }]}>
              {t("modules.unavailableTitle")}
            </Text>
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: theme.spacing.sm }]}>
              {t("modules.unavailableBody")}
            </Text>
          </View>
        )}

        <SectionTitle title={t("more.offline")} />
        <Card>
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
            {jobs.length > 0 ? t("more.offlinePending", { count: jobs.length }) : t("more.offlineEmpty")}
          </Text>
          {jobs.length > 0 ? (
            <AppButton
              label={t("more.offlineFlush")}
              onPress={() => void flushNow()}
              style={{ marginTop: theme.spacing.sm }}
            />
          ) : null}
          {lastError ? (
            <Text style={[theme.typography.caption, { color: theme.colors.dangerText, marginTop: theme.spacing.sm }]}>
              {t("more.offlineLastError", { error: lastError })}
            </Text>
          ) : null}
        </Card>

        <ListItem
          title={showDebug ? t("more.hideDiagnostics") : t("more.diagnostics")}
          onPress={() => setShowDebug((v) => !v)}
        />

        {showDebug ? (
          <Card style={{ marginTop: theme.spacing.sm }}>
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
              {t("more.apiLabel", { url: getApiBaseUrl() })}
            </Text>
            {trackingDebug ? (
              <>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: theme.spacing.sm }]}>
                  {t("more.debugTrackingMode", { mode: trackingDebug.mode })}
                </Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
                  {t("more.debugShiftId", { id: trackingDebug.activeShiftId ?? "—" })}
                </Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
                  {t("more.debugPending", { count: trackingDebug.pendingSamples })}
                </Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
                  {t("more.debugLastFlush", {
                    at: trackingDebug.lastFlushAt
                      ? new Date(trackingDebug.lastFlushAt).toLocaleString()
                      : "—",
                  })}
                </Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
                  {t("more.debugFgPerm", { status: trackingDebug.foregroundPermission })}
                </Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
                  {t("more.debugBgPerm", { status: trackingDebug.backgroundPermission ?? "—" })}
                </Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
                  {t("more.debugTaskStarted", {
                    status: trackingDebug.backgroundTaskStarted ? "yes" : "no",
                  })}
                </Text>
              </>
            ) : null}
            {errorLog.slice(0, 5).map((e) => (
              <Text
                key={`${e.at}-${e.message}`}
                style={[theme.typography.caption, { color: theme.colors.dangerText, marginTop: theme.spacing.sm }]}>
                {new Date(e.at).toLocaleString()} · {e.type}
                {"\n"}
                {e.message}
              </Text>
            ))}
          </Card>
        ) : null}

        <AppButton
          label={t("more.logout")}
          onPress={() => logout()}
          variant="danger"
          style={{ marginTop: theme.spacing.xl }}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {},
  banner: { padding: 12 },
  toggleLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
