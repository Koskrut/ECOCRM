import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { EmptyState } from "@/components/EmptyState";
import { AppButton } from "@/components/ui/AppButton";
import { AppHeader } from "@/components/ui/AppHeader";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { SearchField } from "@/components/ui/SearchField";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { OrderListRow } from "@/components/work/OrderListRow";
import { OrderStagePresets } from "@/components/work/OrderStagePresets";
import { useAuth } from "@/context/auth-context";
import { ordersApi, type OrderListItem } from "@/lib/api/orders";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import { buildMyOrdersListQuery, type OrderStagePreset } from "@/lib/order-list-presets";
import { orderStageLabel } from "@/lib/labels";

export default function OrdersScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { token, user } = useAuth();
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [stagePreset, setStagePreset] = useState<OrderStagePreset>("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  const filterQuery = useMemo(
    () => buildMyOrdersListQuery(user?.id, stagePreset),
    [user?.id, stagePreset],
  );

  const reload = useCallback(
    async (opts?: { page?: number; append?: boolean }) => {
      if (!token || !user?.id) return;
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
    [token, user?.id, debouncedQ, filterQuery],
  );

  useFocusEffect(
    useCallback(() => {
      void reload({ page: 1 });
    }, [reload]),
  );

  const hasMore = items.length < total;
  const counterLabel = useMemo(() => {
    const stagePart =
      stagePreset === "all" ? t("orders.mineOnly") : orderStageLabel(stagePreset);
    if (total > 0 && items.length < total) {
      return `${stagePart} · ${t("work.shownOfTotal", { shown: items.length, total })}`;
    }
    return `${stagePart} · ${t("orders.ordersCount", { count: items.length })}`;
  }, [items.length, total, stagePreset]);

  return (
    <Screen contentStyle={styles.flex}>
      <AppHeader
        title={t("orders.title")}
        subtitle={t("orders.mineOnly")}
        actionLabel={`+ ${t("orders.new")}`}
        onAction={() => router.push("/orders/new")}
      />

      <SearchField value={q} onChangeText={setQ} placeholder={t("orders.searchPlaceholder")} />

      <View style={{ marginVertical: theme.spacing.sm }}>
        <OrderStagePresets value={stagePreset} onChange={setStagePreset} />
      </View>

      {!loading && (items.length > 0 || stagePreset !== "all") ? (
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: theme.spacing.sm }]}>
          {counterLabel}
        </Text>
      ) : null}

      {error ? (
        <Card style={{ marginBottom: theme.spacing.md, borderColor: theme.colors.dangerMuted }}>
          <Text style={[theme.typography.section, { color: theme.colors.danger }]}>{t("common.error")}</Text>
          <Text style={[theme.typography.body, { marginTop: 4 }]}>{error}</Text>
          <AppButton
            label={t("common.retry")}
            onPress={() => void reload({ page: 1 })}
            variant="ghost"
            style={{ marginTop: theme.spacing.sm, alignSelf: "flex-start" }}
          />
        </Card>
      ) : null}

      <FlatList
        style={styles.flex}
        data={items}
        refreshControl={
          <RefreshControl
            refreshing={loading && items.length > 0}
            onRefresh={() => void reload({ page: 1 })}
            tintColor={theme.colors.primary}
          />
        }
        keyExtractor={(o) => o.id}
        contentContainerStyle={items.length === 0 ? styles.emptyList : { paddingBottom: theme.spacing.xl }}
        ListEmptyComponent={
          loading ? (
            <View>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : !error ? (
            <EmptyState message={t("orders.empty")} onRetry={() => void reload({ page: 1 })} />
          ) : null
        }
        ListFooterComponent={
          hasMore ? (
            <AppButton
              label={loadingMore ? t("common.loading") : t("orders.loadMore", { count: total - items.length })}
              onPress={() => void reload({ page: page + 1, append: true })}
              disabled={loadingMore}
              loading={loadingMore}
              variant="ghost"
              style={{ marginVertical: theme.spacing.lg }}
            />
          ) : total > 0 ? (
            <Text style={[theme.typography.caption, styles.footerMeta, { color: theme.colors.textMuted }]}>
              {counterLabel}
            </Text>
          ) : null
        }
        renderItem={({ item, index }) => <OrderListRow item={item} index={index} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  emptyList: { flexGrow: 1, justifyContent: "center" },
  footerMeta: { textAlign: "center", paddingVertical: 12 },
});
