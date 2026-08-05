import React from "react";
import { View } from "react-native";

import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { Card } from "@/components/ui/Card";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import {
  isAndroid,
  openBatteryOptimizationSettings,
  openLocationPermissionSettings,
} from "@/lib/location-permissions";
import type { BatteryOptimizationStatus } from "@/lib/location-tracking-restart";

type Props = {
  backgroundPermission: string | null;
  batteryOptimizationStatus: BatteryOptimizationStatus;
  trackingMode: "background" | "foreground" | "none";
  /** Only true after a failed foreground restart attempt. */
  showBatteryHint?: boolean;
};

export function TrackingHealthBanner({
  backgroundPermission,
  batteryOptimizationStatus,
  trackingMode,
  showBatteryHint = false,
}: Props) {
  const theme = useTheme();

  const needsBackground =
    backgroundPermission != null && backgroundPermission !== "granted" && trackingMode !== "none";
  const needsBattery =
    showBatteryHint &&
    isAndroid() &&
    trackingMode !== "none" &&
    !needsBackground &&
    batteryOptimizationStatus !== "unrestricted" &&
    (batteryOptimizationStatus === "restricted" || batteryOptimizationStatus === "unknown");

  if (!needsBackground && !needsBattery) {
    return null;
  }

  const batteryTitle =
    batteryOptimizationStatus === "unknown" ? t("gps.batteryUnknownHint") : t("gps.batteryHint");
  const title = needsBackground ? t("gps.backgroundHint") : batteryTitle;
  const actionLabel = needsBackground ? t("gps.openSettings") : t("gps.batteryOpen");
  const onPress = needsBackground
    ? () => void openLocationPermissionSettings()
    : () => void openBatteryOptimizationSettings();

  return (
    <Card variant="elevated" style={{ marginBottom: theme.spacing.md }}>
      <View style={{ gap: theme.spacing.sm }}>
        <Text style={[theme.typography.caption, { color: theme.colors.warningText, fontWeight: "600" }]}>
          {needsBackground ? t("gps.trackingForegroundOnly") : t("gps.batteryTitle")}
        </Text>
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>{title}</Text>
        <AppButton label={actionLabel} onPress={onPress} variant="secondary" fullWidth />
      </View>
    </Card>
  );
}
