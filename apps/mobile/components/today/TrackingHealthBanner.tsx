import React from "react";
import { View } from "react-native";

import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { Card } from "@/components/ui/Card";
import { shouldShowBatteryOptimizationWarning } from "@/lib/battery-optimization";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import {
  isAndroid,
  isBackgroundLocationGrantedStatus,
  openBatteryOptimizationSettings,
  openLocationPermissionSettings,
} from "@/lib/location-permissions";
import type { BatteryOptimizationStatus } from "@/lib/location-tracking-restart";

type Props = {
  backgroundPermission: string | null;
  batteryOptimizationStatus: BatteryOptimizationStatus;
  trackingMode: "background" | "foreground" | "none";
  healthy?: boolean;
  backgroundTaskStarted?: boolean;
  lastAcceptedAt?: string | null;
  /** Extra nudge after a failed foreground restart (in addition to ACTIVE-shift battery warn). */
  showBatteryHint?: boolean;
  fieldTrackingMode?: "legacy_expo" | "native_android";
  nativeServiceRunning?: boolean;
};

export function TrackingHealthBanner({
  backgroundPermission,
  batteryOptimizationStatus,
  trackingMode,
  healthy = false,
  backgroundTaskStarted = false,
  lastAcceptedAt = null,
  showBatteryHint = false,
  fieldTrackingMode,
  nativeServiceRunning,
}: Props) {
  const theme = useTheme();

  const needsBackground =
    backgroundPermission != null &&
    !isBackgroundLocationGrantedStatus(backgroundPermission) &&
    trackingMode !== "none";
  const needsBattery =
    isAndroid() &&
    shouldShowBatteryOptimizationWarning({
      batteryStatus: batteryOptimizationStatus,
      trackingMode,
      healthy,
      backgroundTaskStarted,
      lastAcceptedAt,
      showBatteryHint,
      fieldTrackingMode,
      nativeServiceRunning: nativeServiceRunning ?? backgroundTaskStarted,
    });

  if (!needsBackground && !needsBattery) {
    return null;
  }

  const batteryTitle =
    batteryOptimizationStatus === "unknown"
      ? t("gps.batteryUnknownHint")
      : t("gps.batteryHint");
  const title = needsBackground ? t("gps.backgroundRequiredHint") : batteryTitle;
  const actionLabel = needsBackground ? t("gps.openSettings") : t("gps.batteryOpen");
  const onPress = needsBackground
    ? () => void openLocationPermissionSettings()
    : () => void openBatteryOptimizationSettings();

  return (
    <Card variant="elevated" style={{ marginBottom: theme.spacing.md }}>
      <View style={{ gap: theme.spacing.sm }}>
        <Text style={[theme.typography.caption, { color: theme.colors.warningText, fontWeight: "600" }]}>
          {needsBackground ? t("gps.backgroundRequiredTitle") : t("gps.batteryTitle")}
        </Text>
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>{title}</Text>
        <AppButton label={actionLabel} onPress={onPress} variant="secondary" fullWidth />
      </View>
    </Card>
  );
}
