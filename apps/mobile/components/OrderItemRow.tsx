import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { Text } from "@/components/Themed";
import { IconButton } from "@/components/ui/IconButton";
import { useTheme } from "@/lib/design/theme-context";
import { orderCurrencySymbol } from "@/lib/order-currency";
import {
  computeLineTotal,
  isPromoApplicable,
  ORDER_PROMO_BUY_100_GET_30,
  ORDER_PROMO_QTY_25_MINUS_2,
  parsePromoType,
  roundMoney,
  type OrderPromoType,
} from "@/lib/order-line-total";
import { spacing } from "@/lib/design/tokens";
import { t } from "@/lib/i18n";
import type { DraftOrderLine } from "@/types/crm";

type OrderItemRowProps = {
  item: DraftOrderLine;
  currency: string;
  index?: number;
  onChange: (
    patch: Partial<Pick<DraftOrderLine, "qty" | "price" | "discountPercent" | "promoType">>,
  ) => void;
  onRemove: () => void;
  discountPresets?: number[];
  promoOptions?: OrderPromoType[];
};

function lineTotal(item: DraftOrderLine): number {
  return roundMoney(
    computeLineTotal(
      item.qty,
      item.price,
      item.discountPercent,
      parsePromoType(item.promoType),
    ),
  );
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

function promoLabel(promo: OrderPromoType): string {
  if (promo === ORDER_PROMO_BUY_100_GET_30) return t("orderCreate.promoBuy100Get30");
  return t("orderCreate.promoQty25Minus2");
}

export function OrderItemRow({
  item,
  currency,
  index,
  onChange,
  onRemove,
  discountPresets,
  promoOptions,
}: OrderItemRowProps) {
  const theme = useTheme();
  const showDiscounts = (discountPresets?.length ?? 0) > 0;
  const showPromos = (promoOptions?.length ?? 0) > 0;
  const currencySym = orderCurrencySymbol(currency);
  const activePromo = parsePromoType(item.promoType);

  const qtyField = useNumericDraft(
    item.qty,
    (n) => {
      const patch: Partial<Pick<DraftOrderLine, "qty" | "promoType" | "discountPercent">> = { qty: n };
      if (activePromo && !isPromoApplicable(activePromo, n)) {
        patch.promoType = null;
      }
      onChange(patch);
    },
    1,
  );
  const priceField = useNumericDraft(item.price, (n) => onChange({ price: n }), 0);

  const inputStyle = [
    styles.input,
    {
      color: theme.colors.text,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
  ];

  const total = lineTotal(item);
  const gross = item.qty * item.price;

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surfaceMuted }]}>
      <View style={styles.header}>
        {typeof index === "number" ? (
          <Text style={[styles.index, { color: theme.colors.textMuted }]}>{index + 1}.</Text>
        ) : null}
        <View style={styles.nameBlock}>
          {item.productSku ? (
            <Text style={[styles.sku, { color: theme.colors.textMuted }]}>{item.productSku}</Text>
          ) : null}
          <Text style={[styles.name, { color: theme.colors.text }]}>{item.productName}</Text>
        </View>
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
                if (item.qty > 1) {
                  const nextQty = item.qty - 1;
                  const patch: Partial<
                    Pick<DraftOrderLine, "qty" | "promoType" | "discountPercent">
                  > = { qty: nextQty };
                  if (activePromo && !isPromoApplicable(activePromo, nextQty)) {
                    patch.promoType = null;
                  }
                  onChange(patch);
                }
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
          <Text style={[styles.label, { color: theme.colors.textMuted }]}>Ціна ({currencySym})</Text>
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
      {showPromos ? (
        <View style={styles.presetRow}>
          {promoOptions!.map((promo) => {
            const ok = isPromoApplicable(promo, item.qty);
            const selected = activePromo === promo;
            return (
              <Pressable
                key={promo}
                disabled={!ok && !selected}
                onPress={() =>
                  onChange({
                    promoType: selected ? null : promo,
                    discountPercent: selected ? item.discountPercent : 0,
                  })
                }
                style={[
                  styles.presetChip,
                  { borderColor: theme.colors.border },
                  selected && {
                    backgroundColor: theme.colors.orderMuted,
                    borderColor: theme.colors.order,
                  },
                  !ok && !selected && { opacity: 0.4 },
                ]}
                accessibilityRole="button">
                <Text style={[styles.presetText, { color: theme.colors.text }]}>
                  {promoLabel(promo)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {showDiscounts && !activePromo ? (
        <View style={styles.presetRow}>
          {discountPresets!.map((pct) => (
            <Pressable
              key={pct}
              onPress={() =>
                onChange({
                  discountPercent: item.discountPercent === pct ? 0 : pct,
                  promoType: null,
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
      <Text style={[styles.total, { color: theme.colors.text }]}>
        Сума: {total.toFixed(2)} {currencySym}
        {activePromo || item.discountPercent > 0 ? (
          <Text style={{ color: theme.colors.textMuted }}>
            {" "}
            (було {gross.toFixed(2)})
          </Text>
        ) : null}
      </Text>
      {activePromo ? (
        <Text style={[styles.effective, { color: theme.colors.textMuted }]}>
          {t("orderCreate.promoEffectiveUnit")}: {(total / Math.max(1, item.qty)).toFixed(2)}{" "}
          {currencySym}
        </Text>
      ) : null}
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
  index: { width: 22, fontSize: 13, marginTop: 2, marginRight: 4 },
  nameBlock: { flex: 1, marginRight: 8 },
  sku: { fontSize: 12, marginBottom: 2 },
  name: { fontWeight: "600", fontSize: 15 },
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
  effective: { marginTop: 4, fontSize: 12 },
});
