import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/EmptyState";
import { SearchField } from "@/components/ui/SearchField";
import { StatusPill } from "@/components/ui/StatusPill";
import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { ordersApi, ordersFilterQuery, type OrderListItem } from "@/lib/api/orders";
import { colors, spacing } from "@/lib/design/tokens";
import { t } from "@/lib/i18n";
import { orderStageLabel } from "@/lib/labels";

type OrderFilter = "all" | "mine" | "today" | "drafts";

const FILTERS: Array<{ key: OrderFilter; label: string }> = [
  { key: "all", label: "Усі" },
  { key: "mine", label: "Мої" },
  { key: "today", label: "Сьогодні" },
  { key: "drafts", label: "Нові" },
];

function formatAmount(o: OrderListItem): string {
  if (o.totalAmount == null) return "—";
  return `${o.totalAmount} ${o.currency ?? ""}`.trim();
}

function clientLabel(o: OrderListItem): string {
  if (o.client) return [o.client.firstName, o.client.lastName].filter(Boolean).join(" ");
  if (o.company?.name) return o.company.name;
  return "—";
}

function statusTone(stage?: string | null): "default" | "success" | "warning" | "danger" | "info" {
  if (!stage) return "default";
  if (stage === "COMPLETED" || stage === "RECEIVED") return "success";
  if (stage === "CANCELED" || stage === "REFUSED") return "danger";
  if (stage === "AWAITING_PAYMENT" || stage === "AWAITING_STOCK") return "warning";
  return "info";
}

function hasTtn(o: OrderListItem): boolean {
  const np = o.deliveryData?.novaPoshta as Record<string, unknown> | undefined;
  const ttn = np?.ttn as Record<string, unknown> | undefined;
  return typeof ttn?.number === "string" && ttn.number.length > 0;
}

export function OrdersPanel() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  const filterQuery = useMemo(() => ordersFilterQuery(filter, user?.id), [filter, user?.id]);

  const reload = useCallback(
    async (opts?: { page?: number; append?: boolean }) => {
      if (!token) return;
      const nextPage = opts?.page ?? 1;
      const append = opts?.append === true;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await ordersApi.list(token, {
          ...filterQuery,
          q: debouncedQ || undefined,
          page: nextPage,
          pageSize: 20,
        });
        setItems((prev) => (append ? [...prev, ...(res.items ?? [])] : res.items ?? []));
        setPage(nextPage);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        if (!append) setItems([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [token, debouncedQ, filterQuery],
  );

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return (
    <View style={styles.wrap}>
      <SearchField value={q} onChangeText={setQ} placeholder={t("common.search")} />
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[styles.chip, filter === f.key && styles.chipOn]}
            accessibilityRole="button">
            <Text style={filter === f.key ? styles.chipTextOn : undefined}>{f.label}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={items}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void reload()} />}
        keyExtractor={(item) => item.id}
        onEndReached={() => {
          if (!loadingMore && !loading && items.length >= page * 20) {
            void reload({ page: page + 1, append: true });
          }
        }}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: 32 }} />
          ) : (
            <EmptyState message={error ?? t("common.noData")} onRetry={error ? () => void reload() : undefined} />
          )
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} /> : null}
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/orders/${item.id}`)} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle}>
                {item.orderNumber ? `#${item.orderNumber}` : "Замовлення"}
              </Text>
              <StatusPill
                label={orderStageLabel(item.orderStage) || item.status}
                tone={statusTone(item.orderStage)}
              />
            </View>
            <Text style={styles.cardMeta}>{clientLabel(item)}</Text>
            <View style={styles.cardBottom}>
              <Text style={styles.cardAmount}>{formatAmount(item)}</Text>
              {hasTtn(item) ? <Text style={styles.badge}>ТТН</Text> : null}
            </View>
          </Card>
        )}
      />
      <Pressable
        onPress={() => router.push("/orders/new")}
        style={styles.fab}
        accessibilityRole="button"
        accessibilityLabel="Нове замовлення">
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  filterRow: { flexDirection: "row", gap: 8, marginVertical: spacing.sm, flexWrap: "wrap" },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.orderMuted, borderColor: colors.order },
  chipTextOn: { fontWeight: "700", color: colors.order },
  card: { marginBottom: spacing.sm },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  cardTitle: { fontWeight: "700", fontSize: 16, flex: 1 },
  cardMeta: { marginTop: 4, opacity: 0.75, fontSize: 14 },
  cardBottom: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  cardAmount: { fontWeight: "600", fontSize: 15 },
  badge: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.order,
    backgroundColor: colors.orderMuted,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  fab: {
    position: "absolute",
    right: 0,
    bottom: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.order,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  fabText: { color: "#fff", fontSize: 28, fontWeight: "300", marginTop: -2 },
});
