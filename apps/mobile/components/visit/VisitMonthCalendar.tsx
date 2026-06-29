import React, { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { IconButton } from "@/components/ui/IconButton";
import {
  formatLocalDateKey,
  formatMonthYear,
  isSameDateKey,
  monthGridCells,
  parseDateKey,
} from "@/lib/date";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

type Props = {
  monthAnchorKey: string;
  selectedDateKey: string;
  visitCounts: Record<string, number>;
  onMonthChange: (anchorKey: string) => void;
  onSelectDate: (dateKey: string) => void;
};

export function VisitMonthCalendar({
  monthAnchorKey,
  selectedDateKey,
  visitCounts,
  onMonthChange,
  onSelectDate,
}: Props) {
  const theme = useTheme();
  const todayKey = formatLocalDateKey();
  const cells = useMemo(() => monthGridCells(monthAnchorKey), [monthAnchorKey]);
  const monthLabel = formatMonthYear(parseDateKey(monthAnchorKey));

  function shiftMonth(delta: number) {
    const d = parseDateKey(monthAnchorKey);
    onMonthChange(formatLocalDateKey(new Date(d.getFullYear(), d.getMonth() + delta, 1)));
  }

  return (
    <View style={[styles.wrap, { marginBottom: theme.spacing.md }]}>
      <View style={styles.header}>
        <IconButton name="chevron-back" onPress={() => shiftMonth(-1)} accessibilityLabel={t("visits.prevMonth")} />
        <Text style={theme.typography.section}>{monthLabel}</Text>
        <IconButton name="chevron-forward" onPress={() => shiftMonth(1)} accessibilityLabel={t("visits.nextMonth")} />
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((wd) => (
          <Text
            key={wd}
            style={[styles.weekday, theme.typography.caption, { color: theme.colors.textMuted }]}>
            {wd}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell, index) => {
          if (!cell.dateKey) {
            return <View key={`pad-${index}`} style={styles.cell} />;
          }
          const day = parseDateKey(cell.dateKey).getDate();
          const selected = isSameDateKey(cell.dateKey, selectedDateKey);
          const isToday = isSameDateKey(cell.dateKey, todayKey);
          const count = visitCounts[cell.dateKey] ?? 0;

          return (
            <Pressable
              key={cell.dateKey}
              onPress={() => onSelectDate(cell.dateKey!)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.cell,
                {
                  backgroundColor: selected
                    ? theme.colors.primary
                    : isToday
                      ? theme.colors.primaryMuted
                      : "transparent",
                  borderColor: isToday && !selected ? theme.colors.primary : "transparent",
                  borderWidth: isToday && !selected ? 1 : 0,
                },
                pressed && { opacity: 0.85 },
              ]}>
              <Text
                style={[
                  styles.dayNum,
                  {
                    color: selected
                      ? theme.colors.textInverse
                      : isToday
                        ? theme.colors.primaryText
                        : theme.colors.text,
                  },
                ]}>
                {day}
              </Text>
              {count > 0 ? (
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: selected ? theme.colors.textInverse : theme.colors.visit },
                  ]}
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {},
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekday: { flex: 1, textAlign: "center", fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    padding: 2,
  },
  dayNum: { fontSize: 15, fontWeight: "600" },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
});
