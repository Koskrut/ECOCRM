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
};

export function TrackingHealthBanner({
  backgroundPermission,
  batteryOptimizationStatus,
  trackingMode,
}: Props) {
  const theme = useTheme();

  const needsBackground =
    backgroundPermission != null && backgroundPermission !== "granted" && trackingMode !== "none";
  const needsBattery =
    isAndroid() && batteryOptimizationStatus === "restricted" && trackingMode !== "none";

  if (!needsBackground && !needsBattery) {
    return null;
  }

  const title = needsBackground ? t("gps.backgroundHint") : t("gps.batteryHint");
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
