import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";

import { QuickActions } from "@/components/QuickActions";
import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { apiFetch } from "@/lib/api";
import { formatLocalDateKey } from "@/lib/date";
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
  const raw = useLocalSearchParams<{ id?: string | string[] }>().id;
  const visitId = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  const { token } = useAuth();
  const dateKey = formatLocalDateKey();

  const [visit, setVisit] = useState<VisitSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
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
    } finally {
      setLoading(false);
    }
  }, [token, visitId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function gpsPayloadForRequest(): Promise<Record<string, unknown> | undefined> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("gps.title"), t("gps.denied"));
      return { permissionState: status };
    }
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const c = pos.coords;
      return {
        lat: c.latitude,
        lng: c.longitude,
        accuracyM:
          typeof c.accuracy === "number" && Number.isFinite(c.accuracy) ? c.accuracy : undefined,
        clientRecordedAt: new Date().toISOString(),
        permissionState: status,
        locationProvider: Platform.select({
          ios: "ios-core",
          android: "android-fused",
          default: "expo-location",
        }),
      };
    } catch {
      Alert.alert(t("gps.title"), t("gps.failed"));
      return { permissionState: status };
    }
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
      const vLabel = gpsVerificationLabel(updated.startGpsVerification ?? null);
      if (vLabel) Alert.alert("GPS", vLabel);
    } catch (e) {
      if (isOfflineLikeError(e)) {
        const extra = await gpsPayloadForRequest().catch(() => undefined);
        await enqueueOfflineJob("visitStart", { visitId: visit.id, body: extra ?? {} });
        Alert.alert(t("common.done"), "Дію додано в офлайн-чергу.");
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
        Alert.alert(t("common.done"), "Дію додано в офлайн-чергу.");
        router.back();
      } else {
        Alert.alert(t("common.error"), String(e));
      }
    } finally {
      setActionBusy(false);
    }
  }

  if (loading || !visit) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={{ marginTop: 12 }}>{t("common.loading")}</Text>
      </View>
    );
  }

  const scheduled = visit.status === "SCHEDULED";
  const active = visit.status === "IN_PROGRESS";
  const contactName = visit.contact
    ? [visit.contact.firstName, visit.contact.lastName].filter(Boolean).join(" ")
    : null;

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>{visitLabel(visit)}</Text>

      <Text style={styles.section}>{t("visit.preparation")}</Text>
      <Text style={styles.meta}>
        {t("visit.status")}: {visit.status}
        {"\n"}
        {visit.addressText ?? t("visit.noAddress")}
      </Text>
      {contactName ? <Text style={styles.meta}>{contactName}</Text> : null}
      {visit.company?.name ? <Text style={styles.meta}>{visit.company.name}</Text> : null}
      {visit.purpose ? (
        <Text style={styles.meta}>
          {t("visit.purpose")}: {visit.purpose}
        </Text>
      ) : null}

      <QuickActions
        token={token!}
        date={dateKey}
        phone={visitPhone(visit)}
        visitId={visit.id}
        lat={visit.lat}
        lng={visit.lng}
      />

      {visit.contact?.id ? (
        <Pressable
          onPress={() => router.push(`/contact/${visit.contact!.id}`)}
          style={({ pressed }) => [styles.btnOutline, pressed && styles.pressed]}
          accessibilityRole="button">
          <Text style={styles.btnOutlineText}>{t("visit.openContact")}</Text>
        </Pressable>
      ) : null}

      <Pressable
        onPress={() => router.push("/(tabs)/map")}
        style={({ pressed }) => [styles.btnOutline, pressed && styles.pressed]}
        accessibilityRole="button">
        <Text style={styles.btnOutlineText}>{t("visit.mapDay")}</Text>
      </Pressable>

      {(visit.startGpsVerification ?? visit.completeGpsVerification) ? (
        <View style={styles.box}>
          {visit.startGpsVerification ? (
            <Text>
              {t("visit.startGps")}: {gpsVerificationLabel(visit.startGpsVerification)}
            </Text>
          ) : null}
          {visit.completeGpsVerification ? (
            <Text>
              {t("visit.completeGps")}: {gpsVerificationLabel(visit.completeGpsVerification)}
            </Text>
          ) : null}
        </View>
      ) : null}

      {scheduled ? (
        <>
          <Text style={styles.section}>{t("visit.sectionVisit")}</Text>
          <Pressable
            disabled={actionBusy}
            onPress={onStart}
            style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]}
            accessibilityRole="button">
            <Text style={styles.btnPrimaryText}>
              {actionBusy ? "…" : t("visit.start")}
            </Text>
          </Pressable>
        </>
      ) : null}

      {active ? (
        <>
          <Text style={styles.section}>{t("visit.sectionResult")}</Text>
          <View style={styles.row}>
            {VISIT_OUTCOMES.map((code) => (
              <Pressable
                key={code}
                onPress={() => setOutcome(code)}
                style={[styles.chip, outcome === code && styles.chipActive]}
                accessibilityRole="button">
                <Text>{visitOutcomeLabel(code)}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionTitle}>{t("visit.comment")}</Text>
          <TextInput
            value={resultNote}
            onChangeText={setResultNote}
            multiline
            placeholder={t("visit.commentPlaceholder")}
            placeholderTextColor="#888"
            style={styles.note}
          />

          <View style={styles.nextRow}>
            <Text style={styles.sectionTitle}>{t("visit.nextAction")}</Text>
            <Switch value={nextActionEnabled} onValueChange={setNextActionEnabled} />
          </View>
          {nextActionEnabled ? (
            <TextInput
              value={nextActionNote}
              onChangeText={setNextActionNote}
              placeholder={t("visit.nextActionNotePlaceholder")}
              placeholderTextColor="#888"
              style={styles.noteSmall}
            />
          ) : null}

          <Text style={styles.section}>{t("visit.sectionComplete")}</Text>
          <Pressable
            disabled={actionBusy}
            onPress={onComplete}
            style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]}
            accessibilityRole="button">
            <Text style={styles.btnPrimaryText}>
              {actionBusy ? "…" : t("visit.complete")}
            </Text>
          </Pressable>
        </>
      ) : visit.status === "DONE" ? (
        <Text style={styles.done}>{t("visit.completed")}</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  scroll: { padding: 20, gap: 14, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: "700" },
  section: { fontWeight: "700", fontSize: 16, marginTop: 8 },
  meta: { fontSize: 15, opacity: 0.85, lineHeight: 22 },
  box: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: "rgba(128,128,128,0.12)",
    gap: 6,
  },
  btnOutline: {
    borderWidth: 1,
    borderColor: "#059669",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "rgba(5,150,105,0.08)",
  },
  btnOutlineText: { color: "#047857", fontWeight: "600", fontSize: 15 },
  btnPrimary: {
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnPrimaryText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  pressed: { opacity: 0.85 },
  sectionTitle: { fontWeight: "600", fontSize: 16, marginTop: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  chipActive: { backgroundColor: "#dbeafe", borderColor: "#2563eb" },
  note: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    minHeight: 100,
    padding: 12,
    textAlignVertical: "top",
    fontSize: 16,
  },
  noteSmall: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    minHeight: 56,
    padding: 12,
    fontSize: 15,
  },
  nextRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  done: { fontSize: 16, opacity: 0.8, marginTop: 16 },
});
