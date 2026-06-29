import React from "react";
import { StyleSheet, TextInput } from "react-native";

import { Text } from "@/components/Themed";
import { useTheme } from "@/lib/design/theme-context";
import { spacing } from "@/lib/design/tokens";
import { t } from "@/lib/i18n";

type Props = {
  value: number;
  onChange: (v: number) => void;
};

export function OrderDiscountField({ value, onChange }: Props) {
  const theme = useTheme();

  return (
    <>
      <Text style={[styles.label, { color: theme.colors.text }]}>{t("orderCreate.orderDiscount")}</Text>
      <TextInput
        value={value > 0 ? String(value) : ""}
        onChangeText={(raw) => {
          const n = Number(raw.replace(",", "."));
          onChange(Number.isFinite(n) && n >= 0 ? n : 0);
        }}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={theme.colors.textMuted}
        style={[
          styles.input,
          {
            color: theme.colors.text,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceMuted,
          },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: "600", marginTop: spacing.sm },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
});
