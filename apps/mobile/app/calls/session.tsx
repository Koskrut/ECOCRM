import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { CallOutcomeSheet } from "@/components/CallOutcomeSheet";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { useActiveWork } from "@/context/active-work-context";
import {
  manualCallingApi,
  type ManualCallOutcome,
  type PlaybookSection,
  type SessionDetail,
} from "@/lib/api/manual-calling";
import { useTheme } from "@/lib/design/theme-context";
import { spacing } from "@/lib/design/tokens";
import { t } from "@/lib/i18n";
import { openPhone } from "@/lib/linking-actions";

export default function CallSessionScreen() {
  const router = useRouter();
  const theme = useTheme();
  const raw = useLocalSearchParams<{ id?: string | string[] }>().id;
  const sessionId = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  const { token } = useAuth();
  const { setCallSession } = useActiveWork();

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [playbook, setPlaybook] = useState<PlaybookSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const dialPending = useRef(false);

  const load = useCallback(async () => {
    if (!token || !sessionId) return;
    setLoading(true);
    try {
      const [sessRes, pbRes] = await Promise.all([
        manualCallingApi.getSession(token, sessionId),
        manualCallingApi.getPlaybook(token).catch(() => ({ sections: [] })),
      ]);
      setSession(sessRes.session);
      setPlaybook(pbRes.sections ?? []);
      const label = sessRes.session.contact
        ? `${sessRes.session.contact.firstName} ${sessRes.session.contact.lastName}`.trim()
        : sessRes.session.lead?.fullName ?? "дзвінок";
      setCallSession(sessRes.session.status === "OPEN" ? sessRes.session.id : null, label);
    } finally {
      setLoading(false);
    }
  }, [token, sessionId, setCallSession]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && dialPending.current) {
        dialPending.current = false;
        setOutcomeOpen(true);
      }
    });
    return () => sub.remove();
  }, []);

  async function onDial() {
    const phone =
      session?.contact?.phone ??
      session?.lead?.phone ??
      session?.targetPhoneNormalized ??
      null;
    if (!phone) {
      Alert.alert(t("actions.noPhone"));
      return;
    }
    dialPending.current = true;
    await openPhone(phone);
  }

  async function onComplete(outcome: ManualCallOutcome, note: string, callbackAt?: string) {
    if (!token || !session) return;
    setSubmitting(true);
    try {
      await manualCallingApi.completeSession(token, session.id, {
        outcome,
        note: note || undefined,
        callbackAt,
        idempotencyKey: `${session.id}-${outcome}`,
      });
      setCallSession(null, null);
      setOutcomeOpen(false);
      Alert.alert(t("common.done"), t("calls.outcomeTitle"), [
        { text: t("common.ok"), onPress: () => router.replace("/(tabs)/work") },
      ]);
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !session) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={{ marginTop: 12 }}>{t("common.loading")}</Text>
      </View>
    );
  }

  const name = session.contact
    ? `${session.contact.firstName} ${session.contact.lastName}`.trim()
    : session.lead?.fullName ?? session.lead?.firstName ?? "—";
  const phone =
    session.contact?.phone ?? session.lead?.phone ?? session.targetPhoneNormalized ?? "—";

  return (
    <>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.name, { color: theme.colors.text }]}>{name}</Text>
        <Text style={[styles.phone, { color: theme.colors.call }]}>{phone}</Text>
        {session.contact?.company?.name || session.lead?.company?.name ? (
          <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
            {session.contact?.company?.name ?? session.lead?.company?.name}
          </Text>
        ) : null}

        <PrimaryButton
          label={t("calls.dial")}
          onPress={() => void onDial()}
          style={{ marginTop: spacing.xl }}
        />

        {playbook.length > 0 ? (
          <>
            <Text style={[styles.section, { color: theme.colors.text }]}>{t("calls.playbook")}</Text>
            {playbook.map((sec) => (
              <View
                key={sec.id}
                style={[styles.playbook, { backgroundColor: theme.colors.surfaceMuted }]}>
                <Text style={[styles.playbookTitle, { color: theme.colors.text }]}>{sec.title}</Text>
                {sec.bullets.map((b, i) => (
                  <Text key={i} style={[styles.bullet, { color: theme.colors.text }]}>
                    • {b}
                  </Text>
                ))}
              </View>
            ))}
          </>
        ) : null}

        <Pressable
          onPress={() => setOutcomeOpen(true)}
          style={[styles.outcomeBtn, { borderColor: theme.colors.call }]}
          accessibilityRole="button">
          <Text style={[styles.outcomeBtnText, { color: theme.colors.call }]}>{t("calls.outcomeTitle")}</Text>
        </Pressable>
      </ScrollView>

      <CallOutcomeSheet
        visible={outcomeOpen}
        onClose={() => setOutcomeOpen(false)}
        onSubmit={(o, n, c) => void onComplete(o, n, c)}
        loading={submitting}
      />
    </>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  scroll: { padding: spacing.lg, paddingBottom: 48 },
  name: { fontSize: 26, fontWeight: "700" },
  phone: { fontSize: 22, marginTop: 8 },
  meta: { marginTop: 8 },
  section: { fontWeight: "700", fontSize: 16, marginTop: spacing.xl, marginBottom: spacing.sm },
  playbook: {
    padding: spacing.md,
    borderRadius: 10,
    marginBottom: spacing.sm,
  },
  playbookTitle: { fontWeight: "700", marginBottom: 6 },
  bullet: { lineHeight: 20 },
  outcomeBtn: {
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  outcomeBtnText: { fontWeight: "700" },
});
