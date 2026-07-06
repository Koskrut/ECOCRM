import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { EmptyState } from "@/components/EmptyState";
import { AppButton } from "@/components/ui/AppButton";
import { AnimatedListItem } from "@/components/ui/AnimatedListItem";
import { Card } from "@/components/ui/Card";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { StatusPill } from "@/components/ui/StatusPill";
import { useAuth } from "@/context/auth-context";
import { useActiveWork } from "@/context/active-work-context";
import { manualCallingApi, type QueueItemResponse } from "@/lib/api/manual-calling";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";

type Props = {
  onMetaChange?: (meta: { count: number }) => void;
};

function displayInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

function CallQueueCard({
  item,
  index,
  busyId,
  onClaim,
  onSkip,
}: {
  item: QueueItemResponse;
  index: number;
  busyId: string | null;
  onClaim: (item: QueueItemResponse) => void;
  onSkip: (item: QueueItemResponse) => void;
}) {
  const theme = useTheme();
  const target = item.target;
  const name = target?.displayName ?? "—";
  const phone = target?.phone ?? "";

  return (
    <AnimatedListItem index={index}>
      <Card variant="elevated" style={{ marginBottom: theme.spacing.sm }}>
        <View style={styles.top}>
          <View
            style={[
              styles.avatar,
              { backgroundColor: theme.colors.callMuted },
            ]}>
            <Text style={[theme.typography.bodyMedium, { color: theme.colors.call, fontWeight: "700" }]}>
              {displayInitial(name)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={[theme.typography.bodyMedium, { flex: 1 }]} numberOfLines={1}>
                {name}
              </Text>
              {item.source === "MISSED_CALL" ? (
                <StatusPill label="Пропущений" tone="danger" />
              ) : null}
              <StatusPill label={`#${item.sortOrder}`} tone="warning" />
            </View>
            {phone ? (
              <View style={[styles.phoneRow, { marginTop: 4 }]}>
                <Ionicons name="call-outline" size={14} color={theme.colors.textMuted} />
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginLeft: 4 }]}>
                  {phone}
                </Text>
              </View>
            ) : null}
            {target?.companyName ? (
              <Text
                style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}
                numberOfLines={1}>
                {target.companyName}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={[styles.actions, { gap: theme.spacing.sm, marginTop: theme.spacing.md }]}>
          <AppButton
            label={busyId === item.id ? "…" : t("calls.claim")}
            onPress={() => onClaim(item)}
            disabled={busyId === item.id}
            style={styles.btn}
          />
          <AppButton
            label={t("calls.skip")}
            onPress={() => onSkip(item)}
            disabled={busyId === item.id}
            variant="secondary"
            style={styles.btn}
          />
        </View>
      </Card>
    </AnimatedListItem>
  );
}

export function CallsQueuePanel({ onMetaChange }: Props) {
  const router = useRouter();
  const theme = useTheme();
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
      const next = res.items ?? [];
      setItems(next);
      onMetaChange?.({ count: next.length });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
      onMetaChange?.({ count: 0 });
    } finally {
      setLoading(false);
    }
  }, [token, onMetaChange]);

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
        : res.session.lead?.fullName ?? res.session.lead?.firstName ?? t("calls.callFallback");
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
    <View style={styles.wrap}>
      {!loading && items.length > 0 ? (
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: theme.spacing.sm }]}>
          {t("calls.inQueue", { count: items.length })}
        </Text>
      ) : null}
      <FlatList
        data={items}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void reload()} tintColor={theme.colors.primary} />
        }
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          loading ? (
            <View>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : (
            <EmptyState message={error ?? t("calls.queueEmpty")} onRetry={error ? () => void reload() : undefined} />
          )
        }
        renderItem={({ item, index }) => (
          <CallQueueCard
            item={item}
            index={index}
            busyId={busyId}
            onClaim={(row) => void onClaim(row)}
            onSkip={(row) => void onSkip(row)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  top: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  phoneRow: { flexDirection: "row", alignItems: "center" },
  actions: { flexDirection: "row" },
  btn: { flex: 1 },
});
