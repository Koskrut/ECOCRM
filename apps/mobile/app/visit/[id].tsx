import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Switch,
  View,
} from "react-native";

import { EntityActionBar } from "@/components/EntityActionBar";
import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { Screen } from "@/components/ui/Screen";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { TextField } from "@/components/ui/TextField";
import { VisitProximityCard } from "@/components/visit/VisitProximityCard";
import { useAuth } from "@/context/auth-context";
import { useActiveWork } from "@/context/active-work-context";
import { apiFetch } from "@/lib/api";
import { visitsApi } from "@/lib/api/visits";
import { formatLocalDateKey } from "@/lib/date";
import { useTheme } from "@/lib/design/theme-context";
import { captureGpsForVisitRequest } from "@/lib/gps-capture";
import {
  gpsVerificationLabel,
  visitOutcomeLabel,
  VISIT_OUTCOMES,
  type VisitOutcome,
} from "@/lib/labels";
import { enqueueOfflineJob, isOfflineLikeError } from "@/lib/offline-queue";
import { t } from "@/lib/i18n";
import { visitLabel, visitPhone } from "@/lib/visit-utils";
import type { VisitSummary } from "@/types/crm";

export default function VisitDetailScreen() {
  const router = useRouter();
  const theme = useTheme();
  const raw = useLocalSearchParams<{ id?: string | string[] }>().id;
  const visitId = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  const { token } = useAuth();
  const { setActiveVisit } = useActiveWork();
  const dateKey = formatLocalDateKey();

  const [visit, setVisit] = useState<VisitSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleAt, setRescheduleAt] = useState("");
  const [outcome, setOutcome] = useState<VisitOutcome>("SUCCESS");
  const [resultNote, setResultNote] = useState("");
  const [nextActionEnabled, setNextActionEnabled] = useState(false);
  const [nextActionNote, setNextActionNote] = useState("");

  const load = useCallback(async () => {
    if (!token || !visitId) {
      setLoading(false);
      setVisit(null);
      return;
    }
    setLoading(true);
    try {
      const row = await apiFetch<VisitSummary>(`/visits/${visitId}`, { token });
      setVisit(row);
      if (row.status === "IN_PROGRESS") {
        setActiveVisit(row.id, visitLabel(row));
      }
    } finally {
      setLoading(false);
    }
  }, [token, visitId, setActiveVisit]);

  useEffect(() => {
    void load();
  }, [load]);

  async function gpsPayloadForRequest(): Promise<Record<string, unknown> | undefined> {
    return captureGpsForVisitRequest();
  }

  async function onStart() {
    if (!token || !visit) return;
    setActionBusy(true);
    try {
      const extra = await gpsPayloadForRequest();
      const updated = await apiFetch<VisitSummary>(`/visits/${visit.id}/start`, {
        method: "POST",
        body: JSON.stringify(extra ?? {}),
        token,
      });
      setVisit(updated);
      setActiveVisit(updated.id, visitLabel(updated));
      const vLabel = gpsVerificationLabel(updated.startGpsVerification ?? null);
      if (vLabel) Alert.alert(t("gps.title"), vLabel);
    } catch (e) {
      if (isOfflineLikeError(e)) {
        const extra = await gpsPayloadForRequest().catch(() => undefined);
        await enqueueOfflineJob("visitStart", { visitId: visit.id, body: extra ?? {} });
        Alert.alert(t("common.done"), t("common.offlineQueued"));
      } else {
        Alert.alert(t("common.error"), String(e));
      }
    } finally {
      setActionBusy(false);
    }
  }

  async function onComplete() {
    if (!token || !visit) return;
    if (!resultNote.trim()) {
      Alert.alert(t("visit.sectionResult"), t("visit.commentRequired"));
      return;
    }
    setActionBusy(true);
    try {
      const gps = await gpsPayloadForRequest();
      const payload: Record<string, unknown> = {
        outcome,
        resultNote: resultNote.trim(),
        ...gps,
      };
      if (nextActionEnabled) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(10, 0, 0, 0);
        payload.nextActionAt = tomorrow.toISOString();
        if (nextActionNote.trim()) payload.nextActionNote = nextActionNote.trim();
      }
      const done = await apiFetch<VisitSummary>(`/visits/${visit.id}/complete`, {
        method: "POST",
        body: JSON.stringify(payload),
        token,
      });
      setActiveVisit(null, null);
      const vLabel = gpsVerificationLabel(done.completeGpsVerification ?? null);
      Alert.alert(
        t("common.done"),
        vLabel ? `${t("visit.completed")}\n${vLabel}` : t("visit.completed"),
        [{ text: t("common.ok"), onPress: () => router.back() }],
      );
    } catch (e) {
      if (isOfflineLikeError(e)) {
        const gps = await gpsPayloadForRequest().catch(() => undefined);
        const payload: Record<string, unknown> = {
          outcome,
          resultNote: resultNote.trim(),
          ...(gps ?? {}),
        };
        if (nextActionEnabled) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(10, 0, 0, 0);
          payload.nextActionAt = tomorrow.toISOString();
          if (nextActionNote.trim()) payload.nextActionNote = nextActionNote.trim();
        }
        await enqueueOfflineJob("visitComplete", { visitId: visit.id, body: payload });
        Alert.alert(t("common.done"), t("common.offlineQueued"));
        router.back();
      } else {
        Alert.alert(t("common.error"), String(e));
      }
    } finally {
      setActionBusy(false);
    }
  }

  async function onReschedule() {
    if (!token || !visit || !rescheduleAt.trim()) return;
    setActionBusy(true);
    try {
      const startsAt = new Date(rescheduleAt.trim()).toISOString();
      const updated = await visitsApi.update(token, visit.id, { startsAt });
      setVisit(updated);
      setRescheduleOpen(false);
      Alert.alert(t("common.done"), t("visit.rescheduled"));
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  }

  if (loading || !visit) {
    return (
      <Screen gradient={false} padded={false}>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={[theme.typography.body, { color: theme.colors.textMuted, marginTop: theme.spacing.md }]}>
            {t("common.loading")}
          </Text>
        </View>
      </Screen>
    );
  }

  const scheduled = visit.status === "SCHEDULED";
  const active = visit.status === "IN_PROGRESS";
  const contactName = visit.contact
    ? [visit.contact.firstName, visit.contact.lastName].filter(Boolean).join(" ")
    : null;

  return (
    <Screen padded={false} edges={["left", "right", "bottom"]}>
      <KeyboardAwareScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.md },
        ]}>
        <Text style={theme.typography.title}>{visitLabel(visit)}</Text>

        <SectionTitle title={t("visit.preparation")} />
        <Text style={[theme.typography.body, { color: theme.colors.textMuted, lineHeight: 22 }]}>
          {t("visit.status")}: {visit.status}
          {"\n"}
          {visit.addressText ?? t("visit.noAddress")}
        </Text>
        {contactName ? (
          <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>{contactName}</Text>
        ) : null}
        {visit.company?.name ? (
          <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>{visit.company.name}</Text>
        ) : null}
        {visit.purpose ? (
          <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
            {t("visit.purpose")}: {visit.purpose}
          </Text>
        ) : null}

        {visit.lat != null && visit.lng != null ? <VisitProximityCard visit={visit} /> : null}

        <EntityActionBar
          token={token!}
          date={dateKey}
          phone={visitPhone(visit)}
          visitId={visit.id}
          contactId={visit.contactId ?? visit.contact?.id}
          lat={visit.lat}
          lng={visit.lng}
        />

        {visit.contact?.id ? (
          <AppButton
            label={t("visit.openContact")}
            onPress={() => router.push(`/contact/${visit.contact!.id}`)}
            variant="secondary"
            fullWidth
          />
        ) : null}

        <AppButton
          label={t("tasks.reschedule")}
          onPress={() => {
            setRescheduleAt(visit.startsAt ?? "");
            setRescheduleOpen(true);
          }}
          variant="secondary"
          fullWidth
        />

        <AppButton
          label={t("visit.mapDay")}
          onPress={() => router.push("/map")}
          variant="secondary"
          fullWidth
        />

        {(visit.startGpsVerification ?? visit.completeGpsVerification) ? (
          <Card>
            {visit.startGpsVerification ? (
              <Text style={theme.typography.body}>
                {t("visit.startGps")}: {gpsVerificationLabel(visit.startGpsVerification)}
              </Text>
            ) : null}
            {visit.completeGpsVerification ? (
              <Text style={[theme.typography.body, visit.startGpsVerification ? { marginTop: 6 } : undefined]}>
                {t("visit.completeGps")}: {gpsVerificationLabel(visit.completeGpsVerification)}
              </Text>
            ) : null}
          </Card>
        ) : null}

        {scheduled ? (
          <>
            <SectionTitle title={t("visit.sectionVisit")} />
            <AppButton
              label={t("visit.start")}
              onPress={() => void onStart()}
              loading={actionBusy}
              fullWidth
            />
          </>
        ) : null}

        {active ? (
          <>
            <SectionTitle title={t("visit.sectionResult")} />
            <View style={styles.row}>
              {VISIT_OUTCOMES.map((code) => (
                <Chip
                  key={code}
                  label={visitOutcomeLabel(code)}
                  selected={outcome === code}
                  onPress={() => setOutcome(code)}
                />
              ))}
            </View>

            <TextField
              label={t("visit.comment")}
              value={resultNote}
              onChangeText={setResultNote}
              placeholder={t("visit.commentPlaceholder")}
              multiline
              style={{ minHeight: 100 }}
            />

            <View style={styles.nextRow}>
              <Text style={theme.typography.bodyMedium}>{t("visit.nextAction")}</Text>
              <Switch
                value={nextActionEnabled}
                onValueChange={setNextActionEnabled}
                trackColor={{ false: theme.colors.border, true: theme.colors.primaryMuted }}
                thumbColor={nextActionEnabled ? theme.colors.primary : theme.colors.surfaceMuted}
              />
            </View>
            {nextActionEnabled ? (
              <TextField
                value={nextActionNote}
                onChangeText={setNextActionNote}
                placeholder={t("visit.nextActionNotePlaceholder")}
                style={{ minHeight: 56 }}
              />
            ) : null}

            <SectionTitle title={t("visit.sectionComplete")} />
            <AppButton
              label={t("visit.complete")}
              onPress={() => void onComplete()}
              loading={actionBusy}
              fullWidth
            />
          </>
        ) : visit.status === "DONE" ? (
          <>
            <Text style={[theme.typography.body, { color: theme.colors.textMuted, marginTop: theme.spacing.md }]}>
              {t("visit.completed")}
            </Text>
            <AppButton
              label={t("orders.create")}
              onPress={() =>
                router.push(
                  `/orders/new?contactId=${encodeURIComponent(visit.contactId ?? visit.contact?.id ?? "")}`,
                )
              }
              fullWidth
            />
            <AppButton
              label={t("visit.planFollowUp")}
              onPress={() =>
                router.push(
                  `/tasks/new?contactId=${encodeURIComponent(visit.contactId ?? visit.contact?.id ?? "")}`,
                )
              }
              variant="secondary"
              fullWidth
            />
          </>
        ) : null}
      </KeyboardAwareScrollView>

      <BottomSheet
        visible={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        title={t("tasks.rescheduleTitle")}>
        <TextField
          value={rescheduleAt}
          onChangeText={setRescheduleAt}
          placeholder={t("visit.reschedulePlaceholder")}
        />
        <AppButton
          label={t("common.save")}
          onPress={() => void onReschedule()}
          loading={actionBusy}
          fullWidth
        />
        <AppButton
          label={t("common.cancel")}
          onPress={() => setRescheduleOpen(false)}
          variant="ghost"
          fullWidth
          style={{ marginTop: theme.spacing.sm }}
        />
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  scroll: { paddingTop: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  nextRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
});
