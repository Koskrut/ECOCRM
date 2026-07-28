import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { VisitEntityPickerPanel } from "@/components/visit/VisitEntityPickerPanel";
import { VisitScheduleSection,
  resolveVisitPurpose,
  resolveVisitStartsAt,
  type TimeSlotKey,
} from "@/components/visit/VisitScheduleSection";
import { VisitLocationSection } from "@/components/visit/VisitLocationSection";
import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/context/auth-context";
import { companiesApi } from "@/lib/api/companies";
import { contactsApi } from "@/lib/api/contacts";
import { visitsApi } from "@/lib/api/visits";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import { formatHumanDate, formatLocalDateKey, parseDateKey } from "@/lib/date";
import {
  DEFAULT_VISIT_DURATION_MIN,
  buildEndsAt,
  formatTimeHm,
  suggestNextSlot,
  type VisitPurposeKey,
  type VisitScheduleMode,
} from "@/lib/visit-create-utils";
import {
  buildVisitLocationCreatePayload,
  defaultVisitLocationFromAddresses,
  visitLocationHasCoords,
  type VisitLocationValue,
} from "@/lib/visit-location.types";
import { resolveMapsApiKey } from "@/lib/maps-config";
import type { Company, CompanyAddress, Contact } from "@/types/crm";

type Step = 1 | 2;

export default function NewVisitScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const params = useLocalSearchParams<{
    contactId?: string;
    companyId?: string;
    schedule?: string;
    date?: string;
  }>();
  const preselectedContactId =
    typeof params.contactId === "string" && params.contactId ? params.contactId : null;
  const preselectedCompanyId =
    typeof params.companyId === "string" && params.companyId ? params.companyId : null;
  const initialDateKey =
    typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : formatLocalDateKey();
  const defaultToday = params.schedule !== "backlog";

  const [step, setStep] = useState<Step>(1);
  const [contact, setContact] = useState<Contact | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [backlogByContact, setBacklogByContact] = useState<Record<string, string>>({});
  const [backlogByCompany, setBacklogByCompany] = useState<Record<string, string>>({});

  const [mode, setMode] = useState<VisitScheduleMode>(defaultToday ? "today" : "backlog");
  const [dateKey, setDateKey] = useState(initialDateKey);
  const [timeSlot, setTimeSlot] = useState<TimeSlotKey>(() =>
    initialDateKey === formatLocalDateKey() ? "next" : "10",
  );
  const [customTime, setCustomTime] = useState(() => formatTimeHm(suggestNextSlot()));
  const [purposeKey, setPurposeKey] = useState<VisitPurposeKey | null>(null);
  const [customPurpose, setCustomPurpose] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [visitLocation, setVisitLocation] = useState<VisitLocationValue | null>(null);
  const [mapsApiKey, setMapsApiKey] = useState<string | null>(null);

  const entityType = company ? "company" : "contact";
  const backlogVisitId = contact
    ? backlogByContact[contact.id] ?? null
    : company
      ? backlogByCompany[company.id] ?? null
      : null;

  const loadBacklog = useCallback(async () => {
    if (!token) return;
    try {
      const res = await visitsApi.backlog(token);
      const byContact: Record<string, string> = {};
      const byCompany: Record<string, string> = {};
      for (const v of res) {
        if (v.contactId) byContact[v.contactId] = v.id;
        if (v.companyId && !v.contactId) byCompany[v.companyId] = v.id;
      }
      setBacklogByContact(byContact);
      setBacklogByCompany(byCompany);
    } catch {
      // non-blocking
    }
  }, [token]);

  const loadPreselected = useCallback(async () => {
    if (!token) return;
    try {
      if (preselectedContactId) {
        const c = await contactsApi.getById(token, preselectedContactId);
        setContact(c);
        setCompany(null);
        setStep(2);
        return;
      }
      if (preselectedCompanyId) {
        const c = await companiesApi.getById(token, preselectedCompanyId);
        setCompany(c);
        setContact(null);
        setStep(2);
      }
    } catch {
      // user can pick manually
    }
  }, [token, preselectedContactId, preselectedCompanyId]);

  useEffect(() => {
    void loadPreselected();
    void loadBacklog();
    if (token) void resolveMapsApiKey(token).then(setMapsApiKey);
  }, [loadPreselected, loadBacklog, token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const applyAddresses = (items: CompanyAddress[], entity: Contact | Company) => {
      if (cancelled) return;
      setVisitLocation((prev) => {
        if (prev && visitLocationHasCoords(prev)) return prev;
        const ready = items.filter((a) => a.hasCoordinates && a.lat != null && a.lng != null);
        if (ready.length > 0) return defaultVisitLocationFromAddresses(ready);
        if (entity.lat != null && entity.lng != null && entity.address?.trim()) {
          return {
            mode: "entity",
            addressId: "__legacy__",
            addressText: entity.address,
            lat: entity.lat,
            lng: entity.lng,
          };
        }
        return null;
      });
    };

    if (contact) {
      void contactsApi
        .listAddresses(token, contact.id)
        .then((items) => applyAddresses(items, contact))
        .catch(() => applyAddresses([], contact));
    } else if (company) {
      void companiesApi
        .getAddresses(token, company.id)
        .then((res) => applyAddresses(res.items ?? [], company))
        .catch(() => applyAddresses([], company));
    }

    return () => {
      cancelled = true;
    };
  }, [contact, company, token]);

  const scheduleBase = useMemo(() => parseDateKey(dateKey), [dateKey]);
  const isSelectedToday = dateKey === formatLocalDateKey();

  const startsAt = useMemo(
    () => (mode === "today" ? resolveVisitStartsAt(timeSlot, customTime, scheduleBase) : null),
    [mode, timeSlot, customTime, scheduleBase],
  );

  const purpose = useMemo(
    () => resolveVisitPurpose(purposeKey, customPurpose),
    [purposeKey, customPurpose],
  );

  const hasEntity = !!(contact || company);

  const canSubmit = useMemo(() => {
    if (!hasEntity || busy) return false;
    if (mode === "backlog" && backlogVisitId) return false;
    if (!visitLocation || !visitLocationHasCoords(visitLocation)) return false;
    if (mode === "today" && !startsAt) return false;
    return true;
  }, [hasEntity, busy, mode, backlogVisitId, startsAt, visitLocation]);

  const footerSummary = useMemo(() => {
    if (!hasEntity) return "";
    if (mode === "backlog") return t("visits.summaryBacklog");
    if (startsAt) {
      const time = formatTimeHm(startsAt);
      if (isSelectedToday) return t("visits.summaryToday", { time });
      return t("visits.summaryAt", { date: formatHumanDate(scheduleBase), time });
    }
    return t("visits.timeLabel");
  }, [hasEntity, mode, startsAt, isSelectedToday, scheduleBase]);

  const submitLabel = useMemo(() => {
    if (mode === "backlog") return t("visits.backlogAction");
    if (isSelectedToday) return t("visits.scheduleActionToday");
    return t("visits.scheduleAction");
  }, [mode, isSelectedToday]);

  function onSelectContact(c: Contact) {
    setContact(c);
    setCompany(null);
    setVisitLocation(null);
    setStep(2);
  }

  function onSelectCompany(c: Company) {
    setCompany(c);
    setContact(null);
    setVisitLocation(null);
    setStep(2);
  }

  function resetEntity() {
    setContact(null);
    setCompany(null);
    setVisitLocation(null);
    setStep(1);
  }

  async function onCreate() {
    if (!token || !hasEntity || !canSubmit || !visitLocation) return;
    setBusy(true);
    try {
      const body = {
        ...(contact
          ? { contactId: contact.id, phone: contact.phone || null }
          : { companyId: company!.id, phone: company!.phone || null }),
        title: title.trim() || null,
        purpose,
        ...buildVisitLocationCreatePayload(visitLocation, entityType),
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
        mode === "today"
          ? isSelectedToday
            ? t("visits.createdToday")
            : t("visits.createdScheduled", { date: formatHumanDate(scheduleBase) })
          : t("visits.createdBacklog");
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
            <VisitEntityPickerPanel
              token={token}
              onSelectContact={onSelectContact}
              onSelectCompany={onSelectCompany}
            />
          ) : null
        ) : hasEntity ? (
          <>
            <VisitLocationSection
              token={token!}
              contact={contact}
              company={company}
              value={visitLocation}
              onChange={setVisitLocation}
              mapsApiKey={mapsApiKey}
              disabled={busy}
            />
            <VisitScheduleSection
              contact={contact}
              company={company}
              mode={mode}
              onModeChange={setMode}
              dateKey={dateKey}
              onDateKeyChange={setDateKey}
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
              onChangeEntity={resetEntity}
            />
          </>
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
            label={submitLabel}
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
