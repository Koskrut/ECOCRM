import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/EmptyState";
import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { useActiveWork } from "@/context/active-work-context";
import { manualCallingApi, type QueueItemResponse } from "@/lib/api/manual-calling";
import { colors, spacing } from "@/lib/design/tokens";
import { t } from "@/lib/i18n";

export function CallsQueuePanel() {
  const router = useRouter();
  const { token } = useAuth();
  const { setCallSession } = useActiveWork();
  const [items, setItems] = useState<QueueItemResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await manualCallingApi.getQueue(token);
      setItems(res.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  async function onClaim(item: QueueItemResponse) {
    if (!token) return;
    setBusyId(item.id);
    try {
      const res = await manualCallingApi.claim(token, item.id);
      const label = res.session.contact
        ? `${res.session.contact.firstName} ${res.session.contact.lastName}`.trim()
        : res.session.lead?.fullName ?? res.session.lead?.firstName ?? "дзвінок";
      setCallSession(res.session.id, label);
      router.push(`/calls/session?id=${res.session.id}`);
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function onSkip(item: QueueItemResponse) {
    if (!token) return;
    setBusyId(item.id);
    try {
      await manualCallingApi.skip(token, item.id);
      await reload();
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <FlatList
      data={items}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={
        <EmptyState message={error ?? t("calls.queueEmpty")} onRetry={error ? reload : undefined} />
      }
      renderItem={({ item }) => {
        const target = item.target;
        const name = target?.displayName ?? "—";
        const phone = target?.phone ?? "";
        return (
          <Card style={styles.card}>
            <View style={styles.top}>
              <Text style={styles.name}>{name}</Text>
              <Text style={styles.badge}>#{item.sortOrder}</Text>
            </View>
            {phone ? <Text style={styles.phone}>{phone}</Text> : null}
            {target?.companyName ? <Text style={styles.meta}>{target.companyName}</Text> : null}
            <View style={styles.actions}>
              <Pressable
                disabled={busyId === item.id}
                onPress={() => void onClaim(item)}
                style={[styles.btn, styles.btnPrimary]}
                accessibilityRole="button">
                <Text style={styles.btnPrimaryText}>
                  {busyId === item.id ? "…" : t("calls.claim")}
                </Text>
              </Pressable>
              <Pressable
                disabled={busyId === item.id}
                onPress={() => void onSkip(item)}
                style={[styles.btn, styles.btnSecondary]}
                accessibilityRole="button">
                <Text style={styles.btnSecondaryText}>{t("calls.skip")}</Text>
              </Pressable>
            </View>
          </Card>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.sm },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontWeight: "700", fontSize: 16, flex: 1 },
  badge: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.call,
    backgroundColor: colors.callMuted,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  phone: { marginTop: 4, fontSize: 15 },
  meta: { marginTop: 4, opacity: 0.7, fontSize: 13 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  btnPrimary: { backgroundColor: colors.call },
  btnPrimaryText: { color: "#fff", fontWeight: "700" },
  btnSecondary: { backgroundColor: colors.chip },
  btnSecondaryText: { fontWeight: "600" },
});
