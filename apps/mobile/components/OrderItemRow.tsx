import React from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { Text } from "@/components/Themed";
import type { DraftOrderLine } from "@/types/crm";

type OrderItemRowProps = {
  item: DraftOrderLine;
  onChange: (patch: Partial<Pick<DraftOrderLine, "qty" | "price" | "discountPercent">>) => void;
  onRemove: () => void;
};

function lineTotal(item: DraftOrderLine): number {
  const gross = item.qty * item.price;
  const discount = gross * (item.discountPercent / 100);
  return Math.round((gross - discount) * 100) / 100;
}

export function OrderItemRow({ item, onChange, onRemove }: OrderItemRowProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.name}>{item.productName}</Text>
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
          <Text style={styles.remove}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.fields}>
        <View style={styles.field}>
          <Text style={styles.label}>К-сть</Text>
          <TextInput
            value={String(item.qty)}
            onChangeText={(v) => {
              const n = Number(v.replace(",", "."));
              if (Number.isFinite(n) && n > 0) onChange({ qty: n });
            }}
            keyboardType="decimal-pad"
            style={styles.input}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Ціна</Text>
          <TextInput
            value={String(item.price)}
            onChangeText={(v) => {
              const n = Number(v.replace(",", "."));
              if (Number.isFinite(n) && n >= 0) onChange({ price: n });
            }}
            keyboardType="decimal-pad"
            style={styles.input}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Знижка %</Text>
          <TextInput
            value={String(item.discountPercent)}
            onChangeText={(v) => {
              const n = Number(v.replace(",", "."));
              if (Number.isFinite(n) && n >= 0) onChange({ discountPercent: n });
            }}
            keyboardType="decimal-pad"
            style={styles.input}
          />
        </View>
      </View>
      <Text style={styles.total}>Сума: {lineTotal(item)}</Text>
    </View>
  );
}

export function draftLinesTotal(items: DraftOrderLine[]): number {
  return items.reduce((sum, item) => sum + lineTotal(item), 0);
}

const styles = StyleSheet.create({
  card: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(120,120,128,0.08)",
    marginBottom: 8,
  },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  name: { flex: 1, fontWeight: "700", fontSize: 15, marginRight: 8 },
  remove: { color: "#dc2626", fontSize: 18, fontWeight: "700" },
  fields: { flexDirection: "row", gap: 8, marginTop: 10 },
  field: { flex: 1 },
  label: { fontSize: 12, opacity: 0.7, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 15,
  },
  total: { marginTop: 10, fontWeight: "600", opacity: 0.85 },
});
