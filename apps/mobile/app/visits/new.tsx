import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ContactPickerPanel } from "@/components/visit/ContactPickerPanel";
import {
  VisitScheduleSection,
  resolveVisitPurpose,
  resolveVisitStartsAt,
  type TimeSlotKey,
} from "@/components/visit/VisitScheduleSection";
import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/context/auth-context";
import { contactsApi } from "@/lib/api/contacts";
import { visitsApi } from "@/lib/api/visits";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import { parseDateKey } from "@/lib/date";
import {
  DEFAULT_VISIT_DURATION_MIN,
  buildEndsAt,
  contactHasCoords,
  formatTimeHm,
  suggestNextSlot,
  type VisitPurposeKey,
  type VisitScheduleMode,
} from "@/lib/visit-create-utils";
import type { Contact } from "@/types/crm";

type Step = 1 | 2;

export default function NewVisitScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const params = useLocalSearchParams<{ contactId?: string; schedule?: string; date?: string }>();
  const preselectedContactId =
    typeof params.contactId === "string" && params.contactId ? params.contactId : null;
  const scheduleDateKey =
    typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : null;
  const defaultToday = params.schedule !== "backlog";

  const [step, setStep] = useState<Step>(1);
  const [contact, setContact] = useState<Contact | null>(null);
  const [backlogByContact, setBacklogByContact] = useState<Record<string, string>>({});

  const [mode, setMode] = useState<VisitScheduleMode>(defaultToday ? "today" : "backlog");
  const [timeSlot, setTimeSlot] = useState<TimeSlotKey>("next");
  const [customTime, setCustomTime] = useState(() => formatTimeHm(suggestNextSlot()));
  const [purposeKey, setPurposeKey] = useState<VisitPurposeKey | null>(null);
  const [customPurpose, setCustomPurpose] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const backlogVisitId = contact ? backlogByContact[contact.id] ?? null : null;

  const loadBacklog = useCallback(async () => {
    if (!token) return;
    try {
      const res = await visitsApi.backlog(token);
      const map: Record<string, string> = {};
      for (const v of res) {
        if (v.contactId) map[v.contactId] = v.id;
      }
      setBacklogByContact(map);
    } catch {
      // non-blocking
    }
  }, [token]);

  const loadPreselected = useCallback(async () => {
    if (!token || !preselectedContactId) return;
    try {
      const c = await contactsApi.getById(token, preselectedContactId);
      setContact(c);
      setStep(2);
    } catch {
      // user can pick manually
    }
  }, [token, preselectedContactId]);

  useEffect(() => {
    void loadPreselected();
    void loadBacklog();
  }, [loadPreselected, loadBacklog]);

  const scheduleBase = useMemo(
    () => (scheduleDateKey ? parseDateKey(scheduleDateKey) : new Date()),
    [scheduleDateKey],
  );

  const startsAt = useMemo(
    () => (mode === "today" ? resolveVisitStartsAt(timeSlot, customTime, scheduleBase) : null),
    [mode, timeSlot, customTime, scheduleBase],
  );

  const purpose = useMemo(
    () => resolveVisitPurpose(purposeKey, customPurpose),
    [purposeKey, customPurpose],
  );

  const canSubmit = useMemo(() => {
    if (!contact || busy) return false;
    if (mode === "backlog" && backlogVisitId) return false;
    if (mode === "today") {
      if (!contactHasCoords(contact)) return false;
      if (!startsAt) return false;
    }
    return true;
  }, [contact, busy, mode, backlogVisitId, startsAt]);

  const footerSummary = useMemo(() => {
    if (!contact) return "";
    if (mode === "backlog") return t("visits.summaryBacklog");
    if (startsAt) return t("visits.summaryToday", { time: formatTimeHm(startsAt) });
    return t("visits.timeLabel");
  }, [contact, mode, startsAt]);

  function onSelectContact(c: Contact) {
    setContact(c);
    setStep(2);
  }

  async function onCreate() {
    if (!token || !contact || !canSubmit) return;
    setBusy(true);
    try {
      const body = {
        contactId: contact.id,
        title: title.trim() || null,
        phone: contact.phone || null,
        addressText: contact.address ?? null,
        lat: contact.lat ?? null,
        lng: contact.lng ?? null,
        purpose,
      };

      let visitId: string;

      if (backlogVisitId && mode === "today" && startsAt) {
        const endsAt = buildEndsAt(startsAt, DEFAULT_VISIT_DURATION_MIN);
        const v = await visitsApi.update(token, backlogVisitId, {
          status: "SCHEDULED",
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          durationMin: DEFAULT_VISIT_DURATION_MIN,
          title: body.title,
          purpose: body.purpose,
        });
        visitId = v.id;
      } else {
        const v = await visitsApi.createWithSchedule(token, {
          ...body,
          scheduleToday: mode === "today",
          startsAt: startsAt ?? undefined,
          durationMin: DEFAULT_VISIT_DURATION_MIN,
        });
        visitId = v.id;
      }

      const message =
        mode === "today" ? t("visits.createdToday") : t("visits.createdBacklog");
      Alert.alert(t("common.done"), message, [
        {
          text: t("common.ok"),
          onPress: () =>
            router.replace(mode === "today" ? "/(tabs)" : `/visit/${visitId}`),
        },
      ]);
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen padded={false} gradient={false}>
      <View style={styles.stepRow}>
        {([1, 2] as const).map((n) => (
          <View key={n} style={styles.stepItem}>
            <View
              style={[
                styles.stepDot,
                {
                  backgroundColor:
                    step >= n ? theme.colors.primary : theme.colors.surfaceMuted,
                },
              ]}
            />
            <Text
              style={[
                theme.typography.caption,
                {
                  color: step >= n ? theme.colors.primaryText : theme.colors.textMuted,
                  marginTop: 4,
                },
              ]}>
              {n === 1 ? t("visits.stepClient") : t("visits.stepSchedule")}
            </Text>
          </View>
        ))}
      </View>

      <KeyboardAwareScrollView
        extraBottomInset={
          step === 2 ? theme.layout.stickyFooterHeight + insets.bottom : theme.spacing.xxxl
        }
        contentContainerStyle={[
          styles.scroll,
          { paddingHorizontal: theme.spacing.lg },
        ]}>
        {step === 1 ? (
          token ? (
            <ContactPickerPanel token={token} onSelect={onSelectContact} />
          ) : null
        ) : contact ? (
          <VisitScheduleSection
            contact={contact}
            mode={mode}
            onModeChange={setMode}
            timeSlot={timeSlot}
            onTimeSlotChange={setTimeSlot}
            customTime={customTime}
            onCustomTimeChange={setCustomTime}
            purposeKey={purposeKey}
            onPurposeKeyChange={setPurposeKey}
            customPurpose={customPurpose}
            onCustomPurposeChange={setCustomPurpose}
            title={title}
            onTitleChange={setTitle}
            backlogVisitId={backlogVisitId}
            onChangeContact={() => {
              setContact(null);
              setStep(1);
            }}
          />
        ) : null}
      </KeyboardAwareScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: Math.max(insets.bottom, theme.spacing.md),
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.md,
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.bgElevated,
            display: step === 1 ? "none" : "flex",
          },
        ]}>
        {step === 2 && footerSummary ? (
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: 8 }]}>
            {footerSummary}
          </Text>
        ) : null}
        <View style={styles.footerActions}>
          <AppButton
            label={t("common.back")}
            onPress={() => setStep(1)}
            variant="secondary"
            style={styles.footerBtn}
          />
          <AppButton
            label={mode === "today" ? t("visits.scheduleAction") : t("visits.backlogAction")}
            onPress={() => void onCreate()}
            loading={busy}
            disabled={!canSubmit}
            style={styles.footerBtn}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: 8 },
  stepRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 32,
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 16,
  },
  stepItem: { alignItems: "center" },
  stepDot: { width: 8, height: 8, borderRadius: 4 },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerActions: { flexDirection: "row", gap: 8 },
  footerBtn: { flex: 1 },
});
