import { useFocusEffect } from "@react-navigation/native";
import React from "react";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/Themed";
import { DayRouteMapPanel } from "@/components/map/DayRouteMapPanel";
import { Screen } from "@/components/ui/Screen";
import { useModules } from "@/context/modules-context";
import { formatLocalDateKey } from "@/lib/date";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";

export default function MapScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { visitsEnabled } = useModules();
  const dateKey = formatLocalDateKey();

  if (!visitsEnabled) {
    return (
      <Screen>
        <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
          {t("modules.unavailableBody")}
        </Text>
      </Screen>
    );
  }

  const scrollBottom = Math.max(insets.bottom, theme.spacing.md);

  return (
    <Screen padded={false} contentStyle={styles.flex}>
      <DayRouteMapPanel dateKey={dateKey} contentPaddingBottom={scrollBottom} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
