import React, { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Chip } from "@/components/ui/Chip";
import { TextField } from "@/components/ui/TextField";
import { VisitMonthCalendar } from "@/components/visit/VisitMonthCalendar";
import { resolveVisitStartsAt, type TimeSlotKey } from "@/components/visit/VisitScheduleSection";
import { addDays, formatHumanDate, formatLocalDateKey, parseDateKey } from "@/lib/date";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import {
  buildEndsAt,
  DEFAULT_VISIT_DURATION_MIN,
  formatTimeHm,
  parseTodayTime,
  slotAtHour,
} from "@/lib/visit-create-utils";

type DayPreset = "tomorrow" | "in3days" | "inWeek" | "custom";

type SavePayload = {
  startsAt: string;
  endsAt: string;
  durationMin: number;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  initialStartsAt: string | null;
  durationMin?: number | null;
  loading?: boolean;
  title?: string;
  onSave: (payload: SavePayload) => void;
};

function inferDayPreset(dateKey: string): DayPreset {
  const now = new Date();
  for (const [key, days] of [
    ["tomorrow", 1],
    ["in3days", 3],
    ["inWeek", 7],
  ] as const) {
    const target = formatLocalDateKey(addDays(now, days));
    if (dateKey === target) return key;
  }
  return "custom";
}

function dateKeyForPreset(preset: DayPreset): string {
  if (preset === "tomorrow") return formatLocalDateKey(addDays(new Date(), 1));
  if (preset === "in3days") return formatLocalDateKey(addDays(new Date(), 3));
  if (preset === "inWeek") return formatLocalDateKey(addDays(new Date(), 7));
  return formatLocalDateKey();
}

function inferTimeSlot(startsAt: string | null): { timeSlot: TimeSlotKey; customTime: string } {
  if (!startsAt) return { timeSlot: "10", customTime: "10:00" };
  const due = new Date(startsAt);
  const h = due.getHours();
  const m = due.getMinutes();
  if (h === 10 && m === 0) return { timeSlot: "10", customTime: "10:00" };
  if (h === 14 && m === 0) return { timeSlot: "14", customTime: "14:00" };
  if (h === 16 && m === 0) return { timeSlot: "16", customTime: "16:00" };
  return { timeSlot: "custom", customTime: formatTimeHm(due) };
}

function monthAnchorFromDateKey(dateKey: string): string {
  const d = parseDateKey(dateKey);
  return formatLocalDateKey(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function VisitRescheduleSheet({
  visible,
  onClose,
  initialStartsAt,
  durationMin,
  loading,
  title,
  onSave,
}: Props) {
  const theme = useTheme();
  const visitDuration = durationMin ?? DEFAULT_VISIT_DURATION_MIN;

  const [dayPreset, setDayPreset] = useState<DayPreset>("tomorrow");
  const [selectedDateKey, setSelectedDateKey] = useState(formatLocalDateKey());
  const [monthAnchorKey, setMonthAnchorKey] = useState(monthAnchorFromDateKey(formatLocalDateKey()));
  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const [timeSlot, setTimeSlot] = useState<TimeSlotKey>("10");
  const [customTime, setCustomTime] = useState("10:00");

  useEffect(() => {
    if (!visible) return;
    const base = initialStartsAt ? new Date(initialStartsAt) : addDays(new Date(), 1);
    const dateKey = formatLocalDateKey(base);
    const preset = initialStartsAt ? inferDayPreset(dateKey) : "tomorrow";
    const time = inferTimeSlot(initialStartsAt);
    setDayPreset(preset);
    setSelectedDateKey(dateKey);
    setMonthAnchorKey(monthAnchorFromDateKey(dateKey));
    setCalendarExpanded(preset === "custom");
    setTimeSlot(time.timeSlot);
    setCustomTime(time.customTime);
  }, [visible, initialStartsAt]);

  const resolvedStartsAt = useMemo(() => {
    return resolveVisitStartsAt(timeSlot, customTime, parseDateKey(selectedDateKey));
  }, [timeSlot, customTime, selectedDateKey]);

  const summaryLabel = useMemo(() => {
    if (!resolvedStartsAt) return "";
    const date = formatHumanDate(parseDateKey(selectedDateKey));
    const time = formatTimeHm(resolvedStartsAt);
    return t("visit.rescheduleSummary").replace("{date}", date).replace("{time}", time);
  }, [resolvedStartsAt, selectedDateKey]);

  function selectPreset(preset: DayPreset) {
    setDayPreset(preset);
    const dateKey = dateKeyForPreset(preset);
    setSelectedDateKey(dateKey);
    setMonthAnchorKey(monthAnchorFromDateKey(dateKey));
    setCalendarExpanded(false);
  }

  function selectCalendarDate(dateKey: string) {
    setDayPreset("custom");
    setSelectedDateKey(dateKey);
    setMonthAnchorKey(monthAnchorFromDateKey(dateKey));
  }

  function handleSave() {
    if (!resolvedStartsAt) {
      if (timeSlot === "custom") return;
      return;
    }
    const startsAt = resolvedStartsAt.toISOString();
    const endsAt = buildEndsAt(resolvedStartsAt, visitDuration).toISOString();
    onSave({ startsAt, endsAt, durationMin: visitDuration });
  }

  const dayOptions: { key: DayPreset; label: string }[] = [
    { key: "tomorrow", label: t("tasks.tomorrow") },
    { key: "in3days", label: t("tasks.in3days") },
    { key: "inWeek", label: t("tasks.inWeek") },
  ];

  const timeOptions: { key: TimeSlotKey; label: string }[] = [
    { key: "10", label: t("tasks.dueTime10") },
    { key: "14", label: t("tasks.dueTime14") },
    { key: "16", label: t("tasks.dueTime16") },
    { key: "custom", label: t("tasks.dueTimeCustom") },
  ];

  const canSave =
    resolvedStartsAt != null || (timeSlot === "custom" && parseTodayTime(customTime, parseDateKey(selectedDateKey)) != null);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title ?? t("visit.rescheduleTitle")}>
      <Text style={[theme.typography.caption, { marginBottom: 8, fontWeight: "600" }]}>
        {t("tasks.dueSectionLabel")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {dayOptions.map((opt) => (
          <Chip
            key={opt.key}
            label={opt.label}
            selected={dayPreset === opt.key}
            onPress={() => selectPreset(opt.key)}
          />
        ))}
        <Chip
          label={t("visit.pickDate")}
          selected={dayPreset === "custom"}
          onPress={() => {
            setDayPreset("custom");
            setCalendarExpanded((v) => !v);
          }}
        />
      </View>

      {calendarExpanded ? (
        <VisitMonthCalendar
          monthAnchorKey={monthAnchorKey}
          selectedDateKey={selectedDateKey}
          visitCounts={{}}
          onMonthChange={setMonthAnchorKey}
          onSelectDate={selectCalendarDate}
        />
      ) : dayPreset === "custom" ? (
        <Pressable onPress={() => setCalendarExpanded(true)} style={{ marginBottom: theme.spacing.md }}>
          <Text style={[theme.typography.body, { color: theme.colors.primary }]}>
            {formatHumanDate(parseDateKey(selectedDateKey))}
          </Text>
        </Pressable>
      ) : null}

      <Text style={[theme.typography.caption, { marginBottom: 8, fontWeight: "600" }]}>
        {t("tasks.dueTimeLabel")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {timeOptions.map((opt) => (
          <Chip
            key={opt.key}
            label={opt.label}
            selected={timeSlot === opt.key}
            onPress={() => setTimeSlot(opt.key)}
          />
        ))}
      </View>

      {timeSlot === "custom" ? (
        <TextField
          value={customTime}
          onChangeText={setCustomTime}
          placeholder="10:00"
          keyboardType="numbers-and-punctuation"
          style={{ marginBottom: theme.spacing.md }}
        />
      ) : null}

      {summaryLabel ? (
        <Text style={[theme.typography.bodyMedium, { marginBottom: theme.spacing.md }]}>
          {summaryLabel}
        </Text>
      ) : null}

      <AppButton
        label={t("common.save")}
        onPress={handleSave}
        loading={loading}
        disabled={!canSave}
        fullWidth
      />
      <AppButton
        label={t("common.cancel")}
        onPress={onClose}
        variant="ghost"
        fullWidth
        style={{ marginTop: theme.spacing.sm }}
      />
    </BottomSheet>
  );
}
