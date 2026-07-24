import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { EmptyState } from "@/components/EmptyState";
import { Text } from "@/components/Themed";
import { productsApi } from "@/lib/api/products";
import { useTheme } from "@/lib/design/theme-context";
import { formatOrderStockMeta } from "@/lib/stock-display";
import { warehouseStockBreakdown } from "@/lib/order-utils";
import { formatBaseMoney } from "@/lib/order-currency";
import { t } from "@/lib/i18n";
import type { Product } from "@/types/crm";

type ProductPickerProps = {
  token: string;
  warehouseId?: string | null;
  currency: string;
  onSelect: (product: Product) => void;
};

export function ProductPicker({ token, warehouseId, currency, onSelect }: ProductPickerProps) {
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!token || q.length < 2) {
      setResults([]);
      return;
    }
    const id = setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const res = await productsApi.list(token, { search: q, catalog: true, pageSize: 20 });
          setResults(res.items ?? []);
        } catch {
          setResults([]);
        } finally {
          setSearching(false);
        }
      })();
    }, 300);
    return () => clearTimeout(id);
  }, [token, query]);

  return (
    <View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t("catalog.searchHint")}
        placeholderTextColor={theme.colors.textMuted}
        style={[
          styles.input,
          {
            color: theme.colors.text,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          },
        ]}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {searching ? (
        <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{t("common.loading")}</Text>
      ) : null}
      {query.trim().length >= 2 && !searching && results.length === 0 ? (
        <EmptyState message={t("common.noData")} />
      ) : null}
      {results.map((p) => {
        const title = p.name ?? p.sku ?? "Товар";
        const stock = warehouseStockBreakdown(p, warehouseId);
        const meta = [
          p.sku,
          p.basePrice != null ? formatBaseMoney(p.basePrice, currency) : null,
          stock ? formatOrderStockMeta(stock) : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <Pressable
            key={p.id}
            onPress={() => {
              onSelect(p);
              setQuery("");
              setResults([]);
            }}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: theme.colors.surfaceMuted },
              pressed && { opacity: 0.72 },
            ]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
              {meta ? (
                <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{meta}</Text>
              ) : null}
            </View>
            <Text style={[styles.add, { color: theme.colors.order }]}>+</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 8,
  },
  hint: { marginBottom: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
  },
  title: { fontWeight: "600", fontSize: 15 },
  meta: { marginTop: 4, fontSize: 13 },
  add: { fontSize: 22, fontWeight: "700", marginLeft: 8 },
});
