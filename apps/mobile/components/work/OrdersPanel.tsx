import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { EmptyState } from "@/components/EmptyState";
import { Fab } from "@/components/ui/Fab";
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

type Meta = { count: number; total: number; stagePreset: OrderStagePreset };

type Props = {
  onMetaChange?: (meta: Meta) => void;
};

export function OrdersPanel({ onMetaChange }: Props) {
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
          ...filterQuery,
          q: debouncedQ || undefined,
          page: nextPage,
          pageSize: 20,
        });
        const nextItems = res.items ?? [];
        const nextTotal = res.total ?? nextItems.length;
        setItems((prev) => {
          const merged = append ? [...prev, ...nextItems] : nextItems;
          onMetaChange?.({ count: merged.length, total: nextTotal, stagePreset });
          return merged;
        });
        setTotal(nextTotal);
        setPage(nextPage);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        if (!append) {
          setItems([]);
          setTotal(0);
          onMetaChange?.({ count: 0, total: 0, stagePreset });
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [token, user?.id, debouncedQ, filterQuery, onMetaChange, stagePreset],
  );

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const counterLabel = useMemo(() => {
    const stagePart =
      stagePreset === "all" ? t("orders.mineOnly") : orderStageLabel(stagePreset);
    if (total > 0 && items.length < total) {
      return `${stagePart} · ${t("work.shownOfTotal", { shown: items.length, total })}`;
    }
    return `${stagePart} · ${t("orders.ordersCount", { count: items.length })}`;
  }, [items.length, total, stagePreset]);

  return (
    <View style={styles.wrap}>
      <SearchField value={q} onChangeText={setQ} placeholder={t("orders.searchPlaceholder")} />
      <View style={{ marginVertical: theme.spacing.sm }}>
        <OrderStagePresets value={stagePreset} onChange={setStagePreset} />
      </View>
      {!loading && (items.length > 0 || stagePreset !== "all") ? (
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: theme.spacing.sm }]}>
          {counterLabel}
        </Text>
      ) : null}
      <FlatList
        data={items}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void reload()} tintColor={theme.colors.primary} />
        }
        keyExtractor={(item) => item.id}
        onEndReached={() => {
          if (!loadingMore && !loading && items.length < total) {
            void reload({ page: page + 1, append: true });
          }
        }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          loading ? (
            <View>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : (
            <EmptyState message={error ?? t("orders.empty")} onRetry={error ? () => void reload() : undefined} />
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={{ marginVertical: theme.spacing.md }}>
              <SkeletonCard />
            </View>
          ) : null
        }
        renderItem={({ item, index }) => <OrderListRow item={item} index={index} />}
      />
      <Fab
        onPress={() => router.push("/orders/new")}
        accessibilityLabel={t("orders.newOrder")}
        style={{ bottom: theme.spacing.lg }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
});
