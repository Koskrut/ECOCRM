import React from "react";
import { View } from "react-native";

import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { Card } from "@/components/ui/Card";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";

type Props = {
  activeShift: boolean;
  isTracking: boolean;
  trackingMode?: "background" | "foreground" | "none";
  trackingHealthy?: boolean;
  /** True when no successful GPS accept for >10 min (ACTIVE shift). */
  acceptStale?: boolean;
  pendingSamples: number;
  loading: boolean;
  onStart: () => void;
  onEnd: () => void;
  onRestartShift?: () => void;
};

export function ShiftStatusCard({
  activeShift,
  isTracking,
  trackingMode = "none",
  trackingHealthy = true,
  acceptStale = false,
  pendingSamples,
  loading,
  onStart,
  onEnd,
  onRestartShift,
}: Props) {
  const theme = useTheme();
  const trackingBroken =
    activeShift && trackingMode !== "none" && (!trackingHealthy || acceptStale);

  return (
    <Card variant="elevated" style={{ marginBottom: theme.spacing.md }}>
      {activeShift ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Text style={theme.typography.bodyMedium}>{t("today.shiftActive")}</Text>
          {isTracking && !trackingBroken ? (
            <Text style={[theme.typography.caption, { color: theme.colors.primaryText }]}>
              {t("today.trackingActive")}
              {pendingSamples > 0 ? ` · ${t("today.queuePending", { count: pendingSamples })}` : ""}
            </Text>
          ) : null}
          {trackingBroken ? (
            <Text style={[theme.typography.caption, { color: theme.colors.dangerText }]}>
              {acceptStale ? t("gps.staleGpsHint") : t("gps.trackingUnhealthy")}
            </Text>
          ) : null}
          {trackingBroken && onRestartShift ? (
            <AppButton
              label={t("gps.restartShift")}
              onPress={onRestartShift}
              variant="secondary"
              loading={loading}
              disabled={loading}
            />
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
