import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { EmptyState } from "@/components/EmptyState";
import { AppButton } from "@/components/ui/AppButton";
import { AnimatedListItem } from "@/components/ui/AnimatedListItem";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SearchField } from "@/components/ui/SearchField";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { useAuth } from "@/context/auth-context";
import { productsApi } from "@/lib/api/products";
import { formatBaseMoney } from "@/lib/order-currency";
import { formatCatalogStockLine, formatStockBreakdown } from "@/lib/stock-display";
import { warehouseStockLines, totalStockBreakdown } from "@/lib/order-utils";
import { useTheme } from "@/lib/design/theme-context";
import { useBaseCurrency } from "@/lib/use-base-currency";
import { t } from "@/lib/i18n";
import type { Product } from "@/types/crm";

const PAGE_SIZE = 50;

type Props = {
  onMetaChange?: (meta: { count: number; total: number }) => void;
};

function CatalogProductCard({
  item,
  index,
  currency,
  onAddToOrder,
}: {
  item: Product;
  index: number;
  currency: string;
  onAddToOrder: (productId: string) => void;
}) {
  const theme = useTheme();
  const byWarehouse = warehouseStockLines(item);
  const stockTotal = byWarehouse.length === 0 ? totalStockBreakdown(item) : null;

  return (
    <AnimatedListItem index={index}>
      <Card variant="elevated" style={{ marginBottom: theme.spacing.sm }}>
        <Text style={theme.typography.bodyMedium}>{item.name ?? item.sku ?? "—"}</Text>
        {item.sku ? (
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
            {t("catalog.sku")}: {item.sku}
          </Text>
        ) : null}
        {item.externalCode ? (
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
            1С: {item.externalCode}
          </Text>
        ) : null}

        {byWarehouse.length > 0 ? (
          <View style={[styles.chipRow, { marginTop: theme.spacing.sm }]}>
            {byWarehouse.map((line) => (
              <Chip
                key={line.warehouseId}
                label={formatCatalogStockLine(line.warehouseName, line)}
              />
            ))}
          </View>
        ) : stockTotal ? (
          <View style={[styles.chipRow, { marginTop: theme.spacing.sm }]}>
            <Chip
              label={formatStockBreakdown(stockTotal, {
                onWarehouse: t("catalog.onWarehouse"),
                reserved: t("orderCreate.reserved"),
              })}
            />
          </View>
        ) : null}

        {item.basePrice != null ? (
          <Text style={[theme.typography.title, { color: theme.colors.order, marginTop: theme.spacing.sm }]}>
            {formatBaseMoney(item.basePrice, currency)}
          </Text>
        ) : null}

        <AppButton
          label={t("catalog.addToOrder")}
          onPress={() => onAddToOrder(item.id)}
          variant="secondary"
          style={{ marginTop: theme.spacing.sm, alignSelf: "flex-start" }}
        />
      </Card>
    </AnimatedListItem>
  );
}

export function CatalogPanel({ onMetaChange }: Props) {
  const router = useRouter();
  const theme = useTheme();
  const { token } = useAuth();
  const { currency } = useBaseCurrency();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  const fetchPage = useCallback(
    async (opts: { page: number; append: boolean; search: string }) => {
      if (!token) return;
      if (opts.append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await productsApi.list(token, {
          search: opts.search || undefined,
          catalog: true,
          page: opts.page,
          pageSize: PAGE_SIZE,
        });
        const nextItems = res.items ?? [];
        setTotal(res.total);
        setPage(opts.page);
        setItems((prev) => {
          const merged = opts.append ? [...prev, ...nextItems] : nextItems;
          onMetaChange?.({ count: merged.length, total: res.total });
          return merged;
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        if (!opts.append) {
          setItems([]);
          setTotal(0);
          onMetaChange?.({ count: 0, total: 0 });
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [token, onMetaChange],
  );

  const reload = useCallback(async () => {
    await fetchPage({ page: 1, append: false, search: debounced });
  }, [fetchPage, debounced]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const canLoadMore = items.length < total;

  const loadMore = useCallback(() => {
    if (!token || loading || loadingMore || !canLoadMore) return;
    void fetchPage({ page: page + 1, append: true, search: debounced });
  }, [token, loading, loadingMore, canLoadMore, fetchPage, page, debounced]);

  return (
    <View style={styles.wrap}>
      <SearchField value={q} onChangeText={setQ} placeholder={t("catalog.searchHint")} />
      {total > 0 ? (
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: theme.spacing.sm }]}>
          {t("work.shownOfTotal", { shown: items.length, total })}
        </Text>
      ) : null}
      <FlatList
        data={items}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void reload()} tintColor={theme.colors.primary} />
        }
        keyExtractor={(item) => item.id}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          loading ? (
            <View>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : (
            <EmptyState
              message={error ?? t("catalog.empty")}
              onRetry={error ? () => void reload() : undefined}
            />
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={{ marginVertical: theme.spacing.md }}>
              <SkeletonCard />
            </View>
          ) : null
        }
        renderItem={({ item, index }) => (
          <CatalogProductCard
            item={item}
            index={index}
            currency={currency}
            onAddToOrder={(productId) => router.push(`/orders/new?productId=${encodeURIComponent(productId)}`)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});
