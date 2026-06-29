import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import { View } from "react-native";

import { contactDisplayName } from "@/components/ContactRow";
import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TextField } from "@/components/ui/TextField";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import {
  DEFAULT_VISIT_DURATION_MIN,
  VISIT_PURPOSE_KEYS,
  contactHasCoords,
  formatTimeHm,
  parseTodayTime,
  slotAtHour,
  suggestNextSlot,
  type VisitPurposeKey,
  type VisitScheduleMode,
} from "@/lib/visit-create-utils";
import type { Contact } from "@/types/crm";

export type TimeSlotKey = "next" | "10" | "14" | "16" | "custom";

type Props = {
  contact: Contact;
  mode: VisitScheduleMode;
  onModeChange: (mode: VisitScheduleMode) => void;
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
  onChangeContact: () => void;
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
  mode,
  onModeChange,
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
  onChangeContact,
}: Props) {
  const theme = useTheme();
  const router = useRouter();
  const hasCoords = contactHasCoords(contact);
  const startsAt = useMemo(
    () => (mode === "today" ? resolveVisitStartsAt(timeSlot, customTime) : null),
    [mode, timeSlot, customTime],
  );

  const timeChips: Array<{ key: TimeSlotKey; label: string }> = useMemo(() => {
    const next = suggestNextSlot();
    return [
      { key: "next", label: `${t("visits.slotNext")} · ${formatTimeHm(next)}` },
      { key: "10", label: "10:00" },
      { key: "14", label: "14:00" },
      { key: "16", label: "16:00" },
      { key: "custom", label: t("visits.slotCustom") },
    ];
  }, []);

  return (
    <View>
      <Card style={{ marginBottom: theme.spacing.md }}>
        <Text style={theme.typography.bodyMedium}>{contactDisplayName(contact)}</Text>
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
          {contact.company?.name ?? contact.address ?? contact.phone ?? ""}
        </Text>
        <AppButton
          label={t("common.change")}
          onPress={onChangeContact}
          variant="ghost"
          style={{ marginTop: theme.spacing.sm, alignSelf: "flex-start" }}
        />
      </Card>

      {!hasCoords ? (
        <Card style={{ marginBottom: theme.spacing.md, borderColor: theme.colors.warning }}>
          <Text style={[theme.typography.caption, { color: theme.colors.warning }]}>
            {t("visits.noCoords")}
          </Text>
          <AppButton
            label={t("clients.edit")}
            onPress={() => router.push(`/contact/${contact.id}/edit`)}
            variant="ghost"
            style={{ marginTop: theme.spacing.xs, alignSelf: "flex-start" }}
          />
        </Card>
      ) : null}

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
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
            {t("visits.summaryToday", { time: startsAt ? formatTimeHm(startsAt) : "—" })}
          </Text>
        </Card>
      ) : null}

      <SegmentedControl
        options={[
          { value: "today" as const, label: t("visits.modeToday") },
          { value: "backlog" as const, label: t("visits.modeBacklog") },
        ]}
        value={mode}
        onChange={onModeChange}
      />

      {mode === "today" ? (
        <>
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
          {startsAt ? (
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: theme.spacing.md }]}>
              {t("visits.summaryToday", { time: formatTimeHm(startsAt) })} ·{" "}
              {t("visits.duration", { min: DEFAULT_VISIT_DURATION_MIN })}
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
