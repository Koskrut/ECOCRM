import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { EmptyState } from "@/components/EmptyState";
import { Text } from "@/components/Themed";
import { productsApi } from "@/lib/api/products";
import { t } from "@/lib/i18n";
import type { Product } from "@/types/crm";

type ProductPickerProps = {
  token: string;
  onSelect: (product: Product) => void;
};

export function ProductPicker({ token, onSelect }: ProductPickerProps) {
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
        placeholder="Пошук товару (SKU або назва)…"
        placeholderTextColor="#888"
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {searching ? <Text style={styles.hint}>{t("common.loading")}</Text> : null}
      {query.trim().length >= 2 && !searching && results.length === 0 ? (
        <EmptyState message={t("common.noData")} />
      ) : null}
      {results.map((p) => {
        const title = p.name ?? p.sku ?? "Товар";
        const meta = [p.sku, p.basePrice != null ? `${p.basePrice}` : null]
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
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.72 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              {meta ? <Text style={styles.meta}>{meta}</Text> : null}
            </View>
            <Text style={styles.add}>+</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 8,
  },
  hint: { opacity: 0.7, marginBottom: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "rgba(120,120,128,0.08)",
    marginBottom: 6,
  },
  title: { fontWeight: "600", fontSize: 15 },
  meta: { opacity: 0.7, marginTop: 4, fontSize: 13 },
  add: { fontSize: 22, color: "#2563eb", fontWeight: "700", marginLeft: 8 },
});
