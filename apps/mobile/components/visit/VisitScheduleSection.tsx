import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { contactDisplayName } from "@/components/ContactRow";
import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TextField } from "@/components/ui/TextField";
import { VisitMonthCalendar } from "@/components/visit/VisitMonthCalendar";
import { addDays, formatHumanDate, formatLocalDateKey, parseDateKey } from "@/lib/date";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import {
  DEFAULT_VISIT_DURATION_MIN,
  VISIT_PURPOSE_KEYS,
  formatTimeHm,
  parseTodayTime,
  slotAtHour,
  suggestNextSlot,
  type VisitPurposeKey,
  type VisitScheduleMode,
} from "@/lib/visit-create-utils";
import type { Company, Contact } from "@/types/crm";

export type TimeSlotKey = "next" | "10" | "14" | "16" | "custom";

type DayPreset = "today" | "tomorrow" | "custom";

type Props = {
  contact?: Contact | null;
  company?: Company | null;
  mode: VisitScheduleMode;
  onModeChange: (mode: VisitScheduleMode) => void;
  dateKey: string;
  onDateKeyChange: (dateKey: string) => void;
  timeSlot: TimeSlotKey;
  onTimeSlotChange: (slot: TimeSlotKey) => void;
  customTime: string;
  onCustomTimeChange: (value: string) => void;
  purposeKey: VisitPurposeKey | null;
  onPurposeKeyChange: (key: VisitPurposeKey | null) => void;
  customPurpose: string;
  onCustomPurposeChange: (value: string) => void;
  title: string;
  onTitleChange: (value: string) => void;
  backlogVisitId: string | null;
  onChangeEntity: () => void;
};

function purposeLabel(key: VisitPurposeKey): string {
  const map: Record<VisitPurposeKey, string> = {
    presentation: t("visits.purposePresentation"),
    payment: t("visits.purposePayment"),
    delivery: t("visits.purposeDelivery"),
    followUp: t("visits.purposeFollowUp"),
    demo: t("visits.purposeDemo"),
    other: t("visits.purposeOther"),
  };
  return map[key];
}

function monthAnchorFromDateKey(dateKey: string): string {
  const d = parseDateKey(dateKey);
  return formatLocalDateKey(new Date(d.getFullYear(), d.getMonth(), 1));
}

function inferDayPreset(dateKey: string): DayPreset {
  const today = formatLocalDateKey();
  if (dateKey === today) return "today";
  if (dateKey === formatLocalDateKey(addDays(new Date(), 1))) return "tomorrow";
  return "custom";
}

export function resolveVisitStartsAt(
  timeSlot: TimeSlotKey,
  customTime: string,
  base = new Date(),
): Date | null {
  if (timeSlot === "next") {
    const now = new Date();
    const sameDay =
      base.getFullYear() === now.getFullYear() &&
      base.getMonth() === now.getMonth() &&
      base.getDate() === now.getDate();
    if (sameDay) return suggestNextSlot(now);
    return slotAtHour(10, base);
  }
  if (timeSlot === "10") return slotAtHour(10, base);
  if (timeSlot === "14") return slotAtHour(14, base);
  if (timeSlot === "16") return slotAtHour(16, base);
  return parseTodayTime(customTime, base);
}

export function resolveVisitPurpose(
  purposeKey: VisitPurposeKey | null,
  customPurpose: string,
): string | null {
  if (!purposeKey) return null;
  if (purposeKey === "other") {
    const trimmed = customPurpose.trim();
    return trimmed || null;
  }
  return purposeLabel(purposeKey);
}

export function VisitScheduleSection({
  contact,
  company,
  mode,
  onModeChange,
  dateKey,
  onDateKeyChange,
  timeSlot,
  onTimeSlotChange,
  customTime,
  onCustomTimeChange,
  purposeKey,
  onPurposeKeyChange,
  customPurpose,
  onCustomPurposeChange,
  title,
  onTitleChange,
  backlogVisitId,
  onChangeEntity,
}: Props) {
  const theme = useTheme();
  const router = useRouter();
  const todayKey = formatLocalDateKey();
  const isSelectedToday = dateKey === todayKey;

  const [dayPreset, setDayPreset] = useState<DayPreset>(() => inferDayPreset(dateKey));
  const [monthAnchorKey, setMonthAnchorKey] = useState(() => monthAnchorFromDateKey(dateKey));
  const [calendarExpanded, setCalendarExpanded] = useState(() => inferDayPreset(dateKey) === "custom");

  useEffect(() => {
    setDayPreset(inferDayPreset(dateKey));
    setMonthAnchorKey(monthAnchorFromDateKey(dateKey));
  }, [dateKey]);

  useEffect(() => {
    if (!isSelectedToday && timeSlot === "next") {
      onTimeSlotChange("10");
    }
  }, [isSelectedToday, timeSlot, onTimeSlotChange]);

  const scheduleBase = useMemo(() => parseDateKey(dateKey), [dateKey]);

  const startsAt = useMemo(
    () => (mode === "today" ? resolveVisitStartsAt(timeSlot, customTime, scheduleBase) : null),
    [mode, timeSlot, customTime, scheduleBase],
  );

  const timeChips: Array<{ key: TimeSlotKey; label: string }> = useMemo(() => {
    const chips: Array<{ key: TimeSlotKey; label: string }> = [];
    if (isSelectedToday) {
      const next = suggestNextSlot();
      chips.push({ key: "next", label: `${t("visits.slotNext")} · ${formatTimeHm(next)}` });
    }
    chips.push(
      { key: "10", label: "10:00" },
      { key: "14", label: "14:00" },
      { key: "16", label: "16:00" },
      { key: "custom", label: t("visits.slotCustom") },
    );
    return chips;
  }, [isSelectedToday]);

  const summaryText = useMemo(() => {
    if (!startsAt) return null;
    const time = formatTimeHm(startsAt);
    if (isSelectedToday) return t("visits.summaryToday", { time });
    return t("visits.summaryAt", { date: formatHumanDate(scheduleBase), time });
  }, [startsAt, isSelectedToday, scheduleBase]);

  const entityTitle = company ? company.name : contact ? contactDisplayName(contact) : "";
  const entitySub = company
    ? company.address ?? company.phone ?? ""
    : contact
      ? (contact.company?.name ?? contact.address ?? contact.phone ?? "")
      : "";

  function selectPreset(preset: DayPreset) {
    setDayPreset(preset);
    if (preset === "today") {
      onDateKeyChange(todayKey);
      setMonthAnchorKey(monthAnchorFromDateKey(todayKey));
      setCalendarExpanded(false);
      return;
    }
    if (preset === "tomorrow") {
      const tomorrow = formatLocalDateKey(addDays(new Date(), 1));
      onDateKeyChange(tomorrow);
      setMonthAnchorKey(monthAnchorFromDateKey(tomorrow));
      setCalendarExpanded(false);
      return;
    }
    setCalendarExpanded(true);
  }

  function selectCalendarDate(nextDateKey: string) {
    setDayPreset(inferDayPreset(nextDateKey));
    onDateKeyChange(nextDateKey);
    setMonthAnchorKey(monthAnchorFromDateKey(nextDateKey));
  }

  return (
    <View>
      <Card style={{ marginBottom: theme.spacing.md }}>
        <Text style={theme.typography.bodyMedium}>{entityTitle}</Text>
        {entitySub ? (
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
            {entitySub}
          </Text>
        ) : null}
        <AppButton
          label={t("common.change")}
          onPress={onChangeEntity}
          variant="ghost"
          style={{ marginTop: theme.spacing.sm, alignSelf: "flex-start" }}
        />
      </Card>

      {backlogVisitId && mode === "backlog" ? (
        <Card style={{ marginBottom: theme.spacing.md, borderColor: theme.colors.warning }}>
          <Text style={[theme.typography.caption, { color: theme.colors.warning }]}>
            {t("visits.hasBacklog")}
          </Text>
          <AppButton
            label={t("common.details")}
            onPress={() => router.push(`/visit/${backlogVisitId}`)}
            variant="ghost"
            style={{ marginTop: theme.spacing.xs, alignSelf: "flex-start" }}
          />
        </Card>
      ) : null}

      {backlogVisitId && mode === "today" ? (
        <Card style={{ marginBottom: theme.spacing.md, backgroundColor: theme.colors.primaryMuted }}>
          <Text style={[theme.typography.caption, { color: theme.colors.primaryText }]}>
            {t("visits.hasBacklog")}
          </Text>
          {summaryText ? (
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
              {summaryText}
            </Text>
          ) : null}
        </Card>
      ) : null}

      <SegmentedControl
        options={[
          { value: "today" as const, label: t("visits.modeScheduled") },
          { value: "backlog" as const, label: t("visits.modeBacklog") },
        ]}
        value={mode}
        onChange={onModeChange}
      />

      {mode === "today" ? (
        <>
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: 8 }]}>
            {t("visits.dateLabel")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <Chip
              label={t("visits.goToday")}
              selected={dayPreset === "today"}
              onPress={() => selectPreset("today")}
            />
            <Chip
              label={t("tasks.tomorrow")}
              selected={dayPreset === "tomorrow"}
              onPress={() => selectPreset("tomorrow")}
            />
            <Chip
              label={t("visit.pickDate")}
              selected={dayPreset === "custom"}
              onPress={() => selectPreset("custom")}
            />
          </View>

          {calendarExpanded ? (
            <VisitMonthCalendar
              monthAnchorKey={monthAnchorKey}
              selectedDateKey={dateKey}
              visitCounts={{}}
              onMonthChange={setMonthAnchorKey}
              onSelectDate={selectCalendarDate}
            />
          ) : dayPreset === "custom" ? (
            <Pressable onPress={() => setCalendarExpanded(true)} style={{ marginBottom: theme.spacing.md }}>
              <Text style={[theme.typography.body, { color: theme.colors.primary }]}>
                {formatHumanDate(scheduleBase)}
              </Text>
            </Pressable>
          ) : null}

          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: 8 }]}>
            {t("visits.timeLabel")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: theme.spacing.md }}>
            {timeChips.map((chip) => (
              <Chip
                key={chip.key}
                label={chip.label}
                selected={timeSlot === chip.key}
                onPress={() => onTimeSlotChange(chip.key)}
              />
            ))}
          </View>
          {timeSlot === "custom" ? (
            <TextField
              value={customTime}
              onChangeText={onCustomTimeChange}
              placeholder={t("visits.timePlaceholder")}
              keyboardType="numbers-and-punctuation"
              style={{ marginBottom: theme.spacing.md }}
            />
          ) : null}
          {summaryText ? (
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: theme.spacing.md }]}>
              {summaryText} · {t("visits.duration", { min: DEFAULT_VISIT_DURATION_MIN })}
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: theme.spacing.md }]}>
          {t("visits.summaryBacklog")}
        </Text>
      )}

      <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: 8 }]}>
        {t("visits.purposeOptional")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: theme.spacing.sm }}>
        {VISIT_PURPOSE_KEYS.map((key) => (
          <Chip
            key={key}
            label={purposeLabel(key)}
            selected={purposeKey === key}
            onPress={() => onPurposeKeyChange(purposeKey === key ? null : key)}
          />
        ))}
      </View>
      {purposeKey === "other" ? (
        <TextField
          value={customPurpose}
          onChangeText={onCustomPurposeChange}
          placeholder={t("visits.purposeOptional")}
          style={{ marginBottom: theme.spacing.md }}
        />
      ) : null}

      <TextField value={title} onChangeText={onTitleChange} placeholder={t("visits.titleOptional")} />
    </View>
  );
}
