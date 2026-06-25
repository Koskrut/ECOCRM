import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { EntityActionBar } from "@/components/EntityActionBar";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { StatusPill } from "@/components/ui/StatusPill";
import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { useModules } from "@/context/modules-context";
import { leadsApi, type Lead } from "@/lib/api/leads";
import { manualCallingApi } from "@/lib/api/manual-calling";
import { formatLocalDateKey } from "@/lib/date";
import { spacing } from "@/lib/design/tokens";
import { leadStatusLabel } from "@/lib/labels";
import { t } from "@/lib/i18n";

const STATUSES = ["NEW", "IN_PROGRESS", "WON", "NOT_TARGET", "LOST", "SPAM"] as const;

export default function LeadDetailScreen() {
  const router = useRouter();
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
      Alert.alert(t("common.done"), "Лід конвертовано", [
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
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={{ marginTop: 12 }}>{t("common.loading")}</Text>
      </View>
    );
  }

  const name =
    lead.name ?? [lead.firstName, lead.lastName].filter(Boolean).join(" ") ?? lead.phone ?? "—";

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{name}</Text>
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

      {lead.phone ? <Text style={styles.field}>{lead.phone}</Text> : null}
      {lead.email ? <Text style={styles.field}>{lead.email}</Text> : null}
      {lead.companyName ? <Text style={styles.field}>{lead.companyName}</Text> : null}
      {lead.message ? <Text style={styles.box}>{lead.message}</Text> : null}
      {lead.comment ? <Text style={styles.box}>{lead.comment}</Text> : null}

      <Text style={styles.section}>{t("leads.changeStatus")}</Text>
      <View style={styles.chips}>
        {STATUSES.map((s) => (
          <Pressable
            key={s}
            disabled={busy}
            onPress={() => void onStatus(s)}
            style={[styles.chip, lead.status === s && styles.chipOn]}
            accessibilityRole="button">
            <Text>{leadStatusLabel(s)}</Text>
          </Pressable>
        ))}
      </View>

      <PrimaryButton
        label={t("leads.convert")}
        onPress={() => void onConvert()}
        loading={busy}
        style={{ marginTop: spacing.lg }}
      />
      {manualCallingEnabled ? (
        <PrimaryButton
          label={t("leads.enqueue")}
          onPress={() => void onEnqueue()}
          variant="secondary"
          style={{ marginTop: spacing.sm }}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  scroll: { padding: spacing.lg, paddingBottom: 48 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  title: { fontSize: 22, fontWeight: "700", flex: 1 },
  field: { marginTop: 8, fontSize: 15, opacity: 0.85 },
  box: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "rgba(120,120,128,0.08)",
    lineHeight: 20,
  },
  section: { fontWeight: "700", fontSize: 16, marginTop: spacing.xl },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.sm },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  chipOn: { backgroundColor: "#dbeafe", borderColor: "#2563eb" },
});
