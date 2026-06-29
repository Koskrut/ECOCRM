import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { useTheme } from "@/lib/design/theme-context";
import { spacing } from "@/lib/design/tokens";
import { t } from "@/lib/i18n";

type Props = {
  value: boolean;
  onChange: (v: boolean) => void;
};

export function DocumentsToggle({ value, onChange }: Props) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.colors.text }]}>{t("orderCreate.documents")}</Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => onChange(true)}
          style={[
            styles.chip,
            { borderColor: theme.colors.border },
            value && { backgroundColor: theme.colors.orderMuted, borderColor: theme.colors.order },
          ]}
          accessibilityRole="button">
          <Text
            style={[
              styles.chipText,
              { color: theme.colors.text },
              value && { fontWeight: "700", color: theme.colors.order },
            ]}>
            {t("common.ok")}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onChange(false)}
          style={[
            styles.chip,
            { borderColor: theme.colors.border },
            !value && { backgroundColor: theme.colors.orderMuted, borderColor: theme.colors.order },
          ]}
          accessibilityRole="button">
          <Text
            style={[
              styles.chipText,
              { color: theme.colors.text },
              !value && { fontWeight: "700", color: theme.colors.order },
            ]}>
            {t("common.cancel")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.sm },
  label: { fontWeight: "600" },
  row: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontSize: 14 },
});
