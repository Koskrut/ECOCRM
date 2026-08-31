import React from "react";
import { AppState, View } from "react-native";

import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { Card } from "@/components/ui/Card";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import {
  unhealthyReasonMessageKeys,
  type TrackingUnhealthyReason,
} from "@/lib/location-tracking-health";
import { openLocationPermissionSettings } from "@/lib/location-permissions";
import { shouldOfferRestartShiftCta } from "@/lib/shift-ops-gate";

type Props = {
  activeShift: boolean;
  isTracking: boolean;
  trackingMode?: "background" | "foreground" | "none";
  mobilityMode?: "CAR" | "WALK_TRANSIT" | null;
  mobilityNote?: string | null;
  trackingHealthy?: boolean;
  /** True when no successful GPS accept for >10 min (ACTIVE shift). */
  acceptStale?: boolean;
  unhealthyReason?: TrackingUnhealthyReason;
  pendingSamples: number;
  loading: boolean;
  onStart: () => void;
  onEnd: () => void;
  /** Light: restart native tracking + immediate fix (keep shift). */
  onRestartTracking?: () => void;
  /** Hard: end shift + start new. */
  onRestartShift?: () => void;
};

export function ShiftStatusCard({
  activeShift,
  isTracking,
  trackingMode = "none",
  mobilityMode = null,
  mobilityNote = null,
  trackingHealthy = true,
  acceptStale = false,
  unhealthyReason = "none",
  pendingSamples,
  loading,
  onStart,
  onEnd,
  onRestartTracking,
  onRestartShift,
}: Props) {
  const theme = useTheme();
  const trackingBroken =
    activeShift &&
    trackingMode !== "none" &&
    (!trackingHealthy || acceptStale || unhealthyReason !== "none");

  const msg = unhealthyReasonMessageKeys(
    unhealthyReason !== "none"
      ? unhealthyReason
      : acceptStale
        ? "accept_stale"
        : "none",
  );

  const showPermissionCta = unhealthyReason === "background_permission";
  const showLoginHint = unhealthyReason === "accept_stale_auth_401";
  const showOpenAppHint = unhealthyReason === "fgs_start_blocked_background";
  const appInForeground = AppState.currentState === "active";

  const showRestartTracking =
    (appInForeground || !showOpenAppHint) &&
    (unhealthyReason === "background_task_dead" ||
      unhealthyReason === "foreground_watch_dead" ||
      unhealthyReason === "accept_stale" ||
      unhealthyReason === "zombie_fgs" ||
      unhealthyReason === "point_stale" ||
      (unhealthyReason === "fgs_start_blocked_background" && appInForeground));
  // End+start only for wrong_day — never primary fix for dead FGS (empty-shift thrash).
  const showRestartShift = shouldOfferRestartShiftCta(unhealthyReason);

  return (
    <Card variant="elevated" style={{ marginBottom: theme.spacing.md }}>
      {activeShift ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Text style={theme.typography.bodyMedium}>{t("today.shiftActive")}</Text>
          {mobilityMode === "WALK_TRANSIT" ? (
            <Text style={[theme.typography.caption, { color: theme.colors.warningText }]}>
              {t("today.shiftMobilityBadgeWalk")}
              {mobilityNote?.trim() ? ` · ${mobilityNote.trim()}` : ""}
            </Text>
          ) : null}
          {isTracking && !trackingBroken ? (
            <Text style={[theme.typography.caption, { color: theme.colors.primaryText }]}>
              {t("today.trackingActive")}
              {pendingSamples > 0 ? ` · ${t("today.queuePending", { count: pendingSamples })}` : ""}
            </Text>
          ) : null}
          {trackingBroken && msg ? (
            <View
              style={{
                gap: theme.spacing.sm,
                padding: theme.spacing.sm,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.dangerMuted,
              }}>
              <Text
                style={[
                  theme.typography.caption,
                  { color: theme.colors.dangerText, fontWeight: "700" },
                ]}>
                {t(msg.titleKey)}
              </Text>
              <Text style={[theme.typography.caption, { color: theme.colors.dangerText }]}>
                {t(msg.bodyKey)}
              </Text>
              {pendingSamples > 0 ? (
                <Text style={[theme.typography.caption, { color: theme.colors.dangerText }]}>
                  {t("today.queuePending", { count: pendingSamples })}
                </Text>
              ) : null}
              {showPermissionCta ? (
                <AppButton
                  label={t("gps.openSettings")}
                  onPress={() => void openLocationPermissionSettings()}
                  variant="secondary"
                  loading={loading}
                  disabled={loading}
                />
              ) : null}
              {showRestartTracking && onRestartTracking ? (
                <AppButton
                  label={t("gps.restartTracking")}
                  onPress={onRestartTracking}
                  variant="secondary"
                  loading={loading}
                  disabled={loading}
                />
              ) : null}
              {showRestartShift && onRestartShift ? (
                <AppButton
                  label={t("gps.closeAndReopenShift")}
                  onPress={onRestartShift}
                  variant="secondary"
                  loading={loading}
                  disabled={loading}
                />
              ) : null}
              {showOpenAppHint && !appInForeground ? (
                <Text style={[theme.typography.caption, { color: theme.colors.dangerText }]}>
                  {t("gps.openAppFirstHint")}
                </Text>
              ) : null}
              {showOpenAppHint && appInForeground && onRestartTracking ? (
                <AppButton
                  label={t("gps.openAppAndRestart")}
                  onPress={onRestartTracking}
                  variant="secondary"
                  loading={loading}
                  disabled={loading}
                />
              ) : null}
              {showLoginHint ? (
                <Text style={[theme.typography.caption, { color: theme.colors.dangerText }]}>
                  {t("gps.loginAgain")}
                </Text>
              ) : null}
            </View>
          ) : null}
          {isTracking && trackingMode === "foreground" && !trackingBroken ? (
            <Text style={[theme.typography.caption, { color: theme.colors.warningText }]}>
              {t("gps.trackingForegroundOnly")}
            </Text>
          ) : null}
          <AppButton
            label={t("today.endShift")}
            onPress={onEnd}
            variant="secondary"
            loading={loading}
            disabled={loading}
          />
        </View>
      ) : (
        <AppButton
          label={t("today.startShift")}
          onPress={onStart}
          loading={loading}
          disabled={loading}
          fullWidth
        />
      )}
    </Card>
  );
}
