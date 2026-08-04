import React, { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Switch, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { AppHeader } from "@/components/ui/AppHeader";
import { Card } from "@/components/ui/Card";
import { ListItem } from "@/components/ui/ListItem";
import { Screen } from "@/components/ui/Screen";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { TrackingHealthBanner } from "@/components/today/TrackingHealthBanner";
import { useAuth } from "@/context/auth-context";
import { useModules } from "@/context/modules-context";
import { useOfflineQueue } from "@/context/offline-queue-context";
import { useServerConfig } from "@/context/server-config-context";
import { useShiftTracking } from "@/context/shift-tracking-context";
import { getApiBaseUrl } from "@/lib/config";
import { formatLocalDateKey } from "@/lib/date";
import { useTheme } from "@/lib/design/theme-context";
import { getErrorLog, type ErrorLogEntry } from "@/lib/error-log";
import { getTrackingDiagnostics, type TrackingDiagnostics } from "@/lib/location-tracking";
import {
  unhealthyReasonMessageKeys,
} from "@/lib/location-tracking-health";
import { openLocationPermissionSettings } from "@/lib/location-permissions";
import { t } from "@/lib/i18n";

export default function MoreScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { user, logout } = useAuth();
  const { apiUrl, clearServerUrl } = useServerConfig();
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
    restartShift,
    restartTracking,
    isTracking,
    unhealthyReason,
    backgroundPermission,
    batteryOptimizationStatus,
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

  const trackingBroken =
    !!activeShift &&
    activeShift.status === "ACTIVE" &&
    unhealthyReason !== "none";
  const unhealthyMsg = unhealthyReasonMessageKeys(unhealthyReason);

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
        <ListItem
          title={t("map.title")}
          onPress={() => router.push(`/map/${formatLocalDateKey()}`)}
        />
        <ListItem
          title={t("tabs.work")}
          subtitle={t("more.workSubtitle")}
          onPress={() => router.push("/(tabs)/work")}
        />

        {visitsEnabled ? (
          <>
            <SectionTitle title={t("more.shift")} />
            {activeShift?.status === "ACTIVE" && activeShift.trackingEnabled ? (
              <TrackingHealthBanner
                backgroundPermission={backgroundPermission}
                batteryOptimizationStatus={batteryOptimizationStatus}
                trackingMode={trackingMode}
              />
            ) : null}
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
                {trackingBroken && unhealthyMsg ? (
                  <View style={{ marginBottom: theme.spacing.sm, gap: 8 }}>
                    <Text
                      style={[
                        theme.typography.caption,
                        { color: theme.colors.dangerText, fontWeight: "700" },
                      ]}>
                      {t(unhealthyMsg.titleKey)}
                    </Text>
                    <Text style={[theme.typography.caption, { color: theme.colors.dangerText }]}>
                      {t(unhealthyMsg.bodyKey)}
                    </Text>
                    {unhealthyReason === "background_permission" ? (
                      <AppButton
                        label={t("gps.openSettings")}
                        onPress={() => void openLocationPermissionSettings()}
                        disabled={loading}
                        loading={loading}
                        variant="secondary"
                      />
                    ) : null}
                    {unhealthyReason === "background_task_dead" ||
                    unhealthyReason === "foreground_watch_dead" ||
                    unhealthyReason === "accept_stale" ? (
                      <AppButton
                        label={t("gps.restartTracking")}
                        onPress={() => void restartTracking()}
                        disabled={loading}
                        loading={loading}
                        variant="secondary"
                      />
                    ) : null}
                    {unhealthyReason === "background_task_dead" ||
                    unhealthyReason === "accept_stale" ||
                    unhealthyReason === "accept_stale_wrong_day" ? (
                      <AppButton
                        label={t("gps.closeAndReopenShift")}
                        onPress={() => void restartShift()}
                        disabled={loading}
                        loading={loading}
                        variant="secondary"
                      />
                    ) : null}
                    {unhealthyReason === "accept_stale_auth_401" ? (
                      <Text style={[theme.typography.caption, { color: theme.colors.dangerText }]}>
                        {t("gps.loginAgain")}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
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
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
                  {t("more.debugHealthy", { status: trackingDebug.healthy ? "yes" : "no" })}
                  {trackingDebug.acceptStale ? " · stale" : ""}
                </Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
                  {t("gps.lastAcceptedAt", {
                    value: trackingDebug.lastAcceptedAt
                      ? new Date(trackingDebug.lastAcceptedAt).toLocaleString()
                      : t("gps.neverAccepted"),
                  })}
                </Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
                  {t("gps.lastRejectReason", {
                    value: trackingDebug.lastRejectReason ?? "—",
                  })}
                </Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
                  {t("more.debugBatteryOpt", { status: trackingDebug.batteryOptimizationStatus })}
                </Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
                  {t("more.debugLastRestart", {
                    at: trackingDebug.lastRestartAt
                      ? new Date(trackingDebug.lastRestartAt).toLocaleString()
                      : "—",
                  })}
                </Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
                  {t("more.debugRestartCount", { count: trackingDebug.restartCountToday })}
                </Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
                  {t("more.debugRestartReason", {
                    reason: trackingDebug.lastRestartReason ?? "—",
                  })}
                </Text>
              </>
            ) : null}
            {errorLog.slice(0, 5).map((e) => (
              <Text
                key={`${e.at}-${e.message}`}
                style={[
                  theme.typography.caption,
                  {
                    color:
                      e.type === "error" || e.type === "rejection"
                        ? theme.colors.dangerText
                        : e.type === "warn"
                          ? theme.colors.warningText
                          : theme.colors.textMuted,
                    marginTop: theme.spacing.sm,
                  },
                ]}>
                {new Date(e.at).toLocaleString()} · {e.type}
                {"\n"}
                {e.message}
              </Text>
            ))}
          </Card>
        ) : null}

        <SectionTitle title={t("more.serverSection")} />
        <ListItem
          title={t("more.serverTitle")}
          subtitle={apiUrl ?? getApiBaseUrl()}
          onPress={() => {
            Alert.alert(t("more.serverChangeTitle"), t("more.serverChangeBody"), [
              { text: t("common.cancel"), style: "cancel" },
              {
                text: t("more.serverChangeConfirm"),
                style: "destructive",
                onPress: () => {
                  void (async () => {
                    const current = apiUrl ?? getApiBaseUrl();
                    await logout();
                    await clearServerUrl();
                    router.replace({
                      pathname: "/server-setup",
                      params: { prefill: current },
                    });
                  })();
                },
              },
            ]);
          }}
        />

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
