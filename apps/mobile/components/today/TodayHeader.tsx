import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { dayPeriod, formatHumanDate } from "@/lib/date";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";

type Props = {
  userName?: string | null;
  done: number;
  total: number;
  onAddVisit?: () => void;
  /** When browsing another day, show this date instead of today. */
  dateLabel?: Date;
};

export function TodayHeader({ userName, done, total, onAddVisit, dateLabel }: Props) {
  const theme = useTheme();
  const period = dayPeriod();
  const greetingKey =
    period === "morning"
      ? "today.greetingMorning"
      : period === "afternoon"
        ? "today.greetingAfternoon"
        : "today.greetingEvening";
  const greeting = userName
    ? t("today.greetingName", { greeting: t(greetingKey), name: userName.split(" ")[0] })
    : t(greetingKey);

  return (
    <LinearGradient
      colors={[theme.colors.primaryMuted, "transparent"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.wrap, { borderRadius: theme.radius.xl, marginBottom: theme.spacing.md }]}>
      <View style={styles.row}>
        <View style={styles.textCol}>
          <Text style={theme.typography.title}>{greeting}</Text>
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
            {formatHumanDate(dateLabel ?? new Date())}
          </Text>
          {total > 0 ? (
            <Text style={[theme.typography.caption, { color: theme.colors.successText, marginTop: 6 }]}>
              {t("today.progress", { done, total })}
            </Text>
          ) : null}
        </View>
        <ProgressRing done={done} total={total} />
      </View>
      {onAddVisit ? (
        <Pressable
          onPress={onAddVisit}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: theme.colors.primaryMuted },
            pressed && { opacity: 0.8 },
          ]}>
          <Text style={{ color: theme.colors.primaryText, fontWeight: "700" }}>{t("today.addVisit")}</Text>
        </Pressable>
      ) : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  textCol: { flex: 1 },
  action: {
    alignSelf: "flex-start",
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
});
