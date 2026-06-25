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
import { ScreenHeader } from "@/components/ui/ScreenHeader";
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
  const cur = o.currency ?? "";
  return `${o.totalAmount} ${cur}`.trim();
}

function clientLabel(o: OrderListItem): string {
  if (o.client) {
    return [o.client.firstName, o.client.lastName].filter(Boolean).join(" ");
  }
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

export default function OrdersScreen() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState(0);
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
          q: debouncedQ || undefined,
          page: nextPage,
          pageSize: 20,
          ...filterQuery,
        });
        setTotal(res.total ?? 0);
        setPage(res.page ?? nextPage);
        setItems((prev) => (append ? [...prev, ...(res.items ?? [])] : res.items ?? []));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
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
      void reload({ page: 1 });
    }, [reload]),
  );

  const hasMore = items.length < total;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Замовлення" actionLabel="+ Нове" onAction={() => router.push("/orders/new")} />

      <SearchField value={q} onChangeText={setQ} placeholder="Пошук за номером, клієнтом, ТТН…" />

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[styles.chip, filter === f.key && styles.chipOn]}>
            <Text style={[styles.chipText, filter === f.key && styles.chipTextOn]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      {error ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorTitle}>{t("common.error")}</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <Pressable onPress={() => void reload({ page: 1 })} style={styles.retryBtn}>
            <Text style={styles.retryText}>{t("common.retry")}</Text>
          </Pressable>
        </Card>
      ) : null}

      {loading && items.length === 0 ? (
        <View style={styles.skeletonWrap}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>{t("common.loading")}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          refreshControl={
            <RefreshControl refreshing={loading && items.length > 0} onRefresh={() => void reload({ page: 1 })} />
          }
          keyExtractor={(o) => o.id}
          contentContainerStyle={items.length === 0 ? styles.emptyList : undefined}
          ListEmptyComponent={
            !loading && !error ? <EmptyState message={t("common.noData")} onRetry={() => void reload({ page: 1 })} /> : null
          }
          ListFooterComponent={
            hasMore ? (
              <Pressable
                disabled={loadingMore}
                onPress={() => void reload({ page: page + 1, append: true })}
                style={styles.loadMore}>
                <Text style={styles.loadMoreText}>
                  {loadingMore ? t("common.loading") : `Ще ${total - items.length}…`}
                </Text>
              </Pressable>
            ) : total > 0 ? (
              <Text style={styles.footerMeta}>{total} замовлень</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <Card onPress={() => router.push(`/orders/${item.id}`)} style={styles.orderCard}>
              <View style={styles.orderTop}>
                <Text style={styles.orderNumber}>
                  {item.orderNumber ? `#${item.orderNumber}` : "Замовлення"}
                </Text>
                <StatusPill
                  label={orderStageLabel(item.orderStage) || item.status}
                  tone={statusTone(item.orderStage)}
                />
              </View>
              <Text style={styles.client}>{clientLabel(item)}</Text>
              <View style={styles.orderBottom}>
                <Text style={styles.amount}>{formatAmount(item)}</Text>
                <Text style={styles.date}>
                  {new Date(item.createdAt).toLocaleDateString("uk-UA", {
                    day: "numeric",
                    month: "short",
                  })}
                </Text>
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginVertical: spacing.md },
  chip: {
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.chip,
  },
  chipOn: { backgroundColor: colors.chipOn },
  chipText: { fontSize: 13, opacity: 0.75 },
  chipTextOn: { fontWeight: "700", opacity: 1, color: colors.primaryText },
  errorCard: { marginBottom: spacing.md, borderColor: "rgba(239,68,68,0.35)" },
  errorTitle: { fontWeight: "700", color: colors.danger, marginBottom: 4 },
  errorBody: { opacity: 0.85, lineHeight: 20 },
  retryBtn: { marginTop: spacing.sm, alignSelf: "flex-start" },
  retryText: { color: colors.primaryText, fontWeight: "700" },
  skeletonWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  loadingText: { opacity: 0.7 },
  emptyList: { flexGrow: 1, justifyContent: "center" },
  orderCard: { marginBottom: spacing.sm },
  orderTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  orderNumber: { fontWeight: "700", fontSize: 16, flex: 1 },
  client: { marginTop: 6, opacity: 0.8, fontSize: 14 },
  orderBottom: {
    marginTop: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  amount: { fontWeight: "700", fontSize: 15 },
  date: { opacity: 0.55, fontSize: 12 },
  loadMore: { paddingVertical: spacing.lg, alignItems: "center" },
  loadMoreText: { color: colors.primaryText, fontWeight: "600" },
  footerMeta: { textAlign: "center", opacity: 0.5, paddingVertical: spacing.md, fontSize: 12 },
});
