import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { IconButton } from "@/components/ui/IconButton";
import {
  addDaysToDateKey,
  formatHumanDate,
  formatLocalDateKey,
  isSameDateKey,
  parseDateKey,
} from "@/lib/date";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";

type Props = {
  dateKey: string;
  onDateKeyChange: (key: string) => void;
  onOpenCalendar?: () => void;
};

export function VisitDayNavigator({ dateKey, onDateKeyChange, onOpenCalendar }: Props) {
  const theme = useTheme();
  const todayKey = formatLocalDateKey();
  const isToday = isSameDateKey(dateKey, todayKey);

  return (
    <View style={[styles.wrap, { marginBottom: theme.spacing.md }]}>
      <View style={styles.row}>
        <IconButton
          name="chevron-back"
          onPress={() => onDateKeyChange(addDaysToDateKey(dateKey, -1))}
          accessibilityLabel={t("visits.prevDay")}
        />
        <Pressable
          onPress={onOpenCalendar}
          disabled={!onOpenCalendar}
          accessibilityRole="button"
          style={({ pressed }) => [styles.dateCol, pressed && onOpenCalendar && { opacity: 0.8 }]}>
          <Text style={theme.typography.bodyMedium}>{formatHumanDate(parseDateKey(dateKey))}</Text>
          {!isToday ? (
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
              {t("visits.notToday")}
            </Text>
          ) : null}
        </Pressable>
        <IconButton
          name="chevron-forward"
          onPress={() => onDateKeyChange(addDaysToDateKey(dateKey, 1))}
          accessibilityLabel={t("visits.nextDay")}
        />
      </View>
      <View style={styles.actions}>
        {!isToday ? (
          <Pressable
            onPress={() => onDateKeyChange(todayKey)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.todayBtn,
              { backgroundColor: theme.colors.primaryMuted },
              pressed && { opacity: 0.85 },
            ]}>
            <Text style={{ color: theme.colors.primaryText, fontWeight: "600", fontSize: 13 }}>
              {t("visits.goToday")}
            </Text>
          </Pressable>
        ) : null}
        {onOpenCalendar ? (
          <Pressable
            onPress={onOpenCalendar}
            accessibilityRole="button"
            style={({ pressed }) => [styles.calBtn, pressed && { opacity: 0.85 }]}>
            <Ionicons name="calendar-outline" size={16} color={theme.colors.primary} />
            <Text style={{ color: theme.colors.primary, fontWeight: "600", fontSize: 13, marginLeft: 4 }}>
              {t("visits.calendar")}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dateCol: { flex: 1, alignItems: "center", paddingHorizontal: 8 },
  actions: { flexDirection: "row", justifyContent: "center", gap: 12, flexWrap: "wrap" },
  todayBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  calBtn: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
});
