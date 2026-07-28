import { useLocalSearchParams } from "expo-router";
import React, { useLayoutEffect } from "react";
import { StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { DayRouteMapPanel } from "@/components/map/DayRouteMapPanel";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/context/auth-context";
import { formatHumanDate, formatLocalDateKey, parseDateKey } from "@/lib/date";
import { useTheme } from "@/lib/design/theme-context";

function resolveParam(raw: string | string[] | undefined, fallback: string): string {
  if (typeof raw === "string" && raw) return raw;
  if (Array.isArray(raw) && raw[0]) return raw[0];
  return fallback;
}

export default function DayMapScreen() {
  const params = useLocalSearchParams<{ date?: string | string[]; ownerId?: string | string[] }>();
  const dateKey = resolveParam(params.date, formatLocalDateKey());
  const ownerId = resolveParam(params.ownerId, "");
  const navigation = useNavigation();
  const { user } = useAuth();

  const title = formatHumanDate(parseDateKey(dateKey));

  useLayoutEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  return (
    <Screen contentStyle={styles.screen} edges={["left", "right"]}>
      <DayRouteMapPanel
        dateKey={dateKey}
        ownerId={ownerId && ownerId !== user?.id ? ownerId : undefined}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
});
