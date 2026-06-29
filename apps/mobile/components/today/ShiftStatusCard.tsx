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
  pendingSamples: number;
  loading: boolean;
  onStart: () => void;
  onEnd: () => void;
};

export function ShiftStatusCard({
  activeShift,
  isTracking,
  trackingMode = "none",
  pendingSamples,
  loading,
  onStart,
  onEnd,
}: Props) {
  const theme = useTheme();

  return (
    <Card variant="elevated" style={{ marginBottom: theme.spacing.md }}>
      {activeShift ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Text style={theme.typography.bodyMedium}>{t("today.shiftActive")}</Text>
          {isTracking ? (
            <Text style={[theme.typography.caption, { color: theme.colors.primaryText }]}>
              {t("today.trackingActive")}
              {pendingSamples > 0 ? ` · ${t("today.queuePending", { count: pendingSamples })}` : ""}
            </Text>
          ) : null}
          {isTracking && trackingMode === "foreground" ? (
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
