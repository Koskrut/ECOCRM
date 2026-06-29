import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { EntityActionBar } from "@/components/EntityActionBar";
import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Screen } from "@/components/ui/Screen";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { StatusPill } from "@/components/ui/StatusPill";
import { useAuth } from "@/context/auth-context";
import { useModules } from "@/context/modules-context";
import { leadsApi, type Lead } from "@/lib/api/leads";
import { manualCallingApi } from "@/lib/api/manual-calling";
import { formatLocalDateKey } from "@/lib/date";
import { useTheme } from "@/lib/design/theme-context";
import { leadStatusLabel } from "@/lib/labels";
import { t } from "@/lib/i18n";

const STATUSES = ["NEW", "IN_PROGRESS", "WON", "NOT_TARGET", "LOST", "SPAM"] as const;

export default function LeadDetailScreen() {
  const router = useRouter();
  const theme = useTheme();
  const raw = useLocalSearchParams<{ id?: string | string[] }>().id;
  const leadId = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  const { token } = useAuth();
  const { manualCallingEnabled } = useModules();
  const dateKey = formatLocalDateKey();

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token || !leadId) return;
    setLoading(true);
    try {
      const row = await leadsApi.getById(token, leadId);
      setLead(row);
    } finally {
      setLoading(false);
    }
  }, [token, leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onStatus(status: string) {
    if (!token || !lead) return;
    setBusy(true);
    try {
      const updated = await leadsApi.updateStatus(token, lead.id, { status });
      setLead(updated);
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onConvert() {
    if (!token || !lead) return;
    setBusy(true);
    try {
      const res = await leadsApi.convert(token, lead.id, { contactMode: "create" });
      Alert.alert(t("common.done"), t("leads.converted"), [
        {
          text: t("common.ok"),
          onPress: () => {
            const contact = res.contact as { id?: string } | null;
            if (contact?.id) router.push(`/contact/${contact.id}`);
          },
        },
      ]);
      setLead(res.lead);
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onEnqueue() {
    if (!token || !lead) return;
    try {
      await manualCallingApi.enqueue(token, { leadId: lead.id });
      Alert.alert(t("common.done"), t("leads.enqueue"));
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    }
  }

  if (loading || !lead) {
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

  const name =
    lead.name ?? [lead.firstName, lead.lastName].filter(Boolean).join(" ") ?? lead.phone ?? "—";

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxxl },
        ]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        <View style={styles.titleRow}>
          <Text style={[theme.typography.title, styles.title]}>{name}</Text>
          <StatusPill label={leadStatusLabel(lead.status)} tone="info" />
        </View>

        {token ? (
          <EntityActionBar
            token={token}
            date={dateKey}
            phone={lead.phone}
            leadId={lead.id}
            compact
          />
        ) : null}

        {lead.phone ? (
          <Text style={[theme.typography.body, { color: theme.colors.textMuted, marginTop: theme.spacing.sm }]}>
            {lead.phone}
          </Text>
        ) : null}
        {lead.email ? (
          <Text style={[theme.typography.body, { color: theme.colors.textMuted, marginTop: theme.spacing.sm }]}>
            {lead.email}
          </Text>
        ) : null}
        {lead.companyName ? (
          <Text style={[theme.typography.body, { color: theme.colors.textMuted, marginTop: theme.spacing.sm }]}>
            {lead.companyName}
          </Text>
        ) : null}
        {lead.message ? (
          <Card style={{ marginTop: theme.spacing.md }}>
            <Text style={theme.typography.body}>{lead.message}</Text>
          </Card>
        ) : null}
        {lead.comment ? (
          <Card style={{ marginTop: theme.spacing.md }}>
            <Text style={theme.typography.body}>{lead.comment}</Text>
          </Card>
        ) : null}

        <SectionTitle title={t("leads.changeStatus")} />
        <View style={styles.chips}>
          {STATUSES.map((s) => (
            <Chip
              key={s}
              label={leadStatusLabel(s)}
              selected={lead.status === s}
              onPress={busy ? undefined : () => void onStatus(s)}
            />
          ))}
        </View>

        <AppButton
          label={t("leads.convert")}
          onPress={() => void onConvert()}
          loading={busy}
          fullWidth
          style={{ marginTop: theme.spacing.lg }}
        />
        {manualCallingEnabled ? (
          <AppButton
            label={t("leads.enqueue")}
            onPress={() => void onEnqueue()}
            variant="secondary"
            fullWidth
            style={{ marginTop: theme.spacing.sm }}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  scroll: { paddingTop: 8 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  title: { flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
});
