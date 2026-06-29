import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { Text } from "@/components/Themed";
import { IconButton } from "@/components/ui/IconButton";
import { useTheme } from "@/lib/design/theme-context";
import { spacing } from "@/lib/design/tokens";
import type { DraftOrderLine } from "@/types/crm";

type OrderItemRowProps = {
  item: DraftOrderLine;
  onChange: (patch: Partial<Pick<DraftOrderLine, "qty" | "price" | "discountPercent">>) => void;
  onRemove: () => void;
  discountPresets?: number[];
};

function lineTotal(item: DraftOrderLine): number {
  const gross = item.qty * item.price;
  const discount = gross * (item.discountPercent / 100);
  return Math.round((gross - discount) * 100) / 100;
}

function useNumericDraft(value: number, onCommit: (n: number) => void, min: number) {
  const [draft, setDraft] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(null);
  }, [value, focused]);

  const display = focused && draft !== null ? draft : String(value);

  return {
    display,
    onFocus: () => {
      setFocused(true);
      setDraft(String(value));
    },
    onBlur: () => {
      setFocused(false);
      const raw = draft ?? String(value);
      const n = Number(raw.replace(",", "."));
      onCommit(Number.isFinite(n) ? Math.max(min, n) : min);
      setDraft(null);
    },
    onChangeText: (v: string) => setDraft(v),
  };
}

export function OrderItemRow({ item, onChange, onRemove, discountPresets }: OrderItemRowProps) {
  const theme = useTheme();
  const showDiscounts = (discountPresets?.length ?? 0) > 0;

  const qtyField = useNumericDraft(item.qty, (n) => onChange({ qty: n }), 1);
  const priceField = useNumericDraft(item.price, (n) => onChange({ price: n }), 0);

  const inputStyle = [
    styles.input,
    {
      color: theme.colors.text,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
  ];

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surfaceMuted }]}>
      <View style={styles.header}>
        <Text style={[styles.name, { color: theme.colors.text }]}>{item.productName}</Text>
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
          <Text style={[styles.remove, { color: theme.colors.danger }]}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.fields}>
        <View style={styles.qtyField}>
          <Text style={[styles.label, { color: theme.colors.textMuted }]}>К-сть</Text>
          <View style={styles.stepper}>
            <IconButton
              name="remove"
              size={18}
              onPress={() => {
                if (item.qty > 1) onChange({ qty: item.qty - 1 });
              }}
              accessibilityLabel="Зменшити кількість"
              style={[
                styles.stepperBtn,
                item.qty <= 1 && { opacity: 0.35 },
              ]}
            />
            <TextInput
              value={qtyField.display}
              onChangeText={qtyField.onChangeText}
              onFocus={qtyField.onFocus}
              onBlur={qtyField.onBlur}
              keyboardType="number-pad"
              selectTextOnFocus
              style={[inputStyle, styles.qtyInput]}
              placeholderTextColor={theme.colors.textMuted}
            />
            <IconButton
              name="add"
              size={18}
              onPress={() => onChange({ qty: item.qty + 1 })}
              accessibilityLabel="Збільшити кількість"
              style={styles.stepperBtn}
            />
          </View>
        </View>
        <View style={styles.priceField}>
          <Text style={[styles.label, { color: theme.colors.textMuted }]}>Ціна</Text>
          <TextInput
            value={priceField.display}
            onChangeText={priceField.onChangeText}
            onFocus={priceField.onFocus}
            onBlur={priceField.onBlur}
            keyboardType="decimal-pad"
            selectTextOnFocus
            style={inputStyle}
            placeholderTextColor={theme.colors.textMuted}
          />
        </View>
      </View>
      {showDiscounts ? (
        <View style={styles.presetRow}>
          {discountPresets!.map((pct) => (
            <Pressable
              key={pct}
              onPress={() =>
                onChange({
                  discountPercent: item.discountPercent === pct ? 0 : pct,
                })
              }
              style={[
                styles.presetChip,
                { borderColor: theme.colors.border },
                item.discountPercent === pct && {
                  backgroundColor: theme.colors.orderMuted,
                  borderColor: theme.colors.order,
                },
              ]}
              accessibilityRole="button">
              <Text style={[styles.presetText, { color: theme.colors.text }]}>{pct}%</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Text style={[styles.total, { color: theme.colors.text }]}>Сума: {lineTotal(item)}</Text>
    </View>
  );
}

export function draftLinesTotal(items: DraftOrderLine[]): number {
  return items.reduce((sum, item) => sum + lineTotal(item), 0);
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  name: { fontWeight: "600", fontSize: 15, flex: 1, marginRight: 8 },
  remove: { fontSize: 18, fontWeight: "700" },
  fields: { flexDirection: "row", gap: 8, marginTop: 10, alignItems: "flex-end" },
  qtyField: { flex: 1.2 },
  priceField: { flex: 1 },
  label: { fontSize: 11, marginBottom: 4 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 4 },
  stepperBtn: { width: 36, height: 36, borderRadius: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 15,
  },
  qtyInput: {
    flex: 1,
    textAlign: "center",
    minWidth: 44,
    paddingHorizontal: 4,
  },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  presetText: { fontSize: 12, fontWeight: "600" },
  total: { marginTop: 10, fontWeight: "600", fontSize: 14 },
});
