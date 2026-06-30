import React, { useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import { Text } from "@/components/Themed";
import { Chip } from "@/components/ui/Chip";
import { TextField } from "@/components/ui/TextField";
import { addDays } from "@/lib/date";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import { formatTimeHm, parseTodayTime, slotAtHour } from "@/lib/visit-create-utils";

export type TaskDueDayKey = "none" | "tomorrow" | "in3days" | "inWeek";
export type TaskDueTimeKey = "10" | "14" | "16" | "custom";

type Props = {
  dueAt: string | null;
  onChange: (dueAt: string | null) => void;
};

function dayOffsetForKey(key: TaskDueDayKey): number | null {
  if (key === "none") return null;
  if (key === "tomorrow") return 1;
  if (key === "in3days") return 3;
  return 7;
}

function resolveDueDate(
  dayKey: TaskDueDayKey,
  timeKey: TaskDueTimeKey,
  customTime: string,
): string | null {
  const offset = dayOffsetForKey(dayKey);
  if (offset === null) return null;
  const base = addDays(new Date(), offset);
  let at: Date | null;
  if (timeKey === "10") at = slotAtHour(10, base);
  else if (timeKey === "14") at = slotAtHour(14, base);
  else if (timeKey === "16") at = slotAtHour(16, base);
  else at = parseTodayTime(customTime, base);
  return at ? at.toISOString() : null;
}

function inferDayKey(dueAt: string | null): TaskDueDayKey {
  if (!dueAt) return "none";
  const due = new Date(dueAt);
  const now = new Date();
  for (const [key, days] of [
    ["tomorrow", 1],
    ["in3days", 3],
    ["inWeek", 7],
  ] as const) {
    const target = addDays(now, days);
    if (
      due.getFullYear() === target.getFullYear() &&
      due.getMonth() === target.getMonth() &&
      due.getDate() === target.getDate()
    ) {
      return key;
    }
  }
  return "tomorrow";
}

function inferTimeKey(dueAt: string | null): { timeKey: TaskDueTimeKey; customTime: string } {
  if (!dueAt) return { timeKey: "10", customTime: "10:00" };
  const due = new Date(dueAt);
  const h = due.getHours();
  const m = due.getMinutes();
  if (h === 10 && m === 0) return { timeKey: "10", customTime: "10:00" };
  if (h === 14 && m === 0) return { timeKey: "14", customTime: "14:00" };
  if (h === 16 && m === 0) return { timeKey: "16", customTime: "16:00" };
  return { timeKey: "custom", customTime: formatTimeHm(due) };
}

export function TaskDueSection({ dueAt, onChange }: Props) {
  const theme = useTheme();
  const initial = useMemo(
    () => ({
      dayKey: inferDayKey(dueAt),
      ...inferTimeKey(dueAt),
    }),
    [],
  );
  const [dayKey, setDayKey] = useState<TaskDueDayKey>(initial.dayKey);
  const [timeKey, setTimeKey] = useState<TaskDueTimeKey>(initial.timeKey);
  const [customTime, setCustomTime] = useState(initial.customTime);

  useEffect(() => {
    onChange(resolveDueDate(dayKey, timeKey, customTime));
  }, [dayKey, timeKey, customTime, onChange]);

  const dayOptions: { key: TaskDueDayKey; label: string }[] = [
    { key: "none", label: t("tasks.noDueDate") },
    { key: "tomorrow", label: t("tasks.tomorrow") },
    { key: "in3days", label: t("tasks.in3days") },
    { key: "inWeek", label: t("tasks.inWeek") },
  ];

  const timeOptions: { key: TaskDueTimeKey; label: string }[] = [
    { key: "10", label: t("tasks.dueTime10") },
    { key: "14", label: t("tasks.dueTime14") },
    { key: "16", label: t("tasks.dueTime16") },
    { key: "custom", label: t("tasks.dueTimeCustom") },
  ];

  return (
    <View style={{ marginBottom: theme.spacing.md }}>
      <Text style={[theme.typography.caption, { marginBottom: 8, fontWeight: "600" }]}>
        {t("tasks.dueSectionLabel")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {dayOptions.map((opt) => (
          <Chip
            key={opt.key}
            label={opt.label}
            selected={dayKey === opt.key}
            onPress={() => setDayKey(opt.key)}
          />
        ))}
      </View>
      {dayKey !== "none" ? (
        <>
          <Text style={[theme.typography.caption, { marginBottom: 8, fontWeight: "600" }]}>
            {t("tasks.dueTimeLabel")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {timeOptions.map((opt) => (
              <Chip
                key={opt.key}
                label={opt.label}
                selected={timeKey === opt.key}
                onPress={() => setTimeKey(opt.key)}
              />
            ))}
          </View>
          {timeKey === "custom" ? (
            <TextField
              value={customTime}
              onChangeText={setCustomTime}
              placeholder="10:00"
              keyboardType="numbers-and-punctuation"
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}
