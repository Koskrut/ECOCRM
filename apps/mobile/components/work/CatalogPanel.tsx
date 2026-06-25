import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/EmptyState";
import { SearchField } from "@/components/ui/SearchField";
import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { productsApi } from "@/lib/api/products";
import { colors, spacing } from "@/lib/design/tokens";
import { t } from "@/lib/i18n";
import type { Product } from "@/types/crm";

export function CatalogPanel() {
  const router = useRouter();
  const { token } = useAuth();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await productsApi.list(token, { search: debounced || undefined, catalog: true, pageSize: 40 });
      setItems(res.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, debounced]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <View style={styles.wrap}>
      <SearchField value={q} onChangeText={setQ} placeholder={t("catalog.searchHint")} />
      <FlatList
        data={items}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState
            message={error ?? (debounced ? t("catalog.empty") : t("catalog.typeToSearch"))}
            onRetry={error ? reload : undefined}
          />
        }
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <Text style={styles.name}>{item.name ?? item.sku ?? "—"}</Text>
            {item.sku ? <Text style={styles.meta}>SKU: {item.sku}</Text> : null}
            <View style={styles.row}>
              <Text style={styles.stock}>
                {t("catalog.stock")}: {item.totalStock ?? "—"}
              </Text>
              {item.basePrice != null ? (
                <Text style={styles.price}>
                  {item.basePrice} {t("common.currency")}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => router.push(`/orders/new?productId=${encodeURIComponent(item.id)}`)}
              style={styles.cta}
              accessibilityRole="button">
              <Text style={styles.ctaText}>{t("catalog.addToOrder")}</Text>
            </Pressable>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  card: { marginBottom: spacing.sm },
  name: { fontWeight: "700", fontSize: 16 },
  meta: { opacity: 0.7, marginTop: 4, fontSize: 13 },
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  stock: { fontSize: 14, opacity: 0.85 },
  price: { fontWeight: "600", color: colors.order },
  cta: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    backgroundColor: colors.orderMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  ctaText: { color: colors.order, fontWeight: "700", fontSize: 13 },
});
